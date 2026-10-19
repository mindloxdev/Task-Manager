"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { acceptInviteAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/form";

export function AcceptInviteForm({ token, defaultName }: { token: string; defaultName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(defaultName);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (password !== confirm) {
      setFieldErrors({ confirm: ["The two passwords do not match."] });
      return;
    }

    startTransition(async () => {
      const result = await acceptInviteAction({ token, name, password });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-overdue/40 bg-overdue-bg p-3" role="alert">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-overdue" aria-hidden="true" />
          <p className="text-xs font-medium text-overdue">{error}</p>
        </div>
      ) : null}

      <Field label="Your name" htmlFor="name" required error={fieldErrors.name}>
        <TextInput
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          required
          invalid={Boolean(fieldErrors.name)}
        />
      </Field>

      <Field
        label="Choose a password"
        htmlFor="password"
        required
        hint="At least 10 characters, including a letter and a number."
        error={fieldErrors.password}
      >
        <TextInput
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
          invalid={Boolean(fieldErrors.password)}
        />
      </Field>

      <Field label="Confirm password" htmlFor="confirm" required error={fieldErrors.confirm}>
        <TextInput
          id="confirm"
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          required
          invalid={Boolean(fieldErrors.confirm)}
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
        Create my account
      </Button>
    </form>
  );
}
