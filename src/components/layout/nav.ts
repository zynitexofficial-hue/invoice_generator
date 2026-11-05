import {
  FilePlus,
  House,
  LayoutTemplate,
  Package,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Additional path prefixes that should mark this item active. */
  match?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: House },
  { href: "/invoice", label: "Editor", icon: FilePlus },
  { href: "/history", label: "History", icon: ScrollText },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/items", label: "Items", icon: Package },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, item: NavItem) {
  return (
    pathname === item.href ||
    pathname.startsWith(`${item.href}/`) ||
    (item.match ?? []).some((m) => pathname.startsWith(m))
  );
}

export const APP_NAME = "Invoice Studio";
