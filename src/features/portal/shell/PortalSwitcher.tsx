"use client";

import { ArrowLeftRight, Check } from "lucide-react";
import { Popover } from "@/components/motion";
import { Icon } from "@/components/ui";
import { cx } from "@/lib/cx";
import type { Portal } from "../routes";
import type { PortalLink } from "../switcher";

/**
 * The role switcher (C-02): links between the portals this user has. Plain links (a full page load is fine:
 * each portal has its own layout and gate). Rendered only when there is more than one portal.
 */
export function PortalSwitchList({
  portals,
  current,
}: {
  portals: readonly PortalLink[];
  current: Portal;
}): React.JSX.Element {
  return (
    <ul aria-label="Switch to" className="flex flex-col gap-1">
      {portals.map((l) => (
        <li key={l.portal}>
          <a
            href={l.href}
            aria-current={l.portal === current ? "true" : undefined}
            className={cx(
              "pressable text-small flex min-h-11 items-center gap-3 rounded-md px-3 font-semibold",
              l.portal === current ? "bg-gold-100 text-ink" : "text-ink-2 hover:bg-surface-2",
            )}
          >
            <span className="flex-1">{l.label}</span>
            {l.portal === current ? <Icon icon={Check} label="Current" /> : null}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function PortalSwitcher({
  portals,
  current,
  compact = false,
  className,
}: {
  portals: readonly PortalLink[];
  current: Portal;
  /** Icon-only trigger (mobile header, collapsed rail). */
  compact?: boolean;
  className?: string;
}): React.JSX.Element | null {
  if (portals.length < 2) return null;
  return (
    <div data-portal-switcher className={className}>
      <Popover
        title="Switch portal"
        triggerClassName={cx(
          "text-ink-2 hover:bg-surface-2 flex min-h-11 items-center gap-3 rounded-md",
          compact ? "size-11 justify-center" : "w-full px-3 text-small font-semibold",
        )}
        label={
          <>
            <Icon icon={ArrowLeftRight} />
            <span className={compact ? "sr-only" : undefined}>Switch portal</span>
          </>
        }
      >
        <div className="w-56 p-2">
          <PortalSwitchList portals={portals} current={current} />
        </div>
      </Popover>
    </div>
  );
}
