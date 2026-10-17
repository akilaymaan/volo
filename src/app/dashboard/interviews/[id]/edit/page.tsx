import { InterviewEditor } from "@/components/interview-editor";
import { requireUser } from "@/lib/auth";
import { getOwnedInterview, listInterviewers } from "@/lib/data";

export const metadata = { title: "Edit interview" };

export default async function EditInterview(props: PageProps<"/dashboard/interviews/[id]/edit">) {
  const { id } = await props.params;
  const user = await requireUser();
  const [iv, interviewers] = await Promise.all([getOwnedInterview(id, user.id), listInterviewers(user.id)]);
  return (
    <>
      <h1 className="text-3xl font-bold">Edit interview</h1>
      <p className="mb-8 mt-1 text-muted-foreground">
        Changes apply to candidates who start after you save.
      </p>
      <InterviewEditor
        interviewId={iv.id}
        interviewers={interviewers}
        initial={{
          name: iv.name,
          objective: iv.objective,
          description: iv.description,
          interviewerId: iv.interviewerId,
          language: iv.language,
          durationMins: iv.durationMins,
          questions: iv.questions,
          isAnonymous: iv.isAnonymous,
          themeColor: iv.themeColor,
          logoUrl: iv.logoUrl ?? "",
          allowedEmails: iv.allowedEmails,
          invitationOnly: iv.invitationOnly,
          retentionDays: iv.retentionDays,
        }}
      />
    </>
  );
}
