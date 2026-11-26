"use client";

import { WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { MemberCard } from "@/components/ui/MemberCard";
import { type CardPayload, fetchCard, registerCardWorker } from "./card-cache";
import { qrPath } from "./qr-path";
import {
  HIDE_BEFORE_EXPIRY_MS,
  OFFLINE_NOTE,
  qrView,
  type QrView,
  refetchOnWake,
  refreshDelay,
  tokenExpiresLocally,
} from "./qr-state";

/**
 * The member card with the live member QR (P1-14; DESIGN §6 "Member card"; PRODUCT §5, §18). The front shows the
 * name and member ID; the back the QR of a 5-minute signed token, fetched on mount, every 4 minutes, and on
 * return to the tab or the network when it's nearly done. A QR is never shown stale: offline, once the token has
 * expired, the back shows the member ID large with "Offline — ask staff to type your member ID".
 *
 * `card` comes from the server on a signed-in page; the offline shell passes none and shows what the worker kept.
 */

type Held = { payload: CardPayload; receivedAt: number } | null;

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = (): void => {
      setOnline(navigator.onLine);
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}

export function useMemberQr(): {
  held: Held;
  view: QrView;
  missing: boolean;
} {
  const online = useOnline();
  const [held, setHeld] = useState<Held>(null);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const heldRef = useRef<Held>(null);
  const busy = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await fetchCard();
      if (r.kind === "card") {
        heldRef.current = { payload: r.payload, receivedAt: r.receivedAt };
        setHeld(heldRef.current);
        setMissing(false);
      } else if (r.kind === "none" || r.kind === "signed-out") {
        heldRef.current = null;
        setHeld(null);
        setMissing(true);
      }
      // "unavailable": keep what is shown; the view hides an expired QR on its own.
    } finally {
      busy.current = false;
      setNow(Date.now());
    }
  }, []);

  // First load, and the worker for the offline card. On a first visit the worker takes over after the card's
  // first fetch, so that fetch never reached its cache: fetch once more when it takes control, so one online
  // visit is enough for the offline card.
  useEffect(() => {
    void load();
    void registerCardWorker();
    if (!("serviceWorker" in navigator)) return undefined;
    const sw = navigator.serviceWorker;
    const hadController = Boolean(sw.controller);
    const onControl = (): void => {
      if (!hadController) void load();
    };
    sw.addEventListener("controllerchange", onControl, { once: true });
    return () => {
      sw.removeEventListener("controllerchange", onControl);
    };
  }, [load]);

  // The 4-minute refresh and the moment the QR must go: one timer to the next of the two.
  useEffect(() => {
    const at = Date.now();
    const delays: number[] = [refreshDelay(held?.receivedAt ?? null, at)];
    if (held) {
      delays.push(tokenExpiresLocally(held.payload, held.receivedAt) - HIDE_BEFORE_EXPIRY_MS - at);
    }
    const next = Math.max(Math.min(...delays.filter((d) => d > 0), 60_000), 250);
    const timer = setTimeout(() => {
      const t = Date.now();
      setNow(t);
      if (refreshDelay(heldRef.current?.receivedAt ?? null, t) === 0) void load();
    }, next);
    return () => {
      clearTimeout(timer);
    };
  }, [held, now, load]);

  // Back to the tab or back online: refetch only when the token is nearly done (design check M4).
  useEffect(() => {
    const wake = (): void => {
      if (document.visibilityState !== "visible") return;
      const t = Date.now();
      setNow(t);
      const h = heldRef.current;
      if (refetchOnWake(h?.payload ?? null, h?.receivedAt ?? null, t)) void load();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [load]);

  const view = qrView({
    token: held?.payload ?? null,
    receivedAt: held?.receivedAt ?? null,
    now,
    online,
  });
  return { held, view, missing };
}

function QrCode({ token }: { token: string }): React.JSX.Element {
  const { size, d } = useMemo(() => qrPath(token), [token]);
  return (
    <svg
      viewBox={`-1 -1 ${size + 2} ${size + 2}`}
      role="img"
      aria-label="Your member QR code"
      shapeRendering="crispEdges"
      data-testid="member-qr"
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
}

function Back({ view, memberId, token }: { view: QrView; memberId: string; token: string | null }) {
  if (view.kind === "qr" && token) return <QrCode token={token} />;
  if (view.kind === "member-id-offline" || view.kind === "offline-no-card") {
    return (
      <span className="m-mc-qr-id" data-testid="member-qr-offline">
        <Icon icon={WifiOff} className="text-ink-2" />
        <span className="tabular">{memberId}</span>
      </span>
    );
  }
  return <span className="m-mc-qr-wait" aria-busy="true" data-testid="member-qr-wait" />;
}

const BACK_TEXT: Record<QrView["kind"], string> = {
  qr: "Show this at the till",
  refreshing: "Getting a fresh code…",
  loading: "Getting your code…",
  "member-id-offline": OFFLINE_NOTE,
  "offline-no-card": OFFLINE_NOTE,
};

/** The card on a signed-in page (Me, shop page): name, member ID and "since" come from the server. */
export function MemberQrCard({
  name,
  memberId,
  since,
}: {
  name: string;
  memberId: string;
  since: string;
}): React.JSX.Element {
  const { held, view } = useMemberQr();
  return (
    <section
      aria-label="Your member card"
      data-testid="member-card"
      data-qr={view.kind}
      className="w-full"
    >
      <MemberCard
        name={name}
        memberId={memberId}
        tier="Member"
        since={since}
        memberIdTestId="member-id"
        backText={BACK_TEXT[view.kind]}
        back={<Back view={view} memberId={memberId} token={held?.payload.token ?? null} />}
      />
      <p className="text-small text-ink-2 mt-3 text-center">
        Tap the card to show your QR code. Staff can also type your member ID.
      </p>
    </section>
  );
}

/** The card in the offline shell: only what the worker kept (member ID and first name), or a note. */
export function OfflineMemberCard(): React.JSX.Element {
  const { held, view, missing } = useMemberQr();
  if (!held) {
    const waiting = view.kind === "loading" && !missing;
    return (
      <p className="text-body text-ink-2 text-center" data-testid="offline-no-card">
        {waiting
          ? "Opening your member card…"
          : "Your member card shows here when you're offline, once you've opened it online on this phone."}
      </p>
    );
  }
  const { payload } = held;
  return (
    <section
      aria-label="Your member card"
      data-testid="member-card"
      data-qr={view.kind}
      className="w-full"
    >
      <MemberCard
        name={payload.firstName}
        memberId={payload.memberId}
        tier="Member"
        since="Offline"
        memberIdTestId="member-id"
        backText={BACK_TEXT[view.kind]}
        back={<Back view={view} memberId={payload.memberId} token={payload.token} />}
      />
    </section>
  );
}
