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
| `web/` | Next.js — SaaS shell + auth (copied from Deflekt P1), builder/runs UI (net-new, later phases) |
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

- **Phase 0 (Foundation): done** — structure, shell/auth copied + rebranded, docker-compose topology,
  CI/CD stub, 21 tests green.
- **Phase 1 (Execution engine): next** — designed and reviewed *before* any net-new UI. See ROADMAP.
