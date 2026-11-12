import { Compass } from "lucide-react";
import { NOT_FOUND_MESSAGE, NOT_FOUND_TITLE, StatePage } from "@/features/portal/StatePage";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found" };

/** Any URL that matches no route, and `notFound()` outside the portals (P0-12, C-04): a real 404. */
export default function NotFound(): React.JSX.Element {
  return (
    <StatePage
      as="main"
      page="not-found"
      icon={Compass}
      title={NOT_FOUND_TITLE}
      message={NOT_FOUND_MESSAGE}
      action={{ href: "/", label: "Go to the home page" }}
    />
  );
}
