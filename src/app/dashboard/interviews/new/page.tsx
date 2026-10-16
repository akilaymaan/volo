import { InterviewEditor } from "@/components/interview-editor";
import { requireUser } from "@/lib/auth";
import { listInterviewers } from "@/lib/data";

export const metadata = { title: "New interview" };

export default async function NewInterview() {
  const user = await requireUser();
  const interviewers = await listInterviewers(user.id);
  return (
    <>
      <h1 className="text-3xl font-bold">New interview</h1>
      <p className="mb-8 mt-1 text-muted-foreground">
        Describe the role, review the questions, and you&apos;ll get a link to share.
      </p>
      <InterviewEditor interviewId={null} interviewers={interviewers} />
    </>
  );
}
