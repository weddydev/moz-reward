import {
  Activity,
  Bell,
  ChartLine,
  CircleUser,
  CreditCard,
  FileCheck,
  Gem,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  type LucideIcon,
  Megaphone,
  MessageSquare,
  QrCode,
  ScanLine,
  ScrollText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Store,
  Tag,
  TriangleAlert,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";

/**
 * The route table names its icons as strings (it is shared with server code and tests); this is the one
 * place they become components, imported per icon so the bundle holds only these. A unit test keeps the
 * map and the table in step.
 */
export const NAV_ICONS: Readonly<Record<string, LucideIcon>> = {
  Activity,
  Bell,
  ChartLine,
  CircleUser,
  CreditCard,
  FileCheck,
  Gem,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  MessageSquare,
  QrCode,
  ScanLine,
  ScrollText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Store,
  Tag,
  TriangleAlert,
  UserCog,
  Users,
  Wallet,
};

/** The icon for a route-table name. A unit test makes the fallback unreachable for table rows. */
export function navIcon(name: string): LucideIcon {
  return NAV_ICONS[name] ?? LayoutDashboard;
}
