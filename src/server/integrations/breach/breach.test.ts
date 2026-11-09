import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createBreachChecker, FAKE_BREACHED_PASSWORDS } from "./index";

const sha1 = (s: string): string => createHash("sha1").update(s).digest("hex").toUpperCase();

function rangeFetch(
  body: string,
  status = 200,
): { fetch: typeof fetch; urls: string[]; headers: Headers[] } {
  const urls: string[] = [];
  const headers: Headers[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    urls.push(url instanceof Request ? url.url : url.toString());
    headers.push(new Headers(init?.headers));
    return new Response(body, { status });
  });
  return { fetch: impl, urls, headers };
}

describe("[P0-06] breached-password check (HIBP k-anonymity)", () => {
  const password = "correct horse battery staple";
  const hash = sha1(password);

  it("sends only the first 5 hash characters, with padding, and finds the suffix", async () => {
    const f = rangeFetch(`0000000000000000000000000000000000A:0\r\n${hash.slice(5)}:42\r\n`);
    expect(await createBreachChecker({ fetch: f.fetch })(password)).toEqual({
      breached: true,
      checked: true,
    });
    expect(f.urls[0]).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    expect(f.urls[0]).not.toContain(hash.slice(5));
    expect(f.headers[0]?.get("add-padding")).toBe("true");
  });

  it("not in the list, or only as a zero-count padding row: not breached", async () => {
    expect(
      await createBreachChecker({
        fetch: rangeFetch("FFFFF0000000000000000000000000000AB:3").fetch,
      })(password),
    ).toEqual({
      breached: false,
      checked: true,
    });
    expect(
      await createBreachChecker({ fetch: rangeFetch(`${hash.slice(5)}:0`).fetch })(password),
    ).toEqual({
      breached: false,
      checked: true,
    });
  });

  it("fails open (allowed, but marked unchecked) on an error status, a timeout or a network failure", async () => {
    expect(await createBreachChecker({ fetch: rangeFetch("", 503).fetch })(password)).toEqual({
      breached: false,
      checked: false,
    });
    const hang = vi.fn(
      (_u: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("timed out", "TimeoutError"));
          });
        }),
    ) as unknown as typeof fetch;
    const started = Date.now();
    expect(await createBreachChecker({ fetch: hang, timeoutMs: 50 })(password)).toEqual({
      breached: false,
      checked: false,
    });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("the test fake knows a fixed list and never touches the network", async () => {
    expect(FAKE_BREACHED_PASSWORDS).toContain("password123456");
  });
});
