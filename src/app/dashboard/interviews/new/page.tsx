import { InterviewEditor } from "@/components/interview-editor";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOwnedInterview, listInterviewers } from "@/lib/data";
import { reusableInterviewConfig } from "@/lib/interview-config";
import { getOwnedTemplate } from "@/lib/templates";
import type { InterviewInput } from "@/app/actions";

export const metadata = { title: "New interview" };

export default async function NewInterview(props: PageProps<"/dashboard/interviews/new">) {
  const user = await requireUser();
  const { template, duplicate } = await props.searchParams;
  if ((template !== undefined && (typeof template !== "string" || !template || template.length > 64)) ||
      (duplicate !== undefined && (typeof duplicate !== "string" || !duplicate || duplicate.length > 64)) ||
      (template !== undefined && duplicate !== undefined)) notFound();
  const interviewers = await listInterviewers(user.id);
  let initial: InterviewInput | undefined;
  let sourceName = "";
  let missingPersona = false;
  if (template || duplicate) {
    const source = template ? await getOwnedTemplate(template, user.id) : null;
    const config = source?.config ?? reusableInterviewConfig(await getOwnedInterview(duplicate!, user.id));
    sourceName = source?.name ?? config.name;
    missingPersona = !interviewers.some((p) => p.id === config.interviewerId);
    initial = {
      ...config,
      name: duplicate ? `${config.name.slice(0, 113)} (copy)` : config.name,
      logoUrl: config.logoUrl ?? "",
      allowedEmails: [],
      interviewerId: missingPersona ? "" : config.interviewerId,
    };
  }
  return (
    <>
      <h1 className="text-3xl font-bold">New interview</h1>
      <p className="mb-8 mt-1 text-muted-foreground">
        Describe the role, review the questions, and you&apos;ll get a link to share.
      </p>
      {initial ? (
        <div role="status" className="mb-6 rounded-xl border bg-card p-4 text-sm">
          <p>Starting from {template ? "template" : "interview"} &ldquo;{sourceName}&rdquo;. Review the settings before creating your new interview.</p>
          <p className="mt-1 text-muted-foreground">Candidate lists, responses and reports are not copied. Access restrictions are preserved; send new invitations for restricted interviews.</p>
          {missingPersona && <p className="mt-2 text-destructive">The saved interviewer is no longer available. Choose an interviewer below.</p>}
        </div>
      ) : <p className="mb-6 text-sm"><Link href="/dashboard/templates" className="underline underline-offset-4">Start from a saved template</Link></p>}
      <InterviewEditor key={`${template ?? ""}:${duplicate ?? ""}`} interviewId={null} initial={initial} interviewers={interviewers} />
    </>
  );
}
