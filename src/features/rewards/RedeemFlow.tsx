"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { RedeemCode } from "@/components/ui/RedeemCode";
import { SignInAgain } from "@/features/auth/SignInAgain";
import { haptic } from "@/lib/haptics";
import { reducedMotionNow } from "@/lib/motion/anim";
import { celebrate } from "@/lib/motion/press";
import { VAULT } from "@/lib/motion/vault";
import { createRedeemCodeAction, redeemCodeStatusAction } from "./actions";
import { REDEMPTION_HINT_EVENT } from "./hint";

type Code = {
  codeId: string;
  code: string;
  expiresAt: number;
  serverNow: number;
  /** The phone's clock when the response arrived (C-81). */
  receivedAt: number;
};

type State =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "code"; code: Code; expired: boolean }
  | { kind: "redeemed" }
  | { kind: "error"; message: string; signIn?: boolean };

/**
 * The redeem slot of a reward card (P1-16; DESIGN §8.6; reference `.reward-card` → `.code`): Redeem, then the
 * 6-character code with its 15-minute ring, then "Redeemed" once the shop confirms. The code shows when the
 * server's response arrives, and never sooner than the press's sparks lead (`VAULT.redeem.codeDelayMs`, as the
 * reference). The countdown runs from the response: `receivedAt` is stamped where the response is received, so
 * a slow network or a late mount still counts from the right moment (C-81). At zero the code dims and "New code"
 * asks for another (which voids nothing still useful: the old one has expired). The shop's confirm arrives as a
 * realtime hint; the code then asks the server whether it was the one confirmed (also after a reconnect).
 *
 * Accessibility (design review HIGH, P1-D close): the pressed button is replaced by the code, so focus moves to
 * the new content (the code, "Redeemed", or back to Redeem after an error) when it was inside the slot, and one
 * live region that stays mounted across states says what appeared. A failed round trip (no connection) is an
 * error with a retry, never a spinner that never ends (code review M5).
 */
export const NO_CONNECTION = "No connection. Try again.";
const REDEEMED = "Redeemed. Enjoy your reward.";
export function RedeemFlow({
  rewardId,
  rewardLabel,
  onRedeemed,
}: {
  rewardId: string;
  /** Named under the code when the card speaks of several rewards (the celebration's "… and 3 more"). */
  rewardLabel?: string;
  onRedeemed?: () => void;
}): React.JSX.Element {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const timer = useRef<number | undefined>(undefined);
  const redeemedRef = useRef(onRedeemed);
  useEffect(() => {
    redeemedRef.current = onRedeemed;
  });
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const root = useRef<HTMLDivElement>(null);
  /** Focus was in the slot when the state changed: the new content takes it. */
  const focusInside = useRef(false);

  const request = useCallback(
    (from: HTMLElement | null, e?: React.MouseEvent<HTMLButtonElement>): void => {
      focusInside.current = root.current?.contains(document.activeElement) ?? false;
      // Sparks and coins, as every button (human, 27 Nov 2026).
      if (from && e) celebrate(from, e);
      const pressedAt = Date.now();
      setState({ kind: "pending" });
      const settle = (next: State, receivedAt: number): void => {
        const show = (): void => {
          setState(next);
        };
        // The code waits for the press's sparks to lead (none under reduced motion, so no wait either).
        const wait = reducedMotionNow() ? 0 : VAULT.redeem.codeDelayMs - (receivedAt - pressedAt);
        if (wait > 0) timer.current = window.setTimeout(show, wait);
        else show();
      };
      createRedeemCodeAction({ rewardId }).then(
        (res) => {
          const receivedAt = Date.now();
          settle(
            res.ok
              ? { kind: "code", code: { ...res.data, receivedAt }, expired: false }
              : {
                  kind: "error",
                  message: res.error.message,
                  signIn: res.error.code === "UNAUTHENTICATED",
                },
            receivedAt,
          );
        },
        () => {
          settle({ kind: "error", message: NO_CONNECTION }, Date.now());
        },
      );
    },
    [rewardId],
  );

  // Focus follows the content that replaced the focused control (WCAG 2.4.3), only if focus was in the slot.
  const shown =
    state.kind === "code" ? `code:${state.code.codeId}:${String(state.expired)}` : state.kind;
  useEffect(() => {
    if (shown === "pending" || shown === "idle") return;
    const active = document.activeElement;
    const lost = !active || active === document.body || !root.current?.contains(active);
    const target = root.current?.querySelector<HTMLElement>("[data-focus-target]");
    if (focusInside.current && lost) target?.focus({ preventScroll: true });
    focusInside.current = false;
  }, [shown]);

  const codeId = state.kind === "code" ? state.code.codeId : null;
  useEffect(() => {
    if (!codeId) return;
    const check = (): void => {
      focusInside.current = root.current?.contains(document.activeElement) ?? false;
      // No connection: the next hint (or the reconnect's) asks again.
      void redeemCodeStatusAction({ codeId }).then(
        (res) => {
          if (!res.ok) return;
          if (res.data.status === "confirmed") {
            setState({ kind: "redeemed" });
            haptic("reward");
            redeemedRef.current?.();
            router.refresh();
          } else if (res.data.status === "voided") {
            // A newer code (another tab) or a leave: this one is dead.
            setState((s) => (s.kind === "code" ? { ...s, expired: true } : s));
          }
        },
        () => undefined,
      );
    };
    // Back to this tab: another tab may have made a newer code meanwhile (voiding this one, with no hint), so ask
    // again (P1-D close QA MINOR 3).
    const onVisible = (): void => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener(REDEMPTION_HINT_EVENT, check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(REDEMPTION_HINT_EVENT, check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [codeId, router]);

  const said =
    state.kind === "code"
      ? state.expired
        ? "Code expired. Ask for a new code."
        : `Your code is ${state.code.code.split("").join(" ")}. Show it at the till. It works once.`
      : state.kind === "redeemed"
        ? REDEEMED
        : "";

  return (
    <div ref={root} className="contents">
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="redeem-live">
        {said}
      </p>
      {slot()}
    </div>
  );

  function slot(): React.JSX.Element {
    if (state.kind === "redeemed") {
      return (
        <div className="m-code" data-testid="redeem-done" data-focus-target tabIndex={-1}>
          <p className="m-redeem-done">{REDEEMED}</p>
        </div>
      );
    }
    if (state.kind === "code") {
      const { code } = state;
      return (
        <div className="flex flex-col items-center gap-3" data-testid="redeem-flow">
          <div data-focus-target={state.expired ? undefined : ""} tabIndex={-1}>
            <RedeemCode
              key={code.codeId}
              code={code.code}
              expiresAt={code.expiresAt}
              serverNow={code.serverNow}
              receivedAt={code.receivedAt}
              onExpire={() => {
                setState((s) => (s.kind === "code" ? { ...s, expired: true } : s));
              }}
            />
          </div>
          {state.expired ? (
            <Button
              data-focus-target=""
              size={46}
              variant="ghost"
              onClick={() => {
                request(null);
              }}
              data-testid="redeem-new-code"
            >
              New code
            </Button>
          ) : (
            <p className="m-redeem-note">
              {rewardLabel ? `For ${rewardLabel}. ` : ""}Show this at the till. It works once.
            </p>
          )}
        </div>
      );
    }
    return (
      <div className="m-code" data-testid="redeem-flow">
        <Button
          data-focus-target=""
          size={46}
          loading={state.kind === "pending"}
          disabled={state.kind === "pending"}
          onClick={(e) => {
            request(e.currentTarget, e);
            return false; // sparks only: the label doesn't roll (the reference's Redeem)
          }}
          data-testid="redeem-button"
        >
          Redeem
        </Button>
        {state.kind === "error" ? (
          <p role="alert" className="m-redeem-note" data-testid="redeem-error">
            {state.message}
            {state.signIn ? (
              <>
                {" "}
                <SignInAgain base="/sign-in" testId="redeem-sign-in" />
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    );
  }
}
