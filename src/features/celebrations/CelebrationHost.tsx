"use client";

import { Component, lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Celebration } from "@/lib/celebration";

/** The moment itself is its own chunk, fetched only when there is one to play (DESIGN §7, §12). */
const loadMoment = () => import("./CelebrationMoment");
const CelebrationMoment = lazy(loadMoment);

/**
 * Fetches and evaluates the moment's chunk at an idle moment, so a moment never evaluates its code in the frame
 * it appears (the gate's 4× CPU run: an 83 ms first frame). Small (≈ 3.5 KB gzip) and cached after.
 */
export function preloadCelebration(): void {
  const load = (): void => {
    void loadMoment();
  };
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(load);
  else window.setTimeout(load, 1_000);
}

/**
 * The chunk, loaded at an idle moment before the first claim (a module that failed to load is asked for again
 * at the next claim). The server marks an approval seen as it hands it out, so the host claims only what it can
 * play: a chunk a deploy removed leaves the approval unseen for the next open (code review M4, P1-D close).
 */
let ready: Promise<unknown> | null = null;
function momentReady(): Promise<unknown> {
  ready ??= new Promise<void>((resolve) => {
    if (typeof window.requestIdleCallback === "function")
      window.requestIdleCallback(
        () => {
          resolve();
        },
        { timeout: 1_000 },
      );
    else window.setTimeout(resolve, 200);
  })
    .then(loadMoment)
    .catch((err: unknown) => {
      ready = null;
      throw err;
    });
  return ready;
}

/** A moment that throws ends quietly: the Wallet already shows the gold; the layout must not go down with it. */
class MomentBoundary extends Component<
  { onError: () => void; children: React.ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override componentDidCatch(): void {
    this.props.onError();
  }
  override render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** One claim (`POST /api/me/celebration`): the moment, or null (none, signed out, refused, offline). */
async function claimOnce(): Promise<Celebration | null> {
  const res = await fetch("/api/me/celebration", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: Celebration | null };
  return body.data ?? null;
}

/** The customer layout's realtime stream asks for a claim with this window event (P1-15). */
export const CLAIM_EVENT = "moz:celebration-claim";

/** Asks the host to check for an approval to celebrate (a `points_credited` hint, a reconnect). */
export const requestCelebrationClaim = (): void => {
  window.dispatchEvent(new Event(CLAIM_EVENT));
};

/**
 * Plays the customer's "points credited" moments (P1-15, DESIGN §8.2). Claims when the app opens and whenever
 * the stream hints that gold arrived (or reconnects after missing events), once the moment's chunk is loaded
 * (`momentReady`). The server marks an approval seen as
 * it hands it out, so it plays once, in one tab. One claim at a time and one moment at a time: a hint while
 * either is in flight is remembered and claimed once that ends. A failed claim (offline, rate-limited) waits for
 * the next hint; the Wallet already shows the gold.
 */
export function CelebrationHost(): React.JSX.Element {
  const [moment, setMoment] = useState<Celebration | null>(null);
  /** Claims finished (for tests and debugging: `data-claims`). */
  const [claims, setClaims] = useState(0);
  const showing = useRef(false);
  const again = useRef(false);
  const claimRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let busy = false;
    let alive = true;
    // Read through a function: the flag changes while a claim is awaited.
    const pending = (): boolean => again.current;
    const claim = async (): Promise<void> => {
      if (busy || showing.current) {
        again.current = true;
        return;
      }
      busy = true;
      again.current = false;
      try {
        await momentReady();
        const data = await claimOnce();
        if (alive && data) {
          showing.current = true;
          setMoment(data);
        }
      } catch {
        /* offline or the server is away: the next hint claims again */
      } finally {
        busy = false;
        if (alive) setClaims((n) => n + 1);
        if (alive && pending() && !showing.current) void claim();
      }
    };
    const onHint = (): void => {
      void claim();
    };
    claimRef.current = onHint;
    onHint();
    window.addEventListener(CLAIM_EVENT, onHint);
    return () => {
      alive = false;
      window.removeEventListener(CLAIM_EVENT, onHint);
    };
  }, []);

  const done = (): void => {
    showing.current = false;
    setMoment(null);
    if (again.current) claimRef.current();
  };

  return (
    <>
      <span hidden data-testid="celebration-host" data-claims={claims} />
      {moment ? (
        <MomentBoundary key={moment.requestId} onError={done}>
          <Suspense fallback={null}>
            <CelebrationMoment moment={moment} onDone={done} />
          </Suspense>
        </MomentBoundary>
      ) : null}
    </>
  );
}
