"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/server/auth";
import { fail, ok, type ActionResult } from "@/server/respond";
import {
  changeRoleSchema,
  createProjectSchema,
  createTeamSchema,
  inviteUserSchema,
  membershipSchema,
  notificationPreferenceSchema,
  settingsSchema,
  updateTeamSchema,
  updateUserSchema,
} from "@/lib/validation";
import {
  addMember,
  archiveProject,
  archiveTeam,
  createProject,
  createTeam,
  removeMember,
  restoreTeam,
  setMemberRole,
  updateTeam,
} from "@/server/services/teams";
import { changeRole, deactivateUser, inviteUser, reactivateUser, updateProfile } from "@/server/services/users";
import { markAllRead, markRead, markUnread, updatePreferences } from "@/server/services/notifications";
import { updateSettings } from "@/server/services/settings";

function revalidateOrgViews(): void {
  revalidatePath("/dashboard");
  revalidatePath("/teams");
  revalidatePath("/employees");
  revalidatePath("/projects");
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

// --- teams -----------------------------------------------------------------

export async function createTeamAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireUser();
    const team = await createTeam(actor, createTeamSchema.parse(input));
    revalidateOrgViews();
    return ok({ id: team.id });
  } catch (error) {
    return fail(error);
  }
}

export async function updateTeamAction(teamId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await updateTeam(actor, teamId, updateTeamSchema.parse(input));
    revalidateOrgViews();
    revalidatePath(`/teams/${teamId}`);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function archiveTeamAction(teamId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await archiveTeam(actor, teamId);
    revalidateOrgViews();
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function restoreTeamAction(teamId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await restoreTeam(actor, teamId);
    revalidateOrgViews();
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function addMemberAction(teamId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await addMember(actor, teamId, membershipSchema.parse(input));
    revalidateOrgViews();
    revalidatePath(`/teams/${teamId}`);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function setMemberRoleAction(
  teamId: string,
  userId: string,
  role: "LEAD" | "MEMBER",
): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await setMemberRole(actor, teamId, userId, role);
    revalidateOrgViews();
    revalidatePath(`/teams/${teamId}`);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function removeMemberAction(teamId: string, userId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await removeMember(actor, teamId, userId);
    revalidateOrgViews();
    revalidatePath(`/teams/${teamId}`);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

// --- projects --------------------------------------------------------------

export async function createProjectAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireUser();
    const project = await createProject(actor, createProjectSchema.parse(input));
    revalidateOrgViews();
    return ok({ id: project.id });
  } catch (error) {
    return fail(error);
  }
}

export async function archiveProjectAction(projectId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await archiveProject(actor, projectId);
    revalidateOrgViews();
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

// --- people ----------------------------------------------------------------

export async function inviteUserAction(
  input: unknown,
): Promise<ActionResult<{ inviteUrl: string; email: string; emailSent: boolean }>> {
  try {
    const actor = await requireUser();
    const result = await inviteUser(actor, inviteUserSchema.parse(input));
    revalidateOrgViews();
    // No mail provider is configured by default, so the owner shares the link.
    return ok({ inviteUrl: result.inviteUrl, email: result.user.email, emailSent: false });
  } catch (error) {
    return fail(error);
  }
}

export async function updateProfileAction(userId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await updateProfile(actor, userId, updateUserSchema.parse(input));
    revalidateOrgViews();
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function changeRoleAction(userId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await changeRole(actor, userId, changeRoleSchema.parse(input));
    revalidateOrgViews();
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function deactivateUserAction(userId: string): Promise<ActionResult<{ openTasks: number }>> {
  try {
    const actor = await requireUser();
    const result = await deactivateUser(actor, userId);
    revalidateOrgViews();
    return ok({ openTasks: result.openTasks });
  } catch (error) {
    return fail(error);
  }
}

export async function reactivateUserAction(userId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await reactivateUser(actor, userId);
    revalidateOrgViews();
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

// --- notifications & settings ---------------------------------------------

export async function markNotificationReadAction(notificationId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await markRead(actor.id, notificationId);
    revalidatePath("/notifications");
    revalidatePath("/", "layout");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function markNotificationUnreadAction(notificationId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await markUnread(actor.id, notificationId);
    revalidatePath("/notifications");
    revalidatePath("/", "layout");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<{ count: number }>> {
  try {
    const actor = await requireUser();
    const count = await markAllRead(actor.id);
    revalidatePath("/notifications");
    revalidatePath("/", "layout");
    return ok({ count });
  } catch (error) {
    return fail(error);
  }
}

export async function updateNotificationPreferencesAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await updatePreferences(actor.id, notificationPreferenceSchema.parse(input));
    revalidatePath("/settings");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function updateSettingsAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await updateSettings(actor, settingsSchema.parse(input));
    revalidateOrgViews();
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}
