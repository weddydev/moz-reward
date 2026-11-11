import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, scrubText, scrubUrl } from "./sentry-scrub";

describe("[P0-13] C-26: Sentry events carry no PII and no sign-in tokens", () => {
  it("strips token and code query parameters (the sign-in confirm URL carries the token)", () => {
    expect(scrubUrl("https://moz.example/sign-in/confirm?token=abc123&returnTo=%2Fwallet")).toBe(
      "https://moz.example/sign-in/confirm?token=[redacted]&returnTo=%2Fwallet",
    );
    expect(scrubUrl("/api/auth/callback/google?code=4%2F0Ab&state=xyz")).toBe(
      "/api/auth/callback/google?code=[redacted]&state=[redacted]",
    );
    expect(scrubUrl("/x?email=jane%40example.com&otp=123456&resetToken=t")).toBe(
      "/x?email=[redacted]&otp=[redacted]&resetToken=[redacted]",
    );
    expect(scrubUrl("/wallet#access_token=abc")).toBe("/wallet");
    expect(scrubUrl("/plain")).toBe("/plain");
    expect(scrubUrl("not a url ?token=zzz")).not.toContain("zzz");
  });

  it("scrubs emails, phone numbers, bearer tokens and token URLs inside free text", () => {
    const text = scrubText(
      "Failed for jane.doe@example.com (+44 7700 900123) Bearer abc.def at /sign-in/confirm?token=sekret",
    );
    expect(text).not.toMatch(/jane|7700|abc\.def|sekret/);
    expect(text).toContain("/sign-in/confirm?token=[redacted]");
  });

  it("keeps request ids (UUIDs) whole even when a group is mostly digits, and still scrubs a phone beside one", () => {
    // CI run 42984090179: a random request id ending in 10+ digits was half-redacted (about 1 run in 100).
    const ids = [
      "a0f26d5a-8e59-4944-949f-123456789012",
      "01234567-8901-4234-8567-890123456789",
      "A0F26D5A-8E59-4944-949F-12345678901B",
    ];
    for (const id of ids) {
      expect(scrubText(`request ${id} failed`)).toBe(`request ${id} failed`);
    }
    const mixed = scrubText(`request ${ids[0] ?? ""} for 07700900123 / +44 7700 900123`);
    expect(mixed).toContain(ids[0]);
    expect(mixed).not.toMatch(/07700900123|7700 900123/);
    // Digits running on past a UUID-shaped prefix are not a UUID: still scrubbed.
    expect(scrubText("a0f26d5a-8e59-4944-949f-1234567890123456")).not.toContain("1234567890123456");
  });

  it("removes user, cookies, headers (but the request id), body and query string; keeps tags", () => {
    const event = scrubEvent({
      message: "boom for jane@example.com",
      user: { id: "u1", email: "jane@example.com", ip_address: "203.0.113.9" },
      request: {
        url: "https://moz.example/sign-in/confirm?token=abc",
        query_string: "token=abc",
        cookies: { "__Secure-moz.session": "s" },
        headers: {
          cookie: "a=b",
          authorization: "Bearer x",
          "x-request-id": "req-1",
          "user-agent": "UA",
        },
        data: { email: "jane@example.com" },
      },
      exception: { values: [{ type: "Error", value: "no user jane@example.com" }] },
      tags: { request_id: "req-1", action: "renameShop" },
      extra: { email: "jane@example.com", count: 3, nested: { note: "call 07700900123" } },
    });
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({
      url: "https://moz.example/sign-in/confirm?token=[redacted]",
      headers: { "x-request-id": "req-1", "user-agent": "UA" },
    });
    expect(event.tags).toEqual({ request_id: "req-1", action: "renameShop" });
    expect(JSON.stringify(event)).not.toMatch(/jane|07700900123|abc"|Bearer x|a=b/);
    expect(event.extra).toEqual({
      email: "[redacted]",
      count: 3,
      nested: { note: "call [redacted]" },
    });
  });

  it("breadcrumbs: navigation and fetch URLs lose their tokens; console text is scrubbed", () => {
    expect(
      scrubBreadcrumb({
        category: "navigation",
        data: { from: "/sign-in", to: "/sign-in/confirm?token=abc" },
      }),
    ).toEqual({
      category: "navigation",
      data: { from: "/sign-in", to: "/sign-in/confirm?token=[redacted]" },
    });
    const fetchCrumb = scrubBreadcrumb({
      category: "fetch",
      data: { url: "/api/sign-in/confirm?token=abc", method: "POST", status_code: 500 },
    });
    expect(fetchCrumb?.data).toEqual({
      url: "/api/sign-in/confirm?token=[redacted]",
      method: "POST",
      status_code: 500,
    });
    expect(scrubBreadcrumb({ category: "console", message: "hi jane@example.com" })?.message).toBe(
      "hi [redacted]",
    );
  });
});

describe("[P0-13] security review 6: no token in stack frames, logentry, tags or exception types", () => {
  it("frame paths of an inline script (the page URL) lose their token; logentry and tags are scrubbed", () => {
    const event = scrubEvent({
      exception: {
        values: [
          {
            type: "Error for jane@example.com",
            value: "x",
            stacktrace: {
              frames: [
                {
                  filename: "https://moz.example/sign-in/confirm?token=abc",
                  abs_path: "https://moz.example/sign-in/confirm?token=abc#frag",
                  function: "f",
                },
              ],
            },
          },
        ],
      },
      logentry: { message: "failed for jane@example.com", params: ["jane@example.com"] },
      tags: { where: "x", note: "jane@example.com" },
    });
    const text = JSON.stringify(event);
    expect(text).not.toMatch(/token=abc|jane|#frag/);
    expect(text).toContain("confirm?token=[redacted]");
    expect(event.tags).toEqual({ where: "x", note: "[redacted]" });
  });
});
