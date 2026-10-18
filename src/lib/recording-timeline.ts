import { z } from "zod";
import { LIMITS } from "@/lib/constants";
import type { TranscriptTurn } from "@/lib/db/schema";
import { PublicError } from "@/lib/errors";

export type RecordingCue = { turnIndex: number; offsetMs: number };
export type RecordingTimeline = { version: 1; durationMs: number; turns: RecordingCue[] };
const MAX_DURATION_MS = 3 * 60 * 60_000;
const Timeline = z.object({
  version: z.literal(1),
  durationMs: z.number().int().min(1).max(MAX_DURATION_MS),
  turns: z.array(z.object({
    // The final two-turn append can cross the existing maxTurns guard by one.
    turnIndex: z.number().int().min(0).max(LIMITS.maxTurns),
    offsetMs: z.number().int().min(0).max(MAX_DURATION_MS),
  }).strict()).max(LIMITS.maxTurns + 1),
}).strict();

/** Timing is candidate-supplied navigation metadata, never scoring or integrity evidence. */
export function parseRecordingTimeline(raw: FormDataEntryValue | null, turnCount: number, elapsedMs: number): RecordingTimeline | null {
  if (raw === null) return null; // Old clients/recordings remain valid without invented cues.
  const invalid = () => { throw new PublicError("Invalid recording timing data"); };
  if (typeof raw !== "string" || raw.length > 20_000) return invalid();
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch { return invalid(); }
  const parsed = Timeline.safeParse(decoded);
  if (!parsed.success) return invalid();
  const timeline = parsed.data;
  if (timeline.durationMs > elapsedMs + 5_000) return invalid();
  let previousIndex = -1;
  let previousOffset = -1;
  for (const cue of timeline.turns) {
    if (cue.turnIndex >= turnCount || cue.turnIndex <= previousIndex ||
        cue.offsetMs < previousOffset || cue.offsetMs > timeline.durationMs) return invalid();
    previousIndex = cue.turnIndex;
    previousOffset = cue.offsetMs;
  }
  return timeline;
}

export function applyRecordingTimeline(transcript: TranscriptTurn[], timeline: RecordingTimeline | null): TranscriptTurn[] {
  if (!timeline) return transcript;
  const offsets = new Map(timeline.turns.map((cue) => [cue.turnIndex, cue.offsetMs]));
  return transcript.map((turn, index) => {
    const clean = { ...turn };
    delete clean.recordingOffsetMs;
    const offset = offsets.get(index);
    return offset === undefined ? clean : { ...clean, recordingOffsetMs: offset };
  });
}

export function recordingCues(transcript: TranscriptTurn[]): RecordingCue[] {
  let previousOffset = -1;
  return transcript.flatMap((turn, turnIndex) => {
    const offsetMs = turn.recordingOffsetMs;
    if (offsetMs === undefined || !Number.isInteger(offsetMs) || offsetMs < 0 ||
        offsetMs > MAX_DURATION_MS || offsetMs < previousOffset) return [];
    previousOffset = offsetMs;
    return [{ turnIndex, offsetMs }];
  });
}

export function activeRecordingTurn(cues: RecordingCue[], seconds: number): number | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return cues.findLast((cue) => cue.offsetMs <= seconds * 1000)?.turnIndex ?? null;
}

export function recordingTimestamp(offsetMs: number) {
  const seconds = Math.floor(offsetMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
