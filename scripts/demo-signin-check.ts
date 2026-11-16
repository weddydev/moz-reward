/**
 * `node cli/demo-signin-check.mjs --url http://web-1:3000` (P0-15, C-38): proves on staging that the demo
 * owner's password alone returns the two-step challenge without a session, and that
 * `/api/auth/two-factor/enable` answers 401 to what that challenge hands out (no authenticator can be enrolled
 * or replaced with the password alone; SECURITY §5). `moz-deploy release staging` and the weekly
 * `moz-deploy seed-reset staging` run it from a worker container on the internal network, after the web
 * replicas are up. Locally: `pnpm demo:signin-check --url http://localhost:3000` against `pnpm start`.
 *
 * Output is one pass/fail line per step with HTTP statuses only: never the password, the email, a cookie or a
 * response body. The requests carry a TEST-NET-1 client address (192.0.2.10), so the staff-login limits and
 * logs file them apart from real traffic.
 */
import "./load-env";
import { isDirectRun } from "@/lib/is-direct-run";
import { demoCredentials, demoEmailBase } from "@/server/db/demo-seed";
import { assertSeedAllowed } from "@/server/db/seed";
import { env } from "@/server/env";
import { purposeKey } from "@/server/security/keys";

export type Send = (path: string, body: unknown, cookie?: string) => Promise<Response>;
export type StepResult = { step: string; ok: boolean; detail: string };

/** Internal targets only: a web replica on the Compose network, or this machine. */
export function checkUrl(url: string): boolean {
  return /^http:\/\/(web-[12]|localhost|127\.0\.0\.1):\d{2,5}$/.test(url);
}

const CHECK_IP = "192.0.2.10";

/** `name=value` of every cookie the response sets with a value (a cleared cookie is not handed back). */
function liveCookies(res: Response): string[] {
  return res.headers
    .getSetCookie()
    .filter((c) => !/;\s*max-age=0\b/i.test(c))
    .map((c) => c.split(";")[0]?.trim() ?? "")
    .filter((pair) => /^[^=]+=.+$/.test(pair));
}

async function twoFactorRedirect(res: Response): Promise<boolean> {
  try {
    const body = (await res.json()) as { twoFactorRedirect?: unknown };
    return body.twoFactorRedirect === true;
  } catch {
    return false;
  }
}

async function attempt(
  step: string,
  run: () => Promise<{ ok: boolean; detail: string }>,
): Promise<StepResult> {
  try {
    return { step, ...(await run()) };
  } catch (err: unknown) {
    // The error's class only: a message could quote a URL, a header or a body.
    const name = err instanceof Error ? err.name : typeof err;
    return { step, ok: false, detail: `request failed (${name})` };
  }
}

export async function checkDemoSignIn(
  send: Send,
  cred: { email: string; password: string },
): Promise<StepResult[]> {
  let cookie = "";
  const challenge = await attempt("password alone → two-step challenge, no session", async () => {
    const res = await send("/sign-in/email", { email: cred.email, password: cred.password });
    const cookies = liveCookies(res);
    const session = cookies.some((c) => /session_token=/.test(c));
    const redirect = res.status === 200 && (await twoFactorRedirect(res));
    cookie = cookies.filter((c) => !/session_token=/.test(c)).join("; ");
    const detail = [
      `status ${res.status}`,
      ...(redirect ? [] : ["no two-step redirect"]),
      ...(session ? ["session cookie set"] : []),
    ].join(", ");
    return { ok: redirect && !session, detail };
  });
  const enrol = await attempt("two-factor enable with the challenge → 401", async () => {
    const res = await send("/two-factor/enable", { password: cred.password }, cookie);
    return { ok: res.status === 401, detail: `status ${res.status}` };
  });
  return [challenge, enrol];
}

async function main(): Promise<void> {
  const appEnv = process.env.APP_ENV;
  assertSeedAllowed(appEnv);
  const at = process.argv.indexOf("--url");
  const base = at > 0 ? (process.argv[at + 1] ?? "") : "";
  if (!checkUrl(base)) {
    throw new Error("--url must be http://web-1:3000, http://web-2:3000 or a localhost URL");
  }
  const origin = new URL(env().APP_URL).origin;
  const owner = demoCredentials(
    purposeKey("demo-seed"),
    demoEmailBase(appEnv, env().DEMO_EMAIL_BASE),
  ).find((c) => c.key === "owner");
  if (!owner?.password) throw new Error("no demo owner account");
  const send: Send = (path, body, cookie) =>
    fetch(`${base}/api/auth${path}`, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        origin,
        "content-type": "application/json",
        "cf-connecting-ip": CHECK_IP,
        "x-forwarded-for": CHECK_IP,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  const results = await checkDemoSignIn(send, { email: owner.email, password: owner.password });
  for (const r of results) {
    process.stdout.write(
      `demo sign-in check: ${r.step}: ${r.ok ? "ok" : "FAILED"} (${r.detail})\n`,
    );
  }
  if (results.some((r) => !r.ok)) process.exit(1);
}

if (isDirectRun(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error("[demo] sign-in check failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
