import { SearchX } from "lucide-react";
import { StatePage } from "@/features/portal/StatePage";

/** Unknown or impossible shop code (P1-02): a designed 404, reached without a database hit for bad formats. */
export default function ShopNotFound(): React.JSX.Element {
  return (
    <StatePage
      as="main"
      page="shop-not-found"
      icon={SearchX}
      title="We can't find that shop"
      message="Check the code on the shop's QR sign and try again."
      action={{ href: "/scan", label: "Enter a shop code" }}
    />
  );
}
