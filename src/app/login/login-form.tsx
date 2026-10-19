"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, LogIn } from "lucide-react";

import { loginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/form";
import { USER_ROLE_LABEL, type UserRole } from "@/lib/enums";

type DemoAccount = { email: string; name: string; role: string; jobTitle: string | null };

export function LoginForm({ nextPath, demoAccounts }: { nextPath: string; demoAccounts: DemoAccount[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await loginAction({ email, password });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      // `next` comes from the URL, so only same-site paths are followed.
      const destination = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard";
      router.push(destination);
      router.refresh();
    });
  };

  return (
    <>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-overdue/40 bg-overdue-bg p-3" role="alert">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-overdue" aria-hidden="true" />
            <p className="text-xs font-medium text-overdue">{error}</p>
          </div>
        ) : null}

        <Field label="Work email" htmlFor="email" required error={fieldErrors.email}>
          <TextInput
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            invalid={Boolean(fieldErrors.email)}
            placeholder="you@company.com"
          />
        </Field>

        <Field label="Password" htmlFor="password" required error={fieldErrors.password}>
          <div className="relative">
            <TextInput
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              invalid={Boolean(fieldErrors.password)}
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            </button>
          </div>
        </Field>

        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
          {!pending ? <LogIn className="size-4" aria-hidden="true" /> : null}
          Sign in
        </Button>
      </form>

      {demoAccounts.length > 0 ? (
        <div className="mt-8 rounded-lg border border-border bg-surface p-3">
          <p className="text-xs font-semibold text-fg">Development accounts</p>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            Password: <code className="font-mono">cadence2026</code>
          </p>
          <ul className="mt-2 space-y-1">
            {demoAccounts.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword("cadence2026");
                    setError(null);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-medium text-fg">{account.name}</span>
                    <span className="block truncate text-[10px] text-fg-subtle">{account.email}</span>
                  </span>
                  <span className="chip bg-surface-2 text-fg-muted">
                    {USER_ROLE_LABEL[account.role as UserRole] ?? account.role}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
