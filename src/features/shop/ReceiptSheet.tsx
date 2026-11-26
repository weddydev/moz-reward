"use client";

import { Download } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { buttonClasses } from "@/components/ui/button-classes";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { ReceiptCard } from "@/components/ui/ReceiptCard";
import type { CelebrationReceipt } from "@/lib/celebration";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query";

/** The overlay's enter (`--dur-quiet`, DESIGN §7.1): the print starts once the sheet is up. */
const SHEET_RISE_MS = 220;

/**
 * One of the member's receipts, opened from the shop page (P1-15, DESIGN §8.5): it prints as the sheet opens
 * (a sheet on phones, a modal from 1024 px), with the PDF download under it. Its own chunk, loaded on first open.
 */
export default function ReceiptSheet({
  receipt,
  pdfHref,
  open,
  run,
  onClose,
}: {
  receipt: CelebrationReceipt;
  pdfHref: string;
  open: boolean;
  /** Counts the opens: each one prints the receipt again. */
  run: number;
  onClose: () => void;
}): React.JSX.Element {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const Overlay = desktop ? Modal : BottomSheet;
  return (
    <Overlay
      open={open}
      onClose={onClose}
      title={`Receipt ${receipt.number.toLocaleString("en-GB")}`}
      footer={
        <a
          href={pdfHref}
          download
          className={buttonClasses({ variant: "orbit", size: 46, block: true })}
          data-testid="receipt-sheet-pdf"
        >
          <Icon icon={Download} size={18} /> Download PDF
        </a>
      }
    >
      {/* Kept while the sheet closes (it leaves whole); a new open re-keys it and it prints again, once the sheet
          has risen (its enter is `--dur-quiet`, 220 ms). */}
      <ReceiptCard key={run} receipt={receipt} print delayMs={SHEET_RISE_MS} />
    </Overlay>
  );
}
