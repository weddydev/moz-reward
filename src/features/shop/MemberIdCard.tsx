import type { MemberId } from "@/lib/brand";
import { formatMemberId } from "@/lib/codes";

/**
 * The customer's member ID card (DESIGN §6 "Member card", P1-04): gold edge, name and the `XXX-XXX` member ID.
 * No QR yet: the member QR carries a signed token, never the raw ID, and arrives with P1-14 (security design
 * check L13), as does the tilt. A server component with no client JS.
 */
export function MemberIdCard({
  memberId,
  fullName,
}: {
  memberId: MemberId;
  fullName: string;
}): React.JSX.Element {
  return (
    <section
      aria-labelledby="member-card-title"
      className="rounded-[var(--r-lg)] bg-[image:var(--gold-gradient)] p-[2px] shadow-[var(--shadow-gold)]"
      data-testid="member-card"
    >
      <div className="bg-surface flex flex-col gap-4 rounded-[calc(var(--r-lg)-2px)] p-5">
        <h2 id="member-card-title" className="text-caption text-ink-2 tracking-wide uppercase">
          Moz Rewards member
        </h2>
        <p className="text-h2 break-words">{fullName}</p>
        <div className="flex flex-col gap-1">
          <span className="text-small text-ink-2" id="member-id-label">
            Member ID
          </span>
          <span
            className="text-display tabular text-gold-700 tracking-[0.08em]"
            aria-labelledby="member-id-label"
            data-testid="member-id"
          >
            {formatMemberId(memberId)}
          </span>
        </div>
        <p className="text-small text-ink-2">
          Staff may ask for this ID at the counter. It is the same at every shop you join.
        </p>
      </div>
    </section>
  );
}
