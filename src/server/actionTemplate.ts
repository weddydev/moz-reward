/**
 * Server action template — every mutation follows these steps (ARCHITECTURE §3):
 *   1. authenticate + 2. authorise  → `authorize` (calls requireCustomer/requireShopRole/requireAdminRole)
 *   3. validate input with Zod     → `input` (strict schema, length limits)
 *   4. call a service               → `handler`
 *   5. return a typed result        → ActionResult<T>; AppErrors become safe messages, others are logged.
 *
 * Shop-scoped actions need the shopId to authorise, so input is parsed first and passed to `authorize`.
 * Parsing never touches data, and `authorize` always runs before `handler`.
 *
 * Usage (in a "use server" file):
 *   export const renameShop = defineAction({
 *     input: z.object({ shopId: z.uuid(), name: z.string().min(1).max(80) }).strict(),
 *     authorize: ({ shopId }) => requireShopRole(shopId, ["owner"]),
 *     handler: ({ shopId, name }, actor) => shopService.rename({ shopId, name, actorId: actor.userId }),
 *   });
 */
import type { z } from "zod";
import { AppError, isAppError } from "@/server/errors";

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: AppError["code"]; message: string; fieldErrors?: Record<string, string[]> };
    };

export function defineAction<Schema extends z.ZodType, Actor, Result>(spec: {
  input: Schema;
  authorize: (input: z.infer<Schema>) => Promise<Actor>;
  handler: (input: z.infer<Schema>, actor: Actor) => Promise<Result>;
}): (raw: unknown) => Promise<ActionResult<Result>> {
  return async (raw) => {
    try {
      const parsed = spec.input.safeParse(raw);
      if (!parsed.success) {
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join(".") || "_";
          (fieldErrors[key] ??= []).push(issue.message);
        }
        throw new AppError("VALIDATION", "Please check the highlighted fields.", fieldErrors);
      }
      const actor = await spec.authorize(parsed.data);
      const data = await spec.handler(parsed.data, actor);
      return { ok: true, data };
    } catch (err) {
      if (isAppError(err)) {
        return {
          ok: false,
          error: {
            code: err.code,
            message: err.message,
            ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}),
          },
        };
      }
      console.error("[action] unexpected error", err instanceof Error ? err.name : typeof err);
      return {
        ok: false,
        error: { code: "INTERNAL", message: "Something went wrong — please try again." },
      };
    }
  };
}
