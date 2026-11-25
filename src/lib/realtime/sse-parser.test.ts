import { describe, expect, it } from "vitest";
import { createSseParser, type SseMessage } from "./sse-parser";

function parseAll(chunks: string[]): { messages: SseMessage[]; retries: number[] } {
  const messages: SseMessage[] = [];
  const retries: number[] = [];
  const parser = createSseParser({
    onMessage: (m) => messages.push(m),
    onRetry: (ms) => retries.push(ms),
  });
  for (const c of chunks) parser.push(c);
  return { messages, retries };
}

describe("[P1-10] SSE parser", () => {
  it("parses event, id and data, and defaults the event name to message", () => {
    const { messages } = parseAll([
      'id: 1\nevent: points_credited\ndata: {"shopId":"a"}\n\n',
      "data: plain\n\n",
    ]);
    expect(messages).toEqual([
      { id: "1", event: "points_credited", data: '{"shopId":"a"}' },
      { id: undefined, event: "message", data: "plain" },
    ]);
  });

  it("joins multi-line data with newlines and accepts CRLF and CR line ends", () => {
    const { messages } = parseAll(["data: a\r\ndata: b\r\n\r\n", "data: c\rdata: d\r\r"]);
    expect(messages.map((m) => m.data)).toEqual(["a\nb", "c\nd"]);
  });

  it("handles a message split across any chunk boundary, including inside CRLF", () => {
    const whole = 'event: notification\r\ndata: {"notificationId":"n1"}\r\n\r\n';
    for (let cut = 1; cut < whole.length; cut++) {
      const { messages } = parseAll([whole.slice(0, cut), whole.slice(cut)]);
      expect(messages, `cut at ${String(cut)}`).toEqual([
        { id: undefined, event: "notification", data: '{"notificationId":"n1"}' },
      ]);
    }
  });

  it("ignores comments (heartbeats), unknown fields and blocks with no data", () => {
    const { messages } = parseAll([": hb\n\n", "foo: bar\n\n", "event: x\n\n", "data\n\n"]);
    // `data` with no colon is a data field with an empty value (spec), so one empty message.
    expect(messages).toEqual([{ id: undefined, event: "message", data: "" }]);
  });

  it("strips exactly one leading space after the colon", () => {
    const { messages } = parseAll(["data:  two\n\n", "data:none\n\n"]);
    expect(messages.map((m) => m.data)).toEqual([" two", "none"]);
  });

  it("reports retry: only for whole non-negative integers", () => {
    const { retries } = parseAll([
      "retry: 4200\n\n",
      "retry: 12x\n\n",
      "retry: -1\n\n",
      "retry:\n\n",
    ]);
    expect(retries).toEqual([4200]);
  });

  it("refuses a line that grows past the size cap (a stream that never ends a line)", () => {
    const parser = createSseParser({ onMessage: () => undefined, maxLineBytes: 64 });
    expect(() => {
      parser.push("data: " + "x".repeat(100));
    }).toThrow(/too long/);
  });
});
