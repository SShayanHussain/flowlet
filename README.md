# Flowlet

**AI-native workflow automation.** Compose `trigger → action → AI-step → branch → output`
pipelines that classify, extract, and decide — and run reliably at volume without per-task pricing
that punishes success.

> Full product spec: [`docs/02-prd-workflow-automation-platform.md`](docs/02-prd-workflow-automation-platform.md).
> Standing rules: [`CLAUDE.md`](CLAUDE.md) · Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md) ·
> Decisions log: [`DECISIONS.md`](DECISIONS.md) · Roadmap: [`ROADMAP.md`](ROADMAP.md) ·
> Deployment lessons: [`PLAYBOOK.md`](PLAYBOOK.md).

## Architecture (the point of this project)

```
 webhooks / cron / manual
        │
   nginx (TLS, routing, edge rate-limit)
        │  /api/auth,/api/workspaces → web    │  /api/* → api    │  / → web
        ▼                                      ▼
   web (Next.js)                          api (Fastify)  ──enqueue──▶  Redis + BullMQ
   SaaS shell + auth (issues JWT)         verifies JWT, CRUD,              │
   builder / runs UI                      trigger ingest                  ▼ dequeue
        │                                                            worker (BullMQ)
        └───────────────── Postgres ─────────────────────────────── walks the run DAG
```

**Runs are jobs, not requests** — the API never executes a workflow inline; it enqueues, and the
worker pool walks the DAG. Idempotency keys prevent double-execution; a separate AI/slow-step queue
keeps one slow LLM call from starving the fast pool. See DECISIONS.md.

## Repo layout

| Path | What |
|------|------|
| `web/` | Next.js — SaaS shell + auth (copied from Deflekt P1) + the net-new node-graph builder, runs/trace, connections, dashboard |
| `api/` | Fastify — workflow/run/connection CRUD + webhook ingest; verifies the shared JWT; **enqueues** runs |
| `worker/` | BullMQ — dequeues + walks the run DAG; isolated AI/slow-step queue; scales independently |
| `packages/shared/` | Cross-service contract: JWT verify, queue topology, `{data}`/`{error}` envelope |
| `packages/ui/` | Designated home for the shared UI kit (lives in `web/` until a 2nd consumer — see its README) |
| `db/` · `nginx/` · `docs/` | migrations escape hatch · reverse-proxy configs · specs |

## What was reused from Deflekt (P1)

The SaaS shell + UI kit + **auth were copied, not rebuilt**: JWT access/refresh, session, guards
(tenant isolation), the `(auth)`/`(public)`/`(dashboard)` shell, workspace CRUD + members, and the
Base UI + CVA component kit — rebranded Deflekt→Flowlet. **Not** copied: the Python `ai-service`,
pgvector + documents/chunks/conversations tables, and the chat/widget/sources surfaces.

## What it does

- **Visual builder** — a React Flow node-graph canvas (dark editor, light shell): drag trigger /
  HTTP / transform / **AI step** / branch / output nodes, connect them, configure each in a side
  panel, set edge conditions, save (versioned), and test-run.
- **AI step** — prompt templated from upstream data → LLM constrained to a declared JSON schema →
  validate (ajv) → repair loop → structured output the flow branches on. Fails loud without a key;
  never emits a fake result.
- **Triggers** — inbound webhook (unguessable token), cron (BullMQ schedulers, tick-deduped), manual.
- **Observability** — per-run trace: every node's input/output/latency/status/cost, retry, replay.
- **Connections** — service credentials encrypted at rest (AES-256-GCM), decrypted only in the worker.
- **Hardening** — AI-output cache (input-repeat, $0 hits) + opt-in GET connector cache; per-run and
  per-workflow cost; nginx edge rate-limits + a per-workspace LLM limiter; Free/Pro/Team plan gating.

## Concurrency & correctness (the load-test artifact)

The engine's headline claims are proven under real concurrency by the load test
([`loadtest/`](loadtest/README.md)): fire N concurrent webhook triggers at the full stack and it
reports enqueue throughput + p95, queue-drain time, and the two invariants — **N distinct deliveries
→ N runs (no drops)** and **M identical deliveries → 1 run (no double-execution)**. The README there
has the with-queue-vs-inline comparison table (the interview line: *runs are jobs, not requests*).

```bash
docker compose up -d && npm run loadtest
```

## Getting started (local)

```bash
cp .env.example .env          # fill secrets (JWT secrets must be ≥ 32 chars)
docker compose up --build     # web:3000 · api:3001 · nginx:80 · postgres · redis · one-shot migrate

# or run a single service in dev:
npm install
npm run dev:web   # / dev:api / dev:worker
```

## Quality gates

```bash
npm run lint        # eslint (0 warnings)
npm run typecheck   # tsc --noEmit across workspaces
npm test            # vitest — incl. cross-tenant isolation (and no-double-execution in Phase 1)
```

CI runs all three on every push/PR. Branch flow: `feature/* → PR → develop` (staging) `→ main`
(production, behind a manual-approval environment). Images are tagged with the git SHA for rollback.

## Status

Phases 0–4 done; Phase 5 (load test + AWS deploy) in progress. See [`ROADMAP.md`](ROADMAP.md).

- **0 — Foundation:** monorepo, shell/auth copied from P1 + rebranded, docker-compose topology, CI/CD.
- **1 — Execution engine:** step-level BullMQ DAG walk; 3-layer idempotency (exactly-once effects);
  crash-safe fairness lease; retry taxonomy; per-step timeouts. *(designed + approved before any UI)*
- **2 — Node types:** real HTTP / transform / AI (schema validate+repair) / branch / output;
  webhook tokens + cron.
- **3 — Builder UI:** node-graph canvas + workflows/runs/connections/dashboard; Flowlet's own theme.
- **4 — Hardening:** AI + connector caching, cost-per-workflow, rate limits, plan gating.
- **5 — Prove it + ship:** load-test artifact ✓; AWS deploy (ECS api+worker, RDS) — filling the CI stubs.

**86 tests** across the workspaces (unit + real-Postgres/Redis integration); `lint` + `tsc` clean;
`next build` green.
