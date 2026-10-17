import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { CandidateCall } from "@/components/call/candidate-call";
import { VoiceOrb } from "@/components/voice-orb";
import { languageLabel } from "@/lib/constants";
import { db } from "@/lib/db";
import { interview, interviewer } from "@/lib/db/schema";

async function load(id: string) {
  if (id.length > 64) return null;
  const [row] = await db
    .select({ interview, interviewer })
    .from(interview)
    .innerJoin(interviewer, eq(interview.interviewerId, interviewer.id))
    .where(eq(interview.id, id));
  return row ?? null;
}

export async function generateMetadata(props: PageProps<"/i/[id]">): Promise<Metadata> {
  const row = await load((await props.params).id);
  return { title: row ? row.interview.name : "Interview", robots: { index: false } };
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="dark flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-center text-foreground">
      <VoiceOrb color="#7aa7a1" size={120} active={false} />
      <h1 className="mt-4 text-2xl font-bold">{title}</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">{body}</p>
    </main>
  );
}

export default async function InterviewLink(props: PageProps<"/i/[id]">) {
  const row = await load((await props.params).id);
  if (!row) return <Notice title="This link doesn't work" body="Check the link you were sent, or ask the hiring team for a new one." />;
  const { interview: iv, interviewer: p } = row;
  if (!iv.isActive)
    return <Notice title="This interview is closed" body="It's no longer accepting responses. Contact the hiring team if you think this is a mistake." />;

  return (
    <CandidateCall
      interview={{
        id: iv.id,
        name: iv.name,
        description: iv.description,
        durationMins: iv.durationMins,
        isAnonymous: iv.isAnonymous,
        retentionDays: iv.retentionDays,
        themeColor: iv.themeColor,
        logoUrl: iv.logoUrl,
        languageLabel: languageLabel(iv.language),
        interviewer: { name: p.name, color: p.color },
      }}
    />
  );
}
