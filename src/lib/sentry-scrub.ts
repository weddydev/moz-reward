/**
 * Sentry PII scrubbing (P0-13, C-26; SECURITY §7: no personal data or tokens leave in error reports). Shared by
 * the browser SDK (lazy-loaded) and the server/worker SDK, so it is plain TypeScript with no imports. Applied in
 * `beforeSend` and `beforeBreadcrumb`; the browser's events pass the tunnel route as they were scrubbed here.
 *  - URLs: sensitive query parameters (token, code, otp, state, email, phone, password, secret, key, sig and any
 *    name containing token/code) are replaced; the fragment is dropped (OAuth tokens can sit there).
 *  - Free text: emails, phone numbers (10+ digits), bearer tokens and sensitive URL parameters.
 *  - Events: no `user`, no cookies, no body, no query string; headers reduced to the request id + user agent.
 */
import type { BrowserOptions } from "@sentry/browser";

type DataCollection = NonNullable<BrowserOptions["dataCollection"]>;
const REDACTED = "[redacted]";

/**
 * The DSN the browser SDK is given. It is a placeholder: the tunnel (/api/monitoring) accepts only envelopes
 * naming it and forwards them to the real project with the server's SENTRY_DSN, so the real DSN never ships in
 * the bundle and the tunnel can't relay to any other project.
 */
export const BROWSER_SENTRY_DSN = "https://browser@sentry.moz.invalid/1";

/**
 * Sentry v11 `dataCollection` (replaces `sendDefaultPii`; its defaults collect user info, cookies, headers,
 * bodies and query params). Every field set explicitly (ENGINEERING §14): nothing personal is collected, only the
 * request id and user agent headers. Same values in the browser, the web server and the worker.
 */
export const sentryDataCollection = (): DataCollection => ({
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ["x-request-id", "user-agent"] }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  frameContextLines: 0,
});
const SENSITIVE_PARAM =
  /^(token|code|otp|state|email|phone|password|secret|key|sig|signature)$|token|code|secret|password/i;
const SENSITIVE_KEY =
  /(email|phone|token|code|password|secret|cookie|authorization|otp|name|address)/i;
const KEPT_HEADERS = new Set(["x-request-id", "user-agent"]);

const EMAIL = /[^\s@"'<>()]+@[^\s@"'<>()]+\.[^\s@"'<>()]+/g;
const BEARER = /\b(Bearer)\s+[^\s)"']+/gi;
const PARAM_IN_TEXT = /([?&]([^=\s&#]+)=)([^&\s#)"']+)/g;
const DIGIT_RUN = /\+?\(?\d[\d\s().-]{7,}\d/g;
const LONG_DIGITS = /\d{10,}/g;

export function scrubText(text: string): string {
  return text
    .replace(EMAIL, REDACTED)
    .replace(BEARER, `$1 ${REDACTED}`)
    .replace(PARAM_IN_TEXT, (all, prefix: string, name: string) =>
      SENSITIVE_PARAM.test(name) ? `${prefix}${REDACTED}` : all,
    )
    .replace(DIGIT_RUN, (run) => ((run.match(/\d/g)?.length ?? 0) >= 10 ? REDACTED : run))
    .replace(LONG_DIGITS, REDACTED);
}

export function scrubUrl(url: string): string {
  const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
  if (!absolute && !url.startsWith("/")) return scrubText(url);
  let parsed: URL;
  try {
    parsed = new URL(url, "http://relative.invalid");
  } catch {
    return scrubText(url);
  }
  for (const name of [...parsed.searchParams.keys()]) {
    if (SENSITIVE_PARAM.test(name)) parsed.searchParams.set(name, REDACTED);
  }
  parsed.hash = "";
  const out = absolute ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
  return scrubText(out.replace(/\?$/, ""));
}

/** Strings scrubbed at any depth; with `byKey`, values under personal-looking keys are replaced too. */
function scrubDeep(value: unknown, byKey = true, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") return scrubText(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, byKey, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const hide = byKey && SENSITIVE_KEY.test(k) && typeof v !== "number" && typeof v !== "boolean";
    out[k] = hide ? REDACTED : scrubDeep(v, byKey, depth + 1);
  }
  return out;
}

type Crumb = { message?: string; data?: Record<string, unknown>; category?: string };

export function scrubBreadcrumb<B extends Crumb>(crumb: B): B | null {
  const out = { ...crumb };
  if (typeof out.message === "string") out.message = scrubText(out.message);
  if (out.data) {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(out.data)) {
      if (typeof v === "string" && (k === "url" || k === "from" || k === "to"))
        data[k] = scrubUrl(v);
      else data[k] = scrubDeep(v);
    }
    out.data = data;
  }
  return out;
}

type ScrubbableEvent = {
  message?: string | undefined;
  user?: unknown;
  request?:
    | {
        url?: string | undefined;
        headers?: Record<string, string> | undefined;
        [key: string]: unknown;
      }
    | undefined;
  exception?:
    | {
        values?:
          | Array<{
              type?: string | undefined;
              value?: string | undefined;
              stacktrace?:
                | { frames?: Array<{ filename?: string; abs_path?: string }> | undefined }
                | undefined;
            }>
          | undefined;
      }
    | undefined;
  logentry?: { message?: string | undefined; params?: unknown[] | undefined } | undefined;
  tags?: Record<string, unknown> | undefined;
  breadcrumbs?: Crumb[] | undefined;
  extra?: Record<string, unknown> | undefined;
  contexts?: Record<string, unknown> | undefined;
  transaction?: string | undefined;
};

/** Any SDK event shape (browser or Node): the fields below are scrubbed, everything else is kept. */
export function scrubEvent<E extends object>(event: E): E {
  const out: ScrubbableEvent = { ...(event as ScrubbableEvent) };
  delete out.user;
  if (typeof out.message === "string") out.message = scrubText(out.message);
  if (out.transaction) out.transaction = scrubUrl(out.transaction);
  if (out.request) {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(out.request.headers ?? {})) {
      if (KEPT_HEADERS.has(k.toLowerCase())) headers[k.toLowerCase()] = v;
    }
    out.request = {
      ...(out.request.url ? { url: scrubUrl(out.request.url) } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };
  }
  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v) => ({
        ...v,
        ...(typeof v.type === "string" ? { type: scrubText(v.type) } : {}),
        ...(typeof v.value === "string" ? { value: scrubText(v.value) } : {}),
        ...(v.stacktrace?.frames
          ? {
              stacktrace: {
                ...v.stacktrace,
                // An inline script's frames carry the page URL (e.g. /sign-in/confirm?token=…).
                frames: v.stacktrace.frames.map((f) => ({
                  ...f,
                  ...(typeof f.filename === "string" ? { filename: scrubUrl(f.filename) } : {}),
                  ...(typeof f.abs_path === "string" ? { abs_path: scrubUrl(f.abs_path) } : {}),
                })),
              },
            }
          : {}),
      })),
    };
  }
  if (out.logentry) {
    out.logentry = {
      ...(typeof out.logentry.message === "string"
        ? { message: scrubText(out.logentry.message) }
        : {}),
      ...(out.logentry.params ? { params: scrubDeep(out.logentry.params) as unknown[] } : {}),
    };
  }
  if (out.tags) out.tags = scrubDeep(out.tags, false) as Record<string, unknown>;
  if (out.breadcrumbs) {
    out.breadcrumbs = out.breadcrumbs.map((b) => scrubBreadcrumb(b)).filter((b) => b !== null);
  }
  if (out.extra) out.extra = scrubDeep(out.extra) as Record<string, unknown>;
  // Contexts are SDK facts (os.name, runtime.name, …): text scrub only, no key filter.
  if (out.contexts) out.contexts = scrubDeep(out.contexts, false) as Record<string, unknown>;
  return out as E;
}
