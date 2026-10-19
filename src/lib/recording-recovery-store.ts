import { LIMITS } from "@/lib/constants";

export const RECOVERY_DB = "volo-recording-recovery";
export const RECOVERY_STORE = "recordings";
export const RECOVERY_WINDOW_MS = 3 * 60 * 60_000;
const MAX_COPIES = 3;
export type RecordingDraft = {
  version: 1; responseId: string; interviewId: string; audio: Blob;
  timeline: string | null; tabSwitches: number; createdAt: number; expiresAt: number;
};

export function validRecordingDraft(value: unknown, now = Date.now()): value is RecordingDraft {
  if (!value || typeof value !== "object") return false;
  const r = value as RecordingDraft;
  return r.version === 1 && typeof r.responseId === "string" && typeof r.interviewId === "string" &&
    /^[\w-]{1,64}$/.test(r.responseId) && /^[\w-]{1,64}$/.test(r.interviewId) &&
    r.audio instanceof Blob && r.audio.size > 0 && r.audio.size <= LIMITS.maxRecordingBytes &&
    (r.timeline === null || (typeof r.timeline === "string" && r.timeline.length <= 20_000)) &&
    Number.isInteger(r.tabSwitches) && r.tabSwitches >= 0 && r.tabSwitches <= 10_000 &&
    Number.isFinite(r.createdAt) && Number.isFinite(r.expiresAt) && r.createdAt <= now && r.createdAt <= r.expiresAt &&
    r.expiresAt > now && r.expiresAt - r.createdAt <= RECOVERY_WINDOW_MS;
}

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let failed = false;
    const request = indexedDB.open(RECOVERY_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(RECOVERY_STORE, { keyPath: "responseId" });
    request.onerror = () => reject(new Error("Browser storage is unavailable."));
    request.onblocked = () => { failed = true; reject(new Error("Browser storage is blocked by another tab.")); };
    request.onsuccess = () => {
      if (failed) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close(); resolve(request.result);
    };
  });
}

async function transaction<T>(work: (store: IDBObjectStore, done: (result: T) => void) => void): Promise<T> {
  const database = await openStore();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = database.transaction(RECOVERY_STORE, "readwrite"); }
    catch { database.close(); reject(new Error("Browser recording storage is unavailable.")); return; }
    let result: T;
    tx.oncomplete = () => { database.close(); resolve(result); };
    tx.onerror = tx.onabort = () => { database.close(); reject(new Error("Could not update browser recording storage.")); };
    try { work(tx.objectStore(RECOVERY_STORE), (value) => { result = value; }); }
    catch { tx.abort(); }
  });
}

/** Expired/invalid copies are removed on access; no local copy contains a session token. */
export async function listRecordingDrafts(interviewId?: string): Promise<RecordingDraft[]> {
  return transaction((store, done) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const valid: RecordingDraft[] = [];
      for (const row of request.result) {
        if (validRecordingDraft(row)) valid.push(row);
        else if (row?.responseId) store.delete(row.responseId);
      }
      done(valid.filter((r) => !interviewId || r.interviewId === interviewId).sort((a, b) => b.createdAt - a.createdAt));
    };
  });
}

export async function saveRecordingDraft(draft: RecordingDraft) {
  if (!validRecordingDraft(draft)) throw new Error("Recording cannot be saved for recovery.");
  // One transaction prevents concurrent tabs exceeding the bound. Never evict an
  // unexpired recording to make room for another candidate's copy.
  await transaction<void>((store, done) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const retained = request.result.filter((r) => validRecordingDraft(r) && r.responseId !== draft.responseId);
      for (const row of request.result) if (!validRecordingDraft(row)) store.delete(row.responseId);
      if (retained.length >= MAX_COPIES) { store.transaction.abort(); return; }
      store.put(draft);
      done();
    };
  });
}

export async function removeRecordingDraft(responseId: string) {
  await transaction<void>((store, done) => { store.delete(responseId); done(); });
}
