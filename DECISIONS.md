# DECISIONS.md — Flowlet

> ADR log. Append after every meaningful choice. Format:
```
## [YYYY-MM-DD] Title
Context / Decision / Tradeoff / Revisit when
```
---

## [seed] Node/TypeScript across the whole stack
Context: workflow execution is event/IO-heavy; want one concurrency model to reason about.
Decision: Node/TS for api, worker, and web.
Tradeoff: give up Python's AI-lib ergonomics for the AI step (mitigated: AI step is just an LLM API call).
Revisit when: AI steps need heavy Python-only tooling → extract a small Python AI microservice.

## [seed] Runs execute as BullMQ jobs, never inline
Context: workflow runs are long, bursty, and must survive failures/retries.
Decision: API enqueues; a separate worker pool executes.
Tradeoff: more infra (Redis + worker) vs. inline simplicity.
Revisit when: never for this product — this is core. (Scale the worker horizontally instead.)

## [seed] Idempotency keys for no-double-execution
Context: webhooks re-deliver; retries can double-send.
Decision: idempotency key per (workflow, trigger event) + output-side keys on sends.
Tradeoff: extra bookkeeping table + checks.
Revisit when: n/a — required.

## [seed] Separate queue + concurrency limits for AI/slow steps
Context: one slow LLM call must not starve fast steps; one user must not hog the pool.
Decision: dedicated queue for AI/HTTP-slow steps; per-user concurrency caps; per-step timeouts.
Tradeoff: more queue config.
Revisit when: tuning throughput vs. fairness under real load.

## [seed] No sharding / no k8s at MVP
Context: target load fits ECS api + worker services or an EC2 pair.
Decision: ECS Fargate (independent api/worker scaling) or EC2 pair; nginx in front.
Tradeoff: manual scaling ceiling.
Revisit when: single-node write throughput or `runs`/`run_steps` table size is the bottleneck →
partition `runs` by time or workspace; consider autoscaling before k8s.

## [2026-07-04] Auth lives in web/ (issues tokens); api/ verifies the shared JWT
Context: Deflekt's (P1) auth is coupled to Next.js — route handlers, `next/headers` session,
Edge middleware. Porting it into the Fastify `api/` service would mean rewriting solved,
security-critical, test-covered code (the "do not rebuild auth" rule).
Decision: `web/` keeps the copied auth verbatim (login/signup/refresh + SaaS shell) and ISSUES
HS256 JWTs. The Fastify `api/` service only VERIFIES the same token (shared `JWT_ACCESS_SECRET`)
via a tiny guard. The JWT signing/verifying is single-sourced conceptually: `web` signs, and
`packages/shared/auth.ts` holds the canonical verify used by `api`. Contract: HS256, claims
`{ userId, workspaceId }`.
Tradeoff: minor deviation from ARCHITECTURE.md's "api/ — auth" line — auth *issuance* is in web,
not api. Two entry points under `/api/*` (nginx routes `/api/auth` + `/api/workspaces` → web, the
rest → api).
Revisit when: we need server-to-server auth or multiple token issuers → promote a dedicated auth
service and have web call it too.

## [2026-07-04] Fastify (not NestJS) for api/ + worker/
Context: CLAUDE.md left it open. MVP speed + a clean single-concurrency story matter more than
DI/module ceremony.
Decision: Fastify for the API; the worker is a plain BullMQ process. 
Tradeoff: less built-in structure than Nest; we add our own conventions.
Revisit when: the API surface or team grows enough that Nest's structure pays for its overhead.

## [2026-07-04] packages/shared single-sources the cross-service contract; packages/ui deferred
Context: api/ and worker/ must agree on queue names + the JWT verify contract; drift there is a
silent outage class (PLAYBOOK). The UI kit only has one consumer (web) today.
Decision: `packages/shared` (real workspace pkg) holds `verifyAccessToken`, the two-queue topology
constants, the `{data}`/`{error}` envelope, and the run-job type. `packages/ui` is created as the
*designated* home but the primitives physically stay in `web/src/components/ui/` for Phase 0 —
extracting them would force Next `transpilePackages` + vitest resolver changes across ~15 already-
green files for zero benefit while web is the only consumer.
Tradeoff: `packages/ui` is a placeholder until a second consumer appears.
Revisit when: a second UI consumer (marketing site / embeddable widget) exists → lift the kit,
add `transpilePackages: ["@flowlet/ui"]`, repoint `@/components/ui/*`.

## [2026-07-04] Single ioredis copy pinned to BullMQ's version
Context: BullMQ nests its own `ioredis`; a second top-level copy makes a shared `IORedis` instance
structurally type-incompatible with `new Worker({ connection })` (protected-member clash).
Decision: root `overrides.ioredis = "5.10.1"` (BullMQ's exact version) + declared `^5.10.1` in
web/api/worker → exactly one copy, no `npm ls` "invalid".
Tradeoff: we track BullMQ's ioredis version when we bump BullMQ.
Revisit when: bumping BullMQ — realign the override to its new ioredis pin.

## [2026-07-04] Plain Postgres 16 (no pgvector); shell migrations owned by web/ for now
Context: Flowlet has no embeddings, so Deflekt's `pgvector/pgvector` image + custom vector type +
documents/chunks tables were dropped. Only the shell tables exist in Phase 0.
Decision: `postgres:16-alpine`; `web/` owns the shell migrations (users/workspaces/members) via
drizzle-kit + a baseline-aware one-shot migrator (`web/scripts/migrate.mjs`, `Dockerfile.migrate`).
Engine tables (workflows/workflow_runs/run_steps/connections/idempotency_keys) get their own
migrations in Phase 1.
Tradeoff: migrations are temporarily split by owner; consolidate when the engine schema lands.
Revisit when: Phase 1 — decide a single migrator (likely a top-level `db/` or api-owned) that both
web shell + engine tables run through.

## [2026-07-04] CI/CD: feature → PR → develop (staging) → main (production, manual approval)
Context: PLAYBOOK §3 flagged "don't wire main → prod directly; add staging + manual approval +
branch protection" as the top gap from Deflekt.
Decision: every push/PR runs lint + typecheck + test (required checks). `develop` auto-deploys to a
staging stack; `main` deploys to production behind a GitHub `production` environment (required
reviewer). Images tagged with BOTH the git SHA (rollback target) and an env tag. Deploy hardening
baked in: literal `.env` with `$`→`$$` escaping, 30m SSH timeouts, `--profile migrate pull`,
migrate (set -e) before `up -d`, `docker image prune -af`.
Tradeoff: deploy jobs are scaffolded stubs until AWS infra is provisioned.
Revisit when: provisioning ECS/EC2 + RDS — fill the deploy steps with the real host/secrets.

## [2026-07-04] Execution engine — step-level DAG executor (Phase 1 design approved)
Context: Phase 1 engine design (`docs/03-execution-engine-design.md`) reviewed + approved.
Decision (4 points):
 - **Step-level jobs**: one BullMQ job per node; the run is a Postgres state machine. Chosen over a
   per-run job because only this gives true AI/slow-step isolation + per-step retry/timeout/fairness.
 - **No double-execution = 3 idempotency layers**: trigger-dedupe (`ON CONFLICT DO NOTHING` at
   ingest), join-safe step claim (atomic `pending→queued` `UPDATE…RETURNING` + BullMQ `jobId`),
   output-side key + provider Idempotency-Key. Guarantee: at-least-once execution, exactly-once effects.
 - **Fairness now**: crash-safe per-workspace Redis concurrency lease (cap `PER_USER_CONCURRENCY`).
 - **Migrations**: engine schema in `packages/shared`; **api owns the engine migrator**; deploy runs
   web shell migrator → api engine migrator.
 - **CI**: real Postgres service container so the atomic-claim / no-double-execution tests actually
   prove the invariant.
Tradeoff: more orchestration (join nodes, enqueue-on-complete) + a second migrator + slower CI —
accepted; it is the core system-design substance of the product.
Revisit when: BullMQ-Pro groups replace the manual lease; or `runs`/`run_steps` volume forces
partitioning (see the no-sharding entry).

## [2026-07-05] Engine logic lives in packages/shared, not split across api/worker
Context: design 03 put createRun in api/ and execution in worker/. Both sides share the
idempotency/claim logic — drift between two implementations is a silent double-execution class.
Decision: the whole engine (createRun, handleStepJob, fan-out, lease, node executors) is one module
in `packages/shared/src/engine`, dependency-injected (db/queues passed in; shared opens no
connections and does not depend on bullmq — a structural StepQueue interface keeps it light).
api/ and worker/ are thin wiring; integration tests live in one place and exercise the real SQL.
Tradeoff: shared grows beyond "contract types" into real logic; api/worker must version together
(they already do — same repo, same deploy).
Revisit when: engine needs worker-only heavy deps (e.g. an LLM SDK) → keep the executor REGISTRY
in shared but inject heavy node implementations from worker.

## [2026-07-05] Step job ids use '.' separator (BullMQ forbids ':' in custom ids)
Context: the deterministic dedupe jobId was `runId:nodeId`; real BullMQ rejects ':' in custom ids —
caught by the e2e test (the fake queue couldn't catch it; keep at least one real-BullMQ test).
Decision: `runId.nodeId` — runId is a UUID (hex+'-'), so '.' is unambiguous.

## [2026-07-05] AI step: Anthropic SDK + structured outputs, ajv as the gate (deps approved)
Context: Phase 2 AI node. Deps @anthropic-ai/sdk (worker) + ajv (shared) approved by user.
Decision: worker-only Anthropic client injected into the engine via `EngineDeps.llm` (shared stays
SDK-free; api never executes steps). The call uses Messages API structured outputs
(`output_config.format` json_schema) with the user's schema SANITIZED to the API subset
(objects get additionalProperties:false; numeric/string bounds stripped); the engine always
parses + ajv-validates the ORIGINAL schema and runs the repair loop (re-prompt with errors,
terminal after N) — the API constraint is an accelerator, ajv is the guarantee. Schema the API
rejects entirely → one fallback attempt without output_config. Model/limits env-configured
(`LLM_MODEL` default claude-opus-4-8); no key → AI steps fail terminally (no fake results).
Per-workspace LLM budget = fixed-window Redis counter checked BEFORE spending tokens; over
budget → retryable backoff.
Tradeoff: two validation layers; sanitizer must track the API's schema subset.
Revisit when: structured outputs supports full JSON Schema → drop the sanitizer; or a second
LLM provider is needed → add another LlmClient impl behind the same interface.

## [2026-07-05] Output sends: claim-before-send, released on clean failure
Context: claim-before-send loses the send on clean failures; send-before-claim double-sends on
crash. Neither alone is right.
Decision: claim the output idempotency key before sending; on a CLEAN failure (exception path)
delete the claim and rethrow so the retry re-sends; on a crash the claim survives and suppresses
the double-send — exactly the window it exists for. The deterministic Idempotency-Key header is
identical across retries so receivers can dedupe the ambiguous did-it-arrive case.
Tradeoff: receivers that ignore Idempotency-Key could double-receive when a request ambiguously
reached them before a clean network error. Acceptable: that path requires the receiver to have
processed a request whose response never arrived.

## [2026-07-05] Cron triggers via BullMQ job schedulers; webhook tokens replace raw ids
Context: Phase 2 trigger nodes.
Decision: api syncs one BullMQ job scheduler per workflow (upsert/remove on create/update/
enable/disable, keyed `wf-<id>`); worker consumes the CRON queue and calls handleCronFire, using
the deterministic per-tick job id as the trigger idempotency key — a double-fired tick still
yields one run, and disabled/deleted workflows are re-checked at fire time. Webhooks now route by
an unguessable `whk_<48hex>` token column (unique) instead of the raw workflow id.
Tradeoff: cron fires run at default 1 attempt — a failed fire (db blip) waits for the next tick
rather than retrying. Revisit when: schedules are sparse (daily+) where a missed tick matters.

## [2026-07-06] Web ↔ api: browser calls Fastify directly with a Bearer token
Context: Phase 3 UI. web/ owns auth (issues JWTs, Next API routes); api/ owns the domain
(workflows/runs/connections/dashboard). The builder/runs surfaces need those domain endpoints.
Decision: domain pages are client components that call the Fastify api directly with
`Authorization: Bearer <accessToken>` (token held in memory by the auth-provider) via a small
`useApi()` client. Routing: prod/docker serve web+api on one nginx origin, so calls are relative
(`/api/...`); standalone `npm run dev:web` sets `NEXT_PUBLIC_API_URL=http://localhost:3001`
(CORS open on api). Auth routes (`/api/auth/*`) always stay on web, called relative.
Tradeoff: two origins in standalone dev (handled by env + CORS); credentials never returned to the
client (connections list is metadata-only).
Revisit when: SSR of domain data is wanted → add a server-side proxy that forwards the cookie.

## [2026-07-06] Builder canvas = React Flow (@xyflow/react); Flowlet gets its own theme
Context: the node-graph builder is the PRD's signature surface ("Retool/n8n polish"); and the
copied P1 shell still wore Deflekt's slate theme — Flowlet had no identity of its own.
Decision: (a) React Flow (@xyflow/react, user-approved dep) for the canvas — pan/zoom, drag-connect,
typed node components, minimap; graph ⇄ React Flow mapping keeps node positions in `graph.nodes[].position`
(the engine ignores it). (b) A distinct Flowlet theme: light indigo-violet app shell + a dedicated
DARK node-editor canvas (`--canvas*` tokens, React Flow `colorMode="dark"`), matching the PRD's
"dark-canvas editor in a light shell"; new node-merge logo mark + indigo→cyan brand gradient.
Tradeoff: React Flow is a sizable client dep (web only). Revisit: n/a — core to the product.

## [2026-07-06] Caching (Phase 4): input-repeat AI cache + opt-in GET connector cache
Context: PRD wants a "semantic cache on AI-step outputs where inputs repeat" + a connector cache to
cut cost/latency on high-volume repetitive workflows. We dropped pgvector, so embedding-similarity
caching isn't available yet.
Decision: an `EngineCache` interface (shared) with a Redis impl (worker), injected via EngineDeps.
 - **AI-output cache**: key = sha256(model + system + renderedPrompt + schema), tenant-scoped, TTL
   `AI_CACHE_TTL_SEC` (default 1h). A hit returns at costCents 0 and does NOT consume the LLM rate
   budget (checked before the limiter). Invalidation is in the KEY — any config change → new key →
   miss (PLAYBOOK: no stale-cache ghost bugs). Opt out per node with `cache: false`.
 - **Connector cache**: opt-in per http node via `cacheTtlSec`, GET/HEAD only (idempotent),
   key = url + rendered headers + connectionId, tenant-scoped.
 - Cache hits set `StepResult.cached` → stored in the step output envelope → shown as a "cached"
   chip on the trace (PLAYBOOK: a cached result must be distinguishable from a fresh one).
Tradeoff: this is exact-input caching, not true semantic (embedding) similarity.
Revisit when: embeddings return → key AI cache on nearest-neighbour prompt similarity above a
threshold, with the exact-hash as the fast path.

## [2026-07-06] Rate limits: two limits, two reasons (already in place before Phase 4)
Context: interview point — nginx per-IP/webhook vs LLM per-user protect different things.
Decision: nginx zones (webhooks 20r/s, api 50r/s per IP) guard the edge; a per-workspace
fixed-window Redis counter (`LLM_RATE_LIMIT_PER_USER`) at the AI-step boundary stops one tenant
draining the shared LLM budget. Over budget → retryable backoff, not a failure.
Revisit when: bursty-but-legitimate tenants need a token bucket with burst allowance.

## [2026-07-06] Plan gating (Phase 5) enforced at every trigger path; workspaces read-model
Context: PRD DoD — gate active-workflow count + monthly runs per plan (Free 2/100, Pro/Team higher).
The `plan` column lives on web/'s shell `workspaces` table, which the engine migrator does NOT own.
Decision: a read-only `workspaces(id, plan)` model in `packages/shared/src/db/shell.ts` — a SEPARATE
file from the engine schema.ts so `drizzle-kit generate` (which introspects only schema.ts) never
emits a CREATE TABLE that would collide with web's. `PLAN_LIMITS` + quota helpers live in shared;
api enforces on workflow enable (403) + manual run + webhook (429), and cron skips over-quota fires.
Fail-safe: an unknown/missing plan → free.
Tradeoff: enforcement is at the caller (api/cron), not inside createRun — a re-delivered webhook when
already over quota returns 429 instead of the existing run (acceptable: over quota is over quota).
Integration tests create the read-model table (the shell migrator doesn't run in the engine test DB).
Revisit when: plan changes must be instant across services → push plan into the JWT (accept 15-min
staleness) or a shared cache.

## [2026-07-06] Builder UI: React Flow; web calls the Fastify api directly with the Bearer token
Context: Phase 3 net-new UI. Node-graph canvas is the signature surface.
Decision:
 - **React Flow (@xyflow/react)** for the builder canvas (user-approved dep) — pan/zoom, drag-connect,
   custom typed nodes, minimap. Node position is stored on each graph node (`position`), which the
   engine ignores (validateGraph reads id/type only) so the UI layout rides in the same jsonb.
 - **web → api** domain calls go browser-direct with `Authorization: Bearer <accessToken>` via a
   `useApi()` client (src/lib/api-client.ts). Base URL = `NEXT_PUBLIC_API_URL` — empty in prod / docker
   (same origin, nginx routes `/api/*`→api, `/api/auth`+`/api/workspaces`→web), `http://localhost:3001`
   for standalone `npm run dev:web`. Auth routes stay on web and are called relative. All builder/runs/
   connections/dashboard pages are client components gated on `accessToken` (held in memory by the
   AuthProvider) — no domain data is server-rendered.
 - Edge `when` guards edited on the canvas drive branch routing; connection credentials collected as
   header key/values, POSTed once, encrypted server-side, never returned.
Tradeoff: client-side data fetch (no SSR for domain pages) means a brief loader on each surface;
acceptable for an authenticated app behind a memory-held token.
Revisit when: we want SSR/streaming for the runs list, or a second api consumer needs the client.
