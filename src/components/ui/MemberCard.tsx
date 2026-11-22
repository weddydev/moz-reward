"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { cx } from "@/lib/cx";
import { reducedMotionNow } from "@/lib/motion/anim";
import {
  cardGlare,
  cardPointer,
  cardTilt,
  holoShift,
  isIOSDevice,
  MEMBER_CARD,
  memberCardMotion,
  qrPlaceholderCells,
} from "@/lib/motion/controls";
import { useHydrated } from "@/lib/use-hydrated";
import { frauncesItalic } from "@/styles/fonts-italic";

type Env = { ios: boolean; fine: boolean };

/** What this device allows, read once in the browser (reference: `fine` is read once at load). */
function readEnv(): Env {
  return {
    ios: isIOSDevice(navigator),
    fine: window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  };
}

/**
 * Molten member card (PD-06; DESIGN §6, §6.3, §7.4; reference `.mwrap`, `.mcard`, `.mface`, `.holo`, `.glare`,
 * `.m-*`, `.qr` + "member card"). A gold-rimmed card in 3D: the holographic foil and the glare follow the pointer,
 * the card leans towards it (±11° / ±13°, tracking in .12 s) and springs back upright (.7 s) when it leaves; a
 * tap, Enter or Space turns it over (.7 s spring) to the QR side. On touch-only screens it sways gently while
 * untouched (7 s). Reduced motion: nothing follows or sways (the flip still turns, in .12 s). iOS: no tilt and no
 * sway (DESIGN §6: motion there needs a permission the card never asks for); the foil still follows the finger.
 *
 * Frame budget: pointer moves are coalesced to one write per animation frame; the writes are CSS variables that
 * only feed transforms (the card's rotation; the foil and the glare are layers moved by `translate`/`scale`, not
 * repainted gradients), and those layers are promoted only while the pointer is on the card. Never blocks
 * anything: the card is a button (`role="button"`, Enter and Space); it says it is disabled until hydrated, when
 * it can't act yet (C-20). `role="button"` on a div like the reference, not a `<button>`: a button may only hold
 * phrasing content, and the card holds two block faces.
 *
 * The back shows `back` (P1-14: the real QR code); until then a labelled, decorative placeholder (the reference's
 * pattern; not a code). `parity` marks the card for the parity harness.
 */
export function MemberCard({
  name,
  memberId,
  tier,
  since,
  backText,
  brand = "Moz Rewards",
  back,
  frontLabel = `Member card: ${name}, ${memberId}. Press to show QR code`,
  backLabel = "Member card showing QR code. Press to turn back",
  onFlip,
  parity,
  className,
}: {
  name: string;
  /** The member ID printed on the card (tabular figures). */
  memberId: string;
  /** The badge top right, e.g. "Gold member". */
  tier: string;
  /** The line bottom right, e.g. "since Nov 2026". */
  since: string;
  /** The line under the QR code. */
  backText: string;
  brand?: string;
  /** The back's code; omitted: the labelled placeholder. */
  back?: ReactNode;
  /** The button's name while the front shows. */
  frontLabel?: string;
  /** The button's name while the back shows. */
  backLabel?: string;
  /** Called after each turn with the new side (true: the back shows). */
  onFlip?: (flipped: boolean) => void;
  parity?: string;
  className?: string;
}): React.JSX.Element {
  const hydrated = useHydrated();
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState<"rest" | "live" | "idle">("rest");
  const card = useRef<HTMLDivElement>(null);
  const glare = useRef<HTMLSpanElement>(null);
  const env = useRef<Env>({ ios: false, fine: true });
  const pending = useRef<{ px: number; py: number } | null>(null);
  const frame = useRef(0);
  const flippedNow = useRef(false);

  useEffect(() => {
    env.current = readEnv();
    if (memberCardMotion({ reduced: reducedMotionNow(), ...env.current }).sway) setMode("idle");
    return () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, []);

  const motion = (): ReturnType<typeof memberCardMotion> =>
    memberCardMotion({ reduced: reducedMotionNow(), ...env.current });

  const apply = (): void => {
    frame.current = 0;
    const el = card.current;
    const at = pending.current;
    pending.current = null;
    if (!el || !at) return;
    const m = motion();
    if (!m.follow) return;
    const set = (k: string, v: string): void => {
      el.style.setProperty(k, v);
    };
    if (m.tilt) {
      const { rx, ry } = cardTilt(at.px, at.py);
      set("--rx", `${rx.toFixed(2)}deg`);
      set("--ry", `${ry.toFixed(2)}deg`);
    }
    const h = holoShift(at.px, at.py);
    set("--holo-x", `${(h.x * 100).toFixed(3)}%`);
    set("--holo-y", `${(h.y * 100).toFixed(3)}%`);
    const face = glare.current;
    if (face) {
      const g = cardGlare(at.px, at.py, face.offsetWidth, face.offsetHeight, flippedNow.current);
      set("--glare-x", `${g.x.toFixed(1)}px`);
      set("--glare-y", `${g.y.toFixed(1)}px`);
      set("--glare-size", `${g.size.toFixed(1)}px`);
      set("--glare-scale", g.scale.toFixed(4));
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (!motion().follow) return;
    setMode("live");
    pending.current = cardPointer(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
    if (!frame.current) frame.current = requestAnimationFrame(apply);
  };

  const onPointerLeave = (e: PointerEvent<HTMLDivElement>): void => {
    // A move still waiting for its frame must not tilt the card after the pointer has gone.
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    pending.current = null;
    e.currentTarget.style.setProperty("--rx", "0deg");
    e.currentTarget.style.setProperty("--ry", "0deg");
    setMode(motion().sway && !flippedNow.current ? "idle" : "rest");
  };

  const flip = (): void => {
    const next = !flippedNow.current;
    flippedNow.current = next;
    setFlipped(next);
    setMode("rest");
    onFlip?.(next);
  };

  // The reference's keys: Enter and Space turn it (Space without scrolling the page); a held key turns it once.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (!e.repeat) flip();
  };

  return (
    <div className={cx("m-mwrap", className)}>
      <div
        ref={card}
        role="button"
        tabIndex={0}
        className={cx("m-mcard", mode === "live" && "live", mode === "idle" && "idle")}
        data-parity={parity}
        data-face={flipped ? "back" : "front"}
        aria-label={flipped ? backLabel : frontLabel}
        aria-disabled={hydrated ? undefined : true}
        style={{ "--flip": flipped ? "180deg" : "0deg" } as CSSProperties}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={flip}
        onKeyDown={onKeyDown}
      >
        <span className="m-mface">
          <span className="m-holo" />
          <span ref={glare} className="m-glare" />
          <span className="m-mc-top">
            <span className={cx("m-mc-brand", frauncesItalic.variable)}>{brand}</span>
            <span className="m-mc-tier">{tier}</span>
          </span>
          <span className="m-mc-chip" />
          <span className="m-mc-bot">
            <span>
              <span className="m-mc-name">{name}</span>
              <span className="m-mc-id">{memberId}</span>
            </span>
            <span className="m-mc-since">{since}</span>
          </span>
        </span>
        <span className="m-mface m-back">
          <span className="m-holo" />
          <span className="m-mc-qr">{back ?? <QrPlaceholder />}</span>
          <span className="m-mc-note">{backText}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * The card back's stand-in until P1-14 draws the member's real code: the reference's decorative pattern (25 × 25
 * cells, seed 42, three finder squares) in ink, pixel-sharp. Labelled as a placeholder; scanning it does nothing.
 */
function QrPlaceholder(): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    g.clearRect(0, 0, c.width, c.height);
    // Ink from the token (`.m-mc-qr canvas { color: var(--ink) }`).
    g.fillStyle = getComputedStyle(c).color;
    qrPlaceholderCells().forEach((row, y) => {
      row.forEach((on, x) => {
        if (on) g.fillRect(x, y, 1, 1);
      });
    });
  }, []);
  return (
    <canvas
      ref={canvas}
      width={MEMBER_CARD.qrCells}
      height={MEMBER_CARD.qrCells}
      role="img"
      aria-label="QR code placeholder"
      data-placeholder=""
    />
  );
}
