// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VAULT } from "@/lib/motion/vault";
import { GoldVault } from "./GoldVault";
import { RedeemCode } from "./RedeemCode";
import { RewardUnlocked } from "./RewardUnlocked";

const fx = vi.hoisted(() => ({ burst: vi.fn(() => 0), toast: vi.fn() }));
vi.mock("@/lib/motion/fx", () => ({ burst: fx.burst }));
vi.mock("./Toast", () => ({ toast: fx.toast }));

/** A Web Animation stand-in: the test decides when each one finishes (jsdom has no Web Animations). */
class FakeAnimation {
  playState: AnimationPlayState = "running";
  currentTime = 0;
  readonly finished: Promise<FakeAnimation>;
  readonly effect: { getComputedTiming: () => { endTime: number; delay: number } };
  private settle: { ok: (a: FakeAnimation) => void; no: (e: unknown) => void } | null = null;
  constructor(
    readonly target: Element,
    readonly keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    readonly options: KeyframeAnimationOptions,
  ) {
    this.finished = new Promise((ok, no) => {
      this.settle = { ok, no };
    });
    this.finished.catch(() => undefined);
    const delay = options.delay ?? 0;
    const end = delay + (typeof options.duration === "number" ? options.duration : 0);
    this.effect = { getComputedTiming: () => ({ endTime: end, delay }) };
  }
  finish(): void {
    if (this.playState !== "running") return;
    this.playState = "finished";
    this.settle?.ok(this);
  }
  cancel(): void {
    if (this.playState !== "running") return;
    this.playState = "idle";
    this.settle?.no(new DOMException("cancelled", "AbortError"));
  }
  pause(): void {
    /* not needed */
  }
  play(): void {
    /* not needed */
  }
}

let started: FakeAnimation[] = [];
/** The intersection observers made so far, so a test can bring the ingot on screen. */
let observers: { cb: IntersectionObserverCallback; els: Element[] }[] = [];

function show(): void {
  act(() => {
    for (const o of observers)
      o.cb(
        o.els.map((target) => ({ target, isIntersecting: true, intersectionRatio: 1 })) as never,
        {} as IntersectionObserver,
      );
  });
}

const part = (name: string): FakeAnimation | undefined =>
  started.find((a) => a.target.getAttribute("data-ingot-part") === name);

/** Lets the promise callbacks (`finished`) and React's commit run. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  started = [];
  observers = [];
  fx.burst.mockClear();
  fx.toast.mockClear();
  window.sessionStorage.clear();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      private readonly entry: { cb: IntersectionObserverCallback; els: Element[] };
      constructor(cb: IntersectionObserverCallback) {
        this.entry = { cb, els: [] };
        observers.push(this.entry);
      }
      observe(el: Element): void {
        this.entry.els.push(el);
      }
      disconnect(): void {
        observers = observers.filter((o) => o !== this.entry);
      }
      unobserve(): void {
        /* not needed */
      }
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {
        /* the gilded edge redraws on resize: not needed here */
      }
      disconnect(): void {
        /* not needed */
      }
      unobserve(): void {
        /* not needed */
      }
    },
  );
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  Element.prototype.animate = function (
    this: Element,
    k: Keyframe[] | PropertyIndexedKeyframes | null,
    o?: number | KeyframeAnimationOptions,
  ) {
    const a = new FakeAnimation(this, k, typeof o === "number" ? { duration: o } : (o ?? {}));
    started.push(a);
    return a as unknown as Animation;
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "animate");
  document.documentElement.classList.remove("rm");
  document.documentElement.style.removeProperty("--motion-on");
});

const SHOP = { name: "Brew & Bloom", logoUrl: null };

describe("[PD-10] Gold Vault", () => {
  it("[PD-10] header, line and count; the ingot keeps its live text (720 of 1,000 gold, 72%)", () => {
    render(
      <GoldVault
        shop={SHOP}
        title="Free coffee & cake"
        gold={720}
        size={1_000}
        perVisit={80}
        seenKey="t-header"
      />,
    );
    expect(screen.getByRole("region", { name: "Gold Vault, Brew & Bloom" })).toBeVisible();
    expect(screen.getByText(/Gold Vault · Brew & Bloom/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Free coffee & cake" })).toBeVisible();
    expect(screen.getByTestId("vault-line")).toHaveTextContent("280 gold to go · about 4 visits");
    expect(screen.getByRole("img", { name: "720 of 1,000 gold, 72%" })).toBeInTheDocument();
    expect(screen.queryByTestId("reward-card")).toBeNull();
    // [PD-11] A shop without a logo photo gets its coin in the same 30 px ring box (never stretched by the row).
    expect(screen.getByTestId("shop-coin").parentElement).toHaveClass("m-v-logo");
  });

  it("[PD-11] the rays' 40 s loop sleeps while the vault is off screen (FOLLOWUPS L5)", () => {
    render(
      <GoldVault
        shop={SHOP}
        title="Free coffee & cake"
        gold={1_000}
        size={1_000}
        seenKey="t-rays"
        unlocked
      />,
    );
    const vault = screen.getByTestId("gold-vault");
    const watcher = observers.find((o) => o.els.includes(vault));
    expect(watcher, "the vault section itself is watched").toBeDefined();
    act(() => {
      watcher?.cb(
        [{ target: vault, isIntersecting: false, intersectionRatio: 0 }] as never,
        {} as IntersectionObserver,
      );
    });
    expect(vault).toHaveAttribute("data-paused");
  });

  it("[PD-10] unlocked: the reward slot shows the card with 'Your reward is ready'", () => {
    render(
      <GoldVault
        shop={SHOP}
        title="Free coffee & cake"
        gold={1_000}
        size={1_000}
        seenKey="t-unlocked"
        unlocked
        reward={<RewardUnlocked detail="Free coffee & cake · Brew & Bloom Café" imageUrl={null} />}
      />,
    );
    expect(screen.getByTestId("gold-vault")).toHaveAttribute("data-unlocked", "");
    expect(screen.getByRole("heading", { name: "Your reward is ready" })).toBeVisible();
    expect(screen.getByTestId("vault-line")).toHaveTextContent("Your reward is ready.");
  });

  it("[PD-10] the pour lands at the fill's end (line, onLanded, onFull 250 ms later), done after the glint", async () => {
    const onLanded = vi.fn();
    const onFull = vi.fn();
    const { rerender } = render(
      <GoldVault
        shop={SHOP}
        title="t"
        gold={720}
        size={1_000}
        perVisit={80}
        seenKey="t-land"
        onLanded={onLanded}
        onFull={onFull}
      />,
    );
    show();
    // The first view's pour: let it land and settle.
    for (const a of started) a.finish();
    await flush();
    const box = document.querySelector(".ingot-pour");
    expect(box).toHaveAttribute("data-ingot-state", "done");
    onLanded.mockClear();
    started = [];
    vi.useFakeTimers();

    rerender(
      <GoldVault
        shop={SHOP}
        title="t"
        gold={1_000}
        size={1_000}
        perVisit={80}
        seenKey="t-land"
        onLanded={onLanded}
        onFull={onFull}
      />,
    );
    expect(box).toHaveAttribute("data-ingot-state", "run");
    expect(screen.getByTestId("vault-line")).toHaveTextContent("280 gold to go"); // not before it lands
    part("fill")?.finish();
    await flush();
    expect(onLanded).toHaveBeenCalledWith(1_000);
    expect(screen.getByTestId("vault-line")).toHaveTextContent("Your reward is ready.");
    expect(part("glint")?.playState).toBe("running"); // the glint plays on after the landing
    expect(box).toHaveAttribute("data-ingot-state", "run");
    expect(onFull).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(VAULT.unlock.delayMs);
    });
    expect(onFull).toHaveBeenCalledTimes(1);
    for (const a of started) a.finish();
    await flush();
    expect(box).toHaveAttribute("data-ingot-state", "done");
    expect(onLanded).toHaveBeenCalledTimes(1);
    expect(onFull).toHaveBeenCalledTimes(1);
  });

  it("[PD-10] a skip after the landing finishes the glint at once and never calls onFull twice", async () => {
    const onFull = vi.fn();
    const props = { shop: SHOP, title: "t", size: 1_000, seenKey: "t-skip", onFull };
    const { rerender } = render(<GoldVault {...props} gold={720} />);
    show();
    for (const a of started) a.finish();
    await flush();
    started = [];
    vi.useFakeTimers();
    rerender(<GoldVault {...props} gold={1_000} />);
    part("fill")?.finish();
    await flush();
    act(() => {
      vi.advanceTimersByTime(VAULT.unlock.delayMs);
    });
    expect(onFull).toHaveBeenCalledTimes(1);
    const box = document.querySelector(".ingot-pour");
    act(() => {
      box?.dispatchEvent(new Event("pointerdown"));
    });
    expect(part("glint")?.playState).toBe("finished");
    expect(box).toHaveAttribute("data-ingot-state", "done");
    expect(onFull).toHaveBeenCalledTimes(1);
  });

  it("[PD-10] unmounted mid-pour (navigation): nothing lands later and the animations stop", async () => {
    const onLanded = vi.fn();
    const onFull = vi.fn();
    const props = { shop: SHOP, title: "t", size: 1_000, seenKey: "t-nav", onLanded, onFull };
    const { rerender, unmount } = render(<GoldVault {...props} gold={720} />);
    show();
    for (const a of started) a.finish();
    await flush();
    onLanded.mockClear();
    started = [];
    vi.useFakeTimers();
    rerender(<GoldVault {...props} gold={1_000} />);
    unmount();
    expect(started.every((a) => a.playState === "idle")).toBe(true);
    await flush();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(onLanded).not.toHaveBeenCalled();
    expect(onFull).not.toHaveBeenCalled();
  });

  it("[PD-10] multi-ingot overflow: fills to the top, unlocks, then the next ingot starts empty", async () => {
    const onFull = vi.fn();
    const onLanded = vi.fn();
    const props = { shop: SHOP, title: "t", size: 1_000, seenKey: "t-over", onFull, onLanded };
    const { rerender } = render(<GoldVault {...props} gold={900} ingots={0} />);
    show();
    for (const a of started) a.finish();
    await flush();
    onLanded.mockClear();
    started = [];
    vi.useFakeTimers();
    // 900 + 200: the ingot fills (1,000), the next one holds 100.
    rerender(<GoldVault {...props} gold={100} ingots={1} />);
    part("fill")?.finish();
    await flush();
    expect(onLanded).toHaveBeenLastCalledWith(1_000);
    act(() => {
      vi.advanceTimersByTime(VAULT.unlock.delayMs);
    });
    expect(onFull).toHaveBeenCalledTimes(1);
    for (const a of started) a.finish();
    await flush();
    started = [];
    act(() => {
      vi.advanceTimersByTime(VAULT.unlock.holdMs);
    });
    // The next step pours into the new, empty ingot.
    expect(part("fill")).toBeDefined();
    part("fill")?.finish();
    await flush();
    expect(onLanded).toHaveBeenLastCalledWith(100);
    expect(onFull).toHaveBeenCalledTimes(1);
  });

  it("[PD-10] reduced motion: no pour, the end state at once (line and count)", () => {
    document.documentElement.style.setProperty("--motion-on", "0");
    const onLanded = vi.fn();
    const props = { shop: SHOP, title: "t", size: 1_000, perVisit: 80, seenKey: "t-rm", onLanded };
    const { rerender } = render(<GoldVault {...props} gold={720} />);
    show();
    expect(started.filter((a) => a.target.closest(".ingot-pour"))).toHaveLength(0);
    rerender(<GoldVault {...props} gold={800} />);
    expect(started.filter((a) => a.target.closest(".ingot-pour"))).toHaveLength(0);
    expect(onLanded).toHaveBeenCalledWith(800);
    expect(screen.getByTestId("vault-line")).toHaveTextContent("200 gold to go");
    expect(document.querySelector(".ingot-pour")).toHaveAttribute("data-ingot-state", "done");
  });
  it("[PD-10] reduced motion: unlocking shows the lifted end state with no ring pulse", () => {
    const props = { shop: SHOP, title: "t", gold: 1_000, size: 1_000, seenKey: "t-rm-unlock" };
    const { rerender } = render(<GoldVault {...props} />);
    document.documentElement.classList.add("rm");
    started = [];
    rerender(<GoldVault {...props} unlocked />);
    expect(started.filter((a) => a.target.classList.contains("m-vring"))).toHaveLength(0);
    // Motion on, the same unlock pulses the ring.
    document.documentElement.classList.remove("rm");
    rerender(<GoldVault {...props} />);
    rerender(<GoldVault {...props} unlocked />);
    expect(started.filter((a) => a.target.classList.contains("m-vring"))).toHaveLength(1);
  });
});

describe("[PD-10] Reward unlocked", () => {
  it("[PD-10] the card: photo, heading, what and where, and the redeem slot", () => {
    render(
      <RewardUnlocked detail="Free coffee & cake · Brew & Bloom Café" imageUrl={null}>
        <button type="button">Redeem</button>
      </RewardUnlocked>,
    );
    expect(screen.getByRole("heading", { name: "Your reward is ready" })).toBeVisible();
    expect(screen.getByText("Free coffee & cake · Brew & Bloom Café")).toBeVisible();
    expect(screen.getByRole("button", { name: "Redeem" })).toBeVisible();
    // Without `celebrate` (shown at load) nothing moves, falls or speaks.
    expect(started).toHaveLength(0);
    expect(fx.burst).not.toHaveBeenCalled();
    expect(fx.toast).not.toHaveBeenCalled();
  });

  it("[PD-10] celebrate: the card flips in (700 ms after 350 ms), 70 leaves fall, the toast says so", () => {
    render(
      <RewardUnlocked
        detail="d"
        imageUrl={null}
        celebrate
        toastText="Reward unlocked: free coffee & cake"
      />,
    );
    const flip = started.find((a) => a.target.getAttribute("data-testid") === "reward-card");
    expect(flip?.options).toMatchObject({ duration: 700, delay: 350 });
    expect(JSON.stringify(flip?.keyframes)).toContain("rotateX(80deg)");
    expect(fx.burst).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ type: "leaf", count: 70 }),
    );
    expect(fx.toast).toHaveBeenCalledWith("Reward unlocked: free coffee & cake");
  });

  it("[PD-10] reduced motion: the card fades in at once, no flip", () => {
    document.documentElement.classList.add("rm");
    render(<RewardUnlocked detail="d" imageUrl={null} celebrate />);
    const fade = started.find((a) => a.target.getAttribute("data-testid") === "reward-card");
    expect(fade?.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(fade?.options.delay).toBe(0);
  });
});

describe("[PD-10] Redeem code", () => {
  const T0 = Date.UTC(2026, 10, 24, 12, 0, 0);

  it("[PD-10] the digits, named for screen readers, flip in one by one; the ring starts at 15:00", () => {
    vi.useFakeTimers({ now: T0 });
    render(<RedeemCode code="481927" expiresAt={T0 + VAULT.redeem.validMs} serverNow={T0} />);
    expect(screen.getByRole("img", { name: "Redeem code 4 8 1 9 2 7" })).toBeVisible();
    expect(screen.getByRole("timer", { name: "Code expires in 15:00" })).toBeVisible();
    const flips = started.filter((a) => a.target.tagName === "SPAN");
    expect(flips).toHaveLength(6);
    expect(flips.map((a) => a.options.delay)).toEqual([0, 60, 120, 180, 240, 300]);
    expect(JSON.stringify(flips[0]?.keyframes)).toContain("rotateX(-90deg)");
  });

  it("[PD-10] counts down on the server's clock: a phone an hour fast still shows the full 15 minutes", () => {
    vi.useFakeTimers({ now: T0 + 3_600_000 });
    render(<RedeemCode code="481927" expiresAt={T0 + VAULT.redeem.validMs} serverNow={T0} />);
    expect(screen.getByRole("timer")).toHaveAccessibleName("Code expires in 15:00");
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByRole("timer")).toHaveAccessibleName("Code expires in 13:59");
  });

  it("[PD-10] the clock is read when the response arrived (receivedAt), not at mount: 5 minutes later shows 10:00", () => {
    vi.useFakeTimers({ now: T0 + 3_600_000 + 300_000 }); // a phone an hour fast, mounted 5 min after receipt
    render(
      <RedeemCode
        code="481927"
        expiresAt={T0 + VAULT.redeem.validMs}
        serverNow={T0}
        receivedAt={T0 + 3_600_000}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(VAULT.redeem.tickMs);
    });
    expect(screen.getByRole("timer")).toHaveAccessibleName("Code expires in 9:59");
  });

  it("[PD-10] the first render reads only its props (the same on server and client): no clock in it", () => {
    vi.useFakeTimers({ now: T0 + 999_999_999 });
    const html = renderToStaticMarkup(
      <RedeemCode code="481927" expiresAt={T0 + VAULT.redeem.validMs} serverNow={T0} />,
    );
    expect(html).toContain("15:00");
  });

  it("[PD-10] at zero: the expired state, onExpire once, the ticking stops", () => {
    vi.useFakeTimers({ now: T0 });
    const onExpire = vi.fn();
    render(<RedeemCode code="481927" expiresAt={T0 + 2_000} serverNow={T0} onExpire={onExpire} />);
    expect(screen.getByRole("timer")).toHaveAccessibleName("Code expires in 0:02");
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByTestId("redeem-code")).toHaveAttribute("data-expired", "");
    expect(screen.getByRole("timer")).toHaveAccessibleName("Code expired");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("[PD-10] a code already expired when it arrives shows expired at once", () => {
    vi.useFakeTimers({ now: T0 });
    const onExpire = vi.fn();
    render(<RedeemCode code="481927" expiresAt={T0 - 1} serverNow={T0} onExpire={onExpire} />);
    expect(screen.getByTestId("redeem-code")).toHaveAttribute("data-expired", "");
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("[PD-10] reduced motion: the digits appear without flipping", () => {
    document.documentElement.classList.add("rm");
    vi.useFakeTimers({ now: T0 });
    render(<RedeemCode code="481927" expiresAt={T0 + VAULT.redeem.validMs} serverNow={T0} />);
    const flips = started.filter((a) => a.target.tagName === "SPAN");
    expect(
      flips.every((a) => JSON.stringify(a.keyframes) === '[{"opacity":0},{"opacity":1}]'),
    ).toBe(true);
    expect(flips.every((a) => a.options.delay === 0)).toBe(true);
  });
});
