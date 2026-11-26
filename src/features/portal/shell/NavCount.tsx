/**
 * A count on a nav item (P1-12 "dashboard badge", code review M3: the owner's requests awaiting approval). The
 * Molten bell's pill (`.m-bell i`: ember, pearl ring), with obsidian figures for AA contrast (DECISIONS 26 Nov).
 * The figures are hidden from assistive tech; a visually hidden suffix adds the count to the link's name
 * ("Requests (2 awaiting you)"), so the visible label stays part of it.
 */
export function NavCount({ n }: { n: number | undefined }): React.JSX.Element | null {
  if (!n || n <= 0) return null;
  return (
    <>
      <i className="m-nav-count" aria-hidden="true" data-testid="nav-count">
        {n > 99 ? "99+" : n}
      </i>
      <span className="sr-only">({n.toLocaleString("en-GB")} awaiting you)</span>
    </>
  );
}
