import { Card } from "@/components/ui";
import { SystemView } from "@/features/admin/system/SystemView";
import { systemView } from "@/features/admin/system/view-model";
import { healthSnapshotSchema } from "@/server/ops/health-rules";
import { gateAdminRoute } from "@/server/portal/gate";
import { readOpsSnapshot } from "@/server/repos/ops";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "System" };
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8">
      <h1 className="text-h1">System</h1>
      {children}
    </div>
  );
}

/**
 * Admin System page (P0-13, ARCHITECTURE §11): the health monitor's latest snapshot. Admin owner only (DECISIONS
 * P0-13), with two-step verification; the database shows the snapshot to that role alone (RLS). The shared
 * gate (P0-12) answers before anything streams: signed out → 307 to staff sign-in, no TOTP → enrolment,
 * any other admin role → the 403 page. The main landmark is the admin shell's.
 */
export default async function SystemPage(): Promise<React.JSX.Element> {
  const { scope } = await gateAdminRoute("/admin/system");
  const row = await readOpsSnapshot(scope);
  const parsed = row ? healthSnapshotSchema.safeParse(row.data) : null;
  return (
    <Shell>
      {parsed?.success ? (
        <SystemView view={systemView(parsed.data, new Date())} />
      ) : parsed ? (
        <Card className="p-4">
          <p className="text-body">
            The stored snapshot can&apos;t be read (written by an older worker?). The next one
            arrives within a minute: reload.
          </p>
        </Card>
      ) : (
        <Card className="p-4">
          <p className="text-body">
            No health snapshot yet. The worker writes one every minute: check that it is running
            (RUNBOOK “Worker down”).
          </p>
        </Card>
      )}
    </Shell>
  );
}
