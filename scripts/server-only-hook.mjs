/**
 * Node entry hook for the worker and CLI scripts (P0-18). `server-only` throws unless the `react-server`
 * condition is set, but that condition also swaps `react-dom/server` for a stub that refuses to render, and the
 * worker renders emails. So these processes run as plain Node and this hook maps `server-only` to the
 * package's own empty module, exactly what the react-server condition would pick (vitest.config.mts does the
 * same for tests). Usage: `tsx --import ./scripts/server-only-hook.mjs <entry>`.
 */
import { registerHooks } from "node:module";

const EMPTY = new URL("./empty.js", import.meta.resolve("server-only")).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: EMPTY, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
