/**
 * The scanner's camera (P2-02): the back camera where there is one, no audio. `startCamera` turns every failure
 * into one of two answers the page can explain: `denied` (the person or the browser blocked it; manual entry
 * still works) and `unavailable` (no camera, in use elsewhere, or no camera API at all).
 */

export type CameraStart =
  | { ok: true; stream: MediaStream; torch: boolean }
  | { ok: false; reason: "denied" | "unavailable" };

const DENIED = new Set(["NotAllowedError", "SecurityError", "PermissionDeniedError"]);

type TorchCaps = MediaTrackCapabilities & { torch?: boolean };
/** The DOM types say these always exist; outside a secure context (or in older Firefox) they don't. */
type MaybeMedia = { getUserMedia?: MediaDevices["getUserMedia"] } | undefined;
type MaybeCaps = { getCapabilities?: () => TorchCaps };

export async function startCamera(): Promise<CameraStart> {
  const media = (
    typeof navigator === "undefined" ? undefined : navigator.mediaDevices
  ) as MaybeMedia;
  if (!media?.getUserMedia) return { ok: false, reason: "unavailable" };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    const track = stream.getVideoTracks()[0];
    const caps = (track as MaybeCaps | undefined)?.getCapabilities?.() ?? {};
    return { ok: true, stream, torch: caps.torch === true };
  } catch (err) {
    const name = err instanceof Error || err instanceof DOMException ? err.name : "";
    return { ok: false, reason: DENIED.has(name) ? "denied" : "unavailable" };
  }
}

export function stopCamera(stream: MediaStream | null): void {
  for (const t of stream?.getTracks() ?? []) t.stop();
}

/** Torch on or off; false when the track refuses (the toggle then hides). */
export async function setTorch(stream: MediaStream | null, on: boolean): Promise<boolean> {
  const track = stream?.getVideoTracks()[0];
  if (!track) return false;
  try {
    await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
    return true;
  } catch {
    return false;
  }
}
