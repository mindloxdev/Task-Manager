"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateSettingsAction } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Checkbox, ErrorSummary, Field, FormActions, Select, TextInput } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { UPDATE_CADENCES, UPDATE_CADENCE_LABEL, type UpdateCadence } from "@/lib/enums";

export function CompanySettingsForm({
  settings,
}: {
  settings: {
    companyName: string;
    defaultReviewRequired: boolean;
    defaultUpdateCadence: UpdateCadence;
    reminderOffsets: string;
    taskCodePrefix: string;
  };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(settings);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    startTransition(async () => {
      const result = await updateSettingsAction(values);
      if (result.ok) {
        toast({ tone: "success", title: "Company settings saved" });
        router.refresh();
      } else {
        setFieldErrors(result.fieldErrors ?? { _form: [result.error] });
        toast({ tone: "error", title: "Could not save", description: result.error });
      }
    });
  };

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <ErrorSummary errors={fieldErrors} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div id="field-companyName">
          <Field label="Company name" htmlFor="company-name" required error={fieldErrors.companyName}>
            <TextInput
              id="company-name"
              value={values.companyName}
              onChange={(event) => setValues({ ...values, companyName: event.target.value })}
              invalid={Boolean(fieldErrors.companyName)}
            />
          </Field>
        </div>
        <div id="field-taskCodePrefix">
          <Field
            label="Task code prefix"
            htmlFor="code-prefix"
            hint="Letters only. Existing codes keep their prefix."
            error={fieldErrors.taskCodePrefix}
          >
            <TextInput
              id="code-prefix"
              value={values.taskCodePrefix}
              onChange={(event) =>
                setValues({ ...values, taskCodePrefix: event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) })
              }
              className="font-mono"
              invalid={Boolean(fieldErrors.taskCodePrefix)}
            />
          </Field>
        </div>
      </div>

      <Checkbox
        label="New tasks require review by default"
        description="Can be switched off per task."
        checked={values.defaultReviewRequired}
        onChange={(event) => setValues({ ...values, defaultReviewRequired: event.target.checked })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Default update expectation" htmlFor="default-cadence">
          <Select
            id="default-cadence"
            value={values.defaultUpdateCadence}
            onChange={(event) => setValues({ ...values, defaultUpdateCadence: event.target.value as UpdateCadence })}
          >
            {UPDATE_CADENCES.map((cadence) => (
              <option key={cadence} value={cadence}>
                {UPDATE_CADENCE_LABEL[cadence]}
              </option>
            ))}
          </Select>
        </Field>
        <div id="field-reminderOffsets">
          <Field
            label="Company deadline reminders"
            htmlFor="company-offsets"
            hint="Hours before the deadline."
            error={fieldErrors.reminderOffsets}
          >
            <TextInput
              id="company-offsets"
              value={values.reminderOffsets}
              onChange={(event) => setValues({ ...values, reminderOffsets: event.target.value })}
              placeholder="48,24,2"
              className="font-mono"
              invalid={Boolean(fieldErrors.reminderOffsets)}
            />
          </Field>
        </div>
      </div>

      <FormActions>
        <Button type="submit" variant="primary" loading={pending}>
          Save company settings
        </Button>
      </FormActions>
    </form>
  );
}
