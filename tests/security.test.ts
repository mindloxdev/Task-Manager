/**
 * Security behaviour: sessions, password handling, rate limiting, and the
 * private attachment store.
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { authenticate, createSessionToken, readSessionToken } from "@/server/auth";
import { hashPassword, verifyPassword } from "@/server/password";
import { consume, enforce, resetRateLimits } from "@/server/rate-limit";
import {
  ALLOWED_UPLOAD_TYPES,
  deleteAttachment,
  listAttachments,
  readAttachment,
  safeFilename,
  uploadAttachment,
} from "@/server/services/attachments";
import { createTask } from "@/server/services/tasks";
import { acceptInvite, changePassword, deactivateUser, inviteUser } from "@/server/services/users";
import { seedCompany, session, taskInput, type Company } from "./helpers";

let co: Company;

beforeEach(async () => {
  co = await seedCompany();
  resetRateLimits();
});

afterAll(async () => {
  await rm(path.resolve(process.cwd(), "storage/test-attachments"), { recursive: true, force: true });
});

describe("password handling", () => {
  it("stores a salted hash, never the password", async () => {
    const hash = await hashPassword("a-good-password-1");
    expect(hash).not.toContain("a-good-password-1");
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("a-good-password-1", hash)).toBe(true);
    expect(await verifyPassword("wrong-password-1", hash)).toBe(false);
  });

  it("produces a different hash for the same password each time", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password-1"), hashPassword("same-password-1")]);
    expect(a).not.toBe(b);
  });

  it("never verifies against a missing hash", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
  });

  it("refuses a password that is too short or has no digit", async () => {
    const { passwordSchema } = await import("@/lib/validation");
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("alllettersonly").success).toBe(false);
    expect(passwordSchema.safeParse("goodenough1").success).toBe(true);
  });
});

describe("authentication", () => {
  async function makeSignedInUser(password = "correct-password-1") {
    const invite = await inviteUser(co.owner, {
      email: "login@test.local",
      name: "Logan Login",
      jobTitle: null,
      role: "EMPLOYEE",
      teamIds: [],
      weeklyHours: 40,
      timezone: "UTC",
    });
    return acceptInvite({ token: invite.inviteToken, name: "Logan Login", password });
  }

  it("accepts the right password and rejects the wrong one", async () => {
    await makeSignedInUser();
    expect(await authenticate("login@test.local", "correct-password-1")).not.toBeNull();
    expect(await authenticate("login@test.local", "wrong-password-1")).toBeNull();
  });

  it("gives the same answer for an unknown address as for a bad password", async () => {
    expect(await authenticate("nobody@test.local", "whatever-1")).toBeNull();
  });

  it("refuses an account that has not accepted its invitation", async () => {
    await inviteUser(co.owner, {
      email: "pending@test.local",
      name: "Pending Person",
      jobTitle: null,
      role: "EMPLOYEE",
      teamIds: [],
      weeklyHours: 40,
      timezone: "UTC",
    });
    expect(await authenticate("pending@test.local", "anything-1")).toBeNull();
  });

  it("refuses a deactivated account", async () => {
    const user = await makeSignedInUser();
    await deactivateUser(co.owner, user.id);
    expect(await authenticate("login@test.local", "correct-password-1")).toBeNull();
  });

  it("round-trips a signed session token and rejects a tampered one", async () => {
    const user = await makeSignedInUser();
    const token = await createSessionToken(user);

    const claims = await readSessionToken(token);
    expect(claims?.sub).toBe(user.id);
    expect(claims?.role).toBe("EMPLOYEE");
    expect(claims?.tv).toBe(user.tokenVersion);

    // Flipping any character invalidates the signature.
    const tampered = `${token.slice(0, -2)}${token.endsWith("aa") ? "bb" : "aa"}`;
    expect(await readSessionToken(tampered)).toBeNull();
    expect(await readSessionToken("not-a-token")).toBeNull();
  });

  it("invalidates issued tokens when the password changes", async () => {
    const user = await makeSignedInUser();
    const token = await createSessionToken(user);
    const before = await readSessionToken(token);

    await changePassword(await session(user.id), {
      currentPassword: "correct-password-1",
      newPassword: "a-new-password-2",
    });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    // The token still verifies cryptographically, but its version is now stale,
    // which is what getCurrentUser checks against the database.
    expect(before?.tv).toBe(user.tokenVersion);
    expect(after.tokenVersion).toBe(user.tokenVersion + 1);
    expect(after.tokenVersion).not.toBe(before?.tv);
  });

  it("invalidates issued tokens when a role changes or an account is deactivated", async () => {
    const user = await makeSignedInUser();
    const { changeRole } = await import("@/server/services/users");

    await changeRole(co.owner, user.id, { role: "MANAGER" });
    const promoted = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(promoted.tokenVersion).toBeGreaterThan(user.tokenVersion);

    await deactivateUser(co.owner, user.id);
    const removed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(removed.tokenVersion).toBeGreaterThan(promoted.tokenVersion);
  });

  it("rejects the wrong current password when changing it", async () => {
    const user = await makeSignedInUser();
    await expect(
      changePassword(await session(user.id), { currentPassword: "nope-1", newPassword: "a-new-password-2" }),
    ).rejects.toThrow(/not your current password/i);
  });

  it("will not leave the company without an active owner", async () => {
    const { changeRole } = await import("@/server/services/users");
    await expect(changeRole(co.owner, co.owner.id, { role: "EMPLOYEE" })).rejects.toThrow(AppError);
    await expect(deactivateUser(co.owner, co.owner.id)).rejects.toThrow(/cannot deactivate your own account/i);
  });
});

describe("rate limiting", () => {
  it("allows up to the limit and then refuses", () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect(consume("key", 3, 60_000).allowed).toBe(true);
    }
    const blocked = consume("key", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps separate buckets per key", () => {
    consume("a", 1, 60_000);
    expect(consume("a", 1, 60_000).allowed).toBe(false);
    expect(consume("b", 1, 60_000).allowed).toBe(true);
  });

  it("throws a 429 from enforce", () => {
    enforce("enforced", 1, 60_000);
    try {
      enforce("enforced", 1, 60_000);
      throw new Error("expected enforce to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(429);
    }
  });
});

describe("attachments", () => {
  async function taskWithAssignee() {
    return createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));
  }

  const file = (overrides: Partial<{ name: string; type: string; body: string }> = {}) => {
    const body = overrides.body ?? "report contents";
    const bytes = Buffer.from(body, "utf8");
    return {
      name: overrides.name ?? "report.txt",
      type: overrides.type ?? "text/plain",
      size: bytes.byteLength,
      bytes,
    };
  };

  it("stores an allowed file and serves it back to someone on the task", async () => {
    const task = await taskWithAssignee();
    const created = await uploadAttachment(co.employee, task.id, file());

    expect(created.filename).toBe("report.txt");
    expect(created.downloadUrl).toBe(`/api/attachments/${created.id}/download`);
    // The storage key never reaches the caller.
    expect(created).not.toHaveProperty("storageKey");

    const read = await readAttachment(co.employee, created.id);
    expect(read.bytes.toString("utf8")).toBe("report contents");
    expect(read.mimeType).toBe("text/plain");

    // A team-mate who can see the task can read it; an outsider cannot.
    await expect(readAttachment(co.employee2, created.id)).resolves.toBeTruthy();
    await expect(readAttachment(co.outsider, created.id)).rejects.toThrow(/do not have access/i);
  });

  it("refuses a file type that is not on the allow list", async () => {
    const task = await taskWithAssignee();
    await expect(
      uploadAttachment(co.employee, task.id, file({ name: "payload.exe", type: "application/x-msdownload" })),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    expect(Object.keys(ALLOWED_UPLOAD_TYPES)).not.toContain("application/x-msdownload");
  });

  it("refuses an empty file and one over the size limit", async () => {
    const task = await taskWithAssignee();
    await expect(uploadAttachment(co.employee, task.id, file({ body: "" }))).rejects.toThrow(/empty/i);

    const big = Buffer.alloc(11 * 1024 * 1024, 0x41);
    await expect(
      uploadAttachment(co.employee, task.id, { name: "big.txt", type: "text/plain", size: big.byteLength, bytes: big }),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("refuses an upload whose declared size disagrees with the payload", async () => {
    const task = await taskWithAssignee();
    const payload = file();
    await expect(
      uploadAttachment(co.employee, task.id, { ...payload, size: payload.size + 100 }),
    ).rejects.toThrow(/truncated/i);
  });

  it("strips directory traversal out of the stored filename", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("..\\..\\windows\\system32\\cmd.exe")).not.toContain("\\");
    expect(safeFilename("")).toBe("attachment");
    expect(safeFilename("perfectly fine (v2).pdf")).toBe("perfectly fine (v2).pdf");
  });

  it("stops someone who is not on the task from attaching to it", async () => {
    const task = await taskWithAssignee();
    await expect(uploadAttachment(co.outsider, task.id, file())).rejects.toThrow(/do not have access/i);
    // A viewer in the team who is not an assignee also cannot attach.
    await expect(uploadAttachment(co.employee2, task.id, file())).rejects.toThrow(/only an assignee or a team lead/i);
  });

  it("lets the uploader or a lead remove a file, and nobody else", async () => {
    const task = await taskWithAssignee();
    const first = await uploadAttachment(co.employee, task.id, file({ name: "a.txt" }));
    const second = await uploadAttachment(co.employee, task.id, file({ name: "b.txt" }));

    await expect(deleteAttachment(co.employee2, first.id)).rejects.toThrow(/cannot remove/i);
    await deleteAttachment(co.employee, first.id);
    await deleteAttachment(co.manager, second.id);

    expect(await listAttachments(co.employee, task.id)).toHaveLength(0);
  });

  it("reports a missing file honestly rather than returning empty content", async () => {
    const task = await taskWithAssignee();
    const created = await uploadAttachment(co.employee, task.id, file());

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: created.id } });
    await rm(path.resolve(process.cwd(), "storage/test-attachments", row.storageKey!), { force: true });

    await expect(readAttachment(co.employee, created.id)).rejects.toThrow(/no longer in storage/i);
  });
});
