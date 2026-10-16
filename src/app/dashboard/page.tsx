import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { ScoreBadge } from "@/components/score";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PersonaDot, VoiceOrb } from "@/components/voice-orb";
import { requireUser } from "@/lib/auth";
import { languageLabel } from "@/lib/constants";
import { listInterviews } from "@/lib/data";

export const metadata = { title: "Interviews" };

export default async function Dashboard() {
  const user = await requireUser();
  const interviews = await listInterviews(user.id);

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Interviews</h1>
          <p className="mt-1 text-muted-foreground">
            Share a link, and every finished conversation shows up here with a score.
          </p>
        </div>
        <Button asChild className="h-10">
          <Link href="/dashboard/interviews/new">
            <PlusIcon /> New interview
          </Link>
        </Button>
      </div>

      {interviews.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-16 text-center">
          <VoiceOrb color="#0e6e66" size={120} />
          <h2 className="mt-4 text-xl font-semibold">Create your first interview</h2>
          <p className="mt-2 max-w-md text-muted-foreground">
            Paste a job description and Volo drafts the questions. You&apos;ll get a link to send
            to candidates in about two minutes.
          </p>
          <Button asChild className="mt-6 h-10">
            <Link href="/dashboard/interviews/new">
              <PlusIcon /> New interview
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {interviews.map((iv) => (
            <li key={iv.id} className="relative flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-muted/50 sm:px-5">
              <PersonaDot color={iv.interviewerColor} name={iv.interviewerName} size={40} />
              <div className="min-w-0 flex-1">
                <Link href={`/dashboard/interviews/${iv.id}`} className="font-semibold after:absolute after:inset-0">
                  {iv.name}
                </Link>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {iv.interviewerName}, {languageLabel(iv.language)}, {iv.durationMins} min
                </p>
              </div>
              <div className="flex items-center gap-5">
                <div className="text-right">
                  <p className="font-heading text-lg font-semibold leading-none">{iv.responses}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {iv.unviewed > 0 ? <span className="font-medium text-primary">{iv.unviewed} new</span> : "responses"}
                  </p>
                </div>
                <ScoreBadge score={iv.avgScore} label="avg" />
                {iv.isActive ? (
                  <Badge className="bg-mint/20 text-emerald-800 dark:text-mint">Live</Badge>
                ) : (
                  <Badge variant="secondary">Paused</Badge>
                )}
                <div className="relative z-10">
                  <CopyButton text={`/i/${iv.id}`} iconOnly variant="ghost" label="Copy interview link" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
