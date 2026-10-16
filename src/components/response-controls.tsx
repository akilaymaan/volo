"use client";

import { Loader2Icon, RotateCwIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteResponseAction, reanalyzeAction, setCandidateStatusAction } from "@/app/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CANDIDATE_STATUSES } from "@/lib/constants";

type Status = keyof typeof CANDIDATE_STATUSES;

export function ResponseControls({
  responseId,
  interviewId,
  status,
  canReanalyze,
}: {
  responseId: string;
  interviewId: string;
  status: Status;
  canReanalyze: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value}
        disabled={pending}
        onValueChange={(next) => {
          const prev = value;
          setValue(next as Status);
          start(async () => {
            const res = await setCandidateStatusAction(responseId, next as Status);
            if (!res.ok) {
              setValue(prev);
              toast.error(res.error);
            } else toast.success(`Marked as ${CANDIDATE_STATUSES[next as Status].label.toLowerCase()}`);
          });
        }}
      >
        <SelectTrigger className="w-40" aria-label="Candidate status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(CANDIDATE_STATUSES).map(([k, v]) => (
            <SelectItem key={k} value={k}>
              {v.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {canReanalyze && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await reanalyzeAction(responseId);
              if (!res.ok) toast.error(res.error);
              else router.refresh();
            })
          }
        >
          <RotateCwIcon /> Re-analyze
        </Button>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Delete response" disabled={pending}>
            <Trash2Icon />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this response?</AlertDialogTitle>
            <AlertDialogDescription>
              The recording, transcript and report are deleted. The candidate will be able to take the interview again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                start(async () => {
                  const res = await deleteResponseAction(responseId);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Response deleted");
                  router.push(`/dashboard/interviews/${interviewId}`);
                })
              }
            >
              Delete response
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Loads the recording as a blob so seeking works even for MediaRecorder WebM files without duration metadata. */
export function RecordingPlayer({ responseId }: { responseId: string }) {
  const [src, setSrc] = useState<string>();
  const [error, setError] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let url: string | undefined;
    fetch(`/api/recordings/${responseId}`)
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        url = URL.createObjectURL(b);
        setSrc(url);
      })
      .catch(() => setError(true));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [responseId]);

  // Chrome reports Infinity duration for recorder WebM until it has scanned to the end
  function fixDuration() {
    const el = audio.current;
    if (!el || Number.isFinite(el.duration)) return;
    el.currentTime = 1e7;
    el.addEventListener("timeupdate", function reset() {
      el.removeEventListener("timeupdate", reset);
      el.currentTime = 0;
    });
  }

  if (error) return <p className="text-sm text-muted-foreground">The recording couldn&apos;t be loaded.</p>;
  if (!src)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" /> Loading recording
      </p>
    );
  return (
    // biome-ignore lint/a11y/useMediaCaption: the transcript beside the player serves as the caption
    <audio ref={audio} src={src} controls preload="metadata" onLoadedMetadata={fixDuration} className="w-full" />
  );
}
