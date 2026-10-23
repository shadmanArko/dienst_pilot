"""The API image must contain every bundle an engine loads (a missing one made every screen 500)."""

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ENGINES = REPO / "backend" / "src" / "dienstpilot" / "engines"


def test_every_engine_bundle_directory_is_copied_into_the_image() -> None:
    dockerfile = (REPO / "backend" / "Dockerfile").read_text()
    dirs = set()
    for path in ENGINES.glob("c[0-9].py"):
        for m in re.finditer(r'ML_ROOT / "(\w+)" / "artifacts" / "champion"', path.read_text()):
            dirs.add(f"ml/{m.group(1)}/artifacts")
    assert dirs == {
        "ml/absence_forecast/artifacts",
        "ml/preference_learner/artifacts",
        "ml/cover_ranker/artifacts",
        "ml/leave_surrogate/artifacts",
    }
    for d in dirs:
        assert f"COPY {d} {d}" in dockerfile, f"{d} is not copied into the API image"
        assert (REPO / d / "champion" / "bundle.json").exists()
