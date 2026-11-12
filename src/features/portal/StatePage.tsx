import { Compass, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { buttonClasses, Icon } from "@/components/ui";
import { PORTAL_ROOT, type Portal, routeByPath } from "./routes";

/**
 * A whole-page state (P0-12): the 403 page, a not-found page. One icon, one heading, one line, one way on.
 * `as="main"` when it stands alone (it is then the skip link's target); inside a portal shell the shell's
 * `<main>` already wraps it.
 */
export function StatePage({
  as: Tag = "div",
  page,
  icon,
  title,
  message,
  action,
}: {
  as?: "main" | "div";
  /** `data-page` value, for tests and analytics. */
  page: string;
  icon: LucideIcon;
  title: string;
  message: string;
  action: { href: string; label: string };
}): React.JSX.Element {
  return (
    <Tag
      {...(Tag === "main" ? { id: "main" } : {})}
      data-page={page}
      className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-5 py-16 text-center"
    >
      <span className="bg-surface-2 text-gold-700 grid size-16 place-items-center rounded-full">
        <Icon icon={icon} size={32} />
      </span>
      <h1 className="text-h1">{title}</h1>
      <p className="text-body text-ink-2">{message}</p>
      <Link href={action.href} className={buttonClasses({ className: "mt-2" })}>
        {action.label}
      </Link>
    </Tag>
  );
}

export const NOT_FOUND_TITLE = "We can't find that page";
export const NOT_FOUND_MESSAGE = "The link may be old, or the page may have moved.";

/** Not-found inside a portal shell: the way on is the portal's first page. */
export function PortalNotFound({ portal }: { portal: Portal }): React.JSX.Element {
  const root = PORTAL_ROOT[portal];
  return (
    <StatePage
      page="not-found"
      icon={Compass}
      title={NOT_FOUND_TITLE}
      message={NOT_FOUND_MESSAGE}
      action={{ href: root, label: `Back to ${routeByPath(root)?.label ?? "the start"}` }}
    />
  );
}
