/**
 * Creates the company's first owner account on an empty production database.
 *
 *   OWNER_EMAIL=you@example.com OWNER_NAME="Your Name" npx tsx prisma/create-owner.ts
 *
 * Prints a one-time random password; sign in with it and change it under
 * Settings. Does nothing if an owner already exists, so it is safe to re-run.
 * Everyone else is invited from the Employees page.
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import { colorForKey } from "../src/lib/utils";
import { hashPassword } from "../src/server/password";

if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");

const prisma = new PrismaClient();

/** 24 random characters, with the letter and digit the password rules require. */
function generatePassword(): string {
  for (;;) {
    const candidate = randomBytes(18).toString("base64url");
    if (/[a-zA-Z]/.test(candidate) && /[0-9]/.test(candidate)) return candidate;
  }
}

async function main() {
  const email = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  const name = (process.env.OWNER_NAME ?? "").trim() || "Owner";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Set OWNER_EMAIL to the email address the owner will sign in with.");
  }

  const existing = await prisma.user.findFirst({ where: { role: "OWNER" }, select: { email: true } });
  if (existing) {
    console.log(`An owner account already exists (${existing.email}); nothing to do.`);
    return;
  }
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new Error(`${email} already has an account that is not an owner.`);
  }

  const password = generatePassword();
  await prisma.user.create({
    data: {
      email,
      name,
      role: "OWNER",
      status: "ACTIVE",
      passwordHash: await hashPassword(password),
      avatarColor: colorForKey(email),
      preferences: { create: {} },
    },
  });

  console.log("Created the owner account. Sign in, then change this password under Settings:");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
