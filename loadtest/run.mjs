/**
 * Flowlet load test — the concurrency evidence (PRD §9).
 *
 * Fires N concurrent webhook triggers at a RUNNING stack (docker compose up) and
 * reports throughput + p50/p95/p99 enqueue latency, then proves the two
 * correctness invariants under load:
 *   1. N distinct deliveries  → exactly N runs   (no drops)
 *   2. M identical deliveries  → exactly 1 run    (no double-execution)
 * and measures how long the worker pool takes to drain the queue.
 *
 * Dependency-free: Node's global fetch + the `postgres` driver already in the
 * workspace. Seeds directly via DATABASE_URL, fires via the API.
 *
 *   docker compose up -d
 *   npm run loadtest                 # defaults: N=500, DUP=50
 *   N=2000 DUP=200 npm run loadtest
 */
import postgres from "postgres";

const API_URL = process.env.API_URL ?? "http://localhost";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://flowlet:flowlet@localhost:5432/flowlet";
const N = Number(process.env.N ?? 500); // distinct deliveries
const DUP = Number(process.env.DUP ?? 50); // identical re-deliveries of one event
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 200);

const WORKSPACE_ID = "00000000-0000-4000-8000-000000001a5d"; // fixed loadtest workspace
const TOKEN = "whk_" + "abcdef0123456789".repeat(3); // 48 hex chars — matches the webhook route

const sql = postgres(DATABASE_URL, { max: 8, onnotice: () => {} });

function pct(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function seed() {
  // workspaces is web/'s shell table; create the read-model if the shell migrator
  // hasn't run against this DB. Plan 'pro' so the 100-run free cap doesn't bite.
  await sql`CREATE TABLE IF NOT EXISTS workspaces (id uuid primary key, plan text not null default 'free')`;
  await sql`INSERT INTO workspaces (id, plan) VALUES (${WORKSPACE_ID}, 'pro')
            ON CONFLICT (id) DO UPDATE SET plan = 'pro'`;
  await sql`DELETE FROM workflows WHERE webhook_token = ${TOKEN}`;
  const graph = {
    nodes: [
      { id: "A", type: "trigger" },
      { id: "T", type: "transform", config: { set: { processed: true } } },
    ],
    edges: [{ from: "A", to: "T" }],
  };
  await sql`INSERT INTO workflows (workspace_id, name, graph, enabled, webhook_token)
            VALUES (${WORKSPACE_ID}, 'loadtest', ${sql.json(graph)}, true, ${TOKEN})`;
}

async function fire(deliveryId) {
  const t0 = performance.now();
  const res = await fetch(`${API_URL}/api/webhooks/${TOKEN}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-delivery-id": deliveryId },
    body: JSON.stringify({ n: deliveryId }),
  });
  await res.text();
  return { ms: performance.now() - t0, status: res.status };
}

/** Bounded-concurrency map over tasks. */
async function pool(items, limit, fn) {
  const results = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await fn(items[idx]);
      }
    })
  );
  return results;
}

async function drain(timeoutMs = 60_000) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    const [{ n }] = await sql`
      SELECT count(*)::int AS n FROM run_steps s
      JOIN workflow_runs r ON r.id = s.run_id
      WHERE r.workspace_id = ${WORKSPACE_ID} AND s.status IN ('pending', 'queued', 'running')`;
    if (n === 0) return performance.now() - t0;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

async function main() {
  console.log(`\nFlowlet load test → ${API_URL}  (N=${N} distinct, DUP=${DUP} identical, concurrency=${CONCURRENCY})\n`);
  await seed();

  // 1. Throughput: N distinct deliveries.
  const wall0 = performance.now();
  const distinct = await pool([...Array(N).keys()], CONCURRENCY, (k) => fire(`evt-${k}`));
  const wallMs = performance.now() - wall0;
  const lat = distinct.map((r) => r.ms).sort((a, b) => a - b);
  const accepted = distinct.filter((r) => r.status === 202).length;

  // 2. No double-execution: DUP identical deliveries, all at once.
  await pool([...Array(DUP).keys()], DUP, () => fire("dup-event"));

  const drainMs = await drain();

  // Verify invariants from the DB.
  const [{ distinctRuns }] = await sql`
    SELECT count(*)::int AS "distinctRuns" FROM workflow_runs
    WHERE workspace_id = ${WORKSPACE_ID} AND trigger_type = 'webhook'
      AND (trigger_payload->>'n') LIKE 'evt-%'`;
  const [{ dupRuns }] = await sql`
    SELECT count(*)::int AS "dupRuns" FROM workflow_runs
    WHERE workspace_id = ${WORKSPACE_ID} AND (trigger_payload->>'n') = 'dup-event'`;
  const [{ succeeded }] = await sql`
    SELECT count(*)::int AS succeeded FROM workflow_runs
    WHERE workspace_id = ${WORKSPACE_ID} AND status = 'succeeded'`;

  const ok = (b) => (b ? "✓" : "✗ FAIL");
  console.log("── Throughput ─────────────────────────────");
  console.log(`  accepted (202)      ${accepted}/${N}`);
  console.log(`  enqueue throughput  ${(N / (wallMs / 1000)).toFixed(0)} req/s`);
  console.log(`  enqueue latency     p50 ${pct(lat, 50).toFixed(1)}ms · p95 ${pct(lat, 95).toFixed(1)}ms · p99 ${pct(lat, 99).toFixed(1)}ms`);
  console.log(`  queue drain time    ${drainMs === null ? "TIMED OUT" : (drainMs / 1000).toFixed(1) + "s"}`);
  console.log("── Correctness under load ─────────────────");
  console.log(`  ${ok(distinctRuns === N)} ${N} distinct deliveries → ${distinctRuns} runs (no drops)`);
  console.log(`  ${ok(dupRuns === 1)} ${DUP} identical deliveries → ${dupRuns} run (no double-execution)`);
  console.log(`  runs succeeded      ${succeeded}\n`);

  await sql.end({ timeout: 5 });
  if (distinctRuns !== N || dupRuns !== 1) process.exit(1);
}

main().catch((err) => {
  console.error("load test failed:", err);
  process.exit(1);
});
