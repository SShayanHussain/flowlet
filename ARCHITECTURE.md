# ARCHITECTURE.md — Flowlet

## System overview

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

## Services
- **api/** — auth (from P1), workflow CRUD, connections, trigger endpoints (webhook/cron/manual),
  enqueues runs. Never executes runs itself.
- **worker/** — consumes the queue, walks each run's DAG, executes steps, writes traces. Scales
  independently of the API.
- **web/** — Next.js: the node-graph builder (hero surface), runs/trace views, dashboard, settings.
- **packages/ui/** — shared kit from Deflekt.

## Execution model
A run = a DAG walk. `workflows.graph` (jsonb) defines nodes + edges. Worker resolves topologically,
passing each node output to successors. Node types: Trigger, HTTP action, Transform, **AI step**,
Branch/condition, Output.

## System-design concerns (where each concept lives)
- **Queue (BullMQ):** runs are jobs — retries, backpressure, horizontal scale.
- **Concurrency:** idempotency keys (no double-fire), per-user concurrency limits (fairness),
  separate queues for AI/slow steps (no pool starvation), per-step timeouts.
- **Rate limiting:** nginx (per IP/webhook) + LLM boundary (per user, protects shared budget).
- **Caching:** semantic cache on AI-step outputs; standard cache on connector responses.
- **nginx:** TLS, UI/API routing, static, first-line rate limiting.

## Scale honesty
ECS Fargate (api + worker as separate services) or an EC2 pair. **No DB sharding, no k8s** at MVP.
See DECISIONS.md for the partition/scale triggers.

## Deployment
Docker (api, worker, web) + compose locally. AWS: ECS/EC2, RDS Postgres, ElastiCache/Redis (container
early). CI/CD: GitHub Actions → test → build → push ECR → deploy api + worker independently.
Billing alarm day one.
