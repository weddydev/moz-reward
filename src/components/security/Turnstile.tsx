"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { clientEnv } from "@/lib/env";
import { TURNSTILE_BYPASS_TOKEN, TURNSTILE_FIELD } from "@/lib/turnstile";

/**
 * Cloudflare Turnstile (P0-05, SECURITY §6). Put it inside a <form>: the token travels in a hidden field
 * (`cf-turnstile-response`) and is checked on the server with `verifyTurnstile`. Without a site key
 * (local/test) no Cloudflare script loads and the field carries the bypass token, which the server accepts
 * only in local/test. The script is injected by Next's (nonced) runtime, which the CSP's 'strict-dynamic'
 * allows; the challenge iframe is allowed by `frame-src https://challenges.cloudflare.com`.
 */
export type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      action?: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      appearance: "interaction-only";
      size: "flexible";
    },
  ) => string;
  remove: (widgetId: string) => void;
};

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function Turnstile({
  siteKey = clientEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  action,
  onToken,
}: {
  siteKey?: string | undefined;
  /** Shown in Cloudflare analytics, e.g. "magic-link". */
  action?: string;
  onToken?: (token: string) => void;
}): React.JSX.Element {
  const [token, setToken] = useState(siteKey ? "" : TURNSTILE_BYPASS_TOKEN);
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  // Latest callback without re-rendering the widget; synced after render (refs are not written in render).
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const update = useCallback((value: string) => {
    setToken(value);
    onTokenRef.current?.(value);
  }, []);

  const mount = useCallback(() => {
    const api = (window as { turnstile?: TurnstileApi }).turnstile;
    if (!siteKey || !api || !container.current || widgetId.current) return;
    widgetId.current = api.render(container.current, {
      sitekey: siteKey,
      ...(action ? { action } : {}),
      callback: update,
      "expired-callback": () => {
        update("");
      },
      "error-callback": () => {
        update("");
      },
      appearance: "interaction-only",
      size: "flexible",
    });
  }, [siteKey, action, update]);

  useEffect(() => {
    if (!siteKey) {
      onTokenRef.current?.(TURNSTILE_BYPASS_TOKEN);
      return;
    }
    mount(); // script already loaded (client-side navigation)
    return () => {
      const id = widgetId.current;
      widgetId.current = null;
      if (id) (window as { turnstile?: TurnstileApi }).turnstile?.remove(id);
    };
  }, [siteKey, mount]);

  return (
    <>
      <input type="hidden" name={TURNSTILE_FIELD} value={token} />
      {siteKey ? (
        <>
          <div ref={container} />
          <Script src={SCRIPT} strategy="afterInteractive" onReady={mount} />
        </>
      ) : null}
    </>
  );
}
