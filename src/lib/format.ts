export const fmtDuration = (sec: number) => (sec < 60 ? `${sec}s` : `${Math.round(sec / 60)} min`);

/** An analysis "running" for over 5 minutes was killed (timeout or redeploy); treat it as failed so it can be retried. */
export function analysisState(r: {
  analysisStatus: "pending" | "running" | "done" | "failed";
  analysisStartedAt: Date | null;
}): "running" | "done" | "failed" {
  if (r.analysisStatus === "done" || r.analysisStatus === "failed") return r.analysisStatus;
  const fresh = r.analysisStartedAt && Date.now() - r.analysisStartedAt.getTime() < 5 * 60_000;
  return r.analysisStatus === "running" && fresh ? "running" : "failed";
}
