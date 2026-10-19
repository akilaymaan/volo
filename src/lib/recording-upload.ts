import type { RecordingDraft } from "@/lib/recording-recovery-store";

export class RecordingUploadError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message); }
}

export function uploadFailure(status: number) {
  const retryable = [408, 425, 429].includes(status) || status >= 500;
  const message = status === 404 || status === 401 || status === 403
    ? "This browser no longer has permission to upload. Use the original browser with its session cookies, or contact the hiring team."
    : status === 410 ? "The recording upload window has expired. Contact the hiring team."
      : status === 413 ? "The recording exceeds this host's upload size limit. Download your copy and contact the hiring team."
        : retryable ? "The upload could not be confirmed. Your local copy is available to retry."
          : "The server could not accept this recording. Download your copy and contact the hiring team.";
  return new RecordingUploadError(message, retryable);
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function jsonRequest(url: string, signal: AbortSignal, body?: object) {
  signal.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal,
      ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
    if (!res.ok) throw uploadFailure(res.status);
    return await res.json();
  } finally { clearTimeout(timeout); signal.removeEventListener("abort", abort); }
}

function sendAudio(draft: RecordingDraft, signal: AbortSignal, progress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const settle = (error?: unknown) => { signal.removeEventListener("abort", abort); if (error) reject(error); else resolve(); };
    xhr.open("POST", "/api/call/recording");
    xhr.timeout = 60_000;
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) progress(Math.min(99, Math.round(event.loaded / event.total * 100))); };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return settle(uploadFailure(xhr.status));
      try { if (JSON.parse(xhr.responseText)?.ok !== true) throw new Error(); }
      catch { return settle(new RecordingUploadError("The server response was not confirmed. Retry to check whether the recording was saved.", true)); }
      progress(100);
      settle();
    };
    xhr.onerror = xhr.ontimeout = () => settle(new RecordingUploadError("Connection interrupted. Your recording is available to retry.", true));
    xhr.onabort = () => settle(signal.reason ?? new DOMException("Upload cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    const form = new FormData();
    form.set("responseId", draft.responseId);
    form.set("file", draft.audio, "interview");
    if (draft.timeline) form.set("timeline", draft.timeline);
    xhr.send(form);
  });
}

/** Credentials stay in HttpOnly cookies. Replays check server state before sending bytes. */
export async function uploadRecording(draft: RecordingDraft, options: {
  signal: AbortSignal; progress: (value: number) => void; stage: (value: string) => void;
}) {
  const { signal, progress, stage } = options;
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    if (Date.now() >= draft.expiresAt) throw uploadFailure(410);
    if (typeof navigator !== "undefined" && navigator.onLine === false)
      throw new RecordingUploadError("You are offline. Keep this tab open or return to Recording recovery in this browser before the upload window expires.", true);
    try {
      progress(0); stage("Checking recording status…");
      const status = await jsonRequest(`/api/call/recording?responseId=${encodeURIComponent(draft.responseId)}`, signal);
      if (typeof status?.uploaded !== "boolean") throw new RecordingUploadError("Could not verify recording status. Try again.", true);
      if (status.uploaded) { progress(100); return; }
      stage("Finishing interview…");
      const ended = await jsonRequest("/api/call/end", signal, { responseId: draft.responseId, tabSwitches: draft.tabSwitches });
      if (ended?.ok !== true) throw new RecordingUploadError("Could not confirm the interview ended. Try again.", true);
      stage("Uploading recording…");
      await sendAudio(draft, signal, progress);
      return;
    } catch (error) {
      if (signal.aborted) throw error;
      const failure = error instanceof RecordingUploadError ? error : new RecordingUploadError("Connection interrupted. Your recording is available to retry.", true);
      if (!failure.retryable || attempt === 2) throw failure;
      stage(`Connection interrupted. Retrying (${attempt + 1}/2)…`);
      await wait(1000 * (attempt + 1), signal);
    }
  }
}
