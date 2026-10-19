import type { Metadata } from "next";

import { LoginForm } from "@/app/login/login-form";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/services/settings";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const settings = await getSettings();

  // In development the seeded accounts are offered as one-click fills so the
  // roles are easy to compare. Never shown in production.
  const demoAccounts =
    process.env.NODE_ENV === "development"
      ? await prisma.user.findMany({
          where: { status: "ACTIVE", email: { endsWith: "@cadence.test" } },
          select: { email: true, name: true, role: true, jobTitle: true },
          orderBy: [{ role: "asc" }, { name: "asc" }],
          take: 6,
        })
      : [];

  return (
    <main className="flex min-h-dvh flex-col lg:flex-row">
      {/* Brand panel */}
      <section className="relative flex shrink-0 flex-col justify-between overflow-hidden bg-brand-panel px-6 py-8 text-brand-panel-fg lg:w-[44%] lg:px-10 lg:py-12">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-fg">
            {settings.companyName.slice(0, 2).toUpperCase()}
          </span>
          <span className="text-sm font-bold">{settings.companyName}</span>
        </div>

        <div className="my-8 max-w-md lg:my-0">
          <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            Know who is doing what, and whether it will land on time.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-brand-panel-muted">
            Assign work to a person, several people or a whole team — and see where it actually stands.
          </p>
          <ul className="mt-6 space-y-2.5 text-sm text-brand-panel-muted">
            {[
              "One task, however many people own it",
              "Progress reported by the people doing the work",
              "Deadlines, extensions and reviews in one place",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-panel-line" aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-brand-panel-muted">Internal use only. Sessions expire automatically.</p>
      </section>

      {/* Form panel */}
      <section className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <h2 className="text-lg font-bold text-fg">Sign in</h2>
          
          <LoginForm nextPath={next ?? "/dashboard"} demoAccounts={demoAccounts} />
        </div>
      </section>
    </main>
  );
}
