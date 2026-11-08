import "server-only";
import { env } from "@/server/env";

/**
 * Fakes (TESTING §9) are only ever used in local/test. Until a feature task adds the real provider,
 * anything else fails closed with a clear error instead of silently pretending to work.
 */
export function assertFakeAllowed(service: string): void {
  const appEnv = env().APP_ENV;
  if (appEnv !== "local" && appEnv !== "test") {
    throw new Error(`${service} provider is not configured for APP_ENV=${appEnv}`);
  }
}

/**
 * Process-wide state for a fake. Stored on globalThis so that route handlers, server actions and
 * module reloads (Next dev, `vi.resetModules`) all see the same recordings.
 */
export function processState<T>(key: string, init: () => T): T {
  const store = globalThis as unknown as Record<symbol, T | undefined>;
  const sym = Symbol.for(`moz.fake.${key}`);
  store[sym] ??= init();
  return store[sym];
}
