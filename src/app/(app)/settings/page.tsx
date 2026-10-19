import type { Metadata } from "next";
import { History, Mail, ServerCog } from "lucide-react";

import { CompanySettingsForm } from "@/app/(app)/settings/company-settings";
import { ProfileSettingsForm } from "@/app/(app)/settings/profile-settings";
import { NotificationSettingsForm } from "@/app/(app)/settings/notification-settings";
import { RunSweepButton } from "@/app/(app)/settings/run-sweep";
import { Card, CardHeader, EmptyState, KeyValue, Method, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { canConfigureSettings, canViewAudit } from "@/server/permissions";
import { getPreferences } from "@/server/services/notifications";
import { getSettings } from "@/server/services/settings";
import { getLastSweep } from "@/server/services/reminders";
import { listAuditLog } from "@/server/services/users";
import type { UpdateCadence } from "@/lib/enums";
import { formatDateTime, formatRelative } from "@/lib/dates";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();

  const [settings, preferences, profile, lastSweep, audit] = await Promise.all([
    getSettings(),
    getPreferences(user.id),
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { id: true, name: true, jobTitle: true, timezone: true, weeklyHours: true, avatarColor: true, email: true },
    }),
    getLastSweep(),
    canViewAudit(user) ? listAuditLog(user, 40) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" description={undefined} />

      <div className="space-y-4">
        <Card>
          <CardHeader title="Your profile" description={undefined} />
          <div className="p-4">
            <ProfileSettingsForm profile={profile} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="What you are notified about"
            description={undefined}
          />
          <div className="p-4">
            <NotificationSettingsForm
              preferences={{
                inAppEnabled: preferences.inAppEnabled,
                emailEnabled: preferences.emailEnabled,
                notifyAssignment: preferences.notifyAssignment,
                notifyProgress: preferences.notifyProgress,
                notifyBlocker: preferences.notifyBlocker,
                notifyReview: preferences.notifyReview,
                notifyDeadline: preferences.notifyDeadline,
                notifyComments: preferences.notifyComments,
                reminderOffsets: preferences.reminderOffsets,
              }}
              emailConfigured={settings.emailConfigured}
            />
          </div>
        </Card>

        {canConfigureSettings(user) ? (
          <>
            <Card>
              <CardHeader title="Company settings" description={undefined} />
              <div className="p-4">
                <CompanySettingsForm
                  settings={{
                    companyName: settings.companyName,
                    defaultReviewRequired: settings.defaultReviewRequired === "true",
                    defaultUpdateCadence: settings.defaultUpdateCadence as UpdateCadence,
                    reminderOffsets: settings.reminderOffsets,
                    taskCodePrefix: settings.taskCodePrefix,
                  }}
                />
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Scheduled reminders"
                description="Deadline reminders, overdue notices and update nudges."
              />
              <div className="space-y-3 p-4">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <KeyValue label="Last run">
                    {lastSweep ? `${formatDateTime(lastSweep, user.timezone)} (${formatRelative(lastSweep)})` : "Never"}
                  </KeyValue>
                  <KeyValue label="Endpoint">
                    <code className="font-mono text-xs">POST /api/cron/reminders</code>
                  </KeyValue>
                </dl>
                <RunSweepButton />
                <Method>
                  <ServerCog className="mr-1 inline size-3" aria-hidden="true" />
                  Call it hourly with <code className="font-mono">CRON_SECRET</code> as a bearer token. Running it
                  twice never notifies anyone twice.
                </Method>
              </div>
            </Card>

            <Card>
              <CardHeader title="Email delivery" description={undefined} />
              <div className="p-4">
                {settings.emailConfigured ? (
                  <p className="flex items-start gap-2 rounded-md border border-track/40 bg-track-bg p-3 text-xs text-fg-muted">
                    <Mail className="mt-0.5 size-3.5 shrink-0 text-track" aria-hidden="true" />
                    A mail provider is configured. People who enable email will receive it.
                  </p>
                ) : (
                  <p className="flex items-start gap-2 rounded-md border border-border bg-surface-2 p-3 text-xs text-fg-muted">
                    <Mail className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                    No mail provider configured, so <strong className="font-semibold text-fg">no email is sent</strong>.
                    In-app notifications still work. Set <code className="font-mono">EMAIL_PROVIDER</code>,{" "}
                    <code className="font-mono">EMAIL_API_KEY</code> and <code className="font-mono">EMAIL_FROM</code> to
                    enable it.
                  </p>
                )}
              </div>
            </Card>
          </>
        ) : null}

        {canViewAudit(user) ? (
          <Card>
            <CardHeader
              title="Audit history"
              description={undefined}
            />
            {audit.length === 0 ? (
              <EmptyState compact icon={<History className="size-5" aria-hidden="true" />} title="Nothing audited yet" />
            ) : (
              <div className="scroll-x">
                <table className="w-full border-collapse text-left">
                  <caption className="sr-only">Audit history of sensitive actions</caption>
                  <thead>
                    <tr className="border-b border-border">
                      {["When", "Who", "Action", "Record", "Detail"].map((column) => (
                        <th
                          key={column}
                          scope="col"
                          className="whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-fg-subtle"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((entry) => (
                      <tr key={entry.id} className="row-hover border-b border-border last:border-0 hover:bg-surface-2">
                        <td className="whitespace-nowrap px-3 py-2 text-[11px] text-fg-muted">
                          {formatDateTime(entry.createdAt, user.timezone)}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-fg">{entry.actor?.name ?? "System"}</td>
                        <td className="px-3 py-2">
                          <span className="chip bg-surface-2 text-fg-muted">{entry.action.toLowerCase().replace(/_/g, " ")}</span>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-fg-muted">
                          {entry.entityType}
                          <span className="tnum ml-1 font-mono text-[10px] text-fg-subtle">
                            {entry.entityId.slice(0, 8)}
                          </span>
                        </td>
                        <td className="max-w-[22rem] px-3 py-2">
                          <p className="truncate text-[10px] text-fg-subtle" title={entry.after ?? entry.before ?? ""}>
                            {entry.after ?? entry.before ?? "—"}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
