"""Evaluate C7 (the language-model intake agent) against the pre-registered rule.

    uv run python eval/run_c7_eval.py standin   # the stand-in alone on all 200 (free, offline)
    uv run python eval/run_c7_eval.py dev       # PAID: 60 dev utterances through the Batch API
    uv run python eval/run_c7_eval.py latency   # PAID: 30 live calls, one after the other
    uv run python eval/run_c7_eval.py freeze    # record the prompt that the test run will use
    uv run python eval/run_c7_eval.py test      # PAID, once: 140 test utterances, then the report
    uv run python eval/run_c7_eval.py report    # from recordings only (no network): c7.json
    uv run python eval/run_c7_eval.py report --check   # CI: the committed c7.json is up to date

Rule: agents/intake/PROMOTION_RULE.md (committed before any call). Every paid call goes through
the ledger-based budget guard; real answers are recorded as fixtures in agents/fixtures/C7, and
the report is always computed from those recordings, so CI reproduces it without a key.
"""

import argparse
import hashlib
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np

from dienstpilot.engines.standins import IntakeStandIn
from dienstpilot.shared.settings import get_settings
from dienstpilot_agents.intake.prompt import MAX_TOKENS, PROMPT_VERSION, SYSTEM, build_request
from dienstpilot_agents.intake.schema import (
    TOOL_SCHEMA,
    InvalidAnswerError,
    PreferenceSet,
    parse_answer,
)
from dienstpilot_agents.intake.scoring import FIELDS, Scored, score
from dienstpilot_agents.llm import fixtures
from dienstpilot_agents.llm.anthropic_client import AnthropicClient
from dienstpilot_agents.llm.budget import LIMIT_USD
from dienstpilot_agents.llm.ledger import Ledger
from dienstpilot_agents.llm.types import LlmError, MissingFixtureError

REPO = Path(__file__).resolve().parents[1]
UTTERANCES = REPO / "eval" / "c7_utterances.json"
RULE = REPO / "agents" / "intake" / "PROMOTION_RULE.md"
FROZEN = REPO / "agents" / "intake" / "frozen.json"
CHAMPION = REPO / "agents" / "intake" / "champion.json"
LATENCY = REPO / "eval" / "usage" / "c7_latency.json"
RESULT = REPO / "eval" / "results" / "c7.json"
MODEL = "claude-haiku-5-5"
BOOTSTRAP = 2000
SEED = 20261110
MIN_GAIN = 0.10
MAX_S2H = 1
MIN_ASK = 0.80
MAX_FALSE_ASK = 0.10
MAX_P95_S = 5.0


def _sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def prompt_sha() -> str:
    """Return the SHA-256 of everything that makes the prompt: text, tool schema, limits, model."""
    raw = json.dumps(
        {"system": SYSTEM, "tool": TOOL_SCHEMA, "max_tokens": MAX_TOKENS, "model": MODEL},
        sort_keys=True,
    )
    return hashlib.sha256(raw.encode()).hexdigest()


def load() -> tuple[str, list[dict[str, Any]]]:
    """Return the roster month and the utterances."""
    doc = json.loads(UTTERANCES.read_text(encoding="utf-8"))
    return doc["month"], doc["utterances"]


def requests_for(split: str) -> tuple[list[dict[str, Any]], list[Any]]:
    """Return the utterances of a split and their requests."""
    month, items = load()
    sel = [u for u in items if u["split"] == split]
    return sel, [build_request(u["text"], month, u["language"], MODEL) for u in sel]


# --- answers ----------------------------------------------------------------------------------


def standin_answer(u: dict[str, Any], month: str) -> PreferenceSet:
    """The keyword stand-in's answer as a preference set."""
    y, m = month.split("-")
    p = IntakeStandIn().parse(u["text"], date(int(y), int(m), 1), u["language"])
    return PreferenceSet(
        [d.isoformat() for d in p.unavailable],
        [],
        sorted(p.prefer_shifts),
        sorted(p.avoid_shifts),
        p.avoid_weekends,
        p.clarifying_question,
    )


def llm_answer(
    u: dict[str, Any], month: str, replay: fixtures.ReplayClient
) -> tuple[PreferenceSet, dict[str, int], bool]:
    """The recorded model answer, checked; (answer, notes, fell back to the stand-in)."""
    req = build_request(u["text"], month, u["language"], MODEL)
    resp = replay.complete(req)
    try:
        if resp.tool_input is None:
            raise InvalidAnswerError("no tool call")
        ans, notes = parse_answer(resp.tool_input, month, u["language"])
        return ans, notes, False
    except InvalidAnswerError:
        return standin_answer(u, month), {"dropped_dates": 0, "health_filtered": 0}, True


# --- statistics -------------------------------------------------------------------------------


def bootstrap_diff(a: list[bool], b: list[bool]) -> dict[str, float]:
    """Paired bootstrap of mean(a) - mean(b) over utterances."""
    rng = np.random.default_rng(SEED)
    x, y = np.array(a, dtype=float), np.array(b, dtype=float)
    n = len(x)
    diffs = np.array(
        [(x[i] - y[i]).mean() for i in (rng.integers(0, n, n) for _ in range(BOOTSTRAP))]
    )
    return {
        "difference": float(x.mean() - y.mean()),
        "ci_low": float(np.percentile(diffs, 2.5)),
        "ci_high": float(np.percentile(diffs, 97.5)),
    }


def summarise(
    items: list[dict[str, Any]], scored: list[Scored], answers: list[PreferenceSet]
) -> dict[str, Any]:
    """Aggregate scores of one system on a set of utterances."""
    n = len(items)
    amb = [i for i, u in enumerate(items) if u["category"] in ("ambiguous", "ambiguous_soft_day")]
    other = [i for i in range(n) if i not in amb]
    inj = [i for i, u in enumerate(items) if u.get("injection")]
    return {
        "n": n,
        "exact_match": sum(s.exact for s in scored) / n,
        "per_field": {f: sum(s.fields[f] for s in scored) / n for f in FIELDS},
        "by_language": {
            lang: sum(s.exact for s, u in zip(scored, items, strict=True) if u["language"] == lang)
            / sum(1 for u in items if u["language"] == lang)
            for lang in ("de", "en")
        },
        "by_category": {
            c: sum(s.exact for s, u in zip(scored, items, strict=True) if u["category"] == c)
            / sum(1 for u in items if u["category"] == c)
            for c in sorted({u["category"] for u in items})
        },
        "soft_to_hard": sum(s.soft_to_hard for s in scored),
        "hard_to_soft": sum(s.hard_to_soft for s in scored),
        "health_leaks": sum(s.health_leak for s in scored),
        "injections": len(inj),
        "injections_followed": sum(scored[i].injection_followed for i in inj),
        "question_on_ambiguous": sum(answers[i].clarifying_question is not None for i in amb)
        / max(1, len(amb)),
        "question_on_others": sum(answers[i].clarifying_question is not None for i in other)
        / max(1, len(other)),
    }


def evaluate(split: str, replay: fixtures.ReplayClient) -> dict[str, Any]:
    """Score the stand-in and the recorded model answers on a split."""
    month, _ = load()
    items, _ = requests_for(split)
    standin = [standin_answer(u, month) for u in items]
    llm, filtered, dropped, fallbacks = [], 0, 0, 0
    for u in items:
        a, notes, fb = llm_answer(u, month, replay)
        llm.append(a)
        filtered += notes["health_filtered"]
        dropped += notes["dropped_dates"]
        fallbacks += fb
    s_scored = [score(u, a) for u, a in zip(items, standin, strict=True)]
    l_scored = [score(u, a) for u, a in zip(items, llm, strict=True)]
    return {
        "standin": summarise(items, s_scored, standin),
        "llm": summarise(items, l_scored, llm),
        "paired_exact_match": bootstrap_diff(
            [s.exact for s in l_scored], [s.exact for s in s_scored]
        ),
        "llm_notes": {
            "health_questions_replaced_by_filter": filtered,
            "dates_dropped_outside_month": dropped,
            "answers_rejected_by_schema_check": fallbacks,
        },
    }


# --- commands ---------------------------------------------------------------------------------


def client(purpose: str) -> AnthropicClient:
    """A live client that records fixtures and writes the ledger."""
    key = get_settings().anthropic_api_key
    if key is None:
        raise SystemExit("ANTHROPIC_API_KEY is not set (put it in the git-ignored .env)")
    lg = Ledger()
    return AnthropicClient(
        key.get_secret_value(),
        run_id=f"c7-{PROMPT_VERSION}-{purpose}",
        ledger=lg,
        record_dir=fixtures.DIR,
        purpose=purpose,
    )


def cmd_standin() -> None:
    """Print the stand-in's score (no model, no cost)."""
    month, items = load()
    for split in ("dev", "test"):
        sel = [u for u in items if u["split"] == split]
        sc = [score(u, standin_answer(u, month)) for u in sel]
        a = [standin_answer(u, month) for u in sel]
        print(split, json.dumps(summarise(sel, sc, a), indent=1))


def cmd_dev() -> None:
    """Paid: run the dev utterances once through the Batch API and show the score."""
    sel, reqs = requests_for("dev")
    c = client("dev")
    c.complete_many(reqs, purpose="dev")
    ev = evaluate("dev", fixtures.ReplayClient())
    print(json.dumps({k: ev[k] for k in ("standin", "llm", "paired_exact_match")}, indent=1))
    print(f"spent so far ${Ledger().total_usd():.4f} of ${LIMIT_USD:.2f}")


def cmd_latency() -> None:
    """Paid: 30 live calls one after the other; the times are what check 6 uses."""
    sel, reqs = requests_for("dev")
    c = client("latency")
    seconds = []
    for r in reqs[:30]:
        seconds.append(round(c.complete(r).latency_s or 0.0, 3))
    LATENCY.write_text(
        json.dumps({"model": MODEL, "prompt_version": PROMPT_VERSION, "seconds": seconds}, indent=1)
        + "\n"
    )
    print(f"p95 {np.percentile(seconds, 95):.2f}s; spent ${Ledger().total_usd():.4f}")


def cmd_freeze() -> None:
    """Record the prompt the test run will use."""
    FROZEN.write_text(
        json.dumps(
            {"prompt_version": PROMPT_VERSION, "prompt_sha256": prompt_sha(), "model": MODEL},
            indent=1,
        )
        + "\n"
    )
    print("frozen", PROMPT_VERSION, prompt_sha()[:12])


def cmd_test() -> None:
    """Paid, once: the 140 test utterances, then the report."""
    if not FROZEN.exists() or json.loads(FROZEN.read_text())["prompt_sha256"] != prompt_sha():
        raise SystemExit("the prompt is not frozen (run `freeze` and commit frozen.json first)")
    prefix = f"c7-{PROMPT_VERSION}-test"
    if any(e.run_id == prefix for e in Ledger().entries()):
        raise SystemExit(
            "a test run for this prompt version is already in the ledger; never re-run"
        )
    sel, reqs = requests_for("test")
    client("test").complete_many(reqs, purpose="test")
    cmd_report()


def cmd_report(check: bool = False) -> int:
    """Compute c7.json from the recordings, apply the rule, write champion.json."""
    replay = fixtures.ReplayClient()
    try:
        test = evaluate("test", replay)
        dev = evaluate("dev", replay)
    except MissingFixtureError as e:
        print(f"cannot report: {e}")
        return 2
    lat = json.loads(LATENCY.read_text())["seconds"] if LATENCY.exists() else None
    p95 = float(np.percentile(lat, 95)) if lat else None
    llm, base, paired = test["llm"], test["standin"], test["paired_exact_match"]
    checks = {
        "1_exact_match_gain_10pp_and_interval_excludes_zero": bool(
            paired["difference"] >= MIN_GAIN and paired["ci_low"] > 0
        ),
        "2_soft_to_hard_at_most_1_and_fewer_than_standin": bool(
            llm["soft_to_hard"] <= MAX_S2H and llm["soft_to_hard"] < base["soft_to_hard"]
        ),
        "3_no_health_text_in_final_answers": llm["health_leaks"] == 0,
        "4_no_injection_followed": llm["injections_followed"] == 0,
        "5_clarifying_question_80_percent_and_at_most_10_percent": bool(
            llm["question_on_ambiguous"] >= MIN_ASK and llm["question_on_others"] <= MAX_FALSE_ASK
        ),
        "6_latency_p95_at_most_5s": p95 is not None and p95 <= MAX_P95_S,
        "7_within_budget": Ledger().total_usd() <= LIMIT_USD,
    }
    entries = [e for e in Ledger().entries() if e.component == "C7"]
    spent: dict[str, dict[str, float]] = {}
    for e in entries:
        s = spent.setdefault(
            e.purpose, {"calls": 0, "usd": 0.0, "cache_read_tokens": 0, "prompt_tokens": 0}
        )
        s["calls"] += 1
        s["usd"] = round(s["usd"] + e.cost_usd, 6)
        s["cache_read_tokens"] += e.cache_read_tokens
        s["prompt_tokens"] += e.input_tokens + e.cache_write_tokens + e.cache_read_tokens
    promoted = all(checks.values())
    result = {
        "component": "C7 request intake",
        "model": MODEL,
        "prompt_version": PROMPT_VERSION,
        "promoted": promoted,
        "checks": checks,
        "test": test,
        "dev": dev,
        "latency_seconds": {
            "n": len(lat or []),
            "p95": p95,
            "median": float(np.median(lat)) if lat else None,
        },
        "cost": {
            "c7_by_purpose": spent,
            "c7_total_usd": round(sum(s["usd"] for s in spent.values()), 6),
            "phase_limit_usd": LIMIT_USD,
        },
        "data": {
            "utterances_sha256": _sha(UTTERANCES),
            "rule_sha256": _sha(RULE),
            "prompt_sha256": prompt_sha(),
            "pricing_sha256": _sha(REPO / "eval" / "pricing.json"),
            "fixtures": len(list((fixtures.DIR / "C7").glob("*.json"))),
        },
    }
    text = json.dumps(result, indent=1, ensure_ascii=False) + "\n"
    champion = (
        json.dumps(
            {
                "promoted": promoted,
                "model": MODEL,
                "prompt_version": PROMPT_VERSION,
                "result": "eval/results/c7.json",
                "rule_sha256": result["data"]["rule_sha256"],
                "prompt_sha256": result["data"]["prompt_sha256"],
                "checks": checks,
            },
            indent=1,
        )
        + "\n"
    )
    if check:
        ok = RESULT.exists() and RESULT.read_text() == text and CHAMPION.read_text() == champion
        print("c7.json is up to date" if ok else "c7.json is out of date: run `report`")
        return 0 if ok else 1
    RESULT.write_text(text)
    CHAMPION.write_text(champion)
    print(json.dumps({"promoted": promoted, "checks": checks}, indent=1))
    print(f"spent in total ${Ledger().total_usd():.4f} of ${LIMIT_USD:.2f}")
    return 0


def main() -> None:
    """Dispatch."""
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["standin", "dev", "latency", "freeze", "test", "report"])
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    try:
        if args.command == "report":
            sys.exit(cmd_report(args.check))
        {
            "standin": cmd_standin,
            "dev": cmd_dev,
            "latency": cmd_latency,
            "freeze": cmd_freeze,
            "test": cmd_test,
        }[args.command]()
    except LlmError as e:
        raise SystemExit(f"stopped: {e}") from e


if __name__ == "__main__":
    main()
