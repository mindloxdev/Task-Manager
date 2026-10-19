/** Company settings, stored as key/value rows so new options need no migration. */
import { z } from "zod";

import { prisma } from "@/server/db";
import type { SessionUser } from "@/server/auth";
import { forbidden } from "@/server/errors";
import { canConfigureSettings } from "@/server/permissions";
import { recordAudit } from "@/server/services/activity";
import { isEmailConfigured } from "@/server/email";
import type { settingsSchema } from "@/lib/validation";

export type SettingsInput = z.infer<typeof settingsSchema>;

export const SETTING_DEFAULTS = {
  companyName: "MindLox",
  defaultReviewRequired: "true",
  defaultUpdateCadence: "ON_STATUS_CHANGE",
  reminderOffsets: "48,24,2",
  taskCodePrefix: "CAD",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSettings(): Promise<Record<SettingKey, string> & { emailConfigured: boolean }> {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.keys(SETTING_DEFAULTS) } } });
  const values = { ...SETTING_DEFAULTS } as Record<SettingKey, string>;
  for (const row of rows) {
    if (row.key in values) values[row.key as SettingKey] = row.value;
  }
  return { ...values, emailConfigured: isEmailConfigured() };
}

export async function updateSettings(actor: SessionUser, input: SettingsInput) {
  if (!canConfigureSettings(actor)) throw forbidden("Only the company owner can change settings.");

  const before = await getSettings();
  const entries: [SettingKey, string][] = [];
  if (input.companyName !== undefined) entries.push(["companyName", input.companyName]);
  if (input.defaultReviewRequired !== undefined) {
    entries.push(["defaultReviewRequired", String(input.defaultReviewRequired)]);
  }
  if (input.defaultUpdateCadence !== undefined) entries.push(["defaultUpdateCadence", input.defaultUpdateCadence]);
  if (input.reminderOffsets !== undefined) entries.push(["reminderOffsets", input.reminderOffsets]);
  if (input.taskCodePrefix !== undefined) entries.push(["taskCodePrefix", input.taskCodePrefix]);

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }),
    ),
  );

  await recordAudit({
    actorId: actor.id,
    action: "SETTINGS_UPDATED",
    entityType: "Setting",
    entityId: "company",
    before: Object.fromEntries(entries.map(([key]) => [key, before[key]])),
    after: Object.fromEntries(entries),
  });

  return getSettings();
}
