import {
  BarChart3,
  Bell,
  CalendarDays,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Settings,
  SquareCheckBig,
  Users,
  UsersRound,
} from "lucide-react";

import type { UserRole } from "@/lib/enums";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: UserRole[];
  /** Nav group heading this item sits under. */
  group: "work" | "organisation" | "insight";
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "work" },
  { href: "/tasks", label: "All tasks", icon: SquareCheckBig, group: "work" },
  { href: "/my-tasks", label: "My tasks", icon: ListChecks, group: "work" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, group: "work" },
  { href: "/teams", label: "Teams", icon: UsersRound, group: "organisation" },
  { href: "/employees", label: "People", icon: Users, group: "organisation" },
  { href: "/projects", label: "Projects", icon: FolderKanban, group: "organisation" },
  { href: "/reports", label: "Reports", icon: BarChart3, group: "insight", roles: ["OWNER", "MANAGER"] },
  { href: "/notifications", label: "Notifications", icon: Bell, group: "insight" },
  { href: "/settings", label: "Settings", icon: Settings, group: "insight" },
];

export const NAV_GROUP_LABEL: Record<NavItem["group"], string> = {
  work: "Work",
  organisation: "Organisation",
  insight: "Insight",
};

export function navItemsFor(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
