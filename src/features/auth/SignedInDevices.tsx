import "server-only";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { requireOwnAccount } from "@/server/authz";
import { listSignedInDevices } from "@/server/services/sessions";
import { DeviceList } from "./DeviceList";

/** Server part of the signed-in devices list: loads the caller's own sessions (no tokens or IPs). */
export async function SignedInDevices({
  signInPath,
}: {
  signInPath: string;
}): Promise<React.JSX.Element> {
  const { scope, sessionId } = await requireOwnAccount();
  const devices = await listSignedInDevices(scope, sessionId);
  return (
    <DeviceList
      signInPath={signInPath}
      devices={devices.map((d) => ({
        id: d.id,
        device: d.device,
        current: d.current,
        signedIn: formatDate(d.signedInAt),
        lastActive: formatDateTime(d.lastActiveAt),
      }))}
    />
  );
}
