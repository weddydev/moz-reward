import { Lock } from "lucide-react";
import { defaultPortalPath } from "@/features/portal/routes";
import { StatePage } from "@/features/portal/StatePage";
import { currentPrincipal } from "@/server/authz/principal";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "No access" };

/** The signed-in user's own portal; the public home page if that can't be worked out. */
async function homePath(): Promise<string> {
  try {
    const p = await currentPrincipal();
    return p ? defaultPortalPath(p) : "/";
  } catch {
    return "/";
  }
}

/**
 * The 403 page (P0-12): what `forbidden()` renders, with no portal shell or nav. It never says which role
 * the page needs or whether the page exists for someone else; the one way on is the user's own portal.
 */
export default async function Forbidden(): Promise<React.JSX.Element> {
  return (
    <StatePage
      as="main"
      page="forbidden"
      icon={Lock}
      title="You don't have access to this page"
      message="If you think you should, ask the person who manages your account."
      action={{ href: await homePath(), label: "Go to my home page" }}
    />
  );
}
