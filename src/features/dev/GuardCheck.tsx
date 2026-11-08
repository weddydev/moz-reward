"use client";

import { useEffect, useState } from "react";
import type { GuardMode } from "./guard-modes";

/**
 * Deliberately misbehaving page for the console/network guard self-tests (TESTING §8).
 * `ok` must stay clean; every other mode must make the guard fail the test.
 */
export function GuardCheck({ mode }: { mode: GuardMode }) {
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    switch (mode) {
      case "console-error":
        console.error("guard-check: deliberate console.error");
        break;
      case "throw":
        setTimeout(() => {
          throw new Error("guard-check: deliberate uncaught exception");
        }, 0);
        break;
      case "rejection":
        void Promise.reject(new Error("guard-check: deliberate unhandled rejection"));
        break;
      case "fetch-500":
        void fetch("/api/test/guard-500").then((r) => setStatus(`fetched ${r.status}`));
        return;
      default:
        break;
    }
    // Deferred so "ready" only shows after the misbehaviour above has run (tests wait for it).
    queueMicrotask(() => setStatus("ready"));
  }, [mode]);

  return (
    <main className="p-6">
      <h1>Guard check</h1>
      <p data-testid="guard-mode">{mode}</p>
      <p data-testid="guard-status">{status}</p>
      {/* Hydration mode renders different text on server and client on purpose. */}
      {mode === "hydration" ? <p>{typeof window === "undefined" ? "server" : "client"}</p> : null}
    </main>
  );
}
