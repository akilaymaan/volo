import { expect, it } from "vitest";
import { MAX_IMPORT_BYTES, parseInvitationCsv } from "@/lib/invitation-import";

it("parses BOM, case-insensitive headers, quoted commas, quotes and multiline names", () => {
  const rows = parseInvitationCsv('\uFEFFName,EMAIL\r\n"Asha, \"\"Engineer\"\"", ASHA@example.test \r\n"Ravi\nKumar",ravi@example.test\r\n');
  expect(rows).toMatchObject([
    { row: 2, name: 'Asha, "Engineer"', email: "asha@example.test", status: "ready" },
    { row: 3, name: "Ravi\nKumar", email: "ravi@example.test", status: "ready" },
  ]);
});

it("flags invalid emails, duplicates and extra fields without discarding valid rows", () => {
  const rows = parseInvitationCsv("email,name\na@example.test,A\nA@example.test,Again\nbad,B\nc@example.test,C,extra\nd@example.test\n");
  expect(rows.map((r) => r.status)).toEqual(["ready", "duplicate", "invalid", "invalid", "ready"]);
  expect(rows[4].name).toBe("");
});

it("rejects ambiguous headers, malformed quotes and empty imports", () => {
  for (const csv of ["", "email\n", "name\nAsha", "email,email\na@example.test,b@example.test", "email,\na@example.test,x", 'email,name\na@example.test,"unclosed', 'email\n"a@example.test"junk']) {
    expect(() => parseInvitationCsv(csv)).toThrow();
  }
});

it("bounds bytes, recipient rows and columns before any send", () => {
  expect(() => parseInvitationCsv("email\n" + "x".repeat(MAX_IMPORT_BYTES))).toThrow(/100 KB/);
  expect(() => parseInvitationCsv("email\n" + "候".repeat(40_000))).toThrow(/100 KB/);
  expect(() => parseInvitationCsv("email\n" + Array.from({ length: 101 }, (_, i) => `a${i}@example.test`).join("\n"))).toThrow(/100 recipients/);
  expect(() => parseInvitationCsv(Array.from({ length: 21 }, (_, i) => `c${i}`).join(","))).toThrow(/20 columns/);
});

it("ignores blank records but preserves source line numbers and validates optional names", () => {
  const rows = parseInvitationCsv(`email,name\n\na@example.test,A\n\nb@example.test,${"x".repeat(81)}\n`);
  expect(rows.map((r) => r.row)).toEqual([3, 5]);
  expect(rows.map((r) => r.status)).toEqual(["ready", "invalid"]);
});
