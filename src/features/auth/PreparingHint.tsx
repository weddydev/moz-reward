/**
 * C-06 (P0-13): before hydration the sign-in button is disabled (a press must never be lost, P0-14 C-20); on a
 * slow connection that can last seconds, so say why. Gone once the page is interactive. Without JavaScript the
 * form can't work at all, so `<noscript>` says so plainly.
 */
export function PreparingHint({
  id,
  hydrated,
}: {
  id: string;
  hydrated: boolean;
}): React.JSX.Element | null {
  if (hydrated) return null;
  return (
    <>
      <p id={id} role="status" className="text-ink-2 text-sm">
        Getting the page ready. The button switches on in a moment.
      </p>
      <noscript>
        <p className="text-sm font-semibold">
          Signing in needs JavaScript. Please turn it on and reload.
        </p>
      </noscript>
    </>
  );
}
