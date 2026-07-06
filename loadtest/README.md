# Load test — the concurrency evidence

This is the interview artifact for PRD §9: fire N concurrent webhook triggers and
show the queue-based design holds — **throughput, p95, graceful drain, zero drops,
zero double-execution**.

## Run it

```bash
docker compose up -d          # api + worker + postgres + redis + nginx
npm run loadtest              # N=500 distinct + DUP=50 identical (defaults)

# tune the burst:
N=2000 DUP=200 CONCURRENCY=400 npm run loadtest
```

Example output:

```
── Throughput ─────────────────────────────
  accepted (202)      500/500
  enqueue throughput  ~3800 req/s
  enqueue latency     p50 4.1ms · p95 22.7ms · p99 41.0ms
  queue drain time    3.4s
── Correctness under load ─────────────────
  ✓ 500 distinct deliveries → 500 runs (no drops)
  ✓ 50 identical deliveries → 1 run (no double-execution)
  runs succeeded      501
```

k6 variant (built-in percentile reporting), once you have a webhook token:

```bash
WEBHOOK_TOKEN=whk_... API_URL=http://localhost k6 run loadtest/webhooks.k6.js
```

## What it proves — and why "runs are jobs, not requests"

The webhook handler does **O(1)** work — persist a run + enqueue — then returns
`202` in single-digit milliseconds. Execution happens on the worker pool, off the
request path. So enqueue p95 stays flat under a burst while the DAGs drain
asynchronously; that's the whole point of the queue.

**Remove the queue (execute inline in the request) and both properties break:**

| | With BullMQ (this design) | Inline in the HTTP handler |
|---|---|---|
| p95 under 500 concurrent | flat (enqueue only, ~20ms) | balloons — each request runs the full DAG + LLM/HTTP calls |
| Backpressure | queue absorbs the burst; worker concurrency caps load | request threads pile up; the API tips over |
| Re-delivered webhook | idempotency key → **1 run** | **double-executes** — no dedupe gate, double-sends downstream |
| Slow AI step | isolated on its own queue; fast steps unaffected | blocks the request thread and every other caller |
| Horizontal scale | add worker replicas independently of the API | coupled — scale the whole API to scale execution |

The two `✓` lines are the guarantees the engine's integration tests assert at the
unit level, reproduced here **under real concurrency against the full stack**:
distinct deliveries never drop, and identical re-deliveries never double-execute
(the atomic `pending→queued` claim + the trigger idempotency ledger).
