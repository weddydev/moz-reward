"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Badge, Button } from "@/components/ui";
import { cx } from "@/lib/cx";
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
 * taps and network failures, and the result is announced in a live region.
 */
export function DeviceList({
  devices,
  signInPath,
}: {
  devices: ReadonlyArray<DeviceRow>;
  signInPath: string;
}): React.JSX.Element {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

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
      <h2 id="devices-heading" className="text-h3">
        Signed-in devices
      </h2>
      <ul className="border-line divide-line flex flex-col divide-y rounded-md border">
        {devices.map((device) => (
          <li key={device.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
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
                disabled={pending !== null && pending !== device.id}
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
        <div className="bg-surface-2 flex flex-col gap-3 rounded-md p-4">
          <p id="confirm-everywhere">
            Sign out on every device, including this one? You&apos;ll need to sign in again.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="destructive"
              size={40}
              loading={pending === "all"}
              aria-describedby="confirm-everywhere"
              onClick={() => void signOutEverywhere()}
            >
              Sign out everywhere
            </Button>
            <Button
              variant="ghost"
              size={40}
              disabled={pending === "all"}
              onClick={() => {
                setConfirming(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          block
          disabled={pending !== null}
          onClick={() => {
            setConfirming(true);
          }}
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
