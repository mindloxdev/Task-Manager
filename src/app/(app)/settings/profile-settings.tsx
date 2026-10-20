"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";

import { changePasswordAction } from "@/app/actions/auth";
import { updateProfileAction } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { ErrorSummary, Field, FormActions, Select, TextInput } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Istanbul",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Australia/Sydney",
  "America/Sao_Paulo",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];

const COLORS = ["#0F766E", "#0E7490", "#1D4ED8", "#4338CA", "#7E22CE", "#BE185D", "#B91C1C", "#C2410C", "#A16207", "#15803D"];

export function ProfileSettingsForm({
  profile,
}: {
  profile: {
    id: string;
    name: string;
    jobTitle: string | null;
    timezone: string;
    weeklyHours: number;
    avatarColor: string;
    email: string;
  };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(profile.name);
  const [jobTitle, setJobTitle] = useState(profile.jobTitle ?? "");
  const [timezone, setTimezone] = useState(profile.timezone);
  const [weeklyHours, setWeeklyHours] = useState(String(profile.weeklyHours));
  const [avatarColor, setAvatarColor] = useState(profile.avatarColor);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string[]>>({});

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    startTransition(async () => {
      const result = await updateProfileAction(profile.id, { name, jobTitle, timezone, weeklyHours, avatarColor });
      if (result.ok) {
        toast({ tone: "success", title: "Profile saved" });
        router.refresh();
      } else {
        setFieldErrors(result.fieldErrors ?? { _form: [result.error] });
        toast({ tone: "error", title: "Could not save", description: result.error });
      }
    });
  };

  const changePassword = () => {
    setPasswordErrors({});
    if (newPassword !== confirmPassword) {
      setPasswordErrors({ confirmPassword: ["The two passwords do not match."] });
      return;
    }
    startTransition(async () => {
      const result = await changePasswordAction({ currentPassword, newPassword });
      if (result.ok) {
        toast({
          tone: "success",
          title: "Password changed",
          description: "Any other devices you were signed in on have been signed out.",
        });
        setPasswordOpen(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPasswordErrors(result.fieldErrors ?? { currentPassword: [result.error] });
        toast({ tone: "error", title: "Could not change your password", description: result.error });
      }
    });
  };

  return (
    <>
      <form onSubmit={save} className="space-y-4" noValidate>
        <ErrorSummary errors={fieldErrors} />

        <div className="flex items-center gap-3">
          <Avatar name={name || profile.name} color={avatarColor} size="lg" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">{profile.email}</p>
            <p className="text-xs text-fg-subtle">Your email address is set by the company owner.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div id="field-name">
            <Field label="Name" htmlFor="profile-name" required error={fieldErrors.name}>
              <TextInput
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                invalid={Boolean(fieldErrors.name)}
              />
            </Field>
          </div>
          <Field label="Job title" htmlFor="profile-title" error={fieldErrors.jobTitle}>
            <TextInput id="profile-title" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Time zone"
            htmlFor="profile-timezone"
            required
            hint="Deadlines are shown in this zone."
          >
            <Select id="profile-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Contracted hours a week"
            htmlFor="profile-hours"
            hint={undefined}
            error={fieldErrors.weeklyHours}
          >
            <TextInput
              id="profile-hours"
              type="number"
              min={1}
              max={80}
              value={weeklyHours}
              onChange={(event) => setWeeklyHours(event.target.value)}
            />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-fg">Avatar colour</legend>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setAvatarColor(color)}
                aria-label={`Use colour ${color}`}
                aria-pressed={avatarColor === color}
                className={cn(
                  "size-8 rounded-full border-2 transition-transform",
                  avatarColor === color ? "scale-110 border-fg" : "border-transparent",
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </fieldset>

        <FormActions>
          <Button type="button" variant="secondary" onClick={() => setPasswordOpen(true)}>
            <KeyRound className="size-3.5" aria-hidden="true" />
            Change password
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            Save profile
          </Button>
        </FormActions>
      </form>

      <Modal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Change your password"
        description="Signs out your other sessions."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPasswordOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={changePassword}
              loading={pending}
              disabled={!currentPassword || newPassword.length < 6}
            >
              Change password
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Current password" htmlFor="current-password" required error={passwordErrors.currentPassword}>
            <TextInput
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              invalid={Boolean(passwordErrors.currentPassword)}
            />
          </Field>
          <Field
            label="New password"
            htmlFor="new-password"
            required
            hint="6+ characters, with a letter and a number."
            error={passwordErrors.newPassword}
          >
            <TextInput
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              invalid={Boolean(passwordErrors.newPassword)}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm-password" required error={passwordErrors.confirmPassword}>
            <TextInput
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              invalid={Boolean(passwordErrors.confirmPassword)}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
