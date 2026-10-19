/**
 * Per-file test environment. Runs before any test module is imported, so the
 * Prisma client picks up the test database rather than the development one.
 */
process.env.DATABASE_URL = "file:./test.db";
process.env.AUTH_SECRET = "test-secret-at-least-thirty-two-characters-long";
process.env.SESSION_TTL_HOURS = "12";
process.env.ATTACHMENT_DIR = "./storage/test-attachments";
process.env.MAX_UPLOAD_MB = "10";
process.env.APP_URL = "http://localhost:3000";
delete process.env.EMAIL_PROVIDER;
delete process.env.EMAIL_API_KEY;
delete process.env.EMAIL_FROM;
