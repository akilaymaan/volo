"use client";

// Browser audio for a live interview: mic capture with voice-activity detection, interviewer playback,
// and a mixed (mic + interviewer) recording of the whole call.

const SEGMENT_SOFT_MS = 22_000; // rotate at the next pause after this (Sarvam REST STT takes <30s clips)
const SEGMENT_HARD_MS = 27_000;
const MAX_ANSWER_MS = 4 * 60_000;

export type ListenOptions = {
  /** Silence after speech that ends the answer. */
  endSilenceMs?: number;
  /** No speech at all for this long counts as "silent". */
  noSpeechMs?: number;
};

export type ListenResult = { chunks: Blob[]; silent: boolean };

export function pickMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

function rms(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>) {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

/**
 * Decides when an answer is over from a stream of mic levels. Pure, so it can be unit tested.
 * Feed it one RMS reading per tick; it returns what the recorder should do.
 */
export class TurnDetector {
  // Noise floor = quietest reading of the last ~2s (40 ticks). Speech always has brief gaps that drop to the
  // room's background, so this measures the room without learning from the voice — and it adapts to noisy rooms.
  private recent: number[] = [];
  private speechStarted = false;
  private lastVoiceAt = 0;
  private segmentStart = 0;
  private segmentHadSpeech = false;

  constructor(
    private start: number,
    private opts: Required<ListenOptions>,
  ) {
    this.segmentStart = start;
  }

  get threshold() {
    return Math.max(0.008, Math.min(...this.recent, 1) * 2.5);
  }

  get hadSpeech() {
    return this.segmentHadSpeech;
  }

  tick(level: number, now: number): "continue" | "rotate" | "end" | "silent" {
    this.recent.push(level);
    if (this.recent.length > 40) this.recent.shift();
    const voiced = level > this.threshold;
    if (voiced) {
      this.speechStarted = true;
      this.segmentHadSpeech = true;
      this.lastVoiceAt = now;
    }
    if (!this.speechStarted) return now - this.start > this.opts.noSpeechMs ? "silent" : "continue";
    if (now - this.lastVoiceAt > this.opts.endSilenceMs) return "end";
    if (now - this.start > MAX_ANSWER_MS) return "end";
    const segAge = now - this.segmentStart;
    if (segAge > SEGMENT_HARD_MS || (segAge > SEGMENT_SOFT_MS && !voiced)) return "rotate";
    return "continue";
  }

  rotated(now: number) {
    this.segmentStart = now;
    this.segmentHadSpeech = false;
  }
}

const segments = new WeakMap<MediaRecorder, { parts: Blob[]; chunks: Blob[] }>();

export class VoiceEngine {
  ctx: AudioContext;
  private mic: MediaStream;
  private micAnalyser: AnalyserNode;
  private agentAnalyser: AnalyserNode;
  private mix: MediaStreamAudioDestinationNode;
  private callRecorder: MediaRecorder | null = null;
  private callChunks: Blob[] = [];
  private buf = new Float32Array(1024);
  private finishRequested = false;
  private current: AudioBufferSourceNode | null = null;
  readonly mimeType = pickMimeType();

  /** Must be constructed inside a user gesture so audio can play on iOS. */
  constructor(mic: MediaStream) {
    this.ctx = new AudioContext();
    void this.ctx.resume();
    this.mic = mic;
    const src = this.ctx.createMediaStreamSource(mic);
    this.micAnalyser = this.ctx.createAnalyser();
    this.micAnalyser.fftSize = 1024;
    src.connect(this.micAnalyser);
    this.agentAnalyser = this.ctx.createAnalyser();
    this.agentAnalyser.fftSize = 1024;
    this.agentAnalyser.connect(this.ctx.destination);
    this.mix = this.ctx.createMediaStreamDestination();
    src.connect(this.mix);
    this.agentAnalyser.connect(this.mix);
  }

  micLevel = () => Math.min(1, rms(this.micAnalyser, this.buf) * 6);
  agentLevel = () => Math.min(1, rms(this.agentAnalyser, this.buf) * 5);

  startCallRecording() {
    if (!this.mimeType) return;
    this.callRecorder = new MediaRecorder(this.mix.stream, {
      mimeType: this.mimeType,
      audioBitsPerSecond: 24_000,
    });
    this.callRecorder.ondataavailable = (e) => e.data.size && this.callChunks.push(e.data);
    this.callRecorder.start(5000);
  }

  stopCallRecording(): Promise<Blob | null> {
    const rec = this.callRecorder;
    if (!rec || rec.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(this.callChunks, { type: this.mimeType.split(";")[0] }));
      rec.stop();
    });
  }

  /** Plays interviewer audio; resolves when it finishes (or is stopped). */
  async play(bytes: ArrayBuffer) {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const audio = await this.ctx.decodeAudioData(bytes);
    return new Promise<void>((resolve) => {
      const src = this.ctx.createBufferSource();
      src.buffer = audio;
      src.connect(this.agentAnalyser);
      src.onended = () => {
        this.current = null;
        resolve();
      };
      this.current = src;
      src.start();
    });
  }

  stopPlayback() {
    try {
      this.current?.stop();
    } catch {}
  }

  /** Ends the current answer now (the "I'm done" button). */
  finishTurn() {
    this.finishRequested = true;
  }

  /** Records one answer, split into <30s chunks, ending on a natural pause. */
  listen(opts: ListenOptions = {}): Promise<ListenResult> {
    // 4s, not ~2s: interview answers have thinking pauses; "I'm done" / Space ends a turn instantly
    const o = { endSilenceMs: 4000, noSpeechMs: 30_000, ...opts };
    this.finishRequested = false;
    const chunks: Blob[] = [];
    const start = performance.now();
    const detector = new TurnDetector(start, o);
    let recorder = this.newSegment(chunks);

    return new Promise((resolve) => {
      const timer = setInterval(async () => {
        const now = performance.now();
        const action = this.finishRequested ? "end" : detector.tick(rms(this.micAnalyser, this.buf), now);
        if (action === "continue") return;
        if (action === "rotate") {
          this.stopSegment(recorder, detector.hadSpeech);
          detector.rotated(now);
          recorder = this.newSegment(chunks);
          return;
        }
        clearInterval(timer);
        // A manual "done" keeps the segment even if VAD never heard speech (quiet voices)
        await this.stopSegment(recorder, detector.hadSpeech || this.finishRequested);
        resolve({ chunks: [...chunks], silent: action === "silent" && chunks.length === 0 });
      }, 50);
    });
  }

  private newSegment(chunks: Blob[]) {
    const rec = new MediaRecorder(
      this.mic,
      this.mimeType ? { mimeType: this.mimeType, audioBitsPerSecond: 32_000 } : undefined,
    );
    rec.start();
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    segments.set(rec, { parts, chunks });
    return rec;
  }

  /** Stops a segment; pure-silence segments are dropped so we don't pay to transcribe them. */
  private stopSegment(rec: MediaRecorder, keep: boolean) {
    const seg = segments.get(rec)!;
    return new Promise<void>((done) => {
      rec.addEventListener(
        "stop",
        () => {
          if (keep && seg.parts.length) seg.chunks.push(new Blob(seg.parts, { type: rec.mimeType || this.mimeType }));
          done();
        },
        { once: true },
      );
      rec.stop();
    });
  }

  close() {
    this.stopPlayback();
    this.mic.getTracks().forEach((t) => t.stop());
    void this.ctx.close().catch(() => {});
  }
}
