import { z } from "zod";
import { PublicError } from "@/lib/errors";
import type { invitation } from "@/lib/db/schema";

export const MAX_IMPORT_BYTES = 100_000;
export const MAX_IMPORT_ROWS = 100;
export const REMINDER_WAIT_MS = 24 * 60 * 60_000;
export const MAX_REMINDER_SEND_ATTEMPTS = 3;
export type ImportMode = "new" | "reminder";
export type ImportRecipient = {
  row: number;
  name: string;
  email: string;
  status: "ready" | "invalid" | "duplicate" | "blocked";
  reason: string;
};

const emailSchema = z.string().max(200).email();

/** Bounded CSV reader supporting BOM, quoted commas/newlines and escaped quotes. */
export function parseInvitationCsv(source: string): ImportRecipient[] {
  if (typeof source !== "string" || new TextEncoder().encode(source).length > MAX_IMPORT_BYTES)
    throw new PublicError("CSV must be under 100 KB.");
  const input = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let field = "";
  let state: "plain" | "quoted" | "closed" = "plain";
  let line = 1;
  let startLine = 1;
  const finishField = () => {
    cells.push(field);
    if (cells.length > 20) throw new PublicError("CSV must have at most 20 columns.");
    field = "";
    state = "plain";
  };
  const finishRow = () => {
    finishField();
    if (cells.some((c) => c.trim())) records.push({ line: startLine, cells });
    if (records.length > MAX_IMPORT_ROWS + 1) throw new PublicError("Import at most 100 recipients at a time.");
    cells = [];
    startLine = line + 1;
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (state === "quoted") {
      if (c === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else state = "closed";
      } else field += c;
    } else if (c === ",") finishField();
    else if (c === "\n") finishRow();
    else if (state === "closed") {
      if (c !== " " && c !== "\t") throw new PublicError(`Invalid CSV quoting near line ${line}.`);
    } else if (c === '"') {
      if (field.trim()) throw new PublicError(`Invalid CSV quoting near line ${line}.`);
      field = "";
      state = "quoted";
    } else field += c;
    if (c === "\n") line++;
  }
  if (state === "quoted") throw new PublicError("CSV has an unclosed quoted field.");
  if (field || cells.length || state === "closed") finishRow();
  if (records.length < 2) throw new PublicError("Include an email header and at least one recipient.");
  const headers = records[0].cells.map((c) => c.trim().toLowerCase());
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length || !headers.includes("email"))
    throw new PublicError("CSV needs one email column with unique, nonempty column headers. A name column is optional.");
  const emailIndex = headers.indexOf("email");
  const nameIndex = headers.indexOf("name");
  const seen = new Set<string>();
  return records.slice(1).map(({ line: row, cells }) => {
    const email = (cells[emailIndex] ?? "").trim().toLowerCase();
    const name = nameIndex < 0 ? "" : (cells[nameIndex] ?? "").trim();
    const base = { row, email, name };
    if (cells.length > headers.length) return { ...base, status: "invalid", reason: "More fields than column headers." };
    if (!emailSchema.safeParse(email).success) return { ...base, status: "invalid", reason: "Enter a valid email address (max 200 characters)." };
    if (name.length > 80) return { ...base, status: "invalid", reason: "Name is too long (max 80 characters)." };
    if (seen.has(email)) return { ...base, status: "duplicate", reason: "Duplicate email in this file." };
    seen.add(email);
    return { ...base, status: "ready", reason: "Ready" };
  });
}

type ReminderInvitation = Pick<typeof invitation.$inferSelect,
  "status" | "revokedAt" | "expiresAt" | "lastAttemptAt" | "sendCount">;

export function reminderBlockReason(inv: ReminderInvitation | undefined, hasAttempt: boolean, now = Date.now()) {
  if (hasAttempt || inv?.status === "started" || inv?.status === "completed") return "Candidate has already started or completed.";
  if (!inv) return "No existing invitation. Use New invitations first.";
  if (inv.revokedAt || inv.status === "revoked") return "Invitation is revoked.";
  if (inv.expiresAt.getTime() <= now) return "Invitation has expired. Use Resend to issue a new link.";
  if (inv.status !== "sent") return "Previous send is not confirmed. Review it before resending.";
  if (inv.sendCount >= MAX_REMINDER_SEND_ATTEMPTS) return "Reminder limit reached (3 total send attempts).";
  if (!inv.lastAttemptAt || inv.lastAttemptAt.getTime() >= now - REMINDER_WAIT_MS) return "Wait 24 hours after the last send attempt.";
  return null;
}
