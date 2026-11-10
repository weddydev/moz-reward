import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { SystemView } from "@/features/admin/system/SystemView";
import { systemView } from "@/features/admin/system/view-model";
import { getSession } from "@/server/auth/session";
import { requireAdminRole } from "@/server/authz";
import { isAppError } from "@/server/errors";
import { healthSnapshotSchema } from "@/server/ops/health-rules";
import { readOpsSnapshot } from "@/server/repos/ops";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "System" };
export const dynamic = "force-dynamic";

const RETURN_TO = "/admin/system";

function Shell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8">
      <h1 className="text-h1">System</h1>
      {children}
    </main>
  );
}

/**
 * Admin System page (P0-13, ARCHITECTURE §11): the health monitor's latest snapshot. Admin owner only (DECISIONS
 * P0-13), with two-step verification; the database shows the snapshot to that role alone (RLS). The admin shell
 * and navigation arrive with P0-12.
 */
export default async function SystemPage(): Promise<React.JSX.Element> {
  // Checked before anything streams: a signed-out visitor gets a real 307.
  const session = await getSession();
  if (!session) redirect(`/staff/sign-in?returnTo=${encodeURIComponent(RETURN_TO)}`);
  let scope: Awaited<ReturnType<typeof requireAdminRole>>;
  try {
    scope = await requireAdminRole(["owner"]);
  } catch (err) {
    if (!isAppError(err)) throw err;
    if (err.code === "MFA_REQUIRED") redirect("/staff/security");
    if (err.code === "UNAUTHENTICATED")
      redirect(`/staff/sign-in?returnTo=${encodeURIComponent(RETURN_TO)}`);
    return (
      <Shell>
        <Card className="p-4">
          <p className="text-body">
            You don&apos;t have access to this page. It is for the admin owner.
          </p>
        </Card>
      </Shell>
    );
  }
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
