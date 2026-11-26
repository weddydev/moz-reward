"use client";

import { RotateCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { OfflineMemberCard } from "./MemberQrCard";

/** The offline shell's content (P1-14): what happened, the member card, and a way back once online. */
export function OfflineView(): React.JSX.Element {
  return (
    <>
      <div className="flex flex-col items-center gap-2 text-center">
        <Icon icon={WifiOff} className="text-gold-deep" />
        <h1 className="text-h1">You&rsquo;re offline</h1>
        <p className="text-body text-ink-2">
          Your member card still works at the counter. Everything else comes back when you&rsquo;re
          online.
        </p>
      </div>
      <OfflineMemberCard />
      <Button
        variant="orbit"
        onClick={() => {
          window.location.reload();
        }}
      >
        <Icon icon={RotateCw} /> Try again
      </Button>
    </>
  );
}
