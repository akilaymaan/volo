import "server-only";
import { z } from "zod";
import { PublicError } from "@/lib/errors";

export class EmailDeliveryError extends PublicError {
  constructor(readonly code: string, message: string, readonly status?: number) { super(message); }
}

export function emailConfiguration() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new EmailDeliveryError("configuration", "Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM in your hosting environment, then redeploy.");
  if (/[\s"']/.test(apiKey)) throw new EmailDeliveryError("configuration", "RESEND_API_KEY is invalid. Paste only the Resend API key without quotes or whitespace, then redeploy.");
  const address = from.match(/^[^<>]+<([^<>]+)>$/)?.[1]?.trim() ?? from;
  if (/[\r\n]/.test(from) || !z.string().email().safeParse(address).success)
    throw new EmailDeliveryError("configuration", "EMAIL_FROM must be an email address on your verified Resend domain, optionally formatted as Hiring <hiring@your-domain>.");
  return { apiKey, from };
}

/** Only a safe setup message is serialized to the owner UI; never configuration values. */
export function emailConfigurationIssue() {
  try { emailConfiguration(); return null; }
  catch (error) { if (error instanceof EmailDeliveryError) return error.message; throw error; }
}
