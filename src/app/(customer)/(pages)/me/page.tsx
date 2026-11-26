import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { MemberQrCard } from "@/features/member-card/MemberQrCard";
import { formatMemberId } from "@/lib/codes";
import { formatMonthYear } from "@/lib/format-date";
import { requireCustomer } from "@/server/authz";
import { gateCustomerRoute } from "@/server/portal/gate";
import { ownMemberCard } from "@/server/repos/profiles";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Me" };

/**
 * Me (P1-14: the member card with the live member QR, DESIGN §6). Profile and settings arrive later; their slot
 * keeps the placeholder. An account without a customer profile (not joined anywhere yet) has no card.
 */
export default async function MePage(): Promise<React.JSX.Element> {
  const principal = await gateCustomerRoute("/me");
  const card = await ownMemberCard(await requireCustomer(principal));
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <h1 className="text-h1">Me</h1>
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start">
        {card ? (
          <MemberQrCard
            name={card.fullName}
            memberId={formatMemberId(card.memberId)}
            since={`since ${formatMonthYear(card.createdAt)}`}
          />
        ) : (
          <Card data-testid="member-card-none">
            <EmptyState
              title="No member card yet"
              message="Join a shop and your member card shows here, ready to show at the till."
            />
          </Card>
        )}
        <Card data-testid="placeholder-card">
          <EmptyState
            title="Nothing here yet"
            message="Your profile and settings will show here."
          />
        </Card>
      </div>
    </div>
  );
}
