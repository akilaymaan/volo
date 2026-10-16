import { CopyIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { deleteInterviewerAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { InterviewerDialog } from "@/components/interviewer-dialog";
import { Button } from "@/components/ui/button";
import { VoiceOrb } from "@/components/voice-orb";
import { VoicePreviewButton } from "@/components/voice-preview";
import { requireUser } from "@/lib/auth";
import { TRAITS, VOICES } from "@/lib/constants";
import { listInterviewers } from "@/lib/data";

export const metadata = { title: "Interviewers" };

export default async function InterviewersPage() {
  const user = await requireUser();
  const interviewers = await listInterviewers(user.id);

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Interviewers</h1>
          <p className="mt-1 text-muted-foreground">The AI personas that talk to your candidates. Pick one per interview.</p>
        </div>
        <InterviewerDialog
          id={null}
          title="New interviewer"
          trigger={
            <Button className="h-10">
              <PlusIcon /> New interviewer
            </Button>
          }
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {interviewers.map((p) => {
          const own = p.ownerId === user.id;
          const input = {
            name: p.name,
            description: p.description,
            voice: p.voice,
            color: p.color,
            empathy: p.empathy,
            exploration: p.exploration,
            rapport: p.rapport,
            speed: p.speed,
          };
          return (
            <article key={p.id} className="flex flex-col rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-3">
                <VoiceOrb color={p.color} size={64} />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{p.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    Voice: {VOICES.find((x) => x.id === p.voice)?.label ?? p.voice}
                    {!own && ", built in"}
                  </p>
                </div>
              </div>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">{p.description}</p>
              <dl className="mt-4 space-y-2">
                {TRAITS.map((t) => (
                  <div key={t.key} className="flex items-center gap-3 text-sm">
                    <dt className="w-16 text-muted-foreground">{t.label}</dt>
                    <dd className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full" style={{ width: `${p[t.key] * 10}%`, background: p.color }} />
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex flex-wrap items-center gap-1 border-t pt-3">
                <VoicePreviewButton voice={p.voice} />
                <div className="ml-auto flex gap-1">
                  {own ? (
                    <>
                      <InterviewerDialog
                        id={p.id}
                        initial={input}
                        title={`Edit ${p.name}`}
                        trigger={
                          <Button variant="ghost" size="sm">
                            <PencilIcon /> Edit
                          </Button>
                        }
                      />
                      <ActionButton variant="ghost" size="sm" action={deleteInterviewerAction.bind(null, p.id)} success="Interviewer deleted">
                        <Trash2Icon /> Delete
                      </ActionButton>
                    </>
                  ) : (
                    <InterviewerDialog
                      id={null}
                      initial={{ ...input, name: `${p.name} (copy)` }}
                      title={`Customize ${p.name}`}
                      trigger={
                        <Button variant="ghost" size="sm">
                          <CopyIcon /> Duplicate
                        </Button>
                      }
                    />
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
