import "server-only";
import { processState, assertFakeAllowed } from "../fake-support";

export type AiRequest = { purpose: "review-help"; prompt: string };
export type AiResponse = { text: string };

export interface AiProvider {
  complete(request: AiRequest): Promise<AiResponse>;
}

/** The provider is down or refused; callers must degrade gracefully (journey 5: "AI provider down"). */
export class AiUnavailableError extends Error {
  constructor(message = "AI provider unavailable") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export type AiScript = { mode: "ok"; text: string } | { mode: "error" } | { mode: "timeout" } | { mode: "empty" };

const DEFAULT_SCRIPT: AiScript = { mode: "ok", text: "Thanks for a lovely visit — friendly staff and great coffee." };
const state = processState<{ script: AiScript }>("ai", () => ({ script: DEFAULT_SCRIPT }));

/** Scripted fake (TESTING §9) with failure modes, controllable from tests and `/api/test/fakes`. */
export const fakeAi = {
  script: (script: AiScript): void => {
    state.script = script;
  },
  reset: (): void => {
    state.script = DEFAULT_SCRIPT;
  },
};

const fakeProvider: AiProvider = {
  async complete() {
    const s = state.script;
    switch (s.mode) {
      case "ok":
        return { text: s.text };
      case "empty":
        return { text: "" };
      case "error":
        throw new AiUnavailableError();
      case "timeout":
        throw new AiUnavailableError("AI provider timed out");
    }
  },
};

/** The real provider (Gemini, H-09) arrives with the AI review-help task. */
function resolveProvider(): AiProvider {
  assertFakeAllowed("AI");
  return fakeProvider;
}

export async function complete(request: AiRequest): Promise<AiResponse> {
  return resolveProvider().complete(request);
}
