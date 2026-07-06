// k6 variant of the webhook load test (for k6's built-in percentile reporting).
//
//   1. Seed a workflow + get its webhook token (the Node harness does this, or
//      copy a token from the Builder's "webhook URL").
//   2. WEBHOOK_TOKEN=whk_... API_URL=http://localhost k6 run loadtest/webhooks.k6.js
//
// Proves enqueue throughput + p95 under a burst. The no-double-execution
// invariant is asserted by the Node harness (loadtest/run.mjs), which reads the DB.
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const accepted = new Counter("runs_accepted");
const BASE = __ENV.API_URL || "http://localhost";
const TOKEN = __ENV.WEBHOOK_TOKEN;

export const options = {
  scenarios: {
    // 200 virtual users × 5 iterations = 1000 concurrent-ish triggers.
    burst: { executor: "per-vu-iterations", vus: 200, iterations: 5, maxDuration: "60s" },
  },
  thresholds: {
    http_req_duration: ["p(95)<500"], // enqueue is cheap — runs are jobs, not requests
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  if (!TOKEN) throw new Error("Set WEBHOOK_TOKEN=whk_...");
  const res = http.post(
    `${BASE}/api/webhooks/${TOKEN}`,
    JSON.stringify({ ts: Date.now() }),
    { headers: { "Content-Type": "application/json", "X-Delivery-Id": `k6-${__VU}-${__ITER}` } }
  );
  check(res, { "202 accepted": (r) => r.status === 202 });
  if (res.status === 202) accepted.add(1);
}
