"use client";

import { useEffect, useRef, useState } from "react";
import { decodeInterviewDraft, interviewDraftState, writeInterviewDraft, type InterviewDraftState } from "@/lib/interview-draft";

export function useInterviewDraft(key: string | undefined, state: InterviewDraftState, restore: (state: InterviewDraftState) => void) {
  // Normalize schema key order so merely recovering a draft never rewrites it.
  const parsed = interviewDraftState.safeParse(state);
  const serialized = JSON.stringify(parsed.success ? parsed.data : state);
  const [ready, setReady] = useState(!key);
  const [status, setStatus] = useState("Saving draft…");
  const [restored, setRestored] = useState(false);
  const expected = useRef<string | null>(null);
  const latest = useRef<InterviewDraftState | null>(null);
  const stopped = useRef(false);
  const persisted = useRef(serialized);
  const restoreRef = useRef(restore);

  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(() => {
      let recovered = false;
      let invalid = false;
      try {
        expected.current = localStorage.getItem(key);
        if (expected.current) {
          const draft = decodeInterviewDraft(expected.current);
          if (draft) {
            persisted.current = JSON.stringify(draft);
            restoreRef.current(draft);
            setRestored(true);
            recovered = true;
          } else {
            localStorage.removeItem(key);
            expected.current = null;
            invalid = true;
          }
        }
        setStatus(invalid ? "The saved draft expired or could not be read. Start a new interview."
          : recovered ? "Draft saved on this device. Expires after 7 days; attachments are not saved."
            : "Drafts save on this device for 7 days. Attachments must be reattached after reload.");
      } catch {
        stopped.current = true;
        setStatus("Draft saving unavailable. Keep this page open or copy your work before leaving.");
      }
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [key]);

  useEffect(() => {
    if (!key || !ready || stopped.current) return;
    latest.current = JSON.parse(serialized) as InterviewDraftState;
    if (serialized === persisted.current) return;
    const statusTimer = setTimeout(() => setStatus("Saving draft…"), 0);
    const timer = setTimeout(() => {
      if (stopped.current || !latest.current) return;
      try {
        expected.current = writeInterviewDraft(localStorage, key, expected.current, latest.current!);
        persisted.current = JSON.stringify(latest.current);
        setStatus("Draft saved on this device. Expires after 7 days; attachments are not saved.");
      } catch (error) {
        stopped.current = error instanceof Error && error.message === "conflict";
        setStatus(error instanceof Error && error.message === "conflict"
          ? "Draft changed in another tab. Automatic saving paused; copy your work before reloading."
          : "Draft could not be saved. Keep this page open or copy your work before leaving.");
      }
    }, 400);
    return () => { clearTimeout(timer); clearTimeout(statusTimer); };
  }, [key, ready, serialized]);

  useEffect(() => {
    if (!key) return;
    const flush = () => {
      if (stopped.current || !latest.current || JSON.stringify(latest.current) === persisted.current) return;
      try { expected.current = writeInterviewDraft(localStorage, key, expected.current, latest.current); persisted.current = JSON.stringify(latest.current); } catch { /* Never claim a failed exit write succeeded. */ }
    };
    window.addEventListener("pagehide", flush);
    return () => { flush(); window.removeEventListener("pagehide", flush); };
  }, [key]);

  function clear() {
    stopped.current = true;
    latest.current = null;
    if (!key) return true;
    try {
      if (localStorage.getItem(key) !== expected.current) return false;
      localStorage.removeItem(key);
      expected.current = null;
      return true;
    } catch { return false; }
  }
  return { ready, status, restored, clear };
}
