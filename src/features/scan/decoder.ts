/**
 * QR decoding for the member scanner (P2-02, DESIGN §11): the browser's `BarcodeDetector` where it reads QR codes
 * (Chrome on Android and macOS), otherwise jsQR in a Web Worker, whose chunk loads only then. Frames go to the
 * worker downscaled to at most `FRAME_MAX` px on the long side, one at a time, so decoding never piles up or
 * blocks the main thread.
 */

export type Decoder = {
  kind: "native" | "worker";
  /** The text of a QR in the current video frame, or null. */
  read(video: HTMLVideoElement): Promise<string | null>;
  close(): void;
};

export const FRAME_MAX = 640;

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorClass = {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

async function nativeDetector(): Promise<Detector | null> {
  const BD = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (!BD) return null;
  try {
    const formats = await BD.getSupportedFormats();
    return formats.includes("qr_code") ? new BD({ formats: ["qr_code"] }) : null;
  } catch {
    return null;
  }
}

/** The frame's size after downscaling (never upscaled). */
export function frameSize(
  width: number,
  height: number,
  max = FRAME_MAX,
): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

function workerDecoder(): Decoder {
  const worker = new Worker(new URL("./qr-decode.worker.ts", import.meta.url), { type: "module" });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let next = 0;
  const waiting = new Map<number, (text: string | null) => void>();
  worker.onmessage = (e: MessageEvent<{ id: number; text: string | null }>): void => {
    waiting.get(e.data.id)?.(e.data.text);
    waiting.delete(e.data.id);
  };
  return {
    kind: "worker",
    read: (video) => {
      if (!ctx || video.videoWidth === 0) return Promise.resolve(null);
      const { w, h } = frameSize(video.videoWidth, video.videoHeight);
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const id = ++next;
      return new Promise((resolve) => {
        waiting.set(id, resolve);
        worker.postMessage({ id, data: data.buffer, width: w, height: h }, [data.buffer]);
      });
    },
    close: () => {
      worker.terminate();
      for (const done of waiting.values()) done(null);
      waiting.clear();
    },
  };
}

export async function createDecoder(): Promise<Decoder> {
  const native = await nativeDetector();
  if (native) {
    return {
      kind: "native",
      read: async (video) => {
        if (video.videoWidth === 0) return null;
        try {
          return (await native.detect(video))[0]?.rawValue ?? null;
        } catch {
          return null;
        }
      },
      close: () => undefined,
    };
  }
  return workerDecoder();
}
