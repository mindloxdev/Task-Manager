/**
 * Email boundary.
 *
 * No provider is configured by default, and in that case nothing is sent and
 * nothing is claimed to have been sent — `send` returns `{ sent: false,
 * reason: "not-configured" }` and the caller records that honestly.
 *
 * To enable email, set EMAIL_PROVIDER, EMAIL_API_KEY and EMAIL_FROM. The only
 * provider wired up is Resend; adding another means one more branch below.
 */
import "server-only";

import { env } from "@/server/env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type EmailResult =
  | { sent: true; provider: string; id?: string }
  | { sent: false; reason: "not-configured" | "disabled" | "error"; detail?: string };

export function isEmailConfigured(): boolean {
  return env.email !== null;
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const config = env.email;
  if (!config) return { sent: false, reason: "not-configured" };

  if (config.provider !== "resend") {
    return {
      sent: false,
      reason: "error",
      detail: `Unsupported EMAIL_PROVIDER "${config.provider}". Only "resend" is implemented.`,
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      return { sent: false, reason: "error", detail: `Provider returned ${response.status}` };
    }
    const payload = (await response.json().catch(() => null)) as { id?: string } | null;
    return { sent: true, provider: config.provider, id: payload?.id };
  } catch (error) {
    return { sent: false, reason: "error", detail: error instanceof Error ? error.message : "unknown error" };
  }
}
