import { describe, expect, it } from "vitest";
import { interviewerMessages, SILENCE_MARKER } from "@/lib/ai/prompts";
import { toCsv } from "@/lib/csv";
import { TurnDetector } from "@/lib/voice-engine";

describe("TurnDetector", () => {
  const opts = { endSilenceMs: 4000, noSpeechMs: 10_000 };
  // Speech-like level: syllables with a short dip between words every 300ms
  const speech = (t: number, loud: number, floor: number) => (t % 300 < 60 ? floor : loud);

  /** Feeds levels every 50ms until `until`; returns the first non-"continue" action and when. */
  const run = (level: (t: number) => number, until: number) => {
    const d = new TurnDetector(0, opts);
    for (let t = 50; t <= until; t += 50) {
      const a = d.tick(level(t), t);
      if (a !== "continue" && a !== "rotate") return { a, t };
    }
    return { a: "continue", t: until };
  };

  it("reports silence when nobody speaks", () => {
    expect(run(() => 0.002, 20_000)).toEqual({ a: "silent", t: 10_050 });
  });

  it("ends about 4s after the candidate stops", () => {
    const r = run((t) => (t < 5000 ? speech(t, 0.05, 0.003) : 0.003), 20_000);
    expect(r.a).toBe("end");
    expect(r.t).toBeGreaterThanOrEqual(9000);
    expect(r.t).toBeLessThan(9300);
  });

  // Regression: the noise floor used to absorb quiet speech and cut answers off after ~10s
  it("lets a quiet speaker talk for a minute with 3s thinking pauses", () => {
    const level = (t: number) => (t % 15_000 > 12_000 ? 0.002 : speech(t, 0.025, 0.002));
    expect(run(level, 60_000).a).toBe("continue");
  });

  it("adapts to a noisy room: no false speech, still ends after the answer", () => {
    const noise = 0.02;
    expect(run(() => noise, 20_000).a).toBe("silent");
    const r = run((t) => (t < 8000 ? speech(t, 0.09, noise) : noise), 30_000);
    expect(r.a).toBe("end");
    expect(r.t).toBeGreaterThanOrEqual(12_000);
    expect(r.t).toBeLessThan(12_300);
  });

  it("rotates long answers at a pause before the 30s STT limit", () => {
    const d = new TurnDetector(0, opts);
    let t = 0;
    let action = "continue";
    while (action === "continue" && t < 40_000) {
      t += 50;
      action = d.tick(t % 1000 < 100 ? 0.001 : 0.3, t);
    }
    expect(action).toBe("rotate");
    expect(t).toBeGreaterThan(22_000);
    expect(t).toBeLessThanOrEqual(27_100);
  });
});

describe("interviewerMessages", () => {
  it("starts with a user turn, merges same-role turns and stamps the time on the last candidate turn", () => {
    const msgs = interviewerMessages(
      [
        { role: "agent", text: "Hello!", at: 0 },
        { role: "user", text: "Hi", at: 1 },
        { role: "user", text: SILENCE_MARKER, at: 2 },
      ],
      125,
      10,
    );
    expect(msgs[0]).toEqual({ role: "user", content: "[The candidate has joined the call.]" });
    expect(msgs).toHaveLength(3);
    expect(msgs[2].role).toBe("user");
    expect(msgs[2].content).toContain("Hi\n[The candidate stayed silent");
    expect(msgs[2].content).toMatch(/\[Time: 2:05 of 10:00\]$/);
  });
});

describe("toCsv", () => {
  it("quotes fields and neutralizes spreadsheet formulas", () => {
    expect(toCsv([["a", 'say "hi"', 3, null], ["=SUM(A1)", "+1", "-x", "@cmd"]])).toBe(
      `"a","say ""hi""","3",""\r\n"'=SUM(A1)","'+1","'-x","'@cmd"`,
    );
  });
});
