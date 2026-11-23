/**
 * The dock's own icons (PD-07), ported path for path from the Molten reference's dock (`#dock` svgs) so the dock
 * matches it exactly. Stroke, size and caps come from `.m-dk svg` / `.m-scan svg` in molten.css. Icons the
 * reference doesn't draw (shop and admin items) stay Lucide (`navIcon`), styled by the same rules.
 */
type Props = { className?: string };

const svg = (paths: React.ReactNode) =>
  function DockIcon({ className }: Props): React.JSX.Element {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
        {paths}
      </svg>
    );
  };

export const DockWallet = svg(
  <>
    <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
    <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
  </>,
);

export const DockOffers = svg(
  <>
    <path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z" />
    <circle cx="7.5" cy="7.5" r="1" />
  </>,
);

export const DockScan = svg(
  <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />,
);

export const DockMarket = svg(<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6" />);

export const DockMe = svg(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
);

/** Route-table icon names (`routes.ts`) the reference draws itself. */
export const DOCK_ICONS: Readonly<Record<string, (p: Props) => React.JSX.Element>> = {
  Wallet: DockWallet,
  Tag: DockOffers,
  ScanLine: DockScan,
  Store: DockMarket,
  CircleUser: DockMe,
};
