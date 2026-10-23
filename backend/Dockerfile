FROM python:3.12-slim

# LightGBM (C3 serving) needs the OpenMP runtime
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv
ENV UV_PROJECT_ENVIRONMENT=/opt/venv UV_LINK_MODE=copy PATH="/opt/venv/bin:$PATH"

WORKDIR /app
COPY pyproject.toml uv.lock ./
COPY backend/pyproject.toml backend/pyproject.toml
COPY backend/src backend/src
COPY engine engine
# C3: the serving package and the committed champion bundle (no training stack, no MLflow)
COPY ml/pyproject.toml ml/pyproject.toml
COPY ml/src ml/src
COPY ml/absence_forecast/artifacts ml/absence_forecast/artifacts
# C4 to C6: the same kind of committed bundle each (every engine loads its own at start)
COPY ml/preference_learner/artifacts ml/preference_learner/artifacts
COPY ml/cover_ranker/artifacts ml/cover_ranker/artifacts
COPY ml/leave_surrogate/artifacts ml/leave_surrogate/artifacts
# The rulebook: the agents package, the committed corpus and vectors (the bge-m3 model itself is
# mounted, see infra/compose.dev.yml; without it search is full-text only and says so)
COPY agents/pyproject.toml agents/pyproject.toml
COPY agents/src agents/src
COPY agents/rag agents/rag
COPY agents/intake agents/intake
COPY agents/fixtures agents/fixtures
COPY mcp_servers/pyproject.toml mcp_servers/pyproject.toml
COPY synthdata/pyproject.toml synthdata/pyproject.toml
COPY eval/pyproject.toml eval/pyproject.toml
RUN uv sync --frozen --no-dev --package dienstpilot
# The transparency screen (W13) shows the eval summaries written by eval/ scripts.
COPY eval/results eval/results
COPY eval/pricing.json eval/pricing.json
COPY eval/usage eval/usage

COPY backend backend
WORKDIR /app/backend
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn dienstpilot.main:app --host 0.0.0.0 --port 8000"]
