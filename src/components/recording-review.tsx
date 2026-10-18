"use client";

import { Loader2Icon, PlayIcon } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { activeRecordingTurn, recordingTimestamp, type RecordingCue } from "@/lib/recording-timeline";
import { cn } from "@/lib/utils";

type Review = {
  registerAudio: (element: HTMLAudioElement | null) => void;
  offsets: Map<number, number>;
  activeTurn: number | null;
  duration: number | null;
  setDuration: (seconds: number) => void;
  updatePlayhead: (seconds: number) => void;
  canSeek: (index: number) => boolean;
  seekTo: (index: number) => void;
  playbackError: string;
};
const ReviewContext = createContext<Review | null>(null);
function useReview() {
  const review = useContext(ReviewContext);
  if (!review) throw new Error("Recording review provider is missing");
  return review;
}

export function RecordingReviewProvider({ cues, children }: { cues: RecordingCue[]; children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const registerAudio = useCallback((element: HTMLAudioElement | null) => { audio.current = element; }, []);
  const [activeTurn, setActiveTurn] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [playbackError, setPlaybackError] = useState("");
  const offsets = useMemo(() => new Map(cues.map((cue) => [cue.turnIndex, cue.offsetMs])), [cues]);
  const canSeek = (index: number) => {
    const offset = offsets.get(index);
    return duration !== null && offset !== undefined && offset < duration * 1000;
  };
  const updatePlayhead = (seconds: number) => setActiveTurn(activeRecordingTurn(cues, seconds));
  const seekTo = (index: number) => {
    const el = audio.current;
    const offset = offsets.get(index);
    if (!el || offset === undefined || !canSeek(index)) return;
    setPlaybackError("");
    try {
      el.currentTime = offset / 1000;
      updatePlayhead(offset / 1000);
      void el.play().catch(() => setPlaybackError("Playback couldn't start. Use the recording's play control to try again."));
    } catch { setPlaybackError("Couldn't seek to this segment. Try the recording controls."); }
  };
  return <ReviewContext.Provider value={{ registerAudio, offsets, activeTurn, duration, setDuration, updatePlayhead, canSeek, seekTo, playbackError }}>{children}</ReviewContext.Provider>;
}

/** Blob playback retains seeking support for MediaRecorder WebM without duration metadata. */
export function RecordingPlayer({ responseId }: { responseId: string }) {
  const review = useReview();
  const audio = useRef<HTMLAudioElement>(null);
  const { registerAudio } = review;
  const attachAudio = useCallback((element: HTMLAudioElement | null) => {
    audio.current = element;
    registerAudio(element);
  }, [registerAudio]);
  const [src, setSrc] = useState<string>();
  const [error, setError] = useState(false);
  const scanning = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    fetch(`/api/recordings/${responseId}`, { signal: controller.signal })
      .then((result) => result.ok ? result.blob() : Promise.reject())
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [responseId]);

  const readDuration = () => {
    const el = audio.current;
    if (!el) return;
    if (Number.isFinite(el.duration) && el.duration > 0) {
      // Only reset once. A later user seek must never be overwritten by this scan.
      if (scanning.current) { scanning.current = false; el.currentTime = 0; }
      review.setDuration(el.duration);
    } else if (el.readyState >= 1 && !scanning.current) {
      scanning.current = true;
      el.currentTime = 1e7;
    }
  };
  const updateTime = () => {
    if (scanning.current) { readDuration(); return; }
    if (audio.current) review.updatePlayhead(audio.current.currentTime);
  };

  if (error) return <p role="alert" className="text-sm text-muted-foreground">The recording couldn&apos;t be loaded. Refresh the page to retry.</p>;
  if (!src) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" /> Loading recording</p>;
  return (
    <>
      <audio ref={attachAudio} src={src} controls preload="metadata" aria-label="Interview recording"
        onLoadedMetadata={readDuration} onDurationChange={readDuration} onTimeUpdate={updateTime}
        onSeeked={updateTime} onPlay={updateTime} onError={() => { review.setDuration(0); setError(true); }} className="w-full" />
      <p className="mt-3 text-xs text-muted-foreground">{review.offsets.size
        ? "Select a transcript timestamp or evidence link to play that segment. Times mark approximate turn starts, including thinking pauses; they are not word-level alignment."
        : "Audio timestamps were not captured for this interview. Transcript links still work."}</p>
      {review.playbackError && <p role="status" className="mt-2 text-sm text-destructive">{review.playbackError}</p>}
    </>
  );
}

export function TurnAudioButton({ index }: { index: number }) {
  const review = useReview();
  const offset = review.offsets.get(index);
  if (offset === undefined) return null;
  return <button type="button" disabled={!review.canSeek(index)} onClick={() => review.seekTo(index)}
    data-offset-ms={offset}
    aria-label={`Play transcript turn ${index + 1} at ${recordingTimestamp(offset)}`}
    className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40">
    <PlayIcon className="size-3" /> {recordingTimestamp(offset)}
  </button>;
}

export function TranscriptEntry({ index, children }: { index: number; children: ReactNode }) {
  const { activeTurn } = useReview();
  return <li id={`turn-${index}`} aria-current={activeTurn === index ? "true" : undefined}
    className={cn("flex scroll-mt-8 gap-2.5 rounded-lg border border-transparent p-2", activeTurn === index && "border-primary/30 bg-primary/10")}>{children}</li>;
}

export function EvidenceLink({ index, children }: { index: number; children: ReactNode }) {
  const review = useReview();
  const playable = review.canSeek(index);
  const offset = review.offsets.get(index);
  return <a href={`#turn-${index}`} onClick={() => { if (playable) review.seekTo(index); }}
    aria-label={playable ? `Play evidence from transcript turn ${index + 1}` : undefined}
    className="mt-2 block text-sm underline underline-offset-4">
    {children}{playable && offset !== undefined && <span> · audio {recordingTimestamp(offset)}</span>}
  </a>;
}
