import "server-only";
/**
 * Server action and route handler template (ENGINEERING §4, SECURITY §3). Every mutation runs these steps:
 *   1. authenticate   – load the session once; anonymous callers stop here unless the action is `public`
 *   2. validate       – strict Zod schema (lengths, ranges, enums)
 *   3. authorise      – `authorize(input, principal)` calls a require* policy and returns the scope context
 *   4. rate limit     – optional, per user (or per IP for anonymous callers) unless a key is given
 *   5. handler        – inside one transaction when it writes more than once or is audited
 *   6. audit          – optional, written in the same transaction as the change
 *   7. after commit   – side effects (emails, push, jobs) registered with `afterCommit` run only after commit
 *   8. Result         – `{ ok, data }` or `{ ok: false, error }`; AppErrors keep their safe message, anything
 *                       else is logged with the request id and shown as a generic message
 *
 * Validation runs before authorisation because policies need the validated ids (e.g. shopId). Anonymous
 * callers are refused before validation, so they learn nothing about the schema or the data (DECISIONS).
 *
 * Usage (in a "use server" file):
 *   export const renameShop = defineAction({
 *     name: "shop.rename",
 *     input: z.object({ shopId: z.uuid(), name: z.string().min(1).max(80) }).strict(),
 *     authorize: ({ shopId }, p) => requireShopRole(shopId, ["owner"], p),
 *     rateLimit: { max: 20, windowSec: 60 },
 *     audit: ({ shopId, name }) => ({ action: "shop.rename", entity: "shop", entityId: shopId, meta: { name } }),
 *     handler: ({ shopId, name }, scope, { tx }) => shopService.rename(scope, { shopId, name }, tx),
 *   });
 */
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import type { Principal } from "@/server/authz/policies";
import { currentPrincipal } from "@/server/authz/principal";
import type { Scope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { AppError, errorResult, isAppError, type Result } from "@/server/errors";
import { requestLogger } from "@/server/log";
import { transaction } from "@/server/repos/_base";
import { ipKey, limitOrThrow, userKey } from "@/server/security/rate-limit";
import { assertSameOrigin, clientIp } from "@/server/security/request";
import { audit as writeAudit } from "@/server/services/audit";
import type { z } from "zod";

export type { Result } from "@/server/errors";
/** Kept for existing callers: an action's return type. */
export type ActionResult<T> = Result<T>;

/** What `authorize` returns: a scope, or an object carrying one (plus anything the handler needs). */
type ScopeContext = Scope | { scope: Scope };

const scopeOf = (ctx: ScopeContext): Scope => ("kind" in ctx ? ctx : ctx.scope);

export type AuditRecord = {
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
};

export type HandlerTools = {
  /** The action's transaction (undefined when the action is not transactional). Pass it to repositories. */
  tx: Transaction | undefined;
  /** Runs `fn` after the transaction commits (or after the handler, when not transactional). */
  afterCommit: (fn: () => unknown) => void;
  requestId: string;
};

type Spec<Schema extends z.ZodType, Ctx extends ScopeContext, Out> = {
  /** Stable dotted name: logs, rate-limit keys. */
  name: string;
  input: Schema;
  /** Allow anonymous callers through step 1 (`authorize` then decides with a null principal). */
  public?: boolean;
  authorize: (input: z.infer<Schema>, principal: Principal | null) => Promise<Ctx>;
  rateLimit?: {
    max: number;
    windowSec: number;
    key?: (input: z.infer<Schema>, ctx: Ctx) => string;
  };
  /** Run the handler in one transaction. Defaults to true when `audit` is set. */
  transaction?: boolean;
  audit?: (input: z.infer<Schema>, ctx: Ctx, result: Out) => AuditRecord | null;
  handler: (input: z.infer<Schema>, ctx: Ctx, tools: HandlerTools) => Promise<Out>;
};

type RequestFacts = { requestId: string; ip: string };

async function requestFacts(): Promise<RequestFacts> {
  try {
    const h = await headers();
    return { requestId: h.get("x-request-id") ?? randomUUID(), ip: clientIp(h) };
  } catch {
    // Outside a request (tests, scripts): no headers to read.
    return { requestId: randomUUID(), ip: "unknown" };
  }
}

function validationError(error: z.ZodError): AppError {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return new AppError("VALIDATION", undefined, fieldErrors);
}

/** Steps 1–8 for one call. Shared by actions and route handlers. */
async function execute<Schema extends z.ZodType, Ctx extends ScopeContext, Out>(
  spec: Spec<Schema, Ctx, Out>,
  raw: unknown,
  facts: RequestFacts,
): Promise<Out> {
  const principal = await currentPrincipal();
  if (!principal && !spec.public) throw new AppError("UNAUTHENTICATED");

  const parsed = spec.input.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error);
  const input = parsed.data;

  const ctx = await spec.authorize(input, principal);
  const scope = scopeOf(ctx);

  if (spec.rateLimit) {
    const bucket = `action:${spec.name}`;
    // Custom keys stay namespaced per action, so two actions never share a bucket by accident.
    const custom = spec.rateLimit.key?.(input, ctx);
    const key =
      custom !== undefined
        ? `${bucket}:${custom}`
        : principal
          ? userKey(bucket, principal.userId)
          : ipKey(bucket, facts.ip);
    await limitOrThrow({ key, max: spec.rateLimit.max, windowSec: spec.rateLimit.windowSec });
  }

  const pending: Array<() => unknown> = [];
  const afterCommit = (fn: () => unknown): void => {
    pending.push(fn);
  };

  const transactional = spec.transaction ?? spec.audit !== undefined;
  const out = transactional
    ? await transaction(scope, async (tx) => {
        const result = await spec.handler(input, ctx, {
          tx,
          afterCommit,
          requestId: facts.requestId,
        });
        const entry = spec.audit?.(input, ctx, result);
        if (entry) await writeAudit(tx, { actor: scope, ...entry, ip: facts.ip });
        return result;
      })
    : await spec.handler(input, ctx, { tx: undefined, afterCommit, requestId: facts.requestId });

  // The change is committed: a failing side effect is logged, never turned into a failed action.
  for (const fn of pending) {
    try {
      await fn();
    } catch (err) {
      requestLogger(facts.requestId, { action: spec.name }).error(
        { err },
        "after-commit side effect failed",
      );
    }
  }
  return out;
}

function unexpected(err: unknown, facts: RequestFacts, name: string): AppError {
  requestLogger(facts.requestId, { action: name }).error({ err }, "unexpected error");
  return new AppError("INTERNAL");
}

/** A server action following the template. Returns a typed Result; never throws to the client. */
export function defineAction<Schema extends z.ZodType, Ctx extends ScopeContext, Out>(
  spec: Spec<Schema, Ctx, Out>,
): (raw: unknown) => Promise<Result<Out>> {
  return async (raw) => {
    const facts = await requestFacts();
    try {
      return { ok: true, data: await execute(spec, raw, facts) };
    } catch (err) {
      return errorResult(isAppError(err) ? err : unexpected(err, facts, spec.name));
    }
  };
}

/**
 * A route handler following the same template, plus an `Origin` check for mutations (ENGINEERING §4).
 * Input is the JSON body for POST/PUT/PATCH/DELETE and the query string for GET. Errors become
 * `{ error: { code, message } }` with the code's HTTP status; 429s carry a Retry-After header.
 */
export function defineRoute<Schema extends z.ZodType, Ctx extends ScopeContext, Out>(
  spec: Spec<Schema, Ctx, Out> & { status?: number },
): (request: Request) => Promise<Response> {
  return async (request) => {
    const requestId = request.headers.get("x-request-id") ?? randomUUID();
    const facts = { requestId, ip: clientIp(request.headers) };
    try {
      assertSameOrigin(request);
      const raw: unknown =
        request.method === "GET" || request.method === "HEAD"
          ? Object.fromEntries(new URL(request.url).searchParams)
          : await request.json().catch(() => {
              throw new AppError("VALIDATION", "The request body must be JSON.");
            });
      const data = await execute(spec, raw, facts);
      return Response.json({ data }, { status: spec.status ?? 200 });
    } catch (err) {
      const appError = isAppError(err) ? err : unexpected(err, facts, spec.name);
      const retryAfter =
        appError.retryAfterSec !== undefined
          ? { "Retry-After": String(appError.retryAfterSec) }
          : undefined;
      return Response.json(errorResult(appError), {
        status: appError.status,
        ...(retryAfter ? { headers: retryAfter } : {}),
      });
    }
  };
}
