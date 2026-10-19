"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Plus,
  Search,
  Sun,
  UserCircle2,
  X,
} from "lucide-react";

import { NAV_GROUP_LABEL, navItemsFor, type NavItem } from "@/components/shell/nav-items";
import { NotificationBell } from "@/components/shell/notification-bell";
import { Avatar } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { logoutAction } from "@/app/actions/auth";
import { USER_ROLE_LABEL, type UserRole } from "@/lib/enums";
import { cn } from "@/lib/utils";

export type ShellUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  jobTitle: string | null;
  avatarColor: string;
  teams: { teamId: string; teamName: string; role: string }[];
};

export function AppShell({
  user,
  companyName,
  unreadCount,
  canAssign,
  children,
}: {
  user: ShellUser;
  companyName: string;
  unreadCount: number;
  /** Whether this person can create tasks at all — owners and team leads. */
  canAssign: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = navItemsFor(user.role);

  // Any navigation closes the mobile drawer, so Back behaves predictably.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const groups: NavItem["group"][] = ["work", "organisation", "insight"];

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <Brand companyName={companyName} />
        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
          {groups.map((group) => {
            const groupItems = items.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group} className="mb-4">
                <p className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                  {NAV_GROUP_LABEL[group]}
                </p>
                <ul className="space-y-0.5">
                  {groupItems.map((item) => (
                    <li key={item.href}>
                      <NavLink item={item} pathname={pathname} badge={item.href === "/notifications" ? unreadCount : 0} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-border p-2">
          <UserMenu user={user} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fade absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div
            className="rise absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <div className="flex items-center justify-between border-b border-border pr-2">
              <Brand companyName={companyName} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-2 text-fg-subtle hover:bg-surface-2 hover:text-fg"
                aria-label="Close navigation"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
              {groups.map((group) => {
                const groupItems = items.filter((item) => item.group === group);
                if (groupItems.length === 0) return null;
                return (
                  <div key={group} className="mb-4">
                    <p className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                      {NAV_GROUP_LABEL[group]}
                    </p>
                    <ul className="space-y-0.5">
                      {groupItems.map((item) => (
                        <li key={item.href}>
                          <NavLink
                            item={item}
                            pathname={pathname}
                            badge={item.href === "/notifications" ? unreadCount : 0}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </nav>
            <div className="border-t border-border p-2">
              <UserMenu user={user} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur sm:px-4">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg lg:hidden"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>

          <QuickSearch />

          <div className="ml-auto flex items-center gap-1.5">
            {canAssign ? (
              <>
                <ButtonLink href="/tasks/new" variant="primary" size="sm" className="hidden sm:inline-flex">
                  <Plus className="size-3.5" aria-hidden="true" />
                  New task
                </ButtonLink>
                <ButtonLink href="/tasks/new" variant="primary" size="icon" className="sm:hidden">
                  <Plus className="size-4" aria-hidden="true" />
                  <span className="sr-only">New task</span>
                </ButtonLink>
              </>
            ) : null}
            <ThemeToggle />
            <NotificationBell initialUnread={unreadCount} />
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function Brand({ companyName }: { companyName: string }) {
  return (
    <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-fg">
        {companyName.slice(0, 2).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold leading-tight text-fg">{companyName}</span>
        <span className="block text-[10px] leading-tight text-fg-subtle">Task Manager</span>
      </span>
    </div>
  );
}

function NavLink({ item, pathname, badge }: { item: NavItem; pathname: string; badge: number }) {
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary-soft text-primary-soft-fg"
          : "text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {badge > 0 ? (
        <span className="tnum rounded-full bg-accent px-1.5 text-[10px] font-bold leading-4 text-accent-fg">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

function QuickSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  return (
    <form
      role="search"
      className="max-w-sm flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        const query = value.trim();
        router.push(query ? `/tasks?q=${encodeURIComponent(query)}` : "/tasks");
      }}
    >
      <label htmlFor="global-search" className="sr-only">
        Search tasks by title, description or code
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle"
          aria-hidden="true"
        />
        <input
          id="global-search"
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search tasks…"
          className="h-9 w-full rounded-md border border-border bg-bg pl-8 pr-3 text-sm text-fg transition-colors placeholder:text-fg-subtle hover:border-border-strong"
        />
      </div>
    </form>
  );
}

type ThemeChoice = "light" | "dark" | "system";

function ThemeToggle() {
  // Light is the product default; the stored value is the viewer's own choice.
  const [choice, setChoice] = useState<ThemeChoice>("light");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("cadence-theme");
      if (stored === "light" || stored === "dark" || stored === "system") setChoice(stored);
    } catch {
      // Storage can be unavailable; the default still applies.
    }
  }, []);

  const apply = (next: ThemeChoice) => {
    setChoice(next);
    setOpen(false);
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    try {
      // "system" is stored explicitly, so it is distinguishable from "never chose".
      localStorage.setItem("cadence-theme", next);
    } catch {
      // Without storage the choice simply does not persist across reloads.
    }
  };

  const Icon = choice === "dark" ? Moon : choice === "light" ? Sun : Monitor;
  const options: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "Match system", icon: Monitor },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="rounded-md p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        aria-label={`Colour theme: ${choice}. Change it`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Icon className="size-4" aria-hidden="true" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="rise absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
          >
            {options.map((option) => {
              const OptionIcon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={choice === option.value}
                  onClick={() => apply(option.value)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  <OptionIcon className="size-3.5" aria-hidden="true" />
                  <span className="flex-1">{option.label}</span>
                  {choice === option.value ? <Check className="size-3.5 text-primary" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-2"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Avatar name={user.name} color={user.avatarColor} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-fg">{user.name}</span>
          <span className="block truncate text-[10px] text-fg-subtle">
            {USER_ROLE_LABEL[user.role]}
            {user.jobTitle ? ` · ${user.jobTitle}` : ""}
          </span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="rise absolute bottom-full left-0 z-20 mb-1 w-full overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
          >
            <div className="border-b border-border px-3 py-2">
              <p className="truncate text-xs font-semibold text-fg">{user.name}</p>
              <p className="truncate text-[10px] text-fg-subtle">{user.email}</p>
            </div>
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <UserCircle2 className="size-3.5" aria-hidden="true" />
              Profile and preferences
            </Link>
            <button
              type="button"
              role="menuitem"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                await logoutAction();
                router.push("/login");
                router.refresh();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60"
            >
              <LogOut className="size-3.5" aria-hidden="true" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
