# PRD 02 — Workflow Automation Platform (Scoped, AI-Native)

> **Role in portfolio:** The system-design project. This is where **caching, rate limiting, nginx,
> queues/messaging, and concurrency control** stop being theory and become load-bearing, because
> you're executing many users' workflows concurrently. Primary domains: **AI Automation + System
> Design + Full-Stack + Queues.**
> **Suggested stack:** Node/TypeScript throughout (this domain is event/IO-heavy — Node fits, and a
> single-language stack keeps the concurrency story clean). NestJS or Fastify API + Next.js builder
> UI + Postgres + Redis + **BullMQ** (Redis-backed queue). Nginx in front.

---

## 0. Product profile

- **Product name:** **Flowlet** (alt: *Runloop*, *Threadwork*, *Cascade*)
- **Tagline:** "Automations that can actually think."
- **One-liner positioning:** Flowlet lets ops teams build trigger→action workflows with an AI step
  in the middle — classify, extract, draft, decide — that run reliably at volume without per-task
  pricing that punishes success.
- **Category:** AI-native workflow automation (scoped to a vertical — e.g. agency/e-commerce ops).
- **Who pays:** ops leads, agency owners, e-commerce teams drowning in glue work between tools.
  Value = hours saved, fewer dropped handoffs, reasoning where rigid if/then fails.
- **Pricing concept:** Free (2 workflows, 100 runs/mo) · Pro (unlimited workflows, more runs, AI
  steps) · Team (seats, higher run limits). Gate active-workflow count + monthly runs.
- **Visual theme:** builder-tool energy — confident, technical-but-approachable. Dark-canvas node
  editor (the hero surface) with a light app shell around it. Node graph is the signature UI:
  crisp connectors, typed node colors (trigger / action / AI / branch / output), live run status
  animating along the edges. Think Retool/n8n polish without the clutter.

## 0b. SaaS surface / page map

**Public:** landing (with an animated workflow-graph hero) · pricing · login · signup · reset · verify.

**Onboarding (first-run):** create workspace → pick a template workflow (or blank) → open the builder
→ configure a trigger → drop an AI step → run it once with test data → see the run trace. First
successful run is the activation moment.

**Authenticated app (shell: top bar + left nav):**
- **Dashboard** — runs today, success/failure rate, active workflows, cost this month, recent failures.
- **Workflows** — list of workflows (enabled/disabled, last run, success rate); create/duplicate/delete.
- **Builder** — the node-graph canvas (the core surface): drag nodes, connect, configure each, test-run.
- **Runs** — run history across all workflows; open a run to see the step-by-step trace
  (each node's input/output/latency/status), retry, or replay.
- **Connections** — connected services + credentials (encrypted); add/remove; generic HTTP + the
  vertical's key connectors.
- **Settings** — profile · workspace · team/members (owner/member) · plan/billing · API keys · webhooks.

**Auth:** JWT access + refresh (httpOnly), verification, reset, role-guarded routes, workspace-scoped data.

---

## 1. Problem & opportunity

Every SMB, agency, and ops team leaks hours on **glue work**: copy this from the form into the CRM,
summarize that email and post it to Slack, tag this ticket, chase that follow-up. Generic tools
(Zapier/Make) automate the plumbing but (a) get expensive fast at volume and (b) can't *reason* —
they do rigid if/then, not "read this and decide."

**The gap:** teams want automations that include an **AI step that can classify, extract, draft, or
decide** — dropped into an otherwise ordinary trigger→action pipeline — without paying per-task
pricing that punishes success. And they want it scoped to *their* workflow shape, not a 5000-app
generalist.

**The wedge (pick one vertical so it's not a Zapier clone):** e.g. **agency/e-commerce ops** —
"new order/lead/ticket → AI classifies & drafts → route to the right place." Narrow beats broad.

---

## 2. What it is (one sentence)

A visual workflow builder where users compose **trigger → action → AI-step → branch → output**
pipelines that run reliably and concurrently at volume, with the AI step doing structured
classification/extraction/drafting inside the flow.

---

## 3. Users & core stories

- **Ops builder**: "I drag a trigger (webhook/schedule/email), add steps, drop in an AI node that
  outputs structured JSON, branch on it, and send the result somewhere — without code."
- **Team**: "Our workflows just run; when 500 fire at once they don't drop or double-execute."
- **Admin**: "I see run history, failures, retries, and cost per workflow."

---

## 4. Scope

### In scope (MVP)
1. **Workflow builder UI**: node-graph canvas; node types = Trigger, HTTP action, Transform,
   **AI step**, Branch/condition, Output.
2. **Trigger types**: inbound webhook, schedule (cron), manual run. (Email/polling as stretch.)
3. **AI step**: configurable prompt + **structured output schema** (JSON) the rest of the flow can
   branch on. This is the "AI as a node" pattern from the automation guide.
4. **Execution engine**: each run is a **queued job** (BullMQ). Steps execute in order; failures
   retry with backoff; runs are idempotent (no double-sends).
5. **Run history + observability**: per-run trace of each step's input/output, status, latency, cost.
6. **Auth + per-user workspaces.**

### Out of scope (MVP)
- A giant integration library (you're scoped; a handful of connectors + generic HTTP is enough).
- Multi-agent logic (that's P3 — this is deterministic pipelines with one AI node, not reasoning loops).

---

## 5. Architecture — and why this project is *about* the architecture

```
   Webhooks / cron / manual
            │
        ┌───▼────────┐   enqueue    ┌──────────────┐   ┌─────────────────┐
        │  nginx  →  │─────────────▶│  API (Fastify│──▶│  Redis + BullMQ │
        │  (TLS,     │              │  /NestJS)     │   │  (job queue)    │
        │  rate lim) │              └──────┬───────┘   └────────┬────────┘
        └────────────┘                     │                    │ dequeue
                                           │             ┌──────▼────────┐
        ┌──────────────┐                   │             │  Worker pool  │
        │  Next.js     │◀──────────────────┘             │ (executes     │
        │  builder UI  │   run history / status          │  workflow     │
        └──────────────┘                                 │  steps)       │
                                                         └──────┬────────┘
        ┌──────────────┐        ┌──────────────┐                │
        │  Postgres    │◀───────│  step results│◀───────────────┘
        │ (workflows,  │        │  + traces    │        calls LLM for AI-step
        │  runs, users)│        └──────────────┘        (with semantic cache)
        └──────────────┘
```

**This is where every system-design concept from Guide 1 earns its place:**

- **Queues / messaging (BullMQ):** workflow runs must not execute in the HTTP request — they're
  queued and processed by a worker pool. This is the core concurrency decision. Tradeoff vs. running
  inline: more infra, but you get retries, backpressure, and horizontal scale. *Interview line:
  "runs are jobs, not requests."*
- **Concurrency control:** the real problem. A workflow must not double-fire (idempotency keys), a
  user's runs shouldn't starve others' (per-user concurrency limits / fair queuing), and a single
  slow LLM call shouldn't block the pool (per-step timeouts, separate queues for AI vs non-AI steps).
- **Rate limiting:** at nginx (per IP/webhook) *and* at the LLM boundary (per user, so one user can't
  drain shared budget). Two different rate limits for two different reasons — good thing to articulate.
- **Caching:** semantic cache on AI-step outputs where inputs repeat; standard cache on connector
  responses. Cuts cost on high-volume repetitive workflows.
- **nginx:** genuine reverse-proxy role here — TLS termination, routing UI vs API, first-line rate
  limiting, serving the widget/static.
- **Sharding — the honest "not yet":** you do **not** shard the DB at this scale. Note the trigger
  (single-node write throughput / table size) where you'd partition `runs` by time or tenant. Saying
  "not needed yet, here's when" is the signal.
- **"Do you need k8s?" — no.** ECS Fargate or a couple of EC2 instances (API + worker) is right.
  k8s solves multi-team, many-service orchestration you don't have. Know what it solves; don't reach.

---

## 6. Data model (core)

- `users`, `workspaces`
- `workflows(id, workspace_id, name, graph jsonb, enabled, version)`
- `workflow_runs(id, workflow_id, trigger_payload jsonb, status, started_at, finished_at, cost)`
- `run_steps(id, run_id, node_id, type, input jsonb, output jsonb, status, latency_ms, error)`
- `connections(id, workspace_id, type, credentials_encrypted)` — encrypt secrets at rest
- `idempotency_keys(key, run_id, created_at)`

---

## 7. Execution engine detail (the hard part)

- A run = a DAG walk. Enqueue the run; the worker resolves nodes in topological order, passing each
  node's output to its successors.
- **AI step** = build prompt from upstream data + user config → call LLM → validate against the
  declared JSON schema (reject/repair if malformed) → emit structured output for branching.
- **Retries**: per-step, exponential backoff, max attempts; distinguish retryable (timeout, 5xx)
  from terminal (bad schema after N repairs) failures.
- **Idempotency**: an idempotency key per (workflow, trigger event) so re-delivery of a webhook
  doesn't double-run; output-side keys so a retried send doesn't double-post.
- **Timeouts + isolation**: AI steps and slow HTTP steps get their own queue/concurrency so they
  can't starve fast steps.

---

## 8. Observability & cost

- Per-run trace UI: every step's input/output/latency/status (this is your "LLMOps for automation"
  story — it's the same discipline as agent tracing, applied to workflows).
- Cost tracking per run and per workflow (tokens × price + connector calls).
- Failure dashboard: which node types fail most, retry rates.

---

## 9. Load-testing story (build the "10k users" evidence)

Write a load test (k6 or Artillery) that fires N concurrent webhook triggers and shows:
queue depth, worker throughput, p95 latency, zero double-executions, graceful backpressure. This
*is* the interview artifact — a graph proving the concurrency design holds. Show what breaks when
you remove the queue (inline execution) vs. with it.

---

## 10. Deployment & CI/CD

- **Docker**: api, worker, UI images + compose for local (api + worker + Postgres + Redis + nginx).
- **AWS**: ECS Fargate (api service + worker service scale independently) or EC2 pair; RDS Postgres;
  ElastiCache Redis (or Redis in a container early to stay free). Billing alarm on.
- **CI/CD**: GitHub Actions → test → build → push ECR → deploy both services. Worker and API deploy
  separately (different scaling) — a nice thing to demonstrate.

---

## 11. Definition of Done

- [ ] Build a workflow in the UI with an AI step that outputs JSON and a branch on it.
- [ ] Runs execute via the queue, retry on failure, never double-execute (test proves it).
- [ ] Rate limiting at nginx + LLM boundary; semantic cache working.
- [ ] Load test artifact showing concurrency holds; DECISIONS.md explains every scale choice + the
      "not sharding/k8s yet, here's when" reasoning.
- [ ] Deployed on AWS, CI/CD deploys api + worker independently.
- [ ] **SaaS shell (reused from P1):** JWT auth, workspace/roles, landing/pricing/onboarding, navigable
      app (dashboard, workflows, builder, runs, connections, settings), plan-gating. Only the
      builder/runs surfaces are net-new; auth + shell are dropped in from the P1 template.

---

## 12. How to start with Claude Code

1. *"Spec attached. Propose repo structure and the execution-engine design first — I want to review
   the queue/idempotency/concurrency approach before any UI."*
2. Slice order: execution engine + one hardcoded workflow via queue → AI-step node with schema
   validation → builder UI → observability → rate limit/cache/nginx → load test → deploy.
3. After the engine: *"Walk me through what happens under 500 concurrent triggers, and prove no
   double-execution."*
