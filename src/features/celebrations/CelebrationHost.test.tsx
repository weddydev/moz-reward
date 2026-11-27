// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P1-15 host, code review M4 (P1-D close): the server marks an approval seen as it hands it out, so the host
 * claims only once the moment's chunk has loaded (a chunk a deploy removed leaves the approval unseen, for the
 * next open), and a moment that throws ends quietly instead of taking the customer layout down.
 */
const moment = {
  requestId: "00000000-0000-4000-8000-000000000001",
  shopName: "Brew & Bloom Café",
  gold: 150,
};

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  fetchSpy = vi.fn(async () => new Response(JSON.stringify({ data: moment }), { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.doUnmock("./CelebrationMoment");
  vi.unstubAllGlobals();
});

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });
};

describe("[P1-15] celebration host: claim only what it can play", () => {
  it("[P1-15] the moment's chunk fails to load: no claim, so the approval stays unseen", async () => {
    vi.doMock("./CelebrationMoment", () => {
      throw new Error("ChunkLoadError: the old chunk is gone");
    });
    const { CelebrationHost } = await import("./CelebrationHost");
    render(<CelebrationHost />);
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("celebration-host")).toBeTruthy();
  });

  it("[P1-15] a moment that throws ends quietly; the host and the page stay", async () => {
    vi.doMock("./CelebrationMoment", () => ({
      default: () => {
        throw new Error("render failed");
      },
    }));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { CelebrationHost } = await import("./CelebrationHost");
    render(
      <main>
        <p>Wallet</p>
        <CelebrationHost />
      </main>,
    );
    await settle();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Wallet")).toBeTruthy();
    expect(screen.getByTestId("celebration-host")).toBeTruthy();
    quiet.mockRestore();
  });
});
