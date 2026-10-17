import "server-only";

export type InvitationMail = { email: string; interviewName: string; url: string; expiresAt: Date; deliveryKey: string };

export async function sendInvitationMail(mail: InvitationMail) {
  // The test/demo transport must be explicitly opted into along with fake AI.
  if (process.env.EMAIL_MOCK === "1" && process.env.AI_MOCK === "1") return { id: "mock-email" };
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
    throw new Error("Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json",
      "Idempotency-Key": mail.deliveryKey,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM, to: [mail.email],
      subject: `Interview invitation: ${mail.interviewName}`,
      text: `You are invited to ${mail.interviewName}.\n\nOpen your personal link: ${mail.url}\n\nThis link expires ${mail.expiresAt.toISOString()}. Do not forward it. You will speak with an AI interviewer; your consent is requested before recording. A person reviews hiring decisions. Contact the hiring team for an alternative interview or help.`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error("Email provider rejected the request.");
  const body = await res.json() as { id?: string };
  if (!body.id) throw new Error("Email provider returned an invalid response.");
  return { id: body.id };
}
