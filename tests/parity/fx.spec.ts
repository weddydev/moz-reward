import { expect, type Page, test } from "@playwright/test";
import { fire, openForMotion, referenceUrl, TRIGGERS } from "./support/motion";
import { capture } from "./support/reference";
import { PARITY_PARTS } from "../../src/features/dev/molten/parity-parts";

/**
 * FX parity (C-92, C-93; P1-C close): the particle bursts a part throws (sparks, coins) are what the reference
 * throws for the same interaction: same type, count, speed range, angle and spread, from the same point of the
 * part (± 2 px), at the same moment. Frames and curves can't see them (the FX canvas is outside every part), so
 * a burst could go missing unnoticed (the button's coins did). Both pages record every burst: the reference by
 * wrapping its `fx.burst`, the app through the FX engine's own log (`window.__mozFxBursts`, dev pages only).
 * Under reduced motion both still decide the same bursts and the app throws no particle.
 */
const VP = { width: 390, height: 844 };
const PX = 2;
/** Long enough for the latest burst a trigger schedules (the liquid choice's sparks at 520 ms). */
const AFTER_MS = 1_200;

type Burst = {
  dx: number;
  dy: number;
  type: string;
  count: number;
  speed: readonly number[];
  angle: number;
  spread: number;
};

async function record(page: Page, isReference: boolean): Promise<void> {
  await page.evaluate((ref) => {
    const w = window as unknown as { __bursts: unknown[]; __mozFxBursts?: { clear: () => void } };
    w.__bursts = [];
    if (!ref) {
      w.__mozFxBursts?.clear();
      return;
    }
    // The reference's private engine, handed out by the copy's FX probe (`withFxProbe`); wrapped once.
    type RefFx = { burst: (x: number, y: number, o?: object) => void; wrapped?: true };
    const fx = (window as unknown as { __refFx: RefFx }).__refFx;
    if (fx.wrapped) return;
    const original = fx.burst.bind(fx);
    fx.burst = (x, y, o = {}) => {
      const opt = o as Record<string, unknown>;
      w.__bursts.push({
        x,
        y,
        type: opt.type ?? "spark",
        count: opt.count ?? 20,
        speed: opt.speed ?? [150, 420],
        angle: opt.angle ?? -Math.PI / 2,
        spread: opt.spread ?? Math.PI * 2,
      });
      original(x, y, o);
    };
    fx.wrapped = true;
  }, isReference);
}

/** How far outside its part a burst may start and still count as the part's (the scan coin rises above the dock). */
const NEAR_PX = 48;

/**
 * The bursts since `record` that start on the part (± NEAR_PX), relative to its box (left, top). Bursts elsewhere
 * on the page in the same window (the intro's Gilded Gate igniting) are not the part's.
 */
async function bursts(page: Page, part: string, isReference: boolean): Promise<Burst[]> {
  return page.evaluate(
    ({ name, ref, margin }) => {
      const w = window as unknown as {
        __bursts: Array<Record<string, unknown>>;
        __mozFxBursts?: { list: () => Array<Record<string, unknown>> };
      };
      const box = document.querySelector(`[data-parity="${name}"]`)?.getBoundingClientRect();
      const all = ref ? w.__bursts : (w.__mozFxBursts?.list() ?? []);
      const near = (b: Record<string, unknown>): boolean =>
        box !== undefined &&
        (b.x as number) >= box.left - margin &&
        (b.x as number) <= box.right + margin &&
        (b.y as number) >= box.top - margin &&
        (b.y as number) <= box.bottom + margin;
      return all.filter(near).map((b) => ({
        dx: Math.round(((b.x as number) - (box?.left ?? 0)) * 10) / 10,
        dy: Math.round(((b.y as number) - (box?.top ?? 0)) * 10) / 10,
        type: b.type as string,
        count: b.count as number,
        speed: b.speed as number[],
        angle: b.angle as number,
        spread: b.spread as number,
      }));
    },
    { name: part, ref: isReference, margin: NEAR_PX },
  );
}

/** Fires the part's trigger (or a click on `target` inside it) and lets the page's own timers run. */
async function act(page: Page, part: string, target?: string): Promise<void> {
  if (target) {
    await page.evaluate(
      ({ name, sel }) => {
        const el = document.querySelector(`[data-parity="${name}"]`)?.querySelector(sel);
        if (!el) throw new Error(`no ${sel} in ${name}`);
        const r = el.getBoundingClientRect();
        const at = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
        el.dispatchEvent(new MouseEvent("click", at));
      },
      { name: part, sel: target },
    );
  } else {
    await fire(page, part);
  }
  await page.clock.runFor(AFTER_MS);
}

/**
 * Deliberate differences of origin, each a DECISIONS line. The slider's notch spark: the reference reads the
 * thumb's rect before it re-renders, so on a jump its sparks fly from where the coin was; the app sparks at the
 * notch crossed (DECISIONS "PD-06 slider"). Type, count, speed, angle and spread must still match.
 */
const ORIGIN_DIFFERS: Readonly<Record<string, string>> = {
  slider: "sparks at the notch crossed, not at the coin's pre-move position (DECISIONS PD-06)",
};

function expectSame(app: Burst[], ref: Burst[], what: string, part: string): void {
  const shape = (l: Burst[]) => l.map(({ dx: _x, dy: _y, ...rest }) => rest);
  expect(shape(app), `${what}: the same bursts, in order`).toEqual(shape(ref));
  if (Object.hasOwn(ORIGIN_DIFFERS, part)) return;
  ref.forEach((r, i) => {
    const a = app[i];
    if (!a) return;
    expect(Math.abs(a.dx - r.dx), `${what}: burst ${String(i)} x`).toBeLessThanOrEqual(PX);
    expect(Math.abs(a.dy - r.dy), `${what}: burst ${String(i)} y`).toBeLessThanOrEqual(PX);
  });
}

/** Extra interactions beyond the trigger: the liquid choice pours back the other way (C-93, every direction). */
const AGAIN: Record<string, string> = { "liquid-choice": '[role="radio"]:nth-of-type(1)' };

const PARTS = PARITY_PARTS.filter(
  (p) => p.status === "required" && p.name in TRIGGERS && !TRIGGERS[p.name]?.waitFor,
);

test.describe("[PD-01] FX parity (C-92, C-93)", () => {
  test("[PD-01] the molten button throws the reference's 28 sparks and 6 coins from the press point", async ({
    page,
    context,
  }) => {
    const ref = await context.newPage();
    await openForMotion(ref, referenceUrl, VP.width, VP.height);
    await openForMotion(page, "/dev/molten", VP.width, VP.height);
    for (const [p, isRef] of [
      [ref, true],
      [page, false],
    ] as const) {
      await capture(p, "molten-button");
      await record(p, isRef);
      await act(p, "molten-button");
    }
    const r = await bursts(ref, "molten-button", true);
    expect(r.map((b) => [b.type, b.count])).toEqual([
      ["spark", 28],
      ["coin", 6],
    ]);
    expectSame(await bursts(page, "molten-button", false), r, "molten-button", "molten-button");
  });

  for (const part of PARTS) {
    test(`[${part.task}] ${part.title}: the same bursts as the reference`, async ({
      page,
      context,
    }) => {
      const ref = await context.newPage();
      await openForMotion(ref, referenceUrl, VP.width, VP.height);
      await openForMotion(page, "/dev/molten", VP.width, VP.height);
      const steps = [undefined, AGAIN[part.name]].filter((s, i) => i === 0 || s !== undefined);
      for (const step of steps) {
        const what = `${part.name}${step ? ` then ${step}` : ""}`;
        for (const [p, isRef] of [
          [ref, true],
          [page, false],
        ] as const) {
          if (!step) await capture(p, part.name);
          await record(p, isRef);
          await act(p, part.name, step);
        }
        expectSame(
          await bursts(page, part.name, false),
          await bursts(ref, part.name, true),
          what,
          part.name,
        );
      }
    });
  }

  test("[PD-01] reduced motion: the same bursts are decided, and the app throws no particle", async ({
    page,
    context,
  }) => {
    const ref = await context.newPage();
    for (const p of [ref, page]) await p.emulateMedia({ reducedMotion: "reduce" });
    await openForMotion(ref, referenceUrl, VP.width, VP.height);
    await openForMotion(page, "/dev/molten", VP.width, VP.height);
    for (const [p, isRef] of [
      [ref, true],
      [page, false],
    ] as const) {
      await capture(p, "molten-button");
      await record(p, isRef);
      await act(p, "molten-button");
    }
    const app = await bursts(page, "molten-button", false);
    expectSame(
      app,
      await bursts(ref, "molten-button", true),
      "molten-button (reduced)",
      "molten-button",
    );
    const added = await page.evaluate(
      () =>
        (
          window as unknown as { __mozFxBursts?: { list: () => Array<{ added: number }> } }
        ).__mozFxBursts
          ?.list()
          .reduce((n, b) => n + b.added, 0) ?? -1,
    );
    expect(added).toBe(0);
  });
});
