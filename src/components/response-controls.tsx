"use client";

import { RotateCwIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
