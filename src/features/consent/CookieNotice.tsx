"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import {
  type ConsentChoice,
  consentCookie,
  parseConsent,
  umamiScriptAttributes,
} from "@/lib/consent";
import { cx } from "@/lib/cx";

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
 * sits above the home indicator. No animation.
 * P1-02: the server renders the notice when the request carries no choice, so its text paints with the page
 * (it was the landing's LCP element, late by a full hydration). The buttons are rendered in place but stay
 * `invisible` (no tap, no focus, no accessibility node) until React owns them, so a press is never lost and the
 * reserved space means nothing shifts when they appear.
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
const noSubscribe = (): (() => void) => () => undefined;

export function CookieNotice({
  path,
  websiteId,
  initialChoice,
}: {
  path: string;
  websiteId: string;
  /** The choice in this request's cookie (root layout), so server HTML and hydration agree. */
  initialChoice: ConsentChoice | null;
}): React.JSX.Element | null {
  const stored = useSyncExternalStore(subscribe, readChoice, () => initialChoice);
  // false in the server HTML and during hydration, true once React owns the buttons.
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
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
      <div
        className={cx("mt-3 flex flex-wrap gap-2", !hydrated && "invisible")}
        data-consent-actions=""
      >
        <Button
          variant="orbit"
          size={46}
          onClick={() => {
            decide("granted");
          }}
        >
          Allow analytics
        </Button>
        <Button
          variant="orbit"
          size={46}
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
