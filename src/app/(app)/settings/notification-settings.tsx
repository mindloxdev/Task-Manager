"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateNotificationPreferencesAction } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormActions, TextInput } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

type Preferences = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  notifyAssignment: boolean;
  notifyProgress: boolean;
  notifyBlocker: boolean;
  notifyReview: boolean;
  notifyDeadline: boolean;
  notifyComments: boolean;
  reminderOffsets: string;
};

const TOPICS: { key: keyof Preferences; label: string; description: string }[] = [
  {
    key: "notifyAssignment",
    label: "Assignments",
    description: "Assigned, reprioritised or cancelled.",
  },
  {
    key: "notifyProgress",
    label: "Progress",
    description: "Acknowledgements, starts and progress reports.",
  },
  { key: "notifyBlocker", label: "Blockers", description: "Someone is blocked." },
  {
    key: "notifyReview",
    label: "Reviews",
    description: "Submitted, approved or sent back.",
  },
  {
    key: "notifyDeadline",
    label: "Deadlines",
    description: "Changes, approaching dates, overdue and extensions.",
  },
  { key: "notifyComments", label: "Comments", description: "Comments on your tasks." },
];

export function NotificationSettingsForm({
  preferences,
  emailConfigured,
}: {
  preferences: Preferences;
  emailConfigured: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Preferences>(preferences);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    startTransition(async () => {
      const result = await updateNotificationPreferencesAction(values);
      if (result.ok) {
        toast({ tone: "success", title: "Notification preferences saved" });
        router.refresh();
      } else {
        setFieldErrors(result.fieldErrors ?? { reminderOffsets: [result.error] });
        toast({ tone: "error", title: "Could not save", description: result.error });
      }
    });
  };

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <Checkbox
        label="In-app notifications"
        description="Stops all new notifications. Your dashboard still shows everything."
        checked={values.inAppEnabled}
        onChange={(event) => set("inAppEnabled", event.target.checked)}
      />

      <Checkbox
        label="Also send me email"
        description={emailConfigured ? "For the topics switched on below." : "No mail provider configured yet."}
        checked={values.emailEnabled}
        disabled={!emailConfigured && !values.emailEnabled}
        onChange={(event) => set("emailEnabled", event.target.checked)}
      />

      <fieldset disabled={!values.inAppEnabled} className="space-y-2 disabled:opacity-60">
        <legend className="mb-1.5 text-xs font-semibold text-fg">Topics</legend>
        {TOPICS.map((topic) => (
          <Checkbox
            key={topic.key}
            label={topic.label}
            description={topic.description}
            checked={values[topic.key] as boolean}
            onChange={(event) => set(topic.key, event.target.checked as Preferences[typeof topic.key])}
          />
        ))}
      </fieldset>

      <Field
        label="Deadline reminders"
        htmlFor="reminder-offsets"
        hint="Hours before the deadline, comma separated."
        error={fieldErrors.reminderOffsets}
      >
        <TextInput
          id="reminder-offsets"
          value={values.reminderOffsets}
          onChange={(event) => set("reminderOffsets", event.target.value)}
          placeholder="48,24,2"
          className="max-w-xs font-mono"
          invalid={Boolean(fieldErrors.reminderOffsets)}
        />
      </Field>

      <p className="text-[11px] text-fg-subtle">Only the tightest window fires, once per deadline.</p>

      <FormActions>
        <Button type="submit" variant="primary" loading={pending}>
          Save preferences
        </Button>
      </FormActions>
    </form>
  );
}
