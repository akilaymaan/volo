"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  FileTextIcon,
  ImageIcon,
  Loader2Icon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { generateQuestionsAction, type InterviewInput, saveInterviewAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { VoiceOrb } from "@/components/voice-orb";
import { VoicePreviewButton } from "@/components/voice-preview";
import { LANGUAGES } from "@/lib/constants";
import { CANDIDATE_ORB_COLOR } from "@/lib/candidate-appearance";
import type { Interviewer } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { guidedStepError, type InterviewDraftState } from "@/lib/interview-draft";
import { useInterviewDraft } from "@/components/use-interview-draft";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

export function InterviewEditor({
  interviewId,
  initial,
  interviewers,
  draftKey,
}: {
  interviewId: string | null;
  initial?: InterviewInput;
  interviewers: Interviewer[];
  draftKey?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState<InterviewInput>(
    initial ?? {
      name: "",
      objective: "",
      description: "",
      interviewerId: interviewers[0]?.id ?? "",
      language: "en-IN",
      durationMins: 10,
      questions: [],
      isAnonymous: false,
      themeColor: "#111111",
      logoUrl: "",
      allowedEmails: [],
      invitationOnly: false,
      retentionDays: 90,
    },
  );
  const set = <K extends keyof InterviewInput>(k: K, val: InterviewInput[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  const [context, setContext] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [count, setCount] = useState(Math.min(initial?.questions.length || 5, 12));
  const [emailsText, setEmailsText] = useState((initial?.allowedEmails ?? []).join("\n"));
  const [guided, setGuided] = useState(!!draftKey && !initial);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [stepError, setStepError] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [generating, startGenerating] = useTransition();
  const [saving, startSaving] = useTransition();
  const logoInput = useRef<HTMLInputElement>(null);
  const persona = interviewers.find((i) => i.id === v.interviewerId);
  const draftState: InterviewDraftState = { values: v, context, count, emailsText, guided, step, attachmentName: file?.name ?? attachmentName };
  const draft = useInterviewDraft(draftKey, draftState, (saved) => {
    setV({ ...saved.values, interviewerId: interviewers.some((p) => p.id === saved.values.interviewerId) ? saved.values.interviewerId : "" });
    setContext(saved.context); setCount(saved.count); setEmailsText(saved.emailsText);
    setStep(saved.step); setGuided(saved.guided); setAttachmentName(saved.attachmentName);
  });

  function goTo(next: 1 | 2 | 3) {
    const error = next > step ? guidedStepError(draftState, next === 3 ? 2 : 1) : "";
    if (error) { setStepError(error); return; }
    setStepError(""); setStep(next);
    requestAnimationFrame(() => document.getElementById("interview-flow-title")?.focus());
  }

  function generate() {
    if (attachmentName && !file) return void toast.error("Reattach your saved file or remove the attachment reminder before generating.");
    const form = new FormData();
    form.set("name", v.name);
    form.set("objective", v.objective);
    form.set("count", String(count));
    form.set("context", context);
    if (file) form.set("file", file);
    startGenerating(async () => {
      const res = await generateQuestionsAction(form);
      if (!res.ok) return void toast.error(res.error);
      setV((p) => ({
        ...p,
        questions: res.questions.map((q) => ({ id: nanoid(8), question: q, followUps: 1 })),
        description: p.description || res.description,
      }));
      if (guided) { setStep(2); setStepError(""); requestAnimationFrame(() => document.getElementById("interview-flow-title")?.focus()); }
      toast.success(`Drafted ${res.questions.length} questions. Edit anything you like.`);
    });
  }

  function updateQuestion(i: number, patch: Partial<InterviewInput["questions"][number]>) {
    set("questions", v.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  }
  function moveQuestion(i: number, dir: -1 | 1) {
    const qs = [...v.questions];
    [qs[i], qs[i + dir]] = [qs[i + dir], qs[i]];
    set("questions", qs);
  }

  function onLogo(f: File | undefined) {
    if (!f) return;
    if (f.size > 300_000) return void toast.error("Logo must be under 300 KB.");
    const reader = new FileReader();
    reader.onload = () => set("logoUrl", String(reader.result));
    reader.readAsDataURL(f);
  }

  function save() {
    if (guided) {
      const error = guidedStepError(draftState, 2);
      if (error || !persona) { setStepError(error || "Choose an available interviewer."); setStep(2); return; }
    }
    const allowedEmails = emailsText
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    startSaving(async () => {
      const res = await saveInterviewAction(interviewId, { ...v, allowedEmails });
      if (!res.ok) return void toast.error(res.error);
      if (draftKey && !draft.clear()) toast.warning("Interview created, but the local draft could not be removed. Clear it before starting another interview.");
      toast.success(interviewId ? "Changes saved" : "Interview created");
      router.push(`/dashboard/interviews/${res.id}${interviewId ? "" : "?share=1"}`);
      router.refresh();
    });
  }

  const canGenerate = v.name.trim() && v.objective.trim();

  if (!draft.ready) return <p role="status" className="py-8 text-sm text-muted-foreground">Loading saved draft…</p>;

  return (
    <>
    {draftKey && <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Interview editor mode" className="flex gap-1 rounded-lg border p-1">
          <Button variant={guided ? "secondary" : "ghost"} size="sm" type="button" aria-pressed={guided} disabled={saving || generating} onClick={() => setGuided(true)}>Guided setup</Button>
          <Button variant={!guided ? "secondary" : "ghost"} size="sm" type="button" aria-pressed={!guided} disabled={saving || generating} onClick={() => { setGuided(false); setStepError(""); }}>Full editor</Button>
        </div>
        <Button type="button" variant="ghost" size="sm" disabled={saving || generating} onClick={() => {
          if (!window.confirm("Discard this interview draft and start again? This only removes this draft from this device.")) return;
          if (!draft.clear()) return void toast.error("Draft could not be discarded. It may have changed in another tab.");
          window.location.reload();
        }}>Discard draft</Button>
      </div>
      {draft.restored && <p className="text-sm font-medium">Saved draft restored. Review it before creating your interview.</p>}
      <p role="status" aria-live="polite" className="text-xs text-muted-foreground">{draft.status}</p>
      <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">About draft privacy</summary><p className="mt-2">Stored in this browser, not synced across devices. Avoid sensitive information on shared devices. Expired drafts are removed when you next open this editor.</p></details>
      {attachmentName && !file && <div role="alert" className="rounded-lg border p-3 text-sm">Reattach “{attachmentName}” to use it for question generation. <button type="button" className="underline" onClick={() => setAttachmentName("")}>Remove attachment reminder</button></div>}
    </div>}
    {guided && <div className="mb-6 space-y-4">
      <nav aria-label="Interview setup progress"><ol className="grid grid-cols-3 gap-2">{["Describe the role", "Review questions", "Launch and share"].map((label, index) => <li key={label}><button type="button" aria-current={step === index + 1 ? "step" : undefined} disabled={saving || generating} onClick={() => goTo((index + 1) as 1 | 2 | 3)} className={cn("w-full rounded-lg border p-3 text-left text-xs sm:text-sm", step === index + 1 ? "border-primary bg-secondary font-medium" : "text-muted-foreground")}><span className="mb-1 block text-xs">Step {index + 1}</span>{label}</button></li>)}</ol></nav>
      <h2 id="interview-flow-title" tabIndex={-1} className="text-xl font-semibold outline-none">{["Describe the role", "Review your questions and format", "Review, launch and share"][step - 1]}</h2>
      {step === 3 && <p className="text-sm text-muted-foreground">{v.name} · {v.questions.length} questions · {v.durationMins} minutes. Creating the interview opens its sharing options; it does not send email invitations.</p>}
    </div>}
    {stepError && <p role="alert" className="mb-4 rounded-lg border border-destructive/40 p-3 text-sm">{stepError}</p>}
    <div className={cn("grid gap-6", (!guided || step === 3) && "lg:grid-cols-[minmax(0,1fr)_320px]")}>
      <div className="space-y-6">
        {(!guided || step === 1) && <Section title="The role" hint="Only you see the objective. The AI uses it to decide what to dig into.">
          <div className="space-y-1.5">
            <Label htmlFor="name">Interview name</Label>
            <Input
              id="name"
              value={v.name}
              maxLength={120}
              placeholder="Role and interview round"
              onChange={(e) => set("name", e.target.value)}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="objective">Objective</Label>
            <Textarea
              id="objective"
              value={v.objective}
              rows={3}
              maxLength={4000}
              placeholder="Describe the skills and experience this interview should assess."
              onChange={(e) => set("objective", e.target.value)}
            />
          </div>
        </Section>}

        {(!guided || step !== 3) && <Section
          title={guided && step === 1 ? "Job description" : "Questions"}
          hint="Generate a draft from the job description, then edit freely. The interviewer asks them in order and adds follow-ups."
        >
          <div className="rounded-xl bg-muted/60 p-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              {(!guided || step === 1) && <div className="space-y-1.5">
                <Label htmlFor="context">Job description (optional)</Label>
                <Textarea
                  id="context"
                  value={context}
                  rows={3}
                  maxLength={30000}
                  placeholder="Paste the job description or notes here, or attach a PDF."
                  onChange={(e) => setContext(e.target.value)}
                  className="bg-background"
                />
                <div className="flex flex-wrap items-center gap-2">
                  {file ? (
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-background px-2 py-1 text-sm">
                      <FileTextIcon className="size-4 shrink-0" /><span className="min-w-0 break-all">{file.name}</span>
                      <button type="button" aria-label="Remove file" onClick={() => { setFile(null); setAttachmentName(""); }}>
                        <XIcon className="size-3.5" />
                      </button>
                    </span>
                  ) : (
                    <Label className="cursor-pointer text-sm font-normal text-primary underline underline-offset-4">
                      Attach PDF or text file
                      <input
                        type="file"
                        accept=".pdf,.txt,.md,application/pdf,text/plain"
                        className="sr-only"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      />
                    </Label>
                  )}
                </div>
              </div>}
              <div className="flex flex-col justify-end gap-2 sm:w-44">
                <div className="space-y-1.5">
                  <Label>How many questions</Label>
                  <Select value={String(count)} onValueChange={(x) => setCount(Number(x))}>
                    <SelectTrigger className="w-full bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[3, 4, 5, 6, 7, 8, 10, 12].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} questions
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" onClick={generate} disabled={!canGenerate || generating} className="h-10">
                  {generating ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                  {v.questions.length ? "Regenerate" : "Generate"}
                </Button>
              </div>
            </div>
            {!canGenerate && (
              <p className="mt-3 text-xs text-muted-foreground">Add a name and objective to generate questions.</p>
            )}
          </div>

          {(!guided || step === 2) && v.questions.length > 0 && (
            <ol className="space-y-3">
              {v.questions.map((q, i) => (
                <li key={q.id} className="flex gap-3 rounded-xl border bg-background p-3">
                  <span className="mt-2 w-5 shrink-0 text-right font-heading text-sm font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Textarea
                      value={q.question}
                      rows={2}
                      maxLength={500}
                      aria-label={`Question ${i + 1}`}
                      onChange={(e) => updateQuestion(i, { question: e.target.value })}
                      className="min-h-0 resize-none border-0 p-1 shadow-none focus-visible:ring-1"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Select
                        value={String(q.followUps)}
                        onValueChange={(x) => updateQuestion(i, { followUps: Number(x) })}
                      >
                        <SelectTrigger size="sm" className="w-auto" aria-label="Follow-up questions">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">No follow-ups</SelectItem>
                          <SelectItem value="1">Up to 1 follow-up</SelectItem>
                          <SelectItem value="2">Up to 2 follow-ups</SelectItem>
                          <SelectItem value="3">Up to 3 follow-ups</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => moveQuestion(i, -1)}>
                          <ArrowUpIcon />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === v.questions.length - 1} onClick={() => moveQuestion(i, 1)}>
                          <ArrowDownIcon />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Delete question" onClick={() => set("questions", v.questions.filter((_, j) => j !== i))}>
                          <Trash2Icon />
                        </Button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {(!guided || step === 2) && <Button
            type="button"
            variant="outline"
            disabled={v.questions.length >= 25 || generating}
            onClick={() => set("questions", [...v.questions, { id: nanoid(8), question: "", followUps: 1 }])}
          >
            <PlusIcon /> Add a question
          </Button>}
        </Section>}

        {(!guided || step === 2) && <Section title="Interviewer and format">
          <div role="radiogroup" aria-label="Interviewer" className="grid gap-3 sm:grid-cols-2">
            {interviewers.map((p) => {
              const selected = p.id === v.interviewerId;
              return (
                <div
                  key={p.id}
                  role="radio"
                  aria-checked={selected}
                  aria-label={p.name}
                  tabIndex={0}
                  onClick={() => set("interviewerId", p.id)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      set("interviewerId", p.id);
                    }
                  }}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    selected ? "border-primary bg-accent" : "hover:bg-muted/60",
                  )}
                >
                  <VoiceOrb color={p.color} size={48} active={selected} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.name}</p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                    <VoicePreviewButton voice={p.voice} lang={v.language} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Interview language</Label>
              <Select value={v.language} onValueChange={(x) => set("language", x)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label} {l.native !== l.label && <span className="text-muted-foreground">{l.native}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">The interviewer speaks this language. Your report is always in English.</p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Length</Label>
                <span className="text-sm font-medium">{v.durationMins} minutes</span>
              </div>
              <Slider
                min={3}
                max={45}
                step={1}
                value={[v.durationMins]}
                onValueChange={([x]) => set("durationMins", x)}
                aria-label="Interview length in minutes"
              />
              <p className="text-xs text-muted-foreground">The interviewer wraps up when time runs out.</p>
            </div>
          </div>
        </Section>}

        {(!guided || step === 3) && <Section title="What candidates see" hint="Shown on the page candidates open before they start.">
          <div className="space-y-1.5">
            <Label htmlFor="description">Intro for candidates</Label>
            <Textarea
              id="description"
              value={v.description}
              rows={3}
              maxLength={1000}
              placeholder="Describe what candidates should expect from this interview."
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div>
            <div className="space-y-2">
              <Label>Company logo</Label>
              <div className="flex items-center gap-3">
                {v.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.logoUrl} alt="Logo preview" className="h-9 max-w-32 rounded object-contain" />
                ) : (
                  <span className="flex size-9 items-center justify-center rounded-md bg-muted">
                    <ImageIcon className="size-4 text-muted-foreground" />
                  </span>
                )}
                <Button type="button" variant="outline" onClick={() => logoInput.current?.click()}>
                  {v.logoUrl ? "Replace" : "Upload"}
                </Button>
                {v.logoUrl && (
                  <Button type="button" variant="ghost" onClick={() => set("logoUrl", "")}>
                    Remove
                  </Button>
                )}
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="sr-only"
                  onChange={(e) => onLogo(e.target.files?.[0])}
                />
              </div>
            </div>
          </div>
        </Section>}

        {(!guided || step === 3) && <Section title="Access">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="anon">Anonymous responses</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Don&apos;t ask candidates for their name and email. Useful for surveys and practice rounds.
              </p>
            </div>
            <Switch id="anon" checked={v.isAnonymous} onCheckedChange={(x) => setV((p) => ({ ...p, isAnonymous: x, invitationOnly: x ? false : p.invitationOnly }))} />
          </div>
          {!v.isAnonymous && (
            <div className="space-y-1.5">
              <Label htmlFor="invite-only">Require personal email invitations</Label>
              <Switch id="invite-only" checked={v.invitationOnly} onCheckedChange={(x) => set("invitationOnly", x)} />
              <p className="text-xs text-muted-foreground">Prevents access through the public link. Send invitations from the interview dashboard.</p>
              <Label htmlFor="emails">Email allowlist (optional)</Label>
              <Textarea
                id="emails"
                rows={3}
                value={emailsText}
                maxLength={500000}
                placeholder="Leave empty to let anyone with the link respond. Or paste emails, one per line."
                onChange={(e) => setEmailsText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">An allowlist requires a personal invitation for each address; saving it does not send emails.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="retention-days">Data retention (days)</Label>
            <Input id="retention-days" type="number" min={1} max={3650} value={v.retentionDays} onChange={(e) => set("retentionDays", Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">Applies to new responses. Scheduled cleanup must be configured by your administrator. Existing records are not silently deleted.</p>
          </div>
        </Section>}
      </div>

      {(!guided || step === 3) && <aside className="lg:sticky lg:top-8 lg:self-start">
        <p className="mb-2 text-sm font-medium text-muted-foreground">Candidate preview</p>
        <div data-candidate-preview="" className="dark overflow-hidden rounded-lg border bg-background text-foreground">
          <div className="h-1 bg-secondary" />
          <div className="flex flex-col items-center px-5 pb-6 pt-5 text-center">
            {v.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.logoUrl} alt="" className="mb-3 h-8 max-w-36 object-contain" />
            )}
            <VoiceOrb color={CANDIDATE_ORB_COLOR} size={110} />
            <p className="max-w-full break-words font-heading text-lg font-semibold leading-tight">{v.name || "Interview name"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              With {persona?.name ?? "your interviewer"}, about {v.durationMins} min
            </p>
            <p className="mt-3 line-clamp-5 text-sm text-muted-foreground">
              {v.description || "Your intro for candidates appears here."}
            </p>
            <span
              className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Start interview
            </span>
          </div>
        </div>

        <div className="mt-4 flex gap-2 bg-background py-3">
          <Button type="button" variant="outline" className="h-10" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="button" className="h-10 flex-1" disabled={saving} onClick={save}>
            {saving && <Loader2Icon className="animate-spin" />}
            {interviewId ? "Save changes" : "Create interview"}
          </Button>
        </div>
      </aside>}
    </div>
    {guided && <div className="mt-6 flex items-center justify-between gap-3 border-t pt-4">
      <Button type="button" variant="outline" disabled={saving || generating || step === 1} onClick={() => goTo((step - 1) as 1 | 2)}>Back</Button>
      {step < 3 && <Button type="button" disabled={saving || generating} onClick={() => goTo((step + 1) as 2 | 3)}>{step === 1 ? "Continue to questions" : "Review and launch"}</Button>}
    </div>}
    </>
  );
}
