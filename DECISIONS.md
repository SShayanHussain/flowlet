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
