"use client";

import { Gift } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import { haptic } from "@/lib/haptics";
import { useHydrated } from "@/lib/use-hydrated";
import { confirmRedeemCodeAction } from "./actions";

type Outcome = { kind: "done"; label: string } | { kind: "error"; message: string } | null;

/**
 * "Redeem a reward" for the shop's team (P1-16, PRODUCT §6): the customer shows their 6-character code; the team
 * member types it and confirms. One confirm redeems the reward once (the server decides; a second one says
 * "Already redeemed"). The field takes the code as shown, with or without a space or dash, in any case; wrong
 * codes count towards the shop's and the team member's limits (SECURITY §6), so the message says what to do.
 * On the Requests page until the counter scanner (P2-03) gives it a home of its own (DECISIONS 27 Nov).
 */
export function RedeemConfirm({ shopId }: { shopId: string }): React.JSX.Element {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [tries, setTries] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  // Typed before React owns the field, a code would be reset by hydration (KI-20): the field and Confirm wait.
  const hydrated = useHydrated();

  const submit = async (e: React.SubmitEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (busy) return;
    if (code.replace(/[\s-]/g, "").length !== 6) {
      setOutcome({
        kind: "error",
        message: "Enter the 6-character code on the customer's screen.",
      });
      setTries((n) => n + 1);
      return;
    }
    setBusy(true);
    // No connection: an error with the field kept, never a Confirm that spins for ever (code review M5).
    const res = await confirmRedeemCodeAction({ shopId, code }).catch(() => null);
    setBusy(false);
    if (!res) {
      setOutcome({ kind: "error", message: "No connection. Try again." });
      setTries((n) => n + 1);
      field.current?.focus();
    } else if (res.ok) {
      setOutcome({ kind: "done", label: res.data.rewardLabel });
      setCode("");
      haptic("reward");
    } else {
      setOutcome({ kind: "error", message: res.error.message });
      setTries((n) => n + 1);
      field.current?.focus();
    }
  };

  return (
    <Card
      className="flex flex-col gap-3 p-5"
      data-testid="redeem-confirm"
      data-hydrating={hydrated ? undefined : ""}
    >
      <h2 className="text-h3 flex items-center gap-2">
        <Icon icon={Gift} className="text-gold-deep" />
        Redeem a reward
      </h2>
      {/* The 46 px Confirm centred on the 58 px field, not on its hint; the field sized for 6 characters. */}
      <form
        className="flex flex-wrap items-start gap-3"
        onSubmit={(e) => void submit(e)}
        noValidate
      >
        <TextField
          ref={field}
          label="Customer's code"
          hint="6 characters, on the customer's screen."
          className="max-w-xs min-w-0 flex-1 basis-48"
          value={code}
          maxLength={9}
          disabled={!hydrated}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            if (outcome?.kind === "done") setOutcome(null);
          }}
          error={outcome?.kind === "error" ? outcome.message : undefined}
          errorKey={tries}
          data-testid="redeem-confirm-code"
        />
        <Button
          type="submit"
          size={46}
          loading={busy}
          disabled={!hydrated}
          className="mt-1.5"
          data-testid="redeem-confirm-submit"
        >
          Confirm
        </Button>
      </form>
      {outcome?.kind === "done" ? (
        <p
          role="status"
          className="text-small text-success font-semibold"
          data-testid="redeem-confirmed"
        >
          Redeemed: {outcome.label}. Hand it over.
        </p>
      ) : null}
    </Card>
  );
}
