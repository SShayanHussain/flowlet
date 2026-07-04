# Design 03 — Execution Engine (ROADMAP Phase 1)

> **Status:** proposed, awaiting approval. **No engine code until this is signed off.**
> Implements ROADMAP Phase 1. Governed by CLAUDE.md hard rules: runs are jobs not requests;
> no double-execution; per-user fairness; AI/slow steps isolated; secrets encrypted at rest.

## 1. Goals & invariants

The engine turns an enqueued trigger into a completed, traced run by walking a workflow DAG.

Non-negotiable invariants (each maps to a test):
1. **Runs are jobs.** The API only persists + enqueues. Zero execution in the HTTP handler.
2. **Exactly-once *effects*.** Delivery is *at-least-once* (BullMQ retries + stalled-job recovery);
   we make effects exactly-once with idempotency at three layers (§5).
3. **Fairness.** One workspace's burst cannot starve others (§6).
4. **Isolation.** A slow LLM/HTTP step cannot occupy a fast-step worker slot (§7).
5. **Immutability.** Editing a workflow never mutates an in-flight run — runs execute a snapshot (§2).
6. **Tenant scoping.** Every row, query, queue key, cache key, and rate-limit key carries
   `workspace_id` (PLAYBOOK §4).

## 2. Data model

Engine tables (owned by api/worker). `workspace_id` is denormalized onto every table so all
queries/keys are tenant-scoped without a join.

```sql
-- The design-time definition. graph = { nodes:[{id,type,config}], edges:[{from,to,when?}] }.
workflows(
  id uuid pk, workspace_id uuid → workspaces,
  name text, graph jsonb, enabled boolean default false,
  version int default 1,              -- bumped on save
  created_at, updated_at
)  index (workspace_id, enabled)

-- One row per execution. Executes graph_snapshot, NOT the live workflow.graph (invariant #5).
workflow_runs(
  id uuid pk, workflow_id uuid → workflows, workspace_id uuid,
  workflow_version int, graph_snapshot jsonb,
  trigger_type text,                  -- 'webhook' | 'cron' | 'manual'
  trigger_payload jsonb,
  status text,                        -- 'queued'|'running'|'succeeded'|'failed'|'canceled'
  error jsonb, cost_cents int default 0,
  created_at, started_at, finished_at
)  index (workspace_id, created_at desc), (workflow_id, created_at desc), (status)

-- One row per node per run. The unit of scheduling, retry, and tracing.
run_steps(
  id uuid pk, run_id uuid → workflow_runs, workspace_id uuid,
  node_id text, type text,            -- trigger|http|transform|ai|branch|output
  status text,                        -- 'pending'|'queued'|'running'|'succeeded'|'failed'|'skipped'
  input jsonb, output jsonb,
  attempts int default 0, latency_ms int, cost_cents int default 0,
  error jsonb, started_at, finished_at,
  unique (run_id, node_id)            -- exactly one step row per node per run
)  index (run_id)

-- Encrypted connection credentials. Decrypted ONLY in the worker at step execution.
connections(
  id uuid pk, workspace_id uuid → workspaces,
  type text, name text,
  credentials_encrypted bytea,        -- AES-256-GCM(CREDENTIALS_ENC_KEY); never sent to client
  created_at, updated_at
)  index (workspace_id)

-- The dedupe ledger. PK collision = "already seen" (§5).
idempotency_keys(
  key text pk,                        -- hash(scope, ...)
  scope text,                         -- 'trigger' | 'output'
  run_id uuid, step_id uuid,
  created_at
)
```

Schema lives in **`packages/shared/src/db/`** (imported by both api and worker). See §11 for the
migration-ownership decision.

## 3. Job model — step-level DAG executor (the key architectural choice)

**Decision: one BullMQ job per node, not one job per run.**

| | Run-level job (whole DAG in one job) | **Step-level job (chosen)** |
|---|---|---|
| Isolation | ✗ a slow AI step holds a RUNS slot for the whole run | ✓ each node routed to its own queue |
| Per-step retry/timeout | ✗ awkward (retry restarts whole run) | ✓ native BullMQ attempts/backoff per node |
| Fairness granularity | run-level only | ✓ per-step, finer |
| Complexity | simpler | more orchestration (join nodes, enqueue-on-complete) |
| Redis ops | fewer | more (acceptable at MVP scale) |

The extra orchestration is exactly the system-design substance of this project, and it's the only
model that delivers invariants #3 and #4. The run is a **state machine in Postgres**; BullMQ is the
scheduler. Node type → queue:
- `trigger`, `transform`, `branch`, fast `http` → **RUNS** queue (concurrency `WORKER_CONCURRENCY`).
- `ai`, slow/declared-slow `http`, `output` → **AI_STEPS** queue (concurrency `AI_QUEUE_CONCURRENCY`).

## 4. End-to-end flow

**Ingest (API, never executes):**
1. Trigger arrives (webhook/cron/manual). Compute `trigger_key = hash('trigger', workflow_id, delivery_id)`.
2. `INSERT INTO idempotency_keys(key,scope) VALUES(trigger_key,'trigger') ON CONFLICT DO NOTHING RETURNING key`.
   - No row → duplicate delivery → return the existing run, **do not enqueue** (invariant #2, layer 1).
3. Create `workflow_runs` (status `queued`, snapshot `graph` + `version`), create one `run_steps`
   row (`pending`) per node.
4. Enqueue the entry node(s) with `jobId = ${run_id}:${node_id}`.

**Execute (worker, per step job):**
1. Claim: `UPDATE run_steps SET status='running', started_at=now(), attempts=attempts+1
   WHERE run_id=$r AND node_id=$n AND status IN ('queued','pending') RETURNING id`.
   0 rows → already handled → ack and stop (dedupe layer 2).
2. Gather input from predecessors' `output`. Execute by type (§8).
3. On success: write `output`, `status='succeeded'`, `latency_ms`, `cost_cents`. Then **fan out**:
   for each outgoing edge whose `when` passes, atomically try to claim the successor (§5) and enqueue it.
4. Check run completion (§9).

## 5. Idempotency — three layers (the "no double-execution" proof)

1. **Trigger dedupe (whole-run):** the `ON CONFLICT DO NOTHING` insert at ingest. Re-delivered
   webhook → one run.
2. **Step claim (per-node, join-safe):** a node with multiple predecessors (diamond `A→B, A→C,
   B→D, C→D`) must run **once** even when B and C finish concurrently. Enqueue-successor is guarded by:
   ```sql
   UPDATE run_steps SET status='queued'
   WHERE run_id=$r AND node_id=$successor AND status='pending'
     AND NOT EXISTS (                       -- all predecessors terminal
       SELECT 1 FROM run_steps p
       WHERE p.run_id=$r AND p.node_id = ANY($predecessorNodeIds)
         AND p.status NOT IN ('succeeded','skipped'))
   RETURNING id;
   ```
   The `pending→queued` transition affects exactly one row; the loser matches 0 rows and enqueues
   nothing. Belt-and-suspenders: BullMQ `jobId = run_id:node_id` dedupes at the queue layer too.
3. **Output dedupe (per-send):** an `output`/`http` send uses `output_key = hash('output', run_id,
   node_id)` inserted `ON CONFLICT DO NOTHING` **before** the send, plus a provider `Idempotency-Key`
   header where supported. A retried send after a mid-send crash does not double-post.

**Delivery guarantee stated honestly:** at-least-once execution, exactly-once effects.

## 6. Per-user fair concurrency

Global BullMQ concurrency alone is FIFO — a 500-job burst from one tenant fills every slot. We add a
**per-workspace concurrency lease** in Redis:
- Key `inflight:{workspace_id}`, cap `PER_USER_CONCURRENCY`.
- At step start: atomically acquire a lease (INCR with cap check, or a Lua CAS). If at cap, the job
  yields via `worker.rateLimit()` / re-delay (does **not** count as a failure, does **not** hold a
  slot). Released in a `finally`.
- **Crash-safety:** leases are time-boxed (store `{jobId: expiry}` in a Redis ZSET; a reaper expires
  stale leases) so a crashed worker never permanently leaks a tenant's capacity.

Result: global pool bounded by `WORKER_CONCURRENCY`, each tenant bounded by `PER_USER_CONCURRENCY`.
*Upgrade path:* BullMQ Pro **groups** give this natively — adopt if the semaphore becomes a
bottleneck (noted in DECISIONS when we get there).

## 7. Isolation, timeouts, LLM rate limit

- **Queue isolation:** separate Worker per queue (§3) → a slow AI step consumes an AI_STEPS slot only.
- **Per-step timeout:** `Promise.race([exec(signal), timeout(STEP_TIMEOUT_MS)])` with an
  `AbortController` passed to `fetch`/the LLM SDK so the work is actually canceled, not just
  abandoned. Timeout → **retryable** error.
- **LLM rate limit (per user):** token bucket in Redis keyed by workspace (`LLM_RATE_LIMIT_PER_USER`
  req/min) at the AI-step boundary, so one tenant can't drain shared LLM budget. This is a *different*
  limit from nginx's per-IP webhook limit — two limits, two reasons.

## 8. Step execution by type

- **trigger** — entry; output = normalized `trigger_payload`.
- **http** — decrypt connection creds; `fetch` with timeout + AbortController. Retryable: network /
  429 / 5xx. Terminal: other 4xx.
- **transform** — restricted mapping over upstream JSON (JSONata-style expressions; **no arbitrary
  `eval`** — sandbox risk called out). Deterministic, no retries needed.
- **ai** — render prompt from upstream data → call LLM constrained to the node's declared JSON
  schema → **validate** (Ajv/zod). Invalid → **repair loop** (re-prompt with the validation error)
  up to N attempts → still invalid = **terminal** ("bad schema after N repairs"). Emits structured
  JSON for branching. Records token cost. (Semantic cache hook reserved for Phase 4.)
- **branch** — evaluate condition(s) on upstream JSON; enqueue the taken edge(s) and mark
  **not-taken successors `skipped`** so joins don't wait forever (§9).
- **output** — send result; output-side idempotency (§5 layer 3).

## 9. Branch/join & run completion

- **Skipped propagation:** when a branch isn't taken, its subtree is marked `skipped` (a node whose
  every predecessor is `skipped` becomes `skipped`). The join predicate in §5 treats `skipped` as a
  satisfied predecessor, so a diamond with one dead branch still fires the join once.
- **Run completion:** after each step terminalizes, in the same transaction: if any step is
  `failed` → run `failed` (+ mark remaining `pending` as `skipped`/`canceled`); else if no steps
  remain in `pending/queued/running` → run `succeeded`; set `finished_at`.

## 10. Retry taxonomy

`class StepError extends Error { retryable: boolean; cause?: unknown }`
- **Retryable:** timeout, `ECONNRESET`, HTTP 429/5xx, transient LLM/5xx. → BullMQ exponential
  backoff + jitter, `attempts = N`. Track `attempts` on the step.
- **Terminal:** HTTP 4xx (non-429), schema-invalid after N repairs, auth/validation errors. → fail
  the step immediately (return, don't throw, so BullMQ won't retry), fail the run.
- Exhausted retryable attempts → terminal fail.

## 11. Migration ownership (decision needed)

Phase 0 left shell migrations in `web/`. Proposal for the engine tables:
- Engine **schema** in `packages/shared/src/db/` (single source for api + worker).
- **api/ owns the engine migrator** (drizzle-kit + a one-shot `Dockerfile.migrate`, same
  baseline-aware pattern as web's). Deploy runs **web shell migrator → api engine migrator**, both
  `set -e`, before `up -d`.
- *Alternative:* consolidate everything into one top-level `db/` migrator now. Heavier refactor of
  the green shell setup; I lean against it until there's pain.

## 12. Test plan — the required proof

Engine tests run against a **real Postgres** (CI service container / testcontainers) so the SQL
atomicity claims are actually exercised; BullMQ against a real or in-memory Redis.
1. **Webhook re-delivery** — same `delivery_id` POSTed twice concurrently → 1 run, 1
   `idempotency_keys` row, output sent once.
2. **Diamond join** — `A→B, A→C, B→D, C→D`; B and C complete concurrently → D executes exactly once.
3. **Retry no double-send** — output step crashes after sending → retry → output idempotency key
   blocks the second POST (assert downstream got exactly one call).
4. **Fairness** — tenant X enqueues 200, tenant Y enqueues 5 → Y's runs are not starved (Y completes
   within a bounded lag; X capped at `PER_USER_CONCURRENCY`).
5. **AI schema repair** — malformed LLM output repaired within N; unrepairable → terminal, run failed,
   no downstream executed.

## 13. Implementation slices (after approval), mapped to ROADMAP Phase 1

1. Engine schema + migrations (§2, §11) + encrypt/decrypt helper for connections.
2. API: create-run + enqueue entry node (`POST /api/workflows/:id/run` manual trigger first).
3. Worker: step claim → execute (hardcoded 2-node DAG) → write trace → fan out.
4. Topological fan-out + join predicate (§5 layer 2) + skipped propagation.
5. Retry taxonomy + per-step timeout.
6. Trigger idempotency (§5 layer 1) + **the no-double-execution test** (§12.1–2).
7. Per-workspace lease + AI_STEPS isolation + LLM rate limit (§6, §7).

Node *type* implementations (http/transform/ai/branch/output bodies) are ROADMAP **Phase 2** — Phase 1
proves the machinery with trivial/hardcoded node logic.

## 14. Decisions — APPROVED 2026-07-04

- **A. Step-level job model (§3)** — ✅ approved. One BullMQ job per node.
- **B. Fairness via Redis lease (§6)** — ✅ approved. Per-workspace lease built in Phase 1.
- **C. Migration ownership (§11)** — ✅ approved. api-owned engine migrator; deploy runs web shell
  migrator → api engine migrator.
- **D. Real-Postgres engine tests in CI (§12)** — ✅ approved. CI gains a Postgres service container;
  the idempotency/claim tests run against real Postgres.
