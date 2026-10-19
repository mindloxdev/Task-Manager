import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { getCurrentUser } from "@/server/auth";
import { countUnread } from "@/server/services/notifications";
import { getSettings } from "@/server/services/settings";
import { isOwner } from "@/server/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The middleware already rejected missing or malformed cookies; this is the
  // authoritative check, because only here can the database confirm the account
  // is still active and read its current role.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [unread, settings] = await Promise.all([countUnread(user.id), getSettings()]);

  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        jobTitle: user.jobTitle,
        avatarColor: user.avatarColor,
        teams: user.teams,
      }}
      companyName={settings.companyName}
      unreadCount={unread}
      canAssign={isOwner(user) || user.ledTeamIds.length > 0}
    >
      {children}
    </AppShell>
  );
}
