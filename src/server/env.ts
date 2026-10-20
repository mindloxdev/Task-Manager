/**
 * Server-only environment access.
 *
 * Nothing in here may be imported from a client component — every secret is
 * read through this module so the boundary is easy to audit.
 */

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get authSecret() {
    const secret = required("AUTH_SECRET");
    if (process.env.NODE_ENV === "production" && secret.length < 32) {
      throw new Error("AUTH_SECRET must be at least 32 characters in production.");
    }
    return secret;
  },
  get sessionTtlHours() {
    return int("SESSION_TTL_HOURS", 12);
  },
  get cronSecret() {
    return optional("CRON_SECRET");
  },
  get attachmentDir() {
    return process.env.ATTACHMENT_DIR || "./storage/attachments";
  },
  get maxUploadBytes() {
    return int("MAX_UPLOAD_MB", 10) * 1024 * 1024;
  },
  get appUrl() {
    return process.env.APP_URL || "http://localhost:3000";
  },
  /** Email is strictly optional; when unset, the app never claims mail was sent. */
  get email() {
    const provider = optional("EMAIL_PROVIDER");
    const apiKey = optional("EMAIL_API_KEY");
    const from = optional("EMAIL_FROM");
    if (!provider || !apiKey || !from) return null;
    return { provider, apiKey, from };
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};
