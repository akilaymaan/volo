import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { InvitationManager } from "@/components/invitation-manager";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions", () => ({
  revokeInviteAction: vi.fn(), sendInviteAction: vi.fn(),
  previewInvitationImportAction: vi.fn(), sendImportedInvitationAction: vi.fn(),
}));

it("renders an actionable setup warning and disables single/resend submission", () => {
  const markup = renderToStaticMarkup(createElement(InvitationManager, {
    interviewId: "role", setupError: "Set RESEND_API_KEY and EMAIL_FROM in your hosting environment, then redeploy.",
    rows: [{ id: "invite", email: "candidate@example.test", status: "sent", expiresAt: "2026-11-01", revoked: false, sendCount: 1 }],
  }));
  expect(markup).toContain('role="alert"');
  expect(markup).toContain("Email invitations are not configured");
  expect(markup).toContain("Environment Variables for Production");
  expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Send invitation<\/button>/);
  expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Resend<\/button>/);
  expect(markup).toMatch(/<button(?![^>]*\sdisabled=)[^>]*>Revoke<\/button>/);
});

it("keeps sending available when the server configuration check succeeds", () => {
  const markup = renderToStaticMarkup(createElement(InvitationManager, { interviewId: "role", rows: [], setupError: null }));
  expect(markup).not.toContain("Email invitations are not configured");
  expect(markup).toMatch(/<button(?![^>]*\sdisabled=)[^>]*>Send invitation<\/button>/);
});
