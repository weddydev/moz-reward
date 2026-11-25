/**
 * Child process for tests/integration/realtime-shutdown.test.ts (P1-10, C-28): the real process hub with the
 * real signal wiring. Opens one stream, prints its bytes as they arrive, and exits once the stream closes.
 */
import { newId } from "@/lib/id";
import { realtimeHub, registerRealtimeShutdown } from "@/server/realtime/process-hub";

async function main(): Promise<void> {
  registerRealtimeShutdown();
  const userId = newId();
  const opened = realtimeHub().open({
    userId,
    sessionId: newId(),
    deadline: Number.POSITIVE_INFINITY,
    channel: { kind: "user", id: userId },
  });
  if (!opened.ok) throw new Error(opened.reason);
  const reader = opened.stream.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    process.stdout.write(decoder.decode(value).replace(/\n/g, "\\n") + "\n");
  }
  process.stdout.write("STREAM-CLOSED\n");
  realtimeHub().dispose();
  process.exit(0);
}

void main();
