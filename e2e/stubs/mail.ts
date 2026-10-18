// Test-build-only mail transport. Production uses src/lib/mail.ts directly.
export async function sendInvitationMail() { return { id: "test-email" }; }
