import { afterEach, expect, it, vi } from "vitest";
import { RECOVERY_WINDOW_MS, validRecordingDraft, type RecordingDraft } from "@/lib/recording-recovery-store";
import { RecordingUploadError, uploadFailure, uploadRecording } from "@/lib/recording-upload";

const draft = (): RecordingDraft => ({ version: 1, responseId: "response", interviewId: "role", audio: new Blob(["audio"], { type: "audio/webm" }),
  timeline: null, tabSwitches: 2, createdAt: Date.now(), expiresAt: Date.now() + 60_000 });
const options = () => ({ signal: new AbortController().signal, progress: vi.fn(), stage: vi.fn() });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("accepts only bounded, unexpired recovery records", () => {
  const valid = draft();
  expect(validRecordingDraft(valid)).toBe(true);
  for (const patch of [{ version: 2 }, { responseId: undefined }, { interviewId: "../other" }, { audio: new Blob() },
    { audio: "audio" }, { timeline: "x".repeat(20_001) }, { expiresAt: Date.now() - 1 },
    { createdAt: NaN }, { createdAt: Date.now() + 1000 }, { expiresAt: valid.createdAt + RECOVERY_WINDOW_MS + 1 }, { tabSwitches: -1 }]) {
    expect(validRecordingDraft({ ...valid, ...patch })).toBe(false);
  }
});

it.each([400, 401, 403, 404, 409, 410, 413, 415])("does not automatically retry permanent HTTP %i failures", async (status) => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status })); vi.stubGlobal("fetch", fetcher);
  await expect(uploadRecording(draft(), options())).rejects.toMatchObject({ retryable: false });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("checks server acknowledgement first and never uploads already saved bytes", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ uploaded: true })); vi.stubGlobal("fetch", fetcher);
  const opts = options();
  await uploadRecording(draft(), opts);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(opts.progress).toHaveBeenLastCalledWith(100);
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", cache: "no-store" });
});

it("bounds temporary retries and never treats a non-JSON response as saved", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response("not json", { status: 200 }))); vi.stubGlobal("fetch", fetcher);
  const task = uploadRecording(draft(), options());
  const result = expect(task).rejects.toBeInstanceOf(RecordingUploadError);
  await vi.runAllTimersAsync(); await result;
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(uploadFailure(503).retryable).toBe(true);
  expect(uploadFailure(429).retryable).toBe(true);
});

it("stops retrying when unmounted or cancelled", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 503 })); vi.stubGlobal("fetch", fetcher);
  const task = uploadRecording(draft(), { ...options(), signal: controller.signal });
  const rejected = expect(task).rejects.toBeDefined();
  await vi.advanceTimersByTimeAsync(1);
  controller.abort(); await vi.runAllTimersAsync(); await rejected;
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("does not send expired recordings or upload while offline", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(uploadRecording({ ...draft(), expiresAt: Date.now() - 1 }, options())).rejects.toMatchObject({ retryable: false });
  vi.stubGlobal("navigator", { onLine: false });
  await expect(uploadRecording(draft(), options())).rejects.toThrow("offline");
  expect(fetcher).not.toHaveBeenCalled();
});

it("times out stalled status/finalization requests with bounded retries", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")), { once: true });
  }));
  vi.stubGlobal("fetch", fetcher);
  const task = uploadRecording({ ...draft(), expiresAt: Date.now() + RECOVERY_WINDOW_MS }, options());
  const rejected = expect(task).rejects.toMatchObject({ retryable: true });
  await vi.runAllTimersAsync(); await rejected;
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("sends the original blob and timing data with progress and waits for acknowledgement", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ uploaded: false })).mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetcher);
  const xhr = {
    status: 200, responseText: '{"ok":true}', timeout: 0,
    upload: { onprogress: null as ((event: ProgressEvent) => void) | null },
    onload: null as (() => void) | null, onabort: null as (() => void) | null,
    open: vi.fn(), abort: vi.fn(),
    send: vi.fn<(form: FormData) => void>(() => queueMicrotask(() => {
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
      xhr.onload?.();
    })),
  };
  vi.stubGlobal("XMLHttpRequest", vi.fn(function () { return xhr; }));
  const original = { ...draft(), timeline: '{"version":1,"durationMs":100,"turns":[]}' };
  const opts = options();
  await uploadRecording(original, opts);
  expect(xhr.open).toHaveBeenCalledWith("POST", "/api/call/recording");
  expect(await (xhr.send.mock.calls[0][0].get("file") as Blob).text()).toBe("audio");
  expect(xhr.send.mock.calls[0][0].get("timeline")).toBe(original.timeline);
  expect(opts.progress).toHaveBeenCalledWith(50);
  expect(opts.progress).toHaveBeenLastCalledWith(100);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ responseId: "response", tabSwitches: 2 });
});
