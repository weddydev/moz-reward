"use client";

import { useMemo, useSyncExternalStore } from "react";
import { cx } from "@/lib/cx";
import {
  BODY,
  type ColourRef,
  colourLabel,
  CONTRAST_PAIRS,
  type ContrastResult,
  contrastResults,
} from "@/styles/contrast";
import { TOKEN_GROUPS, type TokenKind } from "@/styles/tokens";
import { Section } from "./Section";

const NAMES = TOKEN_GROUPS.flatMap((g) => g.tokens.map((t) => t.name));
const SEPARATOR = "\u0001";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

/** The reduced-motion choice retunes the duration tokens, so the values are read again when it changes. */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-reduce-motion"],
  });
  const media = window.matchMedia(REDUCED_QUERY);
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

/** One string, so the snapshot is equal by value while nothing changed. */
function readTokens(): string {
  const style = getComputedStyle(document.documentElement);
  return NAMES.map((name) => style.getPropertyValue(`--${name}`).replace(/\s+/g, " ").trim()).join(
    SEPARATOR,
  );
}

/**
 * The value of every token as the browser computes it from tokens.css (never repeated in code). Null on the
 * server and until hydration: the page then shows the names, uses and samples, and the values fill in.
 */
function useTokenValues(): ReadonlyMap<string, string> | null {
  const raw = useSyncExternalStore(subscribe, readTokens, () => null);
  return useMemo(
    () => (raw === null ? null : new Map(raw.split(SEPARATOR).map((v, i) => [NAMES[i] ?? "", v]))),
    [raw],
  );
}

const SAMPLED: ReadonlySet<TokenKind> = new Set([
  "colour",
  "gradient",
  "space",
  "radius",
  "shadow",
]);

function Sample({ kind, name }: { kind: TokenKind; name: string }): React.JSX.Element | null {
  const value = `var(--${name})`;
  switch (kind) {
    case "colour":
    case "gradient":
      return (
        <span
          className="border-line block size-10 rounded-sm border"
          style={{ background: value }}
        />
      );
    case "space":
      return <span className="bg-gold-500 block h-3 rounded-sm" style={{ width: value }} />;
    case "radius":
      return (
        <span
          className="border-ink-2 bg-surface-2 block size-10 border"
          style={{ borderRadius: value }}
        />
      );
    case "shadow":
      return <span className="bg-surface block size-10 rounded-sm" style={{ boxShadow: value }} />;
    case "duration":
    case "easing":
    case "number":
    case "size":
      return null;
  }
}

function Tokens({ values }: { values: ReadonlyMap<string, string> | null }): React.JSX.Element {
  return (
    <Section title="Tokens">
      <p className="text-small text-ink-2 max-w-prose">
        Every custom property in src/styles/tokens.css. The values are read from the page, so they
        follow the reduced-motion setting.
      </p>
      {TOKEN_GROUPS.map((group) => {
        const sampled = SAMPLED.has(group.kind);
        return (
          <div key={group.title} className="flex flex-col">
            <h3 className="text-h3 pt-2 pb-1">{group.title}</h3>
            <ul>
              {group.tokens.map((token) => (
                <li
                  key={token.name}
                  data-token={token.name}
                  className={cx(
                    "border-line grid items-center gap-x-4 gap-y-1 border-b py-2.5",
                    sampled
                      ? "grid-cols-[6rem_minmax(0,1fr)] lg:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1.2fr)]"
                      : "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]",
                  )}
                >
                  {sampled ? (
                    <span aria-hidden="true" className="row-span-2 lg:row-span-1">
                      <Sample kind={group.kind} name={token.name} />
                    </span>
                  ) : null}
                  <span className="flex min-w-0 flex-col">
                    <code className="text-small font-mono font-semibold [overflow-wrap:anywhere]">
                      --{token.name}
                    </code>
                    <span className="text-small text-ink-2">{token.use}</span>
                  </span>
                  <code
                    data-token-value=""
                    className={cx(
                      "text-caption text-ink-2 block min-h-[1lh] font-mono [overflow-wrap:anywhere]",
                      sampled && "col-start-2 lg:col-start-3",
                    )}
                  >
                    {values?.get(token.name) ?? ""}
                  </code>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </Section>
  );
}

const cssColour = (ref: ColourRef): string =>
  typeof ref === "string"
    ? `var(--${ref})`
    : `color-mix(in srgb, var(--${ref.mix[0]}) ${String(ref.mix[1])}%, var(--${ref.mix[2]}))`;

type Checked =
  { state: "pending" } | { state: "error" } | { state: "done"; rows: ContrastResult[] };

function check(values: ReadonlyMap<string, string> | null): Checked {
  if (!values) return { state: "pending" };
  try {
    return { state: "done", rows: contrastResults((token) => values.get(token) ?? "") };
  } catch {
    // A colour token that is not a 6-digit hex: the table says so instead of showing nothing.
    return { state: "error" };
  }
}

function Contrast({ values }: { values: ReadonlyMap<string, string> | null }): React.JSX.Element {
  const checked = useMemo(() => check(values), [values]);
  const failing = checked.state === "done" ? checked.rows.filter((r) => !r.pass).length : 0;
  return (
    <Section title="Contrast">
      <p className="text-small text-ink-2 max-w-prose">
        WCAG 2.2 AA: body text needs 4.5:1; large text and interface parts need 3:1.
      </p>
      <p
        className={cx(
          "text-small font-semibold",
          (failing > 0 || checked.state === "error") && "text-danger",
        )}
        data-testid="contrast-summary"
        role="status"
      >
        {checked.state === "pending"
          ? "Checking the colour pairs."
          : checked.state === "error"
            ? "The colour tokens could not be read."
            : `${String(checked.rows.length)} pairs checked, ${String(failing)} failing.`}
      </p>
      <div
        role="region"
        aria-label="Contrast table"
        tabIndex={0}
        className="border-line bg-surface overflow-x-auto rounded-md border"
      >
        <table className="text-small w-full min-w-[44rem] border-collapse">
          <caption className="sr-only">Contrast of every text and background pair</caption>
          <thead className="bg-surface-2">
            <tr>
              {["Sample", "Pair", "Used for", "Needs", "Ratio", "Result"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="text-ink-2 px-4 py-2.5 text-left font-semibold whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONTRAST_PAIRS.map((pair, i) => {
              const row = checked.state === "done" ? checked.rows[i] : undefined;
              return (
                <tr
                  key={`${colourLabel(pair.fg)}/${colourLabel(pair.bg)}/${pair.use}`}
                  data-contrast={row ? (row.pass ? "pass" : "fail") : "pending"}
                  className="border-line border-t"
                >
                  <td className="px-4 py-2">
                    <span
                      aria-hidden="true"
                      className="border-line text-h2 inline-block rounded-sm border px-2.5 font-bold"
                      style={{ color: cssColour(pair.fg), background: cssColour(pair.bg) }}
                    >
                      Aa
                    </span>
                  </td>
                  <th scope="row" className="px-4 py-2 text-left font-mono font-semibold">
                    {colourLabel(pair.fg)} on {colourLabel(pair.bg)}
                  </th>
                  <td className="text-ink-2 px-4 py-2">{pair.use}</td>
                  <td className="tabular px-4 py-2 whitespace-nowrap">
                    {pair.min === BODY ? "4.5:1 text" : "3:1 large, UI"}
                  </td>
                  <td className="tabular w-24 px-4 py-2 whitespace-nowrap" data-contrast-ratio="">
                    {row ? `${row.ratio.toFixed(2)}:1` : "…"}
                  </td>
                  <td
                    className={cx(
                      "w-20 px-4 py-2 font-semibold whitespace-nowrap",
                      row && (row.pass ? "text-success" : "text-danger"),
                    )}
                  >
                    {row ? (row.pass ? "Pass" : "Fail") : "…"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/** Token page and contrast table of /dev/ui (P0-08 AC 1, AC 2). */
export function TokenPage(): React.JSX.Element {
  const values = useTokenValues();
  return (
    <div data-testid="token-page">
      <Tokens values={values} />
      <Contrast values={values} />
    </div>
  );
}
