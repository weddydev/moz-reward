"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createRealtimeClient, type RealtimeState } from "@/lib/realtime/client";
import type { RealtimeEventType } from "@/lib/realtime/events";

/** A hidden tab closes its stream after this long; it reconnects (and refetches) when shown again. */
export const HIDDEN_CLOSE_MS = 60_000;
/** Bursts of events (a page of notices, approve + credit) cause one refresh. */
export const REFRESH_COALESCE_MS = 300;

/**
 * Subscribes the page to a realtime stream (P1-10). Events are hints: relevant ones (and every reconnect)
 * refresh the server-rendered data with `router.refresh()`, coalesced. A signed-out stream refreshes too, so
 * the page's own gate sends the user to sign in.
 */
export function useRealtime(
  url: string,
  relevant: (type: RealtimeEventType) => boolean,
): { state: RealtimeState; events: number } {
  const router = useRouter();
  const [state, setState] = useState<RealtimeState>("idle");
  const [events, setEvents] = useState(0);
  const relevantRef = useRef(relevant);
  useEffect(() => {
    relevantRef.current = relevant;
  }, [relevant]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = (): void => {
      if (refreshTimer !== null) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        router.refresh();
      }, REFRESH_COALESCE_MS);
    };
    const client = createRealtimeClient({
      url,
      onEvent: (type) => {
        setEvents((n) => n + 1);
        if (relevantRef.current(type)) refresh();
      },
      refetch: refresh,
      onSignedOut: () => {
        router.refresh();
      },
      onState: setState,
    });
    client.start();

    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") {
        hiddenTimer ??= setTimeout(() => {
          hiddenTimer = null;
          client.stop();
        }, HIDDEN_CLOSE_MS);
        return;
      }
      if (hiddenTimer !== null) clearTimeout(hiddenTimer);
      hiddenTimer = null;
      // Stopped while hidden, or replaced by a newer tab: this tab is in use again, so it takes the stream back.
      const st = client.state();
      if (st === "stopped" || st === "replaced") client.start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (hiddenTimer !== null) clearTimeout(hiddenTimer);
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      client.stop();
    };
  }, [url, router]);

  return { state, events };
}
