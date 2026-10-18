import { expect, it } from "vitest";
import { activeRecordingTurn, applyRecordingTimeline, parseRecordingTimeline, recordingCues, recordingTimestamp } from "@/lib/recording-timeline";
import type { TranscriptTurn } from "@/lib/db/schema";

const transcript: TranscriptTurn[] = [
  { role: "agent", text: "Hello", at: 1_000_000 },
  { role: "user", text: "My answer", at: 1_050_000 },
  { role: "agent", text: "Thank you", at: 1_060_000 },
];
const timeline = { version: 1 as const, durationMs: 3000, turns: [{ turnIndex: 0, offsetMs: 0 }, { turnIndex: 1, offsetMs: 600 }, { turnIndex: 2, offsetMs: 2400 }] };

it("uses captured offsets without deriving positions from server timestamps or changing text", () => {
  const parsed = parseRecordingTimeline(JSON.stringify(timeline), 3, 5000);
  const timed = applyRecordingTimeline(transcript, parsed);
  expect(timed.map((t) => t.recordingOffsetMs)).toEqual([0, 600, 2400]);
  expect(timed.map(({ role, text, at }) => ({ role, text, at }))).toEqual(transcript);
  expect(transcript.every((t) => t.recordingOffsetMs === undefined)).toBe(true);
});

it("preserves legacy and partial transcripts without invented timestamps", () => {
  expect(parseRecordingTimeline(null, 3, 5000)).toBeNull();
  expect(recordingCues(applyRecordingTimeline(transcript, null))).toEqual([]);
  const partial = applyRecordingTimeline(transcript, { ...timeline, turns: [timeline.turns[1]] });
  expect(recordingCues(partial)).toEqual([{ turnIndex: 1, offsetMs: 600 }]);
  expect(partial[0].recordingOffsetMs).toBeUndefined();
});

it("rejects malformed, duplicate, reversed, out-of-range and oversized timing payloads", () => {
  for (const raw of ["invalid JSON", "x".repeat(20_001), JSON.stringify({ ...timeline, version: 2 }),
    JSON.stringify({ ...timeline, injected: "extra" }),
    JSON.stringify({ ...timeline, durationMs: 999_999 }),
    ...[
      [{ turnIndex: -1, offsetMs: 0 }], [{ turnIndex: 3, offsetMs: 0 }], [{ turnIndex: 0, offsetMs: -1 }],
      [{ turnIndex: 0, offsetMs: 5000 }], [{ turnIndex: 0, offsetMs: 0.5 }],
      [{ turnIndex: 0, offsetMs: 0 }, { turnIndex: 0, offsetMs: 100 }],
      [{ turnIndex: 1, offsetMs: 300 }, { turnIndex: 0, offsetMs: 400 }],
      [{ turnIndex: 0, offsetMs: 300 }, { turnIndex: 1, offsetMs: 200 }],
    ].map((turns) => JSON.stringify({ ...timeline, turns })),
  ]) expect(() => parseRecordingTimeline(raw, 3, 5000)).toThrow(/Invalid recording timing/);
});

it("highlights only the last captured turn at or before the playhead", () => {
  const cues = timeline.turns;
  expect(activeRecordingTurn(cues, 0)).toBe(0);
  expect(activeRecordingTurn(cues, 0.6)).toBe(1);
  expect(activeRecordingTurn(cues, 1.5)).toBe(1);
  expect(activeRecordingTurn(cues, 2.4)).toBe(2);
  expect(activeRecordingTurn(cues, Number.NaN)).toBeNull();
  expect(activeRecordingTurn([], 10)).toBeNull();
  expect(activeRecordingTurn([{ turnIndex: 1, offsetMs: 600 }], 0)).toBeNull();
});

it("does not expose corrupt historical offsets as playable cues", () => {
  const timed = [0, -1, Number.NaN, 300, 200, 400].map((recordingOffsetMs) => ({ ...transcript[0], recordingOffsetMs }));
  expect(recordingCues(timed)).toEqual([{ turnIndex: 0, offsetMs: 0 }, { turnIndex: 3, offsetMs: 300 }, { turnIndex: 5, offsetMs: 400 }]);
  expect(recordingTimestamp(65_999)).toBe("1:05");
});
