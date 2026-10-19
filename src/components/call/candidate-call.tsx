"use client";

import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  HeadphonesIcon,
  LanguagesIcon,
  Loader2Icon,
  MessageSquareTextIcon,
  MicIcon,
  PhoneOffIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CandidateShell as Shell } from "@/components/call/candidate-shell";
import { CANDIDATE_ORB_COLOR } from "@/lib/candidate-appearance";
import { RecordingRecoveryNotice, RecordingUploadCard } from "@/components/call/recording-recovery";
import { RECOVERY_WINDOW_MS, saveRecordingDraft, type RecordingDraft } from "@/lib/recording-recovery-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VoiceOrb } from "@/components/voice-orb";
import { VoiceEngine } from "@/lib/voice-engine";
import { cn } from "@/lib/utils";
import { CONSENT_VERSION, DISCLOSURE } from "@/lib/privacy";

export type PublicInterview = {
  id: string;
  name: string;
  description: string;
  durationMins: number;
  isAnonymous: boolean;
  retentionDays: number;
  logoUrl: string | null;
  languageLabel: string;
  interviewer: { name: string };
};

type Line = { role: "agent" | "user"; text: string };
type Phase = "intro" | "connecting" | "live" | "ended";
type Live = "speaking" | "listening" | "thinking";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const b64ToBuffer = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;

type TurnReply = { userText: string; say: string; end: boolean; audio?: string; retry?: boolean; error?: string; len: number };

class FatalError extends Error {}

/** Retries network/5xx failures; a 4xx means the session can't continue. */
async function postTurn(form: FormData): Promise<TurnReply> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch("/api/call/turn", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as TurnReply;
      if (res.ok) return data;
      if (res.status < 500) throw new FatalError(data.error || "This interview can't continue");
      if (attempt >= 2) throw new Error(data.error || "Something went wrong");
    } catch (e) {
      if (e instanceof FatalError || attempt >= 2) throw e;
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
}

export function CandidateCall({ interview }: { interview: PublicInterview }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [live, setLive] = useState<Live>("thinking");
  const [lines, setLines] = useState<Line[]>([]);
  const [hint, setHint] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [tabWarning, setTabWarning] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [micError, setMicError] = useState("");
  const [startedId, setStartedId] = useState("");
  const [recovery, setRecovery] = useState<{ draft: RecordingDraft; persisted: boolean } | null>(null);
  const [recordingMessage, setRecordingMessage] = useState("");
  const uploadExpiresAt = useRef(0);

  const engine = useRef<VoiceEngine | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const responseId = useRef("");
  const ended = useRef(false);
  const startedAt = useRef(0);
  const tabRef = useRef(0);
  const transcriptLen = useRef(0);
  const recordingOffsets = useRef(new Map<number, number>());
  const invitationToken = useRef<string | undefined>(undefined);
  const inflight = useRef<Promise<unknown> | null>(null);
  const meter = useRef<HTMLSpanElement>(null);

  const agentLevel = useCallback(() => engine.current?.agentLevel() ?? 0, []);
  const micLevel = useCallback(() => engine.current?.micLevel() ?? 0, []);
  const recordingRemoved = useCallback((_id: string, outcome: "saved" | "discarded" | "expired") => {
    setRecovery(null);
    setRecordingMessage(outcome === "saved" ? "Recording saved successfully. Its local copy was removed. You can close this tab."
      : outcome === "expired" ? "The upload window expired. The local recording copy was removed. Contact the hiring team."
        : "Local recording copy removed. Server-side interview data was not deleted.");
  }, []);

  // ---------- mic check (before the call) ----------
  async function checkMic() {
    setMicError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micStream.current = stream;
      setMicReady(true);
    } catch {
      setMicError("We couldn't access your microphone. Allow microphone access in your browser's address bar, then try again.");
    }
  }

  useEffect(() => {
    if (!micReady || phase !== "intro" || !micStream.current) return;
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(micStream.current).connect(an);
    const buf = new Float32Array(512);
    let raf = 0;
    const tick = () => {
      an.getFloatTimeDomainData(buf);
      const level = Math.min(1, Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length) * 8);
      if (meter.current) meter.current.style.width = `${Math.round(level * 100)}%`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      void ctx.close();
    };
  }, [micReady, phase]);

  // ---------- timer ----------
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 500);
    return () => clearInterval(t);
  }, [phase]);

  // ---------- integrity: tab switches + closing the tab ----------
  useEffect(() => {
    if (phase !== "live") return;
    const onVis = () => {
      if (document.hidden) {
        tabRef.current += 1;
        setTabSwitches(tabRef.current);
        setTabWarning(true);
      }
    };
    const onHide = () => {
      if (ended.current || !responseId.current) return;
      navigator.sendBeacon(
        "/api/call/end",
        new Blob([JSON.stringify({ responseId: responseId.current, tabSwitches: tabRef.current })], { type: "application/json" }),
      );
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [phase]);

  // ---------- finishing ----------
  const finish = useCallback(async () => {
    if (ended.current) return;
    ended.current = true;
    const eng = engine.current;
    eng?.finishTurn();
    eng?.stopPlayback();
    setPhase("ended");
    // Let an answer that's already being processed land in the transcript before the call is scored
    await Promise.race([inflight.current?.catch(() => {}), new Promise((r) => setTimeout(r, 20_000))]);
    const id = responseId.current;
    const recording = await eng?.stopCallRecording().catch(() => null);
    eng?.close();
    if (recording && recording.size > 0) {
      const durationMs = eng?.recordingTimeMs();
      const timeline = durationMs && durationMs > 0 ? JSON.stringify({
        version: 1, durationMs,
        turns: [...recordingOffsets.current.entries()].sort(([a], [b]) => a - b)
          .map(([turnIndex, offsetMs]) => ({ turnIndex, offsetMs })),
      }) : null;
      const draft: RecordingDraft = { version: 1, responseId: id, interviewId: interview.id,
        audio: recording, timeline, tabSwitches: tabRef.current, createdAt: Date.now(), expiresAt: uploadExpiresAt.current };
      let persisted = false;
      try { await saveRecordingDraft(draft); persisted = true; } catch { /* Memory-only fallback stays in the ended screen. */ }
      setRecovery({ draft, persisted });
    } else {
      const result = await fetch("/api/call/end", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ responseId: id, tabSwitches: tabRef.current }) }).catch(() => null);
      setRecordingMessage(result?.ok ? "The interview ended, but this browser did not produce a recording. Contact the hiring team if needed."
        : "Could not confirm the interview ended. No recording was available to recover. Contact the hiring team.");
    }
  }, [interview.id]);

  // Hard stop shortly after the planned length, in case the interviewer runs long
  useEffect(() => {
    if (phase === "live" && elapsed > interview.durationMins * 60 + 90) void finish();
  }, [elapsed, phase, interview.durationMins, finish]);

  // ---------- the conversation loop ----------
  const converse = useCallback(async () => {
    const eng = engine.current!;
    let pending: { chunks?: Blob[]; silent?: boolean; recordingOffsetMs?: number | null } = {};
    let failures = 0;
    while (!ended.current) {
      setLive("thinking");
      const form = new FormData();
      const expectedLen = transcriptLen.current;
      form.set("responseId", responseId.current);
      form.set("len", String(transcriptLen.current));
      if (pending.silent) form.set("silent", "1");
      pending.chunks?.forEach((c, i) => form.append("chunk", c, `chunk-${i}`));

      let reply: TurnReply;
      try {
        const req = postTurn(form);
        inflight.current = req;
        reply = await req;
      } catch (e) {
        if (ended.current) return;
        if (e instanceof FatalError) {
          toast.error(e.message);
          await finish();
          return;
        }
        if (++failures >= 3) {
          toast.error("We hit a technical problem and had to end the interview. Your answers so far were saved.");
          await finish();
          return;
        }
        setError(e instanceof Error ? e.message : "Connection problem");
        // Give the network a moment, then try the same turn again
        await new Promise((r) => setTimeout(r, 3000));
        setError("");
        continue;
      }
      if (ended.current) return;
      failures = 0;
      if (typeof reply.len === "number") transcriptLen.current = reply.len;
      // A saved-but-lost reply replays with empty userText; the transcript position
      // still identifies the answer that was just recorded before that request.
      if (!reply.retry && reply.len === expectedLen + 2 && pending.recordingOffsetMs != null)
        recordingOffsets.current.set(expectedLen, pending.recordingOffsetMs);

      if (reply.retry) {
        setHint("Sorry, I didn't catch that. Please answer again.");
      } else {
        setHint("");
        setLines((l) => [
          ...l,
          ...(reply.userText ? [{ role: "user" as const, text: reply.userText }] : []),
          ...(reply.say ? [{ role: "agent" as const, text: reply.say }] : []),
        ]);
        if (reply.audio) {
          setLive("speaking");
          await eng.play(b64ToBuffer(reply.audio), (offset) => {
            recordingOffsets.current.set(reply.len - 1, offset);
          }).catch(() => {});
        }
        if (reply.end || ended.current) {
          await finish();
          return;
        }
      }

      setLive("listening");
      const heard = await eng.listen();
      if (ended.current) return;
      pending = heard.chunks.length ? { chunks: heard.chunks, recordingOffsetMs: heard.recordingOffsetMs } : { silent: true };
    }
  }, [finish]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!micStream.current) return;
    setError("");
    invitationToken.current ??= new URLSearchParams(window.location.hash.slice(1)).get("invite") || undefined;
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    // Create audio inside the click so browsers allow playback
    const eng = new VoiceEngine(micStream.current);
    engine.current = eng;
    setPhase("connecting");
    try {
      const res = await fetch("/api/call/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interviewId: interview.id, name, email, invitationToken: invitationToken.current, consentVersion: consent ? CONSENT_VERSION : "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't start the interview");
      responseId.current = data.responseId;
      setStartedId(data.responseId);
      startedAt.current = Date.now();
      uploadExpiresAt.current = Math.min(typeof data.recordingExpiresAt === "number" ? data.recordingExpiresAt : Infinity, Date.now() + RECOVERY_WINDOW_MS);
      eng.startCallRecording();
      setPhase("live");
      void converse();
    } catch (err) {
      eng.close();
      engine.current = null;
      micStream.current = null;
      setMicReady(false);
      setPhase("intro");
      setError(err instanceof Error ? err.message : "Couldn't start the interview");
    }
  }

  // Space bar = "I'm done answering"
  useEffect(() => {
    if (phase !== "live" || live !== "listening") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        engine.current?.finishTurn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, live]);

  useEffect(() => () => engine.current?.close(), []);

  useEffect(() => {
    if (phase !== "ended" || recovery || recordingMessage) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase, recovery, recordingMessage]);

  // ---------- render ----------
  if (phase === "ended") return <Ended responseId={startedId} name={name} recovery={recovery} recordingMessage={recordingMessage} onRecordingRemoved={recordingRemoved} />;

  if (phase === "intro" || phase === "connecting") {
    const formValid = interview.isAnonymous || (name.trim() && /^\S+@\S+\.\S+$/.test(email));
    return (
      <Shell recoveryLink={phase === "intro"}>
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center px-4 py-10">
          {interview.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={interview.logoUrl} alt="Company logo" className="mb-6 h-10 max-w-44 object-contain" />
          )}
          <VoiceOrb color={CANDIDATE_ORB_COLOR} size={132} />
          <h1 className="mt-2 text-center text-3xl font-bold">{interview.name}</h1>
          <p className="mt-1 text-center text-muted-foreground">
            A voice conversation with {interview.interviewer.name}, your AI interviewer
          </p>
          {interview.description && <p className="mt-5 text-center leading-relaxed">{interview.description}</p>}
          {phase === "intro" && <RecordingRecoveryNotice interviewId={interview.id} />}

          <ul className="mt-6 grid w-full gap-3 rounded-2xl bg-card p-4 text-sm sm:grid-cols-2">
            <li className="flex items-center gap-2">
              <ClockIcon className="size-4 shrink-0 text-muted-foreground" /> About {interview.durationMins} minutes
            </li>
            <li className="flex items-center gap-2">
              <LanguagesIcon className="size-4 shrink-0 text-muted-foreground" /> In {interview.languageLabel}
            </li>
            <li className="flex items-center gap-2">
              <HeadphonesIcon className="size-4 shrink-0 text-muted-foreground" /> A quiet room, headphones help
            </li>
            <li className="flex items-center gap-2">
              <AlertTriangleIcon className="size-4 text-signal" /> Stay on this tab
            </li>
          </ul>

          <form onSubmit={start} className="mt-6 w-full space-y-4">
            {!interview.isAnonymous && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium">Your name</span>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    className="h-11 w-full rounded-lg border bg-input/30 px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium">Email</span>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="h-11 w-full rounded-lg border bg-input/30 px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </label>
              </div>
            )}

            <div className="rounded-2xl border p-4">
              {micReady ? (
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <CheckIcon className="size-4 text-foreground" /> Microphone connected. Say something to test it.
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <span ref={meter} className="block h-full rounded-full bg-foreground transition-[width] duration-75" style={{ width: 0 }} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">We need your microphone for the interview.</p>
                  <button
                    type="button"
                    onClick={checkMic}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-secondary px-3 text-sm font-medium hover:bg-secondary/80"
                  >
                    <MicIcon className="size-4" /> Allow microphone
                  </button>
                </div>
              )}
              {micError && <p className="mt-2 text-sm text-destructive">{micError}</p>}
            </div>

            <p className="text-sm text-muted-foreground">{DISCLOSURE} Interview data is scheduled for deletion after {interview.retentionDays} days.</p>
            <label className="flex items-start gap-3 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-4"
              />
              I agree that this conversation is recorded, transcribed and analyzed by AI for the hiring team.
            </label>

            {error && (
              <p role="alert" className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!formValid || !micReady || !consent || phase === "connecting"}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-40"
            >
              {phase === "connecting" && <Loader2Icon className="size-5 animate-spin" />}
              Start interview
            </button>
          </form>
        </main>
      </Shell>
    );
  }

  // ---------- live ----------
  const lastAgent = [...lines].reverse().find((l) => l.role === "agent");
  const lastUser = lines.at(-1)?.role === "user" ? lines.at(-1) : undefined;
  const total = interview.durationMins * 60;
  const statusText =
    live === "listening"
      ? "Listening. Take your time."
      : live === "thinking"
        ? lines.length === 0
          ? `${interview.interviewer.name} is joining`
          : "Thinking"
        : `${interview.interviewer.name} is speaking`;

  return (
    <Shell recoveryLink={false}>
      <div className="h-0.5 bg-muted">
        <div className="h-full bg-foreground transition-[width] duration-500" style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} />
      </div>
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <p className="min-w-0 truncate text-sm font-medium">{interview.name}</p>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-card px-3 py-1 font-mono text-sm tabular-nums" aria-label="Elapsed time">
            {fmt(elapsed)} / {fmt(total)}
          </span>
          <button
            type="button"
            onClick={() => setTranscriptOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-full bg-card hover:bg-secondary"
            aria-label="Show conversation"
          >
            <MessageSquareTextIcon className="size-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 pb-6 text-center">
        <div className={cn("transition-transform duration-500", live === "listening" ? "scale-75" : "scale-100")}>
          <VoiceOrb color={CANDIDATE_ORB_COLOR} size={240} getLevel={agentLevel} active={live !== "listening"} />
        </div>
        <p className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          {live === "thinking" && <Loader2Icon className="size-3.5 animate-spin" />}
          {statusText}
        </p>
        <p className="mt-5 min-h-[4.5rem] max-w-xl font-heading text-xl leading-snug sm:text-2xl" aria-live="polite">
          {lastAgent?.text}
        </p>
        {lastUser && live === "thinking" && (
          <p className="mt-4 line-clamp-3 max-w-lg text-sm text-muted-foreground">You said: {lastUser.text}</p>
        )}
        {hint && <p className="mt-4 text-sm text-signal">{hint}</p>}
        {error && (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-signal">
            <Loader2Icon className="size-3.5 animate-spin" /> {error} Reconnecting.
          </p>
        )}
      </main>

      <footer className="flex flex-col items-center gap-3 px-4 pb-6">
        <div className="flex items-center gap-3">
          <MicMeter getLevel={micLevel} active={live === "listening"} />
          <button
            type="button"
            disabled={live !== "listening"}
            onClick={() => engine.current?.finishTurn()}
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 font-semibold text-primary-foreground transition-opacity disabled:opacity-30"
          >
            <CheckIcon className="size-5" /> I&apos;m done answering
          </button>
          <button
            type="button"
            onClick={() => setConfirmEnd(true)}
            className="inline-flex size-12 items-center justify-center rounded-full bg-destructive/20 text-destructive hover:bg-destructive/30"
            aria-label="End interview"
          >
            <PhoneOffIcon className="size-5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {live === "listening" ? "Pausing to think is fine. Stay quiet for 4 seconds or press Space when you're finished." : " "}
        </p>
      </footer>

      <Sheet open={transcriptOpen} onOpenChange={setTranscriptOpen}>
        <SheetContent className="dark w-full bg-background text-foreground sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Conversation so far</SheetTitle>
            <SheetDescription>Live transcript of this interview.</SheetDescription>
          </SheetHeader>
          <ol className="space-y-4 overflow-y-auto px-4 pb-6">
            {lines.map((l, i) => (
              <li key={i} className={cn("rounded-xl px-3 py-2 text-sm", l.role === "agent" ? "bg-card" : "ml-8 bg-accent")}>
                <span className="block text-xs text-muted-foreground">{l.role === "agent" ? interview.interviewer.name : "You"}</span>
                {l.text}
              </li>
            ))}
          </ol>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent className="dark bg-background text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>End the interview now?</AlertDialogTitle>
            <AlertDialogDescription>Your answers so far are sent to the hiring team. You can&apos;t restart.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void finish()}>
              End interview
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={tabWarning} onOpenChange={setTabWarning}>
        <AlertDialogContent className="dark bg-background text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Please stay on this tab</AlertDialogTitle>
            <AlertDialogDescription>
              Leaving the interview tab is noted for the hiring team ({tabSwitches} so far).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Back to the interview</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  );
}

function MicMeter({ getLevel, active }: { getLevel: () => number; active: boolean }) {
  const ring = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const lvl = active ? getLevel() : 0;
      if (ring.current) ring.current.style.transform = `scale(${1 + lvl * 0.6})`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [getLevel, active]);
  return (
    <span className="relative inline-flex size-12 items-center justify-center" aria-label={active ? "Microphone is listening" : "Microphone paused"}>
      <span ref={ring} className={cn("absolute inset-0 rounded-full transition-colors", active ? "bg-foreground/20" : "bg-muted")} />
      <MicIcon className={cn("relative size-5", active ? "text-foreground" : "text-muted-foreground")} />
    </span>
  );
}

function Ended({ responseId, name, recovery, recordingMessage, onRecordingRemoved }: {
  responseId: string; name: string;
  recovery: { draft: RecordingDraft; persisted: boolean } | null; recordingMessage: string;
  onRecordingRemoved: (id: string, outcome: "saved" | "discarded" | "expired") => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const faces = ["😞", "🙁", "😐", "🙂", "😄"];

  async function send() {
    setSending(true);
    const res = await fetch("/api/call/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ responseId, satisfaction: rating, comment }),
    }).catch(() => null);
    setSending(false);
    if (res?.ok) setSent(true);
    else toast.error("Couldn't send feedback. Try again.");
  }

  return (
    <Shell>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-10 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-foreground/10">
          <CheckIcon className="size-8 text-foreground" />
        </span>
        <h1 className="mt-5 text-3xl font-bold">{responseId ? `Thank you${name ? `, ${name.split(" ")[0]}` : ""}!` : "Interview closed"}</h1>
        <p className="mt-2 text-muted-foreground">
          {responseId
            ? "Your interview has ended. Check the recording status below before closing this tab."
            : "You can close this tab."}
        </p>
        {recovery ? <RecordingUploadCard draft={recovery.draft} persisted={recovery.persisted} autoStart onRemoved={onRecordingRemoved} />
          : <p role="status" className="mt-4 text-sm">{recordingMessage || "Preparing recording for upload. Keep this tab open…"}</p>}
        {responseId && (
          <div className="mt-10 w-full rounded-2xl bg-card p-5">
            {sent ? (
              <p className="py-4 font-medium">Thanks for the feedback. Check the recording status above before closing this tab.</p>
            ) : (
              <>
                <p className="font-medium">How was this interview experience?</p>
                <div className="mt-4 flex justify-center gap-2" role="radiogroup" aria-label="Rating">
                  {faces.map((f, i) => (
                    <button
                      key={f}
                      type="button"
                      role="radio"
                      aria-checked={rating === i + 1}
                      aria-label={`${i + 1} out of 5`}
                      onClick={() => setRating(i + 1)}
                      className={cn(
                        "size-11 rounded-full text-2xl transition-transform hover:scale-110",
                        rating === i + 1 ? "bg-foreground/15 ring-2 ring-foreground" : "bg-muted",
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Anything we could do better? (optional)"
                  className="mt-4 w-full rounded-lg border bg-input/30 p-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                />
                <button
                  type="button"
                  disabled={!rating || sending}
                  onClick={send}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-40"
                >
                  {sending && <Loader2Icon className="size-4 animate-spin" />}
                  Send feedback
                </button>
              </>
            )}
          </div>
        )}
      </main>
    </Shell>
  );
}
