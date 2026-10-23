"use client";

import { unwrap, type components } from "@dienstpilot/api-client";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { EngineBadge } from "@/components/EngineBadge";
import { Async, PageHeader, Table } from "@/components/ui";
import { useFmt, type Fmt } from "@/lib/fmt";
import { useQuery } from "@/lib/hooks";

type Component = components["schemas"]["ComponentOut"];
type Metrics = Record<string, unknown>;

const num = (o: unknown, k: string): number | null => {
  const v = (o as Metrics | undefined)?.[k];
  return typeof v === "number" ? v : null;
};

function C1Metrics({ m, fmt }: { m: Metrics; fmt: Fmt }): ReactNode {
  const t = useTranslations("w13");
  const s = m.summary as { c1?: Metrics; baseline?: Metrics } | undefined;
  const rows: { key: string; label: string; c1: string; base: string }[] = [];
  const add = (
    key: "wishes_granted_rate" | "hard_violations" | "overtime_hours" | "burden_spread_mean",
    label: string,
    f: (n: number) => string,
  ): void => {
    const a = num(s?.c1, key);
    const b = num(s?.baseline, key);
    if (a !== null && b !== null) rows.push({ key, label, c1: f(a), base: f(b) });
  };
  add("wishes_granted_rate", t("m.wishes"), (n) => fmt.percent(n));
  add("hard_violations", t("m.hard"), (n) => fmt.number(n, 0));
  add("overtime_hours", t("m.overtime"), (n) => fmt.hours(n));
  add("burden_spread_mean", t("m.spread"), (n) => fmt.number(n, 1));
  const secs = num(m, "median_seconds_per_variant");
  return (
    <div className="flex flex-col gap-2" data-testid="c1-metrics">
      <p className="caption m-0 text-ink-muted">
        {t("evalSource", {
          source: String(m.source ?? ""),
          months: String(m.held_out_months ?? ""),
        })}
      </p>
      <Table label={t("m.label")}>
        <thead>
          <tr>
            <th scope="col">{t("m.metric")}</th>
            <th scope="col" className="text-right">
              C1
            </th>
            <th scope="col" className="text-right">
              {t("m.baseline")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              <td className="num-time text-right">{r.c1}</td>
              <td className="num-time text-right text-ink-muted">{r.base}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      {secs !== null ? (
        <p className="caption m-0 text-ink-muted">
          {t("m.seconds", { seconds: fmt.number(secs, 2) })}
        </p>
      ) : null}
      {Array.isArray(m.limitations) ? (
        <details>
          <summary className="label cursor-pointer">{t("limitations")}</summary>
          <ul className="caption m-0 list-disc pl-5 text-ink-muted">
            {(m.limitations as string[]).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function C2Metrics({ m }: { m: Metrics }): ReactNode {
  const t = useTranslations("w13");
  const s = m.summary as Record<string, string> | undefined;
  return (
    <div className="flex flex-col gap-2" data-testid="c2-metrics">
      <p className="caption m-0 text-ink-muted">
        {t("evalSource", { source: "eval/results/c2.json", months: "" })}
      </p>
      <dl className="body m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <dt>{t("m.agreePublished")}</dt>
        <dd className="num-time m-0 text-right">{s?.agreement_published_months ?? "–"}</dd>
        <dt>{t("m.agreeRandom")}</dt>
        <dd className="num-time m-0 text-right">{s?.agreement_random_changes ?? "–"}</dd>
      </dl>
    </div>
  );
}

type Test = { mae: number; poisson_deviance: number; coverage_80: number };

function C3Metrics({ m, fmt }: { m: Metrics; fmt: Fmt }): ReactNode {
  const t = useTranslations("w13");
  const test = m.test_2025 as Record<string, Test> | undefined;
  const champion =
    (m.champion as { kind?: string; promoted_challenger?: boolean } | undefined) ?? {};
  const kinds = ["seasonal_naive", "poisson_glm", "nb_glm", "lightgbm"] as const;
  const kind = champion.kind as (typeof kinds)[number] | undefined;
  const recovery = (m.truth_recovery as { models?: Record<string, { h14?: Metrics }> } | undefined)
    ?.models;
  const corr = num(recovery?.[kind ?? ""]?.h14, "corr_28d_smoothed_with_true");
  return (
    <div className="flex flex-col gap-2" data-testid="c3-metrics">
      <p className="caption m-0 text-ink-muted">
        {t("evalSource", { source: "eval/results/c3.json", months: "" })}
      </p>
      {kind ? (
        <p className="body-strong m-0" data-testid="c3-served">
          {t("m.c3Served", { model: t(`m.c3Models.${kind}`) })}
        </p>
      ) : null}
      <Table label={t("m.label")}>
        <thead>
          <tr>
            <th scope="col">{t("m.c3Model")}</th>
            <th scope="col" className="text-right">
              {t("m.c3Mae")}
            </th>
            <th scope="col" className="text-right">
              {t("m.c3Deviance")}
            </th>
            <th scope="col" className="text-right">
              {t("m.c3Coverage")}
            </th>
          </tr>
        </thead>
        <tbody>
          {kinds.map((k) =>
            test?.[k] ? (
              <tr key={k} data-served={k === kind}>
                <td className={k === kind ? "body-strong" : undefined}>{t(`m.c3Models.${k}`)}</td>
                <td className="num-time text-right">{fmt.number(test[k].mae, 2)}</td>
                <td className="num-time text-right">{fmt.number(test[k].poisson_deviance, 2)}</td>
                <td className="num-time text-right">{fmt.percent(test[k].coverage_80)}</td>
              </tr>
            ) : null,
          )}
        </tbody>
      </Table>
      <p className="caption m-0 text-ink-muted" data-testid="c3-promotion">
        {champion.promoted_challenger ? t("m.c3Promoted") : t("m.c3NotPromoted")}
      </p>
      {corr !== null ? (
        <p className="caption m-0 text-ink-muted">
          {t("m.c3Truth", { corr: fmt.number(corr, 2) })}
        </p>
      ) : null}
    </div>
  );
}

type C4Test = { wish: { mean_ll: number }; avoid: { mean_ll: number } };

function C4Metrics({ m, fmt }: { m: Metrics; fmt: Fmt }): ReactNode {
  const t = useTranslations("w13");
  const test = m.test_2025 as Record<string, C4Test> | undefined;
  const champion = (m.champion as { kind?: string; promoted_learner?: boolean } | undefined) ?? {};
  const kinds = ["pooled", "raw", "hierarchical"] as const;
  const kind = champion.kind as (typeof kinds)[number] | undefined;
  const recovery = (m.truth_recovery as { models?: Record<string, { all?: Metrics }> } | undefined)
    ?.models;
  const corr = num(recovery?.[kind ?? ""]?.all, "mean_spearman_vs_affinity");
  return (
    <div className="flex flex-col gap-2" data-testid="c4-metrics">
      <p className="caption m-0 text-ink-muted">
        {t("evalSource", { source: "eval/results/c4.json", months: "" })}
      </p>
      {kind ? (
        <p className="body-strong m-0" data-testid="c4-served">
          {t("m.c4Served", { model: t(`m.c4Models.${kind}`) })}
        </p>
      ) : null}
      <Table label={t("m.label")}>
        <thead>
          <tr>
            <th scope="col">{t("m.c4Model")}</th>
            <th scope="col" className="text-right">
              {t("m.c4Wish")}
            </th>
            <th scope="col" className="text-right">
              {t("m.c4Avoid")}
            </th>
          </tr>
        </thead>
        <tbody>
          {kinds.map((k) =>
            test?.[k] ? (
              <tr key={k} data-served={k === kind}>
                <td className={k === kind ? "body-strong" : undefined}>{t(`m.c4Models.${k}`)}</td>
                <td className="num-time text-right">{fmt.number(test[k].wish.mean_ll, 4)}</td>
                <td className="num-time text-right">{fmt.number(test[k].avoid.mean_ll, 4)}</td>
              </tr>
            ) : null,
          )}
        </tbody>
      </Table>
      <p className="caption m-0 text-ink-muted" data-testid="c4-promotion">
        {champion.promoted_learner ? t("m.c4Promoted") : t("m.c4NotPromoted")}
      </p>
      {corr !== null ? (
        <p className="caption m-0 text-ink-muted">
          {t("m.c4Truth", { corr: fmt.number(corr, 2) })}
        </p>
      ) : null}
    </div>
  );
}

type C5Test = { brier: number; auc: number; ece: number };
type C5Policy = {
  time_to_fill_mean_min: { mean: number };
  cover_burden_gini: { mean: number };
  escalation_rate: { mean: number };
  contacted_per_filled_gap: { mean: number };
};

function C5Metrics({ m, fmt }: { m: Metrics; fmt: Fmt }): ReactNode {
  const t = useTranslations("w13");
  const test = m.test_2025 as Record<string, C5Test> | undefined;
  const champion = (m.champion as { kind?: string; promoted_learner?: boolean } | undefined) ?? {};
  const kinds = ["base_rate", "logistic", "lightgbm"] as const;
  const kind = champion.kind as (typeof kinds)[number] | undefined;
  const replay = m.replay_2025 as
    { policies?: Record<string, C5Policy>; replicates?: number } | undefined;
  const policies = [
    "fairness_first_champion",
    "stand_in",
    "most_reliable_first",
    "fairness_first_exact_buckets_sensitivity",
  ] as const;
  return (
    <div className="flex flex-col gap-2" data-testid="c5-metrics">
      <p className="caption m-0 text-ink-muted">
        {t("evalSource", { source: "eval/results/c5.json", months: "" })}
      </p>
      {kind ? (
        <p className="body-strong m-0" data-testid="c5-served">
          {t("m.c5Served", { model: t(`m.c5Models.${kind}`) })}
        </p>
      ) : null}
      <Table label={t("m.label")}>
        <thead>
          <tr>
            <th scope="col">{t("m.c5Model")}</th>
            <th scope="col" className="text-right">
              {t("m.c5Brier")}
            </th>
            <th scope="col" className="text-right">
              {t("m.c5Auc")}
            </th>
            <th scope="col" className="text-right">
              {t("m.c5Ece")}
            </th>
          </tr>
        </thead>
        <tbody>
          {kinds.map((k) =>
            test?.[k] ? (
              <tr key={k} data-served={k === kind}>
                <td className={k === kind ? "body-strong" : undefined}>{t(`m.c5Models.${k}`)}</td>
                <td className="num-time text-right">{fmt.number(test[k].brier, 4)}</td>
                <td className="num-time text-right">{fmt.number(test[k].auc, 3)}</td>
                <td className="num-time text-right">{fmt.number(test[k].ece, 3)}</td>
              </tr>
            ) : null,
          )}
        </tbody>
      </Table>
      <p className="caption m-0 text-ink-muted" data-testid="c5-promotion">
        {champion.promoted_learner ? t("m.c5Promoted") : t("m.c5NotPromoted")}
      </p>
      {replay?.policies ? (
        <>
          <p className="body-strong m-0">
            {t("m.c5ReplayTitle", { n: String(replay.replicates ?? "") })}
          </p>
          <Table label={t("m.c5ReplayTitle", { n: String(replay.replicates ?? "") })}>
            <thead>
              <tr>
                <th scope="col">{t("m.c5Policy")}</th>
                <th scope="col" className="text-right">
                  {t("m.c5Time")}
                </th>
                <th scope="col" className="text-right">
                  {t("m.c5Gini")}
                </th>
                <th scope="col" className="text-right">
                  {t("m.c5Escalation")}
                </th>
                <th scope="col" className="text-right">
                  {t("m.c5Contacted")}
                </th>
              </tr>
            </thead>
            <tbody>
              {policies.map((k) =>
                replay.policies?.[k] ? (
                  <tr key={k} data-testid={`c5-policy-${k}`}>
                    <td>{t(`m.c5Policies.${k}`)}</td>
                    <td className="num-time text-right">
                      {fmt.number(replay.policies[k].time_to_fill_mean_min.mean, 1)}
                    </td>
                    <td className="num-time text-right">
                      {fmt.number(replay.policies[k].cover_burden_gini.mean, 2)}
                    </td>
                    <td className="num-time text-right">
                      {fmt.percent(replay.policies[k].escalation_rate.mean)}
                    </td>
                    <td className="num-time text-right">
                      {fmt.number(replay.policies[k].contacted_per_filled_gap.mean, 2)}
                    </td>
                  </tr>
                ) : null,
              )}
            </tbody>
          </Table>
          <p className="caption m-0 text-ink-muted">{t("m.c5ReplayNote")}</p>
        </>
      ) : null}
    </div>
  );
}

type C6Cell = { precision: number | null; recall: number | null; n: number };
type C6Test = { natural: C6Cell; stress: C6Cell; pooled: C6Cell };

function C6Metrics({ m, fmt }: { m: Metrics; fmt: Fmt }): ReactNode {
  const t = useTranslations("w13");
  const test = m.test_2025 as Record<string, C6Test> | undefined;
  const champion = (m.champion as { kind?: string; promoted_learner?: boolean } | undefined) ?? {};
  const kinds = ["stand_in", "logistic", "lightgbm"] as const;
  const kind = champion.kind as (typeof kinds)[number] | undefined;
  const pct = (v: number | null | undefined): string =>
    v === null || v === undefined ? "–" : fmt.percent(v);
  const lat = (m.latency_full_hint_path as Record<string, { p95_ms: number }> | undefined)?.[
    kind ?? "lightgbm"
  ];
  const agr = m.agreement_with_solver_2025 as
    Record<string, { agreement_rate: number | null }> | undefined;
  const limit = num(
    (m.promotion as { checks?: Record<string, unknown> } | undefined)?.checks
      ?.hint_latency_p95_under_limit,
    "limit_ms",
  );
  return (
    <div className="flex flex-col gap-2" data-testid="c6-metrics">
      <p className="caption m-0 text-ink-muted">
        {t("evalSource", { source: "eval/results/c6.json", months: "" })}
      </p>
      {kind ? (
        <p className="body-strong m-0" data-testid="c6-served">
          {t("m.c6Served", { model: t(`m.c6Models.${kind}`) })}
        </p>
      ) : null}
      <Table label={t("m.label")}>
        <thead>
          <tr>
            <th scope="col">{t("m.c6Model")}</th>
            <th scope="col" className="text-right">
              {t("m.c6Natural")}
            </th>
            <th scope="col" className="text-right">
              {t("m.c6Stress")}
            </th>
            <th scope="col" className="text-right">
              {t("m.c6Pooled")}
            </th>
            <th scope="col" className="text-right">
              {t("m.c6Recall")}
            </th>
          </tr>
        </thead>
        <tbody>
          {kinds.map((k) =>
            test?.[k] ? (
              <tr key={k} data-served={k === kind} data-testid={`c6-model-${k}`}>
                <td className={k === kind ? "body-strong" : undefined}>{t(`m.c6Models.${k}`)}</td>
                <td className="num-time text-right">{pct(test[k].natural.precision)}</td>
                <td className="num-time text-right">{pct(test[k].stress.precision)}</td>
                <td className="num-time text-right">{pct(test[k].pooled.precision)}</td>
                <td className="num-time text-right">{pct(test[k].pooled.recall)}</td>
              </tr>
            ) : null,
          )}
        </tbody>
      </Table>
      <p className="caption m-0 text-ink-muted" data-testid="c6-promotion">
        {champion.promoted_learner ? t("m.c6Promoted") : t("m.c6NotPromoted")}
      </p>
      {lat && limit !== null ? (
        <p className="caption m-0 text-ink-muted" data-testid="c6-latency">
          {t("m.c6Latency", { ms: fmt.number(lat.p95_ms, 1), limit: fmt.number(limit, 0) })}
        </p>
      ) : null}
      {agr ? (
        <p className="caption m-0 text-ink-muted" data-testid="c6-agreement">
          {t("m.c6Agreement", {
            natural: pct(agr.natural?.agreement_rate),
            pooled: pct(agr["pooled including simulated stress states"]?.agreement_rate),
          })}
        </p>
      ) : null}
      <p className="caption m-0 text-ink-muted">{t("m.c6Note")}</p>
    </div>
  );
}

type C7Side = {
  exact_match: number;
  soft_to_hard: number;
  injections_followed: number;
  injections: number;
  question_on_ambiguous: number;
  question_on_others: number;
};

function C7Metrics({ m, fmt }: { m: Metrics; fmt: Fmt }): ReactNode {
  const t = useTranslations("w13");
  const test = m.test as { llm?: C7Side; standin?: C7Side } | undefined;
  const checks = m.checks as Record<string, boolean> | undefined;
  const promoted = m.promoted === true;
  const cost = m.cost as { c7_total_usd?: number; phase_limit_usd?: number } | undefined;
  const rows: { key: string; label: string; f: (s: C7Side) => string }[] = [
    { key: "em", label: t("m.c7Exact"), f: (s) => fmt.percent(s.exact_match) },
    { key: "s2h", label: t("m.c7SoftHard"), f: (s) => fmt.number(s.soft_to_hard, 0) },
    {
      key: "inj",
      label: t("m.c7Injection"),
      f: (s) => `${String(s.injections_followed)} / ${String(s.injections)}`,
    },
    {
      key: "q",
      label: t("m.c7Question"),
      f: (s) => `${fmt.percent(s.question_on_ambiguous)} / ${fmt.percent(s.question_on_others)}`,
    },
  ];
  return (
    <div className="flex flex-col gap-2" data-testid="c7-metrics">
      <p className="caption m-0 text-ink-muted">
        {t("evalSource", { source: "eval/results/c7.json", months: "" })}
      </p>
      <p className="body-strong m-0" data-testid="c7-served">
        {promoted ? t("m.c7ServedLlm", { model: String(m.model ?? "") }) : t("m.c7ServedStandIn")}
      </p>
      {test?.llm && test.standin ? (
        <Table label={t("m.label")}>
          <thead>
            <tr>
              <th scope="col">{t("m.metric")}</th>
              <th scope="col" className="text-right">
                {t("m.c7Llm")}
              </th>
              <th scope="col" className="text-right">
                {t("m.c7StandIn")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td className="num-time text-right">{r.f(test.llm as C7Side)}</td>
                <td className="num-time text-right text-ink-muted">
                  {r.f(test.standin as C7Side)}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
      {checks ? (
        <p className="caption m-0 text-ink-muted" data-testid="c7-promotion">
          {t(promoted ? "m.c7Promoted" : "m.c7NotPromoted", {
            failed: Object.entries(checks)
              .filter(([, ok]) => !ok)
              .map(([k]) => k.split("_")[0])
              .join(", "),
          })}
        </p>
      ) : null}
      {cost?.c7_total_usd !== undefined ? (
        <p className="caption m-0 text-ink-muted">
          {t("m.c7Cost", {
            spent: fmt.number(cost.c7_total_usd, 3),
            limit: fmt.number(cost.phase_limit_usd ?? 0, 2),
          })}
        </p>
      ) : null}
      <p className="caption m-0 text-ink-muted">{t("m.c7Note")}</p>
    </div>
  );
}

type RagMode = { "recall@5": number; mrr: number };

function RagMetrics({ m, fmt }: { m: Metrics; fmt: Fmt }): ReactNode {
  const t = useTranslations("w13");
  const served = (m.served as { method?: string } | undefined)?.method;
  const modes = (m.test as { modes?: Record<string, RagMode> } | undefined)?.modes;
  const checks = m.checks as Record<string, boolean> | undefined;
  const ns = (m.test as { no_source?: Record<string, number> } | undefined)?.no_source;
  const kinds = ["vector", "hybrid", "fts"] as const;
  const failed = checks?.["hybrid_recall@5_at_least_best_single"] === false;
  return (
    <div className="flex flex-col gap-2" data-testid="rag-metrics">
      <p className="caption m-0 text-ink-muted">
        {t("evalSource", { source: "eval/results/rag.json", months: "" })}
      </p>
      {served ? (
        <p className="body-strong m-0" data-testid="rag-served">
          {t("m.ragServed", { method: t(`m.ragMethods.${served as "vector"}`) })}
        </p>
      ) : null}
      <Table label={t("m.label")}>
        <thead>
          <tr>
            <th scope="col">{t("m.ragMethod")}</th>
            <th scope="col" className="text-right">
              {t("m.ragRecall")}
            </th>
            <th scope="col" className="text-right">
              {t("m.ragMrr")}
            </th>
          </tr>
        </thead>
        <tbody>
          {kinds.map((k) =>
            modes?.[k] ? (
              <tr key={k} data-served={k === served}>
                <td className={k === served ? "body-strong" : undefined}>
                  {t(`m.ragMethods.${k}`)}
                </td>
                <td className="num-time text-right">{fmt.percent(modes[k]["recall@5"])}</td>
                <td className="num-time text-right">{fmt.number(modes[k].mrr, 2)}</td>
              </tr>
            ) : null,
          )}
        </tbody>
      </Table>
      {failed ? (
        <p className="caption m-0 text-ink-muted" data-testid="rag-check">
          {t("m.ragCheckFailed")}
        </p>
      ) : null}
      {ns ? (
        <p className="caption m-0 text-ink-muted">
          {t("m.ragNoSource", {
            found: String(ns.unanswerable_rejected ?? ""),
            n: String(ns.n_unanswerable ?? ""),
          })}
        </p>
      ) : null}
      <p className="caption m-0 text-ink-muted">{t("m.ragCaveat")}</p>
    </div>
  );
}

function Card({ c }: { c: Component }): ReactNode {
  const t = useTranslations("w13");
  const fmt = useFmt();
  const known = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "RAG"].includes(c.component);
  const standIn = c.implementation === "stand-in";
  const metrics = c.eval_metric as Metrics | null;
  return (
    <article
      className="flex flex-col gap-3 border border-rule bg-sheet p-5"
      data-testid={`component-${c.component}`}
      data-implementation={c.implementation}
      aria-label={c.component}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="caption text-ink-muted">{c.component}</span>
        <span className="caption rounded-mark border border-rule-strong px-2">
          {t(`kinds.${c.kind as "ml"}`)}
        </span>
      </div>
      <h3 className="heading m-0">{known ? t(`name.${c.component as "C1"}`) : c.component}</h3>
      <EngineBadge
        engine={{
          component: c.component,
          implementation: c.implementation,
          version: c.version,
          note: c.note,
        }}
      />
      <p className="body m-0">{known ? t(`about.${c.component as "C1"}`) : c.note}</p>
      <dl className="body m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-ink-muted">{t("version")}</dt>
        <dd className="num-time m-0">{c.version}</dd>
        <dt className="text-ink-muted">{t("lastTrained")}</dt>
        <dd className="m-0">
          {c.component === "C3"
            ? t("trainedC3")
            : c.component === "C4"
              ? t("trainedC4")
              : c.component === "C5"
                ? t("trainedC5")
                : c.component === "C6"
                  ? t("trainedC6")
                  : c.component === "RAG"
                    ? t("trainedRAG")
                    : c.component === "C7"
                      ? t("trainedC7")
                      : c.kind === "ml"
                        ? t("notTrained")
                        : t("notApplicable")}
        </dd>
        <dt className="text-ink-muted">{t("modelCard")}</dt>
        <dd className="m-0">
          {c.component === "C3"
            ? t("modelCardC3")
            : c.component === "C4"
              ? t("modelCardC4")
              : c.component === "C5"
                ? t("modelCardC5")
                : c.component === "C6"
                  ? t("modelCardC6")
                  : c.component === "RAG"
                    ? t("modelCardRAG")
                    : c.component === "C7"
                      ? t("modelCardC7")
                      : t("modelCardNone")}
        </dd>
        <dt className="text-ink-muted">{t("canChange")}</dt>
        <dd className="body-strong m-0" data-testid="can-change">
          {c.can_change_roster ? t("yes") : t("no")}
        </dd>
      </dl>
      {metrics && c.component === "C1" ? (
        <C1Metrics m={metrics} fmt={fmt} />
      ) : metrics && c.component === "C2" ? (
        <C2Metrics m={metrics} />
      ) : metrics && c.component === "C3" ? (
        <C3Metrics m={metrics} fmt={fmt} />
      ) : metrics && c.component === "C4" ? (
        <C4Metrics m={metrics} fmt={fmt} />
      ) : metrics && c.component === "C5" ? (
        <C5Metrics m={metrics} fmt={fmt} />
      ) : metrics && c.component === "C6" ? (
        <C6Metrics m={metrics} fmt={fmt} />
      ) : metrics && c.component === "C7" ? (
        <C7Metrics m={metrics} fmt={fmt} />
      ) : metrics && c.component === "RAG" ? (
        <RagMetrics m={metrics} fmt={fmt} />
      ) : (
        <p
          className="body m-0 rounded-mark border border-dashed border-pencil bg-pencil-wash p-3 text-pencil"
          data-testid="metric-placeholder"
        >
          {standIn ? t("placeholder", { phase: c.planned_phase ?? 0 }) : t("noMetric")}
        </p>
      )}
    </article>
  );
}

const GROUPS = [
  { key: "rules", kinds: ["optimization", "deterministic"] },
  { key: "ml", kinds: ["ml"] },
  { key: "retrieval", kinds: ["retrieval"] },
  { key: "llm", kinds: ["llm"] },
] as const;

/**
 * The summary line is computed from the cards on screen. It counts the numbered components (C1 to
 * C8) only, so "6 of 8" is always about those eight; cards without a number (the rulebook
 * search) are named after it with their own status, never added to the count.
 */
function statusLine(list: Component[], t: ReturnType<typeof useTranslations<"w13">>): string {
  const numbered = list.filter((c) => /^C\d$/.test(c.component));
  const extras = list.filter((c) => !/^C\d$/.test(c.component));
  const line = t("status", {
    built: numbered.filter((c) => c.implementation === "built").length,
    total: numbered.length,
    standIn: numbered.filter((c) => c.implementation === "stand-in").length,
  });
  if (extras.length === 0) return line;
  const names = extras
    .map(
      (c) =>
        `${t(`name.${c.component as "RAG"}`)} (${t(c.implementation === "built" ? "built" : "standIn")})`,
    )
    .join(", ");
  return `${line} · ${t("statusExtra", { extras: names })}`;
}

/** W13: one card per component with its real status; the portfolio's "how it works" screen. */
export default function TransparencyPage(): ReactNode {
  const t = useTranslations("w13");
  const q = useQuery((api) => unwrap(api.GET("/transparency/components")), []);
  return (
    <>
      <PageHeader title={t("headline")} status={q.data ? statusLine(q.data, t) : undefined} />
      <p className="body m-0 max-w-[80ch]">{t("intro")}</p>
      <Async query={q}>
        {(list) => (
          <>
            <div className="grid border border-rule bg-sheet [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
              {GROUPS.map((g) => {
                const members = list.filter((c) => (g.kinds as readonly string[]).includes(c.kind));
                if (members.length === 0) return null;
                return (
                  <section
                    key={g.key}
                    className="flex flex-col gap-1 border-r border-rule p-4 last:border-r-0"
                  >
                    <h2 className="label m-0 text-ink-muted">
                      {t(`group.${g.key}.title`)} · {members.map((c) => c.component).join(", ")}
                    </h2>
                    <p className="body m-0">{t(`group.${g.key}.tagline`)}</p>
                  </section>
                );
              })}
            </div>
            <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
              {list.map((c) => (
                <Card key={c.component} c={c} />
              ))}
            </div>
          </>
        )}
      </Async>
    </>
  );
}
