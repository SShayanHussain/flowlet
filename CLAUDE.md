# CLAUDE.md — Flowlet

> Standing rules. Read this + ARCHITECTURE.md + DECISIONS.md + ROADMAP.md every session.
> **This project reuses the SaaS shell + UI kit from Deflekt (P1).** Copy auth, app layout, and
> `packages/ui/` in first; only the builder/runs surfaces are net-new.

## Product
**Flowlet** — AI-native workflow automation. Users compose trigger→action→AI-step→branch→output
pipelines that run reliably at volume. Full PRD: `docs/02-prd-workflow-automation-platform.md`.

## Stack
- **Node/TypeScript throughout** (event/IO-heavy domain; single-language keeps the concurrency story clean).
- **API:** Fastify or NestJS. **UI:** Next.js builder. **DB:** Postgres. **Cache/queue:** Redis + **BullMQ**.
- **Proxy:** nginx (TLS, routing, first-line rate limiting).
- **UI kit + auth:** reused from Deflekt.

## How to work (enforce)
1. **Plan before code** — files, approach, tests; wait for approval.
2. **Vertical slices** — the execution engine is designed and reviewed BEFORE any UI.
3. **Update DECISIONS.md** after choices; check off ROADMAP.md slices.
4. **Explain tradeoffs** — especially concurrency/queue/idempotency decisions.
5. **Small commits.**

## Conventions
- Structure: `api/`, `worker/`, `web/` (Next.js), `packages/ui/` (from P1), `docs/`.
- **Runs are jobs, not requests** — workflow execution NEVER happens in the HTTP handler.
- Encrypt connection credentials at rest.
- API responses: `{ data }` / `{ error: { code, message } }`.
- Migrations for every schema change.

## Hard rules — do NOT
- Do NOT execute a workflow run inline in a request — enqueue it (BullMQ).
- Do NOT allow double-execution — idempotency keys per (workflow, trigger event) and on output sends.
- Do NOT let one user's runs starve others — per-user concurrency limits / fair queuing.
- Do NOT let a slow AI/HTTP step block the pool — separate queues + per-step timeouts.
- Do NOT store secrets in code; do NOT add deps without asking.
- Do NOT reach for sharding or k8s at MVP scale (see DECISIONS.md for triggers).

## Concurrency model (the heart of this product)
Enqueue run → worker walks the DAG in topological order → each step's output feeds successors.
AI step = prompt from upstream data → LLM → validate against declared JSON schema (repair/reject) →
structured output for branching. Retries: per-step exponential backoff; distinguish retryable
(timeout/5xx) from terminal (bad schema after N repairs). AI/slow steps get their own queue.

## Commands
- Dev: `docker compose up` (api + worker + postgres + redis + nginx)
- API: `cd api && npm run dev` · Worker: `cd worker && npm run dev` · Web: `cd web && npm run dev`
- Test: `npm test` · Lint: `npm run lint` · Migrate: `npm run db:migrate`
- Load test: `npm run loadtest` (k6/Artillery — proves concurrency holds)

## Definition of done for a slice
Runs locally, tests pass (incl. no-double-execution test where relevant), lint clean, docs updated, one commit.
