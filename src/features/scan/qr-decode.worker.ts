import jsQR from "jsqr";

/**
 * The fallback QR decoder (P2-02, DESIGN §11 "Camera scanning"): jsQR off the main thread, for browsers without
 * `BarcodeDetector` (Safari, Firefox). It only ever receives one downscaled frame at a time and answers with the
 * decoded text or null; the page decides what the text means.
 */
type Frame = { id: number; data: ArrayBuffer; width: number; height: number };

/** The worker's own global, typed by hand: a `webworker` lib reference would retype the whole program's DOM. */
type WorkerScope = {
  onmessage: ((e: MessageEvent<Frame>) => void) | null;
  postMessage(message: { id: number; text: string | null }): void;
};
const scope = self as unknown as WorkerScope;

scope.onmessage = (e: MessageEvent<Frame>): void => {
  const { id, data, width, height } = e.data;
  let text: string | null = null;
  try {
    // Both: a member card on a phone in dark mode may show light modules on a dark background.
    text =
      jsQR(new Uint8ClampedArray(data), width, height, { inversionAttempts: "attemptBoth" })
        ?.data ?? null;
  } catch {
    text = null;
  }
  scope.postMessage({ id, text });
};
