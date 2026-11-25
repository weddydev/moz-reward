/**
 * Incremental Server-Sent Events parser (P1-10), for the fetch-based realtime client. EventSource is not used: it
 * hides the HTTP status (a 401 must send the user to sign in, not reconnect for ever) and reconnects on a fixed
 * timer, never with backoff and jitter (ARCHITECTURE §7).
 *
 * Follows the WHATWG event-stream rules: lines end in CRLF, LF or CR; `:` lines are comments (heartbeats); a
 * blank line dispatches; `data` lines join with "\n"; one space after the colon is dropped; a block without
 * data dispatches nothing; `retry:` takes only whole non-negative numbers. Pure: no I/O, no timers.
 */
export type SseMessage = { id: string | undefined; event: string; data: string };

export type SseParser = { push: (chunk: string) => void };

/** A line longer than this ends the stream (a broken or hostile server never ends a line). */
export const SSE_MAX_LINE_BYTES = 64 * 1024;

export function createSseParser(handlers: {
  onMessage: (message: SseMessage) => void;
  onRetry?: (ms: number) => void;
  maxLineBytes?: number;
}): SseParser {
  const maxLine = handlers.maxLineBytes ?? SSE_MAX_LINE_BYTES;
  let buffer = "";
  /** The previous chunk ended in CR: a leading LF in the next chunk belongs to that line end. */
  let pendingCr = false;
  let data: string[] = [];
  let event = "";
  let id: string | undefined;

  const dispatch = (): void => {
    if (data.length > 0)
      handlers.onMessage({ id, event: event || "message", data: data.join("\n") });
    data = [];
    event = "";
    id = undefined;
  };

  const line = (text: string): void => {
    if (text === "") {
      dispatch();
      return;
    }
    if (text.startsWith(":")) return;
    const colon = text.indexOf(":");
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    switch (field) {
      case "data":
        data.push(value);
        return;
      case "event":
        event = value;
        return;
      case "id":
        if (!value.includes("\0")) id = value;
        return;
      case "retry":
        if (/^\d+$/.test(value)) handlers.onRetry?.(Number(value));
        return;
      default:
        return;
    }
  };

  return {
    push(chunk) {
      let text = chunk;
      if (pendingCr && text.startsWith("\n")) text = text.slice(1);
      pendingCr = false;
      buffer += text;
      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const ch = buffer[i];
        if (ch !== "\n" && ch !== "\r") continue;
        line(buffer.slice(start, i));
        if (ch === "\r") {
          if (i + 1 < buffer.length) {
            if (buffer[i + 1] === "\n") i++;
          } else {
            pendingCr = true;
          }
        }
        start = i + 1;
      }
      buffer = buffer.slice(start);
      if (buffer.length > maxLine) throw new Error("SSE line too long");
    },
  };
}
