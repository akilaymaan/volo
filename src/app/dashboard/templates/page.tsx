import { FilesIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { DeleteTemplateButton } from "@/components/delete-template-button";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { languageLabel } from "@/lib/constants";
import { listTemplates } from "@/lib/templates";

export const metadata = { title: "Interview templates" };

export default async function TemplatesPage() {
  const user = await requireUser();
  const templates = await listTemplates(user.id);
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Interview templates</h1>
          <p className="mt-1 text-muted-foreground">Your saved starting points for recurring roles. Each new interview is independent.</p>
        </div>
        <Button asChild><Link href="/dashboard/interviews/new"><PlusIcon /> New interview</Link></Button>
      </div>
      {templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card px-6 py-16 text-center">
          <FilesIcon className="mx-auto size-10 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">No templates yet</h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">Open an interview, choose More actions, then Save as template to reuse its questions and settings.</p>
          <Button asChild variant="outline" className="mt-6"><Link href="/dashboard">Go to interviews</Link></Button>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {templates.map((t) => (
            <li key={t.id} className="flex min-w-0 flex-col rounded-2xl border bg-card p-5">
              <h2 className="break-words text-lg font-semibold">{t.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.config.questions.length} questions · {languageLabel(t.config.language)} · {t.config.durationMins} min</p>
              <p className="mb-5 mt-3 line-clamp-3 text-sm text-muted-foreground">{t.config.objective}</p>
              <div className="mt-auto flex items-center gap-2">
                <Button asChild><Link href={`/dashboard/interviews/new?template=${t.id}`}>Use template<span className="sr-only"> {t.name}</span></Link></Button>
                <DeleteTemplateButton id={t.id} name={t.name} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
