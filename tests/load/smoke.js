// k6 smoke load test (TESTING §5). Skeleton: grows with the busiest endpoints of each phase.
// Run: `pnpm test:load:smoke` (BASE_URL defaults to the local app; point it at staging for gates).
// Full P1/P3 gate: VUS=200 DURATION=5m against staging. p95 actions < 300 ms, errors < 0.5 %.
import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  vus: Number(__ENV.VUS || 5),
  duration: __ENV.DURATION || "20s",
  thresholds: {
    http_req_failed: ["rate<0.005"],
    "http_req_duration{kind:page}": ["p(95)<800"],
    "http_req_duration{kind:action}": ["p(95)<300"],
  },
};

export default function smoke() {
  const home = http.get(`${BASE_URL}/`, { tags: { kind: "page" } });
  check(home, { "home 200": (r) => r.status === 200 });

  const signIn = http.get(`${BASE_URL}/sign-in`, { tags: { kind: "page" } });
  check(signIn, { "sign-in 200": (r) => r.status === 200 });

  const session = http.get(`${BASE_URL}/api/auth/get-session`, { tags: { kind: "action" } });
  check(session, { "session endpoint 200": (r) => r.status === 200 });

  sleep(1); // think time between iterations (k6 VU pacing, not a test wait)
}
