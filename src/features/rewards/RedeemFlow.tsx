"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { RedeemCode } from "@/components/ui/RedeemCode";
import { haptic } from "@/lib/haptics";
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
  | { kind: "error"; message: string };

/**
 * The redeem slot of a reward card (P1-16; DESIGN §8.6; reference `.reward-card` → `.code`): Redeem, then the
 * 6-character code with its 15-minute ring, then "Redeemed" once the shop confirms. The code shows when the
 * server's response arrives, and never sooner than the press's sparks lead (`VAULT.redeem.codeDelayMs`, as the
 * reference). The countdown runs from the response: `receivedAt` is stamped where the response is received, so
 * a slow network or a late mount still counts from the right moment (C-81). At zero the code dims and "New code"
 * asks for another (which voids nothing still useful: the old one has expired). The shop's confirm arrives as a
 * realtime hint; the code then asks the server whether it was the one confirmed (also after a reconnect).
 */
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

  const request = useCallback(
    (from: HTMLElement | null, e?: React.MouseEvent<HTMLButtonElement>): void => {
      if (from && e) celebrate(from, e, 0);
      const pressedAt = Date.now();
      setState({ kind: "pending" });
      void createRedeemCodeAction({ rewardId }).then((res) => {
        const receivedAt = Date.now();
        const show = (): void => {
          if (res.ok) {
            setState({ kind: "code", code: { ...res.data, receivedAt }, expired: false });
          } else {
            setState({ kind: "error", message: res.error.message });
          }
        };
        const wait = VAULT.redeem.codeDelayMs - (receivedAt - pressedAt);
        if (wait > 0) timer.current = window.setTimeout(show, wait);
        else show();
      });
    },
    [rewardId],
  );

  const codeId = state.kind === "code" ? state.code.codeId : null;
  useEffect(() => {
    if (!codeId) return;
    const check = (): void => {
      void redeemCodeStatusAction({ codeId }).then((res) => {
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
      });
    };
    window.addEventListener(REDEMPTION_HINT_EVENT, check);
    return () => {
      window.removeEventListener(REDEMPTION_HINT_EVENT, check);
    };
  }, [codeId, router]);

  if (state.kind === "redeemed") {
    return (
      <div className="m-code" data-testid="redeem-done" role="status">
        <p className="m-redeem-done">Redeemed. Enjoy it!</p>
      </div>
    );
  }
  if (state.kind === "code") {
    const { code } = state;
    return (
      <div className="flex flex-col items-center gap-3" data-testid="redeem-flow">
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
        {state.expired ? (
          <Button
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
        </p>
      ) : null}
    </div>
  );
}
