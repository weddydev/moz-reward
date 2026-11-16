import { describe, expect, it } from "vitest";
import { checkDemoSignIn, checkUrl, type Send } from "./demo-signin-check";

const CRED = { email: "owner@example.test", password: "correct horse battery" };

const json = (status: number, body: unknown, cookies: string[] = []): Response => {
  const headers = new Headers({ "content-type": "application/json" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(JSON.stringify(body), { status, headers });
};

/** What staging must answer: a challenge with only the two-factor cookie, then 401 for enrolment. */
const CHALLENGE_COOKIES = [
  "__Secure-moz.session_token=; Max-Age=0; Path=/; HttpOnly; Secure",
  "__Secure-moz.two_factor=abc.def; Max-Age=600; Path=/; HttpOnly; Secure",
];

function fake(answers: Record<string, () => Response | Promise<Response>>) {
  const calls: { path: string; body: unknown; cookie: string | undefined }[] = [];
  const send: Send = async (path, body, cookie) => {
    calls.push({ path, body, cookie });
    const answer = answers[path];
    if (!answer) throw new Error(`unexpected ${path}`);
    return answer();
  };
  return { send, calls };
}

const good = {
  "/sign-in/email": () => json(200, { twoFactorRedirect: true }, CHALLENGE_COOKIES),
  "/two-factor/enable": () => json(401, { message: "Unauthorized" }),
};

describe("[P0-15] demo sign-in check on staging (C-38)", () => {
  it("[P0-15] passes when the password alone gives the challenge without a session and enrolment answers 401", async () => {
    const { send, calls } = fake(good);
    const results = await checkDemoSignIn(send, CRED);
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    expect(calls.map((c) => c.path)).toEqual(["/sign-in/email", "/two-factor/enable"]);
    // Enrolment is tried with exactly what the challenge handed out: the two-factor cookie, no session.
    expect(calls[1]?.cookie).toBe("__Secure-moz.two_factor=abc.def");
    expect(calls[1]?.body).toEqual({ password: CRED.password });
  });

  it("[P0-15] fails when the password alone signs in (a session cookie with a value)", async () => {
    const { send } = fake({
      ...good,
      "/sign-in/email": () =>
        json(200, { token: "t" }, ["__Secure-moz.session_token=live; Max-Age=3600; Path=/"]),
    });
    const [challenge] = await checkDemoSignIn(send, CRED);
    expect(challenge?.ok).toBe(false);
    expect(challenge?.detail).toBe("status 200, no two-step redirect, session cookie set");
  });

  it("[P0-15] fails when sign-in is refused (wrong password, rate limit) and still tries enrolment without a cookie", async () => {
    const { send, calls } = fake({ ...good, "/sign-in/email": () => json(401, {}) });
    const results = await checkDemoSignIn(send, CRED);
    expect(results.map((r) => [r.ok, r.detail])).toEqual([
      [false, "status 401, no two-step redirect"],
      [true, "status 401"],
    ]);
    expect(calls[1]?.cookie).toBe("");
  });

  it("[P0-15] fails when enrolment does not answer 401", async () => {
    const { send } = fake({ ...good, "/two-factor/enable": () => json(200, { totpURI: "x" }) });
    const [, enrol] = await checkDemoSignIn(send, CRED);
    expect(enrol).toMatchObject({ ok: false, detail: "status 200" });
  });

  it("[P0-15] a network error fails the step with the error's name only, and a non-JSON body is not a redirect", async () => {
    const { send } = fake({
      "/sign-in/email": () => new Response("<html>bad gateway</html>", { status: 502 }),
      "/two-factor/enable": () => {
        throw new TypeError("fetch failed");
      },
    });
    const results = await checkDemoSignIn(send, CRED);
    expect(results.map((r) => [r.ok, r.detail])).toEqual([
      [false, "status 502, no two-step redirect"],
      [false, "request failed (TypeError)"],
    ]);
  });

  it("[P0-15] never puts the password, the email or a cookie value into a result", async () => {
    const { send } = fake({
      "/sign-in/email": () =>
        json(200, { echo: CRED.password }, [`__Secure-moz.session_token=${CRED.email}; Path=/`]),
      "/two-factor/enable": () => {
        throw new Error(`boom ${CRED.password}`);
      },
    });
    const text = JSON.stringify(await checkDemoSignIn(send, CRED));
    expect(text).not.toContain(CRED.password);
    expect(text).not.toContain(CRED.email);
  });

  it.each([
    ["http://web-1:3000", true],
    ["http://web-2:3000", true],
    ["http://localhost:3000", true],
    ["http://127.0.0.1:3100", true],
    ["https://staging.mozrewards.com", false],
    ["http://web-3:3000", false],
    ["http://web-1:3000/api", false],
    ["http://web-1", false],
    ["http://evil.example:3000", false],
    ["", false],
  ])("[P0-15] --url %s is accepted: %s (internal targets only)", (url, ok) => {
    expect(checkUrl(url)).toBe(ok);
  });
});
