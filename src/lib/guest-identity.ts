/** Internal, non-deliverable identifiers; guests never supply an email address. */
export function isGuestUser(user: { email?: string | null } | null | undefined) {
  return /^guest-[0-9a-f-]{36}@guest\.volo\.invalid$/.test(user?.email ?? "");
}
