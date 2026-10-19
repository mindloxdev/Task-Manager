import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { AcceptInviteForm } from "@/app/invite/[token]/accept-form";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/services/settings";

export const metadata: Metadata = { title: "Accept your invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invitee, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { inviteToken: token },
      select: {
        email: true,
        name: true,
        jobTitle: true,
        status: true,
        role: true,
        memberships: { select: { team: { select: { name: true } } } },
      },
    }),
    getSettings(),
  ]);

  const valid = invitee !== null && invitee.status === "INVITED";

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-fg">
            {settings.companyName.slice(0, 2).toUpperCase()}
          </span>
          <span className="text-sm font-bold text-fg">{settings.companyName}</span>
        </div>

        {!valid ? (
          <div className="card p-5">
            <h1 className="text-base font-bold text-fg">This invitation is no longer valid</h1>
            <p className="mt-2 text-sm text-fg-muted">
              It may have been used already, or withdrawn. Ask your administrator to send a new one.
            </p>
            <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
              Go to sign in
            </Link>
          </div>
        ) : (
          <div className="card p-5">
            <h1 className="text-base font-bold text-fg">Set up your account</h1>
            <p className="mt-1 text-sm text-fg-muted">
              You were invited as <strong className="font-semibold text-fg">{invitee.email}</strong>
              {invitee.memberships.length > 0
                ? ` and added to ${invitee.memberships.map((m) => m.team.name).join(", ")}.`
                : "."}
            </p>

            <AcceptInviteForm token={token} defaultName={invitee.name} />

            <p className="mt-4 flex items-start gap-1.5 text-[11px] text-fg-subtle">
              <ShieldCheck className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              Your password is hashed before it is stored and is never readable by anyone, including your administrator.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
