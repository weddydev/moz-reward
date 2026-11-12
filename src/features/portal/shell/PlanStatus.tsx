import { ChevronRight, Crown } from "lucide-react";
import { TransitionLink } from "@/components/motion";
import { Icon } from "@/components/ui";
import type { ShopStatus } from "./types";

/**
 * The shop sidebar's footer (DESIGN §5): the shop's plan state (PRODUCT §14). Owners get a link to Settings,
 * where the plan view will live; staff see the state only. Renewal dates arrive with plans and payments
 * (DECISIONS 13 Nov 2026 "shell plan footer").
 */
const LABEL: Record<ShopStatus, string> = {
  pending: "Awaiting activation",
  active: "Active",
  expiring: "Ends soon",
  grace: "Ended: grace period",
  restricted: "Ended: read-only",
  suspended: "Suspended",
  closed: "Closed",
};

export function PlanStatus({
  status,
  owner,
}: {
  status: ShopStatus;
  owner: boolean;
}): React.JSX.Element {
  const body = (
    <>
      <span className="bg-gold-100 text-gold-700 grid size-9 shrink-0 place-items-center rounded-sm">
        <Icon icon={Crown} size={18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-caption text-ink-2">Plan</span>
        <span className="text-small truncate font-semibold">{LABEL[status]}</span>
      </span>
    </>
  );
  if (!owner) {
    return (
      <div data-plan-status={status} className="flex items-center gap-3 rounded-md p-2">
        {body}
      </div>
    );
  }
  return (
    <TransitionLink
      href="/dashboard/settings"
      data-plan-status={status}
      className="pressable hover:bg-surface-2 flex items-center gap-3 rounded-md p-2"
    >
      {body}
      <Icon icon={ChevronRight} size={18} />
    </TransitionLink>
  );
}
