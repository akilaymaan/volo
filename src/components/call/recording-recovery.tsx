"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { listRecordingDrafts, removeRecordingDraft, type RecordingDraft } from "@/lib/recording-recovery-store";
import { RecordingUploadError, uploadRecording } from "@/lib/recording-upload";

type Outcome = "saved" | "discarded" | "expired";
const actionClass = "rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-40";

export function RecordingUploadCard({ draft, persisted, autoStart = false, onRemoved }: {
  draft: RecordingDraft; persisted: boolean; autoStart?: boolean;
  onRemoved: (id: string, outcome: Outcome) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("A completed recording is waiting to upload.");
  const [canRetry, setCanRetry] = useState(true);
  const [saved, setSaved] = useState(false);
  const current = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const enabled = useRef(autoStart);

  const run = useCallback(async () => {
    if (current.current) return;
    enabled.current = true;
    const controller = new AbortController();
    current.current = controller;
    setBusy(true);
    try {
      await uploadRecording(draft, { signal: controller.signal,
        progress: (value) => { if (mounted.current) setProgress(value); },
        stage: (value) => { if (mounted.current) setMessage(value); },
      });
      if (!mounted.current) return;
      enabled.current = false;
      setSaved(true); setCanRetry(false);
      try {
        if (persisted) await removeRecordingDraft(draft.responseId);
        if (mounted.current) onRemoved(draft.responseId, "saved");
      } catch { if (mounted.current) setMessage("Recording saved successfully, but local cleanup failed. Remove the local copy below or clear this site's browser data."); }
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      const retry = error instanceof RecordingUploadError && error.retryable;
      enabled.current = retry;
      setCanRetry(retry);
      setMessage(error instanceof RecordingUploadError ? error.message : "Upload interrupted. Your recording is available to retry.");
    } finally {
      if (current.current === controller) current.current = null;
      if (mounted.current) setBusy(false);
    }
  }, [draft, persisted, onRemoved]);

  useEffect(() => {
    mounted.current = true;
    const online = () => { if (enabled.current) void run(); };
    const unload = (event: BeforeUnloadEvent) => { if (current.current || !persisted) event.preventDefault(); };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", unload);
    // Defer the initial side effect so React's development setup/cleanup cycle
    // cannot issue a duplicate upload before the first request is aborted.
    const start = setTimeout(() => { if (autoStart) void run(); }, 0);
    const expiry = setTimeout(() => {
      enabled.current = false;
      current.current?.abort();
      void (persisted ? removeRecordingDraft(draft.responseId) : Promise.resolve()).then(() => {
        if (mounted.current) onRemoved(draft.responseId, "expired");
      }).catch(() => { if (mounted.current) { setCanRetry(false); setMessage("The upload window expired. Clear this site's browser data to remove its expired local recording."); } });
    }, Math.max(0, draft.expiresAt - Date.now()));
    return () => {
      mounted.current = false;
      clearTimeout(start); clearTimeout(expiry);
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", unload);
      current.current?.abort();
      current.current = null;
    };
  }, [autoStart, draft, persisted, onRemoved, run]);

  function download() {
    const url = URL.createObjectURL(draft.audio);
    const link = document.createElement("a");
    link.href = url;
    link.download = `interview-recording.${draft.audio.type.includes("mp4") ? "m4a" : draft.audio.type.includes("ogg") ? "ogg" : "webm"}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section aria-label="Recording upload" className="my-5 w-full rounded-xl border p-4 text-left">
    <h2 className="font-semibold">{saved ? "Recording saved" : "Recording upload"}</h2>
    <p className="mt-1 text-xs text-muted-foreground">{new Date(draft.createdAt).toLocaleString()} · Reference {draft.responseId.slice(-6)}</p>
    <p role="status" className="mt-2 text-sm">{message}</p>
    {busy && <div className="mt-3">
      <progress aria-label="Recording upload progress" max={100} value={progress} className="w-full accent-current" />
      <p className="text-xs">{progress}% · Keep this tab open until upload is confirmed.</p>
    </div>}
    {!saved && <p className="mt-2 text-xs text-muted-foreground">{persisted
      ? "A temporary copy is saved in this browser. Return to Recording recovery on this same site and browser if interrupted."
      : "Browser storage is unavailable or full. This copy exists only in this tab—do not refresh or close it before uploading or downloading."}
      {` Upload permission expires at ${new Date(draft.expiresAt).toLocaleTimeString()}.`}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      {!saved && <button type="button" className={actionClass} disabled={busy || !canRetry} onClick={() => void run()}>Retry recording upload</button>}
      {!saved && <button type="button" className={actionClass} disabled={busy} onClick={download}>Download recording</button>}
      <button type="button" className={actionClass} disabled={busy} onClick={async () => {
        if (!window.confirm("Remove the local recording copy? This cannot be undone and does not delete any server-side interview data.")) return;
        enabled.current = false;
        try { if (persisted) await removeRecordingDraft(draft.responseId); onRemoved(draft.responseId, saved ? "saved" : "discarded"); }
        catch { setMessage("Could not remove the local copy. Try again or clear this site's browser data."); }
      }}>Remove local copy</button>
    </div>
  </section>;
}

export function RecordingRecoveryNotice({ interviewId }: { interviewId: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    void listRecordingDrafts(interviewId).then((rows) => { if (active) setCount(rows.length); }).catch(() => {});
    return () => { active = false; };
  }, [interviewId]);
  return count ? <p role="status" className="mt-4 rounded-xl border p-3 text-sm">A completed recording from this interview is waiting on this browser. <Link className="underline" href="/recording-recovery">Open Recording recovery</Link> before its upload window expires.</p> : null;
}

export function RecordingRecovery() {
  const [drafts, setDrafts] = useState<RecordingDraft[]>([]);
  const [message, setMessage] = useState("Checking this browser for pending recordings…");
  const removed = useCallback((id: string, outcome: Outcome) => {
    setDrafts((rows) => rows.filter((r) => r.responseId !== id));
    setMessage(outcome === "saved" ? "Recording saved successfully. Its local copy was removed." : outcome === "expired" ? "The upload window expired. The local copy was removed." : "Local copy removed. Server-side interview data was not deleted.");
  }, []);
  useEffect(() => {
    let active = true;
    void listRecordingDrafts().then((rows) => {
      if (active) { setDrafts(rows); setMessage(rows.length ? "Choose a recording to finish uploading. This does not restart the interview." : "No pending recordings on this browser. Expired copies have been removed."); }
    }).catch(() => { if (active) setMessage("This browser's recording storage is unavailable. Recovery requires the original browser and site, with its session cookies intact."); });
    return () => { active = false; };
  }, []);
  return <div>
    <p role="status" className="text-sm text-muted-foreground">{message}</p>
    {drafts.map((draft) => <RecordingUploadCard key={draft.responseId} draft={draft} persisted onRemoved={removed} />)}
    <p className="mt-4 text-xs text-muted-foreground">Copies expire within three hours of the interview starting and are cleared when recovery is opened again. Closing the browser stops uploads; they do not run in the background. Cleared storage, missing cookies or private browsing may prevent recovery. Downloaded files are yours to manage and are not automatically deleted.</p>
  </div>;
}
