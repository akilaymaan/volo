import "server-only";
import { EmailDeliveryError, emailConfiguration } from "@/lib/email-config";

export type InvitationMail = { email: string; interviewName: string; url: string; expiresAt: Date; deliveryKey: string; reminder?: boolean };

export async function sendInvitationMail(mail: InvitationMail) {
  const config = emailConfiguration();
  let res: Response;
  try { res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`, "content-type": "application/json",
      "Idempotency-Key": mail.deliveryKey,
    },
    body: JSON.stringify({
      from: config.from, to: [mail.email],
      subject: `${mail.reminder ? "Interview reminder" : "Interview invitation"}: ${mail.interviewName}`,
      text: `${mail.reminder ? "A reminder to complete" : "You are invited to"} ${mail.interviewName}.\n\n${mail.reminder ? "This replaces your previous personal link.\n\n" : ""}Open your personal link: ${mail.url}\n\nThis link expires ${mail.expiresAt.toISOString()}. Do not forward it. You will speak with an AI interviewer; your consent is requested before recording. A person reviews hiring decisions. Contact the hiring team for an alternative interview or help.`,
    }),
    signal: AbortSignal.timeout(15_000),
  }); } catch {
    throw new EmailDeliveryError("unconfirmed", "Could not confirm email delivery because Resend could not be reached. Check invitation status before resending after one minute.");
  }
  if (!res.ok) {
    // Inspect provider diagnostics only to classify the problem. Never expose or log
    // raw bodies: they can include recipient addresses, tokens or other private data.
    const body = await res.json().catch(() => null) as { name?: unknown; message?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name : "";
    const message = typeof body?.message === "string" ? body.message : "";
    if (res.status === 401 || ["missing_api_key", "restricted_api_key", "suspended_api_key", "invalid_permission"].includes(name) || /api key is invalid/i.test(message))
      throw new EmailDeliveryError("authentication", "Resend rejected the API key or its sending permission. Check RESEND_API_KEY in the hosting environment and its permitted sending domain, then redeploy.", res.status);
    if (res.status === 403 && /only send testing emails|testing emails to your own/i.test(message))
      throw new EmailDeliveryError("test_sender", "Resend's test sender cannot send invitations to other recipients. Verify your own domain in Resend and set EMAIL_FROM to an address on that domain, then redeploy.", res.status);
    if (res.status === 403 && /domain.*not verified|verify.*domain|domain.*verif/i.test(message))
      throw new EmailDeliveryError("sender_domain", "Resend has not verified the EMAIL_FROM domain for this API key. Verify the domain in the same Resend account and use a sender on that domain, then redeploy.", res.status);
    if (["daily_quota_exceeded", "monthly_quota_exceeded"].includes(name))
      throw new EmailDeliveryError("quota", "Resend's email sending quota has been reached. Check your Resend usage and wait for the quota to reset before resending.", res.status);
    if (res.status === 429)
      throw new EmailDeliveryError("rate_limit", "Resend is rate-limiting email requests. Wait at least one minute before resending.", res.status);
    if (res.status >= 500)
      throw new EmailDeliveryError("unavailable", "Resend is temporarily unavailable. Could not confirm email delivery; check invitation status before resending after one minute.", res.status);
    throw new EmailDeliveryError("rejected", "Email provider rejected the request. Check EMAIL_FROM, the candidate email address and your Resend sending permissions before resending after one minute.", res.status);
  }
  const body = await res.json().catch(() => null) as { id?: unknown } | null;
  if (typeof body?.id !== "string" || !body.id.trim())
    throw new EmailDeliveryError("unconfirmed", "Email provider returned an invalid response. Could not confirm email delivery; check invitation status before resending after one minute.");
  return { id: body.id };
}
