# ROADMAP.md — Flowlet

> Build top to bottom. **Engine before UI.** Check off as you go.

## Phase 0 — Foundation
- [x] Repo structure (`api/`, `worker/`, `web/`, `packages/ui/`, `packages/shared/`, `docs/`)
- [x] Docs committed (CLAUDE, ARCHITECTURE, DECISIONS, ROADMAP, .env.example, PRD, PLAYBOOK)
- [x] **Copy SaaS shell + UI kit + auth from Deflekt (P1)**; adapt branding (Deflekt→Flowlet)
- [x] docker-compose (web + api + worker + postgres + redis + nginx + one-shot migrate) — composed
- [x] CI stub (feature→PR→develop/staging→main/prod; lint+typecheck+test gates green; 21 tests pass)

## Phase 1 — Execution engine (design + review BEFORE UI)
- [ ] Data model: workflows, workflow_runs, run_steps, connections, idempotency_keys
- [ ] Enqueue a run (API) → worker dequeues and walks a hardcoded 2-node DAG
- [ ] Topological execution: node output feeds successors
- [ ] Retries (exponential backoff; retryable vs terminal)
- [ ] Idempotency keys (no double-execution) + **test proving it**
- [ ] Per-user concurrency limits + separate queue for AI/slow steps + timeouts

## Phase 2 — Node types
- [ ] Trigger nodes: webhook, cron, manual
- [ ] HTTP action node
- [ ] Transform node
- [ ] **AI step node**: prompt from upstream + declared JSON schema + validate/repair output
- [ ] Branch/condition node (routes on AI-step JSON)
- [ ] Output node

## Phase 3 — Builder UI + surfaces
- [ ] Node-graph canvas: drag, connect, configure, test-run a node
- [ ] Workflows page (list, enable/disable, duplicate, delete)
- [ ] Runs page + per-run trace (each step input/output/latency/status; retry; replay)
- [ ] Connections page (services + encrypted credentials)
- [ ] Dashboard (runs today, success/fail rate, active workflows, cost, recent failures)

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
