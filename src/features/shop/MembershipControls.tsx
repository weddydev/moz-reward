"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { withNetworkGuard } from "@/features/auth/network";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { leaveShopAction, setShopMutedAction } from "./actions";

/**
 * The member's own settings for one shop (P1-09, PRODUCT §4): "Mute notifications" (immediate, the switch
 * flips at once and goes back if the server refuses) and "Leave shop" behind a confirm sheet (BottomSheet on
 * phones, Modal from 1024px) that says what leaving does and until when a rejoin restores the progress. Both
 * are enforced by the server actions; this is only their UI. After leaving, the Wallet (without the shop).
 */
export function MembershipControls({
  shopId,
  shopName,
  muted: initialMuted,
  restoreBy,
}: {
  shopId: string;
  shopName: string;
  muted: boolean;
  /** The last day a rejoin restores the progress if the member leaves now (`19 Dec 2026`). */
  restoreBy: string;
}): React.JSX.Element {
  const router = useRouter();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [muted, setMuted] = useState(initialMuted);
  const [muteError, setMuteError] = useState<string | null>(null);
  const muteSeq = useRef(0);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  async function toggleMute(next: boolean): Promise<void> {
    const seq = ++muteSeq.current;
    setMuted(next);
    setMuteError(null);
    const res = await withNetworkGuard(() => setShopMutedAction({ shopId, muted: next }));
    if (seq !== muteSeq.current) return; // a later toggle owns the switch now
    const message = !res.ok ? res.message : !res.value.ok ? res.value.error.message : null;
    if (message) {
      setMuted(!next);
      setMuteError(message);
    }
  }

  async function leave(): Promise<void> {
    if (leaving) return;
    setLeaving(true);
    setLeaveError(null);
    const res = await withNetworkGuard(() => leaveShopAction({ shopId }));
    if (!res.ok) {
      setLeaveError(res.message);
      setLeaving(false);
      return;
    }
    const result = res.value;
    if (!result.ok && result.error.code !== "NOT_FOUND") {
      setLeaveError(result.error.message);
      setLeaving(false);
      return;
    }
    // Left now, or already left elsewhere (NOT_FOUND): either way the shop is no longer the member's.
    router.replace("/wallet");
  }

  const close = (): void => {
    if (!leaving) setOpen(false);
  };
  const Overlay = desktop ? Modal : BottomSheet;
  return (
    <>
      <div className="flex flex-col gap-1" data-testid="shop-mute">
        <Switch
          checked={muted}
          onCheckedChange={(next) => void toggleMute(next)}
          label="Mute notifications"
          description={`No messages from ${shopName} until you turn this off.`}
        />
        {muteError ? (
          <p role="alert" className="text-small text-danger" data-testid="shop-mute-error">
            {muteError}
          </p>
        ) : null}
      </div>
      <Button
        variant="ghost"
        className="self-start"
        onClick={() => {
          setLeaveError(null);
          setOpen(true);
        }}
        data-testid="shop-leave"
      >
        <Icon icon={LogOut} size={18} /> Leave shop
      </Button>

      <Overlay
        open={open}
        onClose={close}
        title={`Leave ${shopName}?`}
        description="You can rejoin at any time by scanning the shop's QR code."
        footer={
          <div className="flex w-full flex-col gap-3">
            {leaveError ? (
              <p role="alert" className="text-small text-danger" data-testid="shop-leave-error">
                {leaveError}
              </p>
            ) : null}
            <Button
              variant="destructive"
              size={54}
              block
              loading={leaving}
              onClick={() => void leave()}
              data-testid="shop-leave-confirm"
            >
              Leave shop
            </Button>
            <Button variant="orbit" size={54} block onClick={close} disabled={leaving}>
              Stay a member
            </Button>
          </div>
        }
      >
        <ul
          className="text-body text-ink-2 flex list-disc flex-col gap-2 pl-5"
          data-testid="shop-leave-terms"
        >
          <li>
            Your gold is kept. Rejoin by <strong className="text-ink">{restoreBy}</strong> and you
            pick up where you left off. After that, the gold in your current ingot is lost.
          </li>
          <li>Rewards you&rsquo;ve unlocked are kept until their own expiry date.</li>
          <li>Any redeem or offer code on your screen stops working.</li>
          <li>{shopName} won&rsquo;t send you messages or offers.</li>
        </ul>
      </Overlay>
    </>
  );
}
