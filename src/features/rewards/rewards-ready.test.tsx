// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as RewardsReadyModule from "./RewardsReady";
import type { ReadyRewardView } from "./view";

// The sheet's chunk on a slow line (P1-D close QA MINOR 5, slow 3G): its module resolves only when the test says.
const chunk = vi.hoisted(() => {
  let release: () => void = () => undefined;
  let fail: (e: Error) => void = () => undefined;
  const state = { loads: 0, gate: Promise.resolve() };
  return {
    state,
    hold(): void {
      state.gate = new Promise<void>((resolve, reject) => {
        release = resolve;
        fail = reject;
      });
    },
    release: () => {
      release();
    },
    fail: (e: Error) => {
      fail(e);
    },
  };
});
const toast = vi.hoisted(() => vi.fn());

vi.mock("@/components/ui/Toast", () => ({ toast }));

const REWARDS: ReadyRewardView[] = [
  {
    id: "r1",
    label: "Free coffee",
    shopName: "Brew & Bloom",
    validUntil: "Use by 7 Dec 2026",
  },
  {
    id: "r2",
    label: "Free cake",
    shopName: "Brew & Bloom",
    validUntil: "Use by 7 Dec 2026",
  },
];

let idle: Array<() => void> = [];

beforeEach(() => {
  // doMock, not mock: re-run for every fresh module graph (resetModules), so each test starts with no chunk.
  vi.doMock("./RedeemSheet", async () => {
    chunk.state.loads += 1;
    await chunk.state.gate;
    return {
      default: ({ reward, open }: { reward: ReadyRewardView; open: boolean }) =>
        open ? <div role="dialog" aria-label={`Redeem ${reward.label}`} /> : null,
    };
  });
  chunk.state.loads = 0;
  chunk.state.gate = Promise.resolve();
  idle = [];
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => idle.push(cb));
  vi.stubGlobal("cancelIdleCallback", (id: number) => {
    idle[id - 1] = () => undefined;
  });
  toast.mockClear();
});
afterEach(() => {
  cleanup(); // before the idle stubs go: unmounting cancels the idle preload
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function load(): Promise<typeof RewardsReadyModule> {
  return import("./RewardsReady");
}
const flush = async (): Promise<void> => {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
};

describe("[P1-18] Rewards ready: the redeem sheet's chunk on a slow line", () => {
  it("is fetched at idle once the list shows, never before (no list, no fetch)", async () => {
    const { RewardsReady } = await load();
    const { rerender } = render(<RewardsReady rewards={[]} showShop />);
    expect(idle).toHaveLength(0);
    rerender(<RewardsReady rewards={REWARDS} showShop />);
    expect(chunk.state.loads).toBe(0);
    expect(idle).toHaveLength(1);
    await act(async () => {
      idle[0]?.();
      await Promise.resolve();
    });
    expect(chunk.state.loads).toBe(1);
  });

  it("Redeem before the chunk arrives: that row is busy at once, then the sheet opens and the row is not busy", async () => {
    chunk.hold();
    const { RewardsReady } = await load();
    render(<RewardsReady rewards={REWARDS} showShop />);
    const button = screen.getByRole("button", { name: "Redeem Free coffee" });
    fireEvent.click(button);
    await flush();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Redeem Free cake" })).not.toHaveAttribute(
      "aria-busy",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    chunk.release();
    await flush();
    expect(await screen.findByRole("dialog", { name: "Redeem Free coffee" })).toBeTruthy();
    expect(button).not.toHaveAttribute("aria-busy");
  });

  it("the chunk fails to load: the row is not left busy and a toast says to try again", async () => {
    chunk.hold();
    const { RewardsReady } = await load();
    render(<RewardsReady rewards={REWARDS} showShop />);
    const button = screen.getByRole("button", { name: "Redeem Free coffee" });
    fireEvent.click(button);
    await flush();
    expect(button).toHaveAttribute("aria-busy", "true");
    chunk.fail(new Error("ChunkLoadError"));
    await flush();
    expect(button).not.toHaveAttribute("aria-busy");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(toast).toHaveBeenCalledWith(
      "Couldn’t open the reward just now. Check your connection and try again.",
      "error",
    );
  });

  it("chunk already here: Redeem opens the sheet with no busy state", async () => {
    const { RewardsReady } = await load();
    render(<RewardsReady rewards={REWARDS} showShop />);
    await act(async () => {
      idle[0]?.();
      await Promise.resolve();
    });
    await flush();
    const button = screen.getByRole("button", { name: "Redeem Free cake" });
    fireEvent.click(button);
    expect(button).not.toHaveAttribute("aria-busy");
    expect(await screen.findByRole("dialog", { name: "Redeem Free cake" })).toBeTruthy();
  });
});
