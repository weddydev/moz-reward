import { Suspense } from "react";
import { GUARD_MODES, type GuardMode } from "@/features/dev/guard-modes";
import { GuardCheck } from "@/features/dev/GuardCheck";

async function GuardCheckForMode({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  const safe: GuardMode = GUARD_MODES.find((m) => m === mode) ?? "ok";
  return <GuardCheck mode={safe} />;
}

/** /dev/guard-check?mode=… — self-test target for the Playwright console/network guard. */
export default function GuardCheckPage({
  searchParams,
}: PageProps<"/dev/guard-check">): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <GuardCheckForMode searchParams={searchParams} />
    </Suspense>
  );
}
