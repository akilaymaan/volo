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

export type PublicInterview = {
  id: string;
  name: string;
  description: string;
  durationMins: number;
  isAnonymous: boolean;
  themeColor: string;
  logoUrl: string | null;
  languageLabel: string;
  interviewer: { name: string; color: string };
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

function Shell({ interview, children }: { interview: PublicInterview; children: React.ReactNode }) {
  return (
    <div className="dark flex min-h-dvh flex-col bg-background text-foreground">
      <div className="h-1" style={{ background: interview.themeColor }} />
      {children}
      <p className="pb-4 text-center text-xs text-muted-foreground">
        Powered by <span className="font-heading font-semibold">Volo</span>
      </p>
    </div>
  );
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

  const engine = useRef<VoiceEngine | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const responseId = useRef("");
  const ended = useRef(false);
  const startedAt = useRef(0);
  const tabRef = useRef(0);
  const transcriptLen = useRef(0);
  const inflight = useRef<Promise<unknown> | null>(null);
  const meter = useRef<HTMLSpanElement>(null);

  const agentLevel = useCallback(() => engine.current?.agentLevel() ?? 0, []);
  const micLevel = useCallback(() => engine.current?.micLevel() ?? 0, []);

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
    await fetch("/api/call/end", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ responseId: id, tabSwitches: tabRef.current }),
    }).catch(() => {});
    if (recording && recording.size > 0) {
      const form = new FormData();
      form.set("responseId", id);
      form.set("file", recording, "interview");
      await fetch("/api/call/recording", { method: "POST", body: form }).catch(() => {});
    }
  }, []);

  // Hard stop shortly after the planned length, in case the interviewer runs long
  useEffect(() => {
    if (phase === "live" && elapsed > interview.durationMins * 60 + 90) void finish();
  }, [elapsed, phase, interview.durationMins, finish]);

  // ---------- the conversation loop ----------
  const converse = useCallback(async () => {
    const eng = engine.current!;
    let pending: { chunks?: Blob[]; silent?: boolean } = {};
    let failures = 0;
    while (!ended.current) {
      setLive("thinking");
      const form = new FormData();
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
          await eng.play(b64ToBuffer(reply.audio)).catch(() => {});
        }
        if (reply.end || ended.current) {
          await finish();
          return;
        }
      }

      setLive("listening");
      const heard = await eng.listen();
      if (ended.current) return;
      pending = heard.chunks.length ? { chunks: heard.chunks } : { silent: true };
    }
  }, [finish]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!micStream.current) return;
    setError("");
    // Create audio inside the click so browsers allow playback
    const eng = new VoiceEngine(micStream.current);
    engine.current = eng;
    setPhase("connecting");
    try {
      const res = await fetch("/api/call/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interviewId: interview.id, name, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't start the interview");
      responseId.current = data.responseId;
      setStartedId(data.responseId);
      startedAt.current = Date.now();
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

  // ---------- render ----------
  if (phase === "ended") return <Ended interview={interview} responseId={startedId} name={name} />;

  if (phase === "intro" || phase === "connecting") {
    const formValid = interview.isAnonymous || (name.trim() && /^\S+@\S+\.\S+$/.test(email));
    return (
      <Shell interview={interview}>
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center px-4 py-10">
          {interview.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={interview.logoUrl} alt="Company logo" className="mb-6 h-10 max-w-44 object-contain" />
          )}
          <VoiceOrb color={interview.interviewer.color} size={132} />
          <h1 className="mt-2 text-center text-3xl font-bold">{interview.name}</h1>
          <p className="mt-1 text-center text-muted-foreground">
            A voice conversation with {interview.interviewer.name}, your AI interviewer
          </p>
          {interview.description && <p className="mt-5 text-center leading-relaxed">{interview.description}</p>}

          <ul className="mt-6 grid w-full gap-3 rounded-2xl bg-card p-4 text-sm sm:grid-cols-2">
            <li className="flex items-center gap-2">
              <ClockIcon className="size-4 text-mint" /> About {interview.durationMins} minutes
            </li>
            <li className="flex items-center gap-2">
              <LanguagesIcon className="size-4 text-mint" /> In {interview.languageLabel}
            </li>
            <li className="flex items-center gap-2">
              <HeadphonesIcon className="size-4 text-mint" /> A quiet room, headphones help
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
                    <CheckIcon className="size-4 text-mint" /> Microphone connected. Say something to test it.
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <span ref={meter} className="block h-full rounded-full bg-mint transition-[width] duration-75" style={{ width: 0 }} />
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

            <label className="flex items-start gap-3 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--mint)]"
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
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-white transition-opacity disabled:opacity-40"
              style={{ background: interview.themeColor }}
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
    <Shell interview={interview}>
      <div className="h-0.5 bg-muted">
        <div className="h-full bg-mint transition-[width] duration-500" style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} />
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
          <VoiceOrb color={interview.interviewer.color} size={240} getLevel={agentLevel} active={live !== "listening"} />
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
            className="inline-flex h-12 items-center gap-2 rounded-full bg-mint px-6 font-semibold text-[#06201a] transition-opacity disabled:opacity-30"
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
      <span ref={ring} className={cn("absolute inset-0 rounded-full transition-colors", active ? "bg-mint/30" : "bg-muted")} />
      <MicIcon className={cn("relative size-5", active ? "text-mint" : "text-muted-foreground")} />
    </span>
  );
}

function Ended({ interview, responseId, name }: { interview: PublicInterview; responseId: string; name: string }) {
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
    <Shell interview={interview}>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-10 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-mint/20">
          <CheckIcon className="size-8 text-mint" />
        </span>
        <h1 className="mt-5 text-3xl font-bold">{responseId ? `Thank you${name ? `, ${name.split(" ")[0]}` : ""}!` : "Interview closed"}</h1>
        <p className="mt-2 text-muted-foreground">
          {responseId
            ? "You're all done. The hiring team will review your conversation and get back to you."
            : "You can close this tab."}
        </p>
        {responseId && (
          <div className="mt-10 w-full rounded-2xl bg-card p-5">
            {sent ? (
              <p className="py-4 font-medium">Thanks for the feedback. You can close this tab.</p>
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
                        rating === i + 1 ? "bg-mint/25 ring-2 ring-mint" : "bg-muted",
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
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-mint font-semibold text-[#06201a] disabled:opacity-40"
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
