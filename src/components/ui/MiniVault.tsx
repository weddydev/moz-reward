/**
 * The shop page's compact Gold Vault line (PD-08; reference `.mini-vault`): "Gold Vault" and the gold towards
 * the reward ("720 / 1,000") over a metal bar. The bar is a `scaleX` of the full width (composite-only), so the
 * gold wipe can fill it from 0 (`data-wipe-bar`). The full vault with the pour is PD-10.
 */
export function MiniVault({
  gold,
  target,
  label = "Gold Vault",
}: {
  gold: number;
  target: number;
  label?: string;
}): React.JSX.Element {
  const share = target > 0 ? Math.min(1, Math.max(0, gold / target)) : 0;
  const text = `${gold.toLocaleString("en-GB")} / ${target.toLocaleString("en-GB")}`;
  return (
    <div className="m-mini-vault" data-testid="mini-vault">
      <p className="m-mv-top">
        <span>{label}</span>
        <b>{text}</b>
      </p>
      <span
        className="m-mv-bar"
        role="progressbar"
        aria-label={`${label}: ${text} gold`}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(gold, target)}
      >
        <i data-wipe-bar="" style={{ transform: `scaleX(${String(share)})` }} />
      </span>
    </div>
  );
}
