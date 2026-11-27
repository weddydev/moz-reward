"use client";

import { Clock, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { newId } from "@/lib/id";
import { BUTTON } from "@/lib/motion/controls";
import { requestPointsAction } from "./actions";
import {
  afterSend,
  browserQueueStorage,
  dropQueued,
  enqueueRequest,
  keepOwnQueue,
  QUEUE_EVENT,
  queuedFor,
  readQueue,
} from "./request-queue";
import { pendingRequestText } from "./view";

/** The reference's toast after a request (Molten `index.html`: `.shop-body .btn-molten`). */
export const REQUEST_SENT_TOAST = "Request sent. The shop will approve it shortly.";
export const REQUEST_OPEN_TOAST = "You already have a request waiting at this shop.";
export const REQUEST_QUEUED_TEXT =
  "You’re offline, so your request is saved on this phone. We’ll send it when you’re back online.";
/** The queued card once the phone says it is online again, while the saved tap is on its way (or retrying). */
export const REQUEST_SENDING_TEXT = "You’re back online. Sending your saved request…";
/** Asks `QueuedRequestSender` to try now (the queued card's "Send now"). */
export const QUEUE_FLUSH_EVENT = "moz:request-queue-flush";
/**
 * While a saved tap is still waiting and the phone says it is online, the sender tries again after these delays
 * (then every last one): the first send after `online` often fails because the line isn't really up yet, and
 * nothing else would retry until the next `online` event (human, 27 Nov 2026: stuck on "You're offline").
 */
export const REQUEST_RETRY_MS = [3_000, 10_000, 30_000] as const;

/** `navigator.onLine`, kept current (true on the server and before hydration). */
function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const read = (): void => {
      setOnline(navigator.onLine);
    };
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);
  return online;
}

export type OpenRequestView = { status: "pending" | "awaiting_owner"; requestedAt: string };

const tapKey = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : newId();

/**
 * "Request points" on the member's shop page (P1-11, PRODUCT §5; Molten reference `.shop-body .btn-molten`:
 * sparks and coins from the press point (coins on every button, human 27 Nov 2026), the label rolls to "Request sent", and a toast). With a request
 * open (pending or awaiting the owner) the page shows its pending state instead; it updates live (the layout's
 * realtime stream refreshes the page on `request_created` and `request_decided`).
 *
 * Each tap gets one idempotency key; a second tap while the first is on its way does nothing, and a retry sends
 * the same key, so the server makes one request. A tap with no connection is queued on the phone
 * (request-queue.ts) and `QueuedRequestSender` sends it, with the same key, when the phone is back online.
 */
export function RequestPoints({
  shopId,
  shopName,
  open,
  userId,
}: {
  shopId: string;
  shopName: string;
  open: OpenRequestView | null;
  /** The signed-in customer: a tap queued offline is theirs alone (request-queue.ts). */
  userId: string;
}): React.JSX.Element {
  const router = useRouter();
  const inFlight = useRef(false);
  const online = useOnline();
  const [queued, setQueued] = useState(false);
  // After a successful tap the button stays for its label roll before the pending state takes its place.
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    const read = (): void => {
      setQueued(queuedFor(browserQueueStorage(), userId, shopId, new Date()) !== null);
    };
    read();
    window.addEventListener(QUEUE_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(QUEUE_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, [shopId, userId]);

  // The swap to the pending card follows the Button's own roll (`onRollEnd`, design review M1, P1-C close); this
  // timer is only a fallback for a roll that never ran (the button gone before the answer).
  useEffect(() => {
    if (!rolling) return;
    const t = setTimeout(() => {
      setRolling(false);
    }, BUTTON.labelBackMs + 1000);
    return () => {
      clearTimeout(t);
    };
  }, [rolling]);

  const queue = (key: string, at: string): void => {
    const now = new Date();
    // The queued card (role=status) says it where the button was; no toast repeating it.
    if (enqueueRequest(browserQueueStorage(), { userId, shopId, key, at }, now)) {
      window.dispatchEvent(new Event(QUEUE_EVENT));
    } else {
      toast("You’re offline. Check your connection and try again.", "error");
    }
  };

  async function send(): Promise<boolean> {
    if (inFlight.current) return false;
    inFlight.current = true;
    const key = tapKey();
    const at = new Date().toISOString();
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        queue(key, at);
        return false;
      }
      let res: Awaited<ReturnType<typeof requestPointsAction>>;
      try {
        res = await requestPointsAction({ shopId, idempotencyKey: key, clientRequestedAt: at });
      } catch {
        // No answer (offline, dropped connection): keep the tap with its key and send it later.
        queue(key, at);
        return false;
      }
      if (!res.ok) {
        toast(res.error.message, "error");
        return false;
      }
      if (res.data.outcome === "open") {
        toast(REQUEST_OPEN_TOAST);
        router.refresh();
        return false;
      }
      setRolling(true);
      toast(REQUEST_SENT_TOAST, "success");
      router.refresh();
      return true;
    } finally {
      inFlight.current = false;
    }
  }

  if (open && !rolling) {
    const text = pendingRequestText(open, shopName);
    return (
      <Card
        // A quiet rise where the button was (design review M1): the taller card doesn't just appear.
        className="stagger-item flex items-start gap-3 p-5"
        role="status"
        data-testid="request-pending"
        data-status={open.status}
      >
        <Icon icon={Clock} className="text-gold-deep mt-1 shrink-0" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-h2">{text.title}</p>
          <p className="text-body text-ink-2" data-testid="request-pending-text">
            {text.body}
          </p>
          <p className="text-small text-ink-2">{text.expiry}</p>
        </div>
      </Card>
    );
  }

  if (queued) {
    return (
      <Card
        className="stagger-item flex items-start gap-3 p-5"
        role="status"
        data-testid="request-queued"
      >
        <Icon icon={online ? Clock : WifiOff} className="text-gold-deep mt-1 shrink-0" />
        <div className="flex min-w-0 flex-col items-start gap-3">
          <p className="text-body text-ink-2">
            {online ? REQUEST_SENDING_TEXT : REQUEST_QUEUED_TEXT}
          </p>
          {online ? (
            <Button
              size={46}
              variant="orbit"
              onClick={() => {
                window.dispatchEvent(new Event(QUEUE_FLUSH_EVENT));
              }}
            >
              Send now
            </Button>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <Button
      block
      resultLabel="Request sent"
      onClick={send}
      onRollEnd={() => {
        setRolling(false);
      }}
      data-testid="request-points"
    >
      Request points
    </Button>
  );
}

/**
 * Sends the phone's queued requests (request-queue.ts) when it is online: on load, on every `online` event, when
 * the page is shown again (an `online` event missed while the phone was in Settings), on "Send now", and, while a
 * tap is still waiting, again after `REQUEST_RETRY_MS` (a first send that failed because the line wasn't really
 * back). One at a time, each with its own key. A request the server answers for good is dropped (sent → the page
 * refreshes into its pending state; refused → the reason as a toast); no answer, or a short-lived refusal, keeps
 * it for next time. Mounted once, in the customer layout.
 */
export function QueuedRequestSender({ userId }: { userId: string }): null {
  const router = useRouter();
  const running = useRef(false);

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;
    const schedule = (): void => {
      clearTimeout(retry);
      if (stopped) return;
      const delay = REQUEST_RETRY_MS[Math.min(attempt, REQUEST_RETRY_MS.length - 1)];
      attempt += 1;
      retry = setTimeout(() => {
        void flush();
      }, delay);
    };
    const flush = async (): Promise<void> => {
      // Offline: nothing is tried and nothing is scheduled; `online` (or the page shown again) starts it.
      if (running.current || !navigator.onLine) return;
      clearTimeout(retry);
      running.current = true;
      try {
        const storage = browserQueueStorage();
        let changed = false;
        for (const entry of readQueue(storage, userId, new Date())) {
          let outcome: Parameters<typeof afterSend>[0];
          let message: string | null = null;
          let alreadyOpen = false;
          try {
            const res = await requestPointsAction({
              shopId: entry.shopId,
              idempotencyKey: entry.key,
              clientRequestedAt: entry.at,
            });
            outcome = res.ok ? { ok: true } : { ok: false, code: res.error.code };
            if (!res.ok) message = res.error.message;
            // Another request was already waiting there: say so, not "sent" (code review LOW 4, P1-C close).
            else alreadyOpen = res.data.outcome === "open";
          } catch {
            outcome = { thrown: true };
          }
          if (afterSend(outcome) === "keep") continue;
          dropQueued(storage, userId, entry.key, new Date());
          changed = true;
          if (message) toast(message, "error");
          else if (alreadyOpen) toast(REQUEST_OPEN_TOAST);
          else toast("Your saved request was sent.", "success");
        }
        if (changed) {
          window.dispatchEvent(new Event(QUEUE_EVENT));
          router.refresh();
        }
      } finally {
        running.current = false;
      }
      if (stopped) return;
      if (readQueue(browserQueueStorage(), userId, new Date()).length > 0) schedule();
      else attempt = 0;
    };
    const now = (): void => {
      attempt = 0;
      void flush();
    };
    const onVisible = (): void => {
      if (!document.hidden) now();
    };
    // A tap queued while the phone says it is online (the send threw): try again after the first delay.
    const onQueued = (): void => {
      if (!running.current && navigator.onLine) schedule();
    };
    // Another account's leftovers and stale taps go before anything is sent (security review re-check, P1-C close).
    keepOwnQueue(browserQueueStorage(), userId, new Date());
    void flush();
    window.addEventListener("online", now);
    window.addEventListener("pageshow", now);
    window.addEventListener(QUEUE_FLUSH_EVENT, now);
    window.addEventListener(QUEUE_EVENT, onQueued);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(retry);
      window.removeEventListener("online", now);
      window.removeEventListener("pageshow", now);
      window.removeEventListener(QUEUE_FLUSH_EVENT, now);
      window.removeEventListener(QUEUE_EVENT, onQueued);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, userId]);

  return null;
}
