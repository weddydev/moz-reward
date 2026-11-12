"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";
import {
  type ConsentChoice,
  consentCookie,
  parseConsent,
  umamiScriptAttributes,
} from "@/lib/consent";

/** Fired by a "Cookie settings" link (footer, P0-12) to show the notice again. */
export const COOKIE_SETTINGS_EVENT = "moz:cookie-settings";

function loadUmami(path: string, websiteId: string): void {
  if (document.querySelector("script[data-moz-analytics]")) return;
  const script = document.createElement("script");
  script.defer = true;
  for (const [k, v] of Object.entries(umamiScriptAttributes(path, websiteId)))
    script.setAttribute(k, v);
  script.setAttribute("data-moz-analytics", "");
  document.head.appendChild(script);
}

/**
 * Basic cookie notice (P0-13; final copy in P5) and the analytics loader. Umami is injected only after the
 * visitor allows it (AC5); "No thanks" is just as easy and is remembered. Not a modal: it never blocks the page,
 * sits above the home indicator, and appears only after hydration (so a press is never lost). No animation.
 */
/** Cookie choice as an external store: written by `decide`, which notifies subscribers. */
const CHANGED = "moz:consent-changed";
const subscribe = (notify: () => void): (() => void) => {
  window.addEventListener(CHANGED, notify);
  return () => {
    window.removeEventListener(CHANGED, notify);
  };
};
const readChoice = (): ConsentChoice | null => parseConsent(document.cookie);
/** Before hydration nothing is shown: the buttons must never be pressable before React owns them. */
const serverChoice = (): "unknown" => "unknown";

export function CookieNotice({
  path,
  websiteId,
}: {
  path: string;
  websiteId: string;
}): React.JSX.Element | null {
  const stored = useSyncExternalStore(subscribe, readChoice, serverChoice);
  const [reopened, setReopened] = useState(false);
  const choice = reopened ? null : stored;

  useEffect(() => {
    if (stored === "granted") loadUmami(path, websiteId);
  }, [stored, path, websiteId]);

  useEffect(() => {
    const reopen = (): void => {
      setReopened(true);
    };
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    return () => {
      window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
    };
  }, []);

  const decide = (next: ConsentChoice): void => {
    document.cookie = consentCookie(next, window.location.protocol === "https:");
    setReopened(false);
    window.dispatchEvent(new Event(CHANGED));
    // Withdrawing consent stops collection from the next page load (the tracker can't be unloaded).
  };

  if (choice !== null) return null;
  return (
    <section
      aria-label="Cookies"
      className="bg-surface shadow-2 border-line fixed inset-x-3 z-40 mx-auto max-w-xl rounded-md border p-4"
      style={{ bottom: "var(--fixed-bottom)" }}
    >
      <p className="text-small">
        We use essential cookies to keep you signed in. With your OK we also count visits with
        privacy-friendly analytics (no advertising, no tracking across sites).
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size={40}
          onClick={() => {
            decide("granted");
          }}
        >
          Allow analytics
        </Button>
        <Button
          variant="secondary"
          size={40}
          onClick={() => {
            decide("denied");
          }}
        >
          No thanks
        </Button>
      </div>
    </section>
  );
}
