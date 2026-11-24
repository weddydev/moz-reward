"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { anim, reducedMotionNow } from "@/lib/motion/anim";
import { springEasing } from "@/lib/motion/controls";
import { clockSkew, countdown, digitKeyframes, VAULT } from "@/lib/motion/vault";

/**
 * A redeem code at the till (DESIGN §8.6 v2; PD-10, reference `.code`, `.digits`, `.ring-cd`): the digits flip in
 * one by one (rotateX −90° → 0, 380 ms spring, 60 ms apart) and a gold ring depletes over the code's 15 minutes
 * with the time left as `m:ss`. The countdown runs on the server's clock: `expiresAt` and `serverNow` come from
 * the server, `receivedAt` is the phone's clock when that response arrived (taken where it is received, so a later
 * mount, a back navigation or a cached page still counts from the right moment), and the phone's clock only
 * measures time passing since then (a phone set wrong still shows the right time left). The first render reads
 * only the props (the same on the server and the client); the clock is read from the first tick. At zero the code shows as expired (digits dimmed, ring empty) and `onExpire` is called once.
 * Reduced motion: the digits appear without flipping. Visual only until P1-16 wires it to a real code.
 */
export function RedeemCode({
  code,
  expiresAt,
  serverNow,
  receivedAt,
  onExpire,
}: {
  code: string;
  /** Epoch ms, from the server. */
  expiresAt: number;
  /** The server's time when it sent the code (epoch ms). */
  serverNow: number;
  /** The phone's `Date.now()` when that response arrived; P1-16 passes it (/dev/molten: the mount). */
  receivedAt?: number;
  onExpire?: () => void;
}): React.JSX.Element {
  const digits = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(() => countdown(expiresAt, serverNow));
  const expireRef = useRef(onExpire);
  useLayoutEffect(() => {
    expireRef.current = onExpire;
  });

  // The flip, before the digits are first painted.
  useLayoutEffect(() => {
    const spans = digits.current?.querySelectorAll("span") ?? [];
    const reduced = reducedMotionNow();
    spans.forEach((s, k) => {
      anim(s, reduced ? [{ opacity: 0 }, { opacity: 1 }] : digitKeyframes(), {
        duration: VAULT.redeem.digitMs,
        delay: k * VAULT.redeem.staggerMs,
        easing: springEasing(),
      });
    });
  }, [code]);

  useEffect(() => {
    const skew = clockSkew(serverNow, receivedAt ?? Date.now());
    const tick = (): boolean => {
      const c = countdown(expiresAt, Date.now() + skew);
      setLeft(c);
      if (c.expired) expireRef.current?.();
      return c.expired;
    };
    if (tick()) return;
    const id = window.setInterval(() => {
      if (tick()) window.clearInterval(id);
    }, VAULT.redeem.tickMs);
    return () => {
      window.clearInterval(id);
    };
  }, [expiresAt, serverNow, receivedAt]);

  return (
    <div className="m-code" data-expired={left.expired ? "" : undefined} data-testid="redeem-code">
      <div
        ref={digits}
        className="m-digits"
        role="img"
        aria-label={`Redeem code ${code.split("").join(" ")}`}
      >
        {code.split("").map((d, i) => (
          <span key={i} aria-hidden="true">
            {d}
          </span>
        ))}
      </div>
      <div
        className="m-ring-cd"
        role="timer"
        aria-label={left.expired ? "Code expired" : `Code expires in ${left.label}`}
        style={{ "--cd-p": left.percent } as React.CSSProperties}
      >
        <span aria-hidden="true">{left.label}</span>
      </div>
    </div>
  );
}
