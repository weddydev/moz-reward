"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge, Button } from "@/components/ui";
import { cx } from "@/lib/cx";
import { useHydrated } from "@/lib/use-hydrated";
import { withNetworkGuard } from "./network";
import { signOutAllDevices, signOutOtherDevice } from "./session-actions";

export type DeviceRow = {
  id: string;
  device: string;
  signedIn: string;
  lastActive: string;
  current: boolean;
};

/**
 * Signed-in devices (SECURITY §2): sign one other device out, or sign out everywhere (this device too, after
 * an inline confirm). No motion: a rarely used, functional screen. Every request is guarded against double
 * taps and network failures, and the result is announced in a live region. Focus never falls to <body>:
 * the confirm takes focus when it opens, Cancel/Escape return it to the trigger, and after a device is
 * removed focus moves to the list heading (P0-B QA).
 */
export function DeviceList({
  devices,
  signInPath,
}: {
  devices: ReadonlyArray<DeviceRow>;
  signInPath: string;
}): React.JSX.Element {
  const router = useRouter();
  /** Buttons are disabled until React owns the page: a press before hydration would be lost (P0-14 CI). */
  const hydrated = useHydrated();
  const busy = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  /** Where focus goes after the next render: the element that replaces the one that was just removed. */
  const focusAfterRender = useRef<string | null>(null);
  const setFocusTarget = (id: string): void => {
    focusAfterRender.current = id;
  };

  useEffect(() => {
    const id = focusAfterRender.current;
    if (!id) return;
    focusAfterRender.current = null;
    document.getElementById(id)?.focus();
  });

  function openConfirm(): void {
    setConfirming(true);
    setFocusTarget("confirm-everywhere-yes");
  }

  function closeConfirm(): void {
    setConfirming(false);
    setFocusTarget("sign-out-everywhere");
  }

  async function run<T>(
    key: string,
    call: () => Promise<{ ok: true; data: T } | { ok: false; error: { message: string } }>,
  ): Promise<T | null> {
    if (busy.current) return null;
    busy.current = true;
    setPending(key);
    setStatus(null);
    const res = await withNetworkGuard(call);
    busy.current = false;
    setPending(null);
    if (!res.ok) {
      setStatus({ tone: "error", text: res.message });
      return null;
    }
    if (!res.value.ok) {
      setStatus({ tone: "error", text: res.value.error.message });
      router.refresh(); // e.g. already signed out elsewhere: show the current list
      return null;
    }
    return res.value.data;
  }

  async function signOutOne(device: DeviceRow): Promise<void> {
    const done = await run(device.id, () => signOutOtherDevice({ sessionId: device.id }));
    if (done === null) return;
    setStatus({ tone: "ok", text: `Signed out of ${device.device}.` });
    setFocusTarget("devices-heading"); // its row (and the focused button) is about to disappear
    router.refresh();
  }

  async function signOutEverywhere(): Promise<void> {
    const done = await run("all", () => signOutAllDevices({}));
    if (done === null) return;
    // Full page load: every session is gone, so no client-cached signed-in page may survive.
    window.location.assign(signInPath);
  }

  return (
    <section aria-labelledby="devices-heading" className="flex flex-col gap-4">
      <h2 id="devices-heading" tabIndex={-1} className="text-h3 outline-none">
        Signed-in devices
      </h2>
      <ul className="border-line divide-line flex flex-col divide-y rounded-md border">
        {devices.map((device) => (
          <li key={device.id} className="flex flex-wrap items-center gap-3 p-4">
            {/* basis-48: on narrow screens the button wraps below instead of squeezing the dates */}
            <div className="min-w-0 flex-1 basis-48">
              <p className="flex flex-wrap items-center gap-2 font-semibold wrap-break-word">
                {device.device}
                {device.current ? <Badge tone="business">This device</Badge> : null}
              </p>
              <p className="text-small text-ink-2">Signed in {device.signedIn}</p>
              <p className="text-small text-ink-2">Last active {device.lastActive}</p>
            </div>
            {device.current ? null : (
              <Button
                variant="secondary"
                size={40}
                loading={pending === device.id}
                disabled={!hydrated || (pending !== null && pending !== device.id)}
                onClick={() => void signOutOne(device)}
                aria-label={`Sign out of ${device.device}`}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>

      {confirming ? (
        <div
          className="bg-surface-2 flex flex-col gap-3 rounded-md p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape" && pending !== "all") closeConfirm();
          }}
        >
          <p id="confirm-everywhere">
            Sign out on every device, including this one? You&apos;ll need to sign in again.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              id="confirm-everywhere-yes"
              variant="destructive"
              size={40}
              loading={pending === "all"}
              aria-describedby="confirm-everywhere"
              onClick={() => void signOutEverywhere()}
            >
              Sign out everywhere
            </Button>
            <Button variant="ghost" size={40} disabled={pending === "all"} onClick={closeConfirm}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          id="sign-out-everywhere"
          variant="secondary"
          block
          disabled={!hydrated || pending !== null}
          onClick={openConfirm}
        >
          Sign out everywhere
        </Button>
      )}

      <p
        role="status"
        aria-live="polite"
        // Out of layout while empty (no stray gap) but still in the accessibility tree for announcements.
        className={cx("empty:sr-only", status?.tone === "error" ? "text-danger" : "text-ink-2")}
      >
        {status?.text ?? ""}
      </p>
    </section>
  );
}
