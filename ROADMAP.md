# ROADMAP.md — Flowlet

> Build top to bottom. **Engine before UI.** Check off as you go.

## Phase 0 — Foundation
- [x] Repo structure (`api/`, `worker/`, `web/`, `packages/ui/`, `packages/shared/`, `docs/`)
- [x] Docs committed (CLAUDE, ARCHITECTURE, DECISIONS, ROADMAP, .env.example, PRD, PLAYBOOK)
- [x] **Copy SaaS shell + UI kit + auth from Deflekt (P1)**; adapt branding (Deflekt→Flowlet)
- [x] docker-compose (web + api + worker + postgres + redis + nginx + one-shot migrate) — composed
- [x] CI stub (feature→PR→develop/staging→main/prod; lint+typecheck+test gates green; 21 tests pass)

## Phase 1 — Execution engine (design + review BEFORE UI)
- [x] Design doc approved before code (`docs/03-execution-engine-design.md`)
- [x] Data model: workflows, workflow_runs, run_steps, connections, idempotency_keys
- [x] Enqueue a run (API) → worker dequeues and walks a hardcoded 2-node DAG (e2e test, real BullMQ)
- [x] Topological execution: node output feeds successors (join-safe fan-out + skipped propagation)
- [x] Retries (exponential backoff; retryable vs terminal)
- [x] Idempotency keys (no double-execution) + **test proving it** (real-Postgres: concurrent
      re-delivery → 1 run; diamond join fires once; duplicate output send suppressed)
- [x] Per-user concurrency limits (crash-safe Redis lease) + separate queue for AI/slow steps + timeouts

## Phase 2 — Node types
- [x] Trigger nodes: webhook (unguessable `whk_` token), cron (BullMQ job schedulers, tick-deduped), manual
- [x] HTTP action node (templated url/headers/body, connection creds decrypted at exec time, 429/5xx retry vs 4xx terminal)
- [x] Transform node (dot-path `map` + `set` — no eval)
- [x] **AI step node**: prompt from upstream + declared JSON schema + validate/repair output
      (Anthropic SDK structured outputs + ajv; terminal after N repairs; per-workspace LLM rate limit; fail-loud without key)
- [x] Branch/condition node (routes on AI-step JSON — proven by the ai→branch integration test)
- [x] Output node (real send, Idempotency-Key header, claim released on clean failure / kept on crash)

## Phase 3 — Builder UI + surfaces
- [x] Node-graph canvas (React Flow): drag, connect, configure per-node, edge `when` guards, save, test-run
- [x] Workflows page (list, enable/disable toggle, run, duplicate, delete, webhook URL)
- [x] Runs page + per-run trace (each step input/output/latency/status/cost; replay)
- [x] Connections page (encrypted header credentials; never shown again)
- [x] Dashboard (runs today, success rate, active workflows, cost this month, recent failures)

## Phase 4 — System-design hardening
- [ ] Rate limiting: nginx (per IP/webhook) + LLM boundary (per user)
- [ ] Semantic cache on AI-step outputs; connector-response cache
- [ ] Cost tracking per run + per workflow

## Phase 5 — Prove it + ship
- [ ] Load test (k6/Artillery): N concurrent triggers → queue depth, throughput, p95, zero double-exec
- [ ] Artifact: with-queue vs inline comparison graph (for README/interview)
- [ ] Dockerfiles; AWS deploy (ECS api + worker separately, RDS, Redis) + billing alarm
- [ ] CI/CD deploys api + worker independently
- [ ] Plan-gating (Free/Pro/Team: active-workflow count + monthly runs)
- [ ] README: architecture, DECISIONS narrative, load-test artifact, demo
