"use client";

import {
  DownloadIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Share2Icon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { deleteInterviewAction, setInterviewActiveAction } from "@/app/actions";
import { CopyButton } from "@/components/copy-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const noop = () => () => {};

export function InterviewActions({ id, isActive, invitationOnly }: { id: string; isActive: boolean; invitationOnly: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [shareOpen, setShareOpen] = useState(() => params.get("share") === "1");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [active, setActive] = useState(isActive);
  const [pending, start] = useTransition();
  // Server render has no origin; React swaps in the browser value right after hydration
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");

  useEffect(() => {
    if (params.get("share") === "1") router.replace(`/dashboard/interviews/${id}`, { scroll: false });
  }, [params, id, router]);

  const url = `${origin}/i/${id}`;
  const embed = `<iframe src="${url}" allow="microphone; autoplay" style="width:100%;height:760px;border:0;border-radius:16px"></iframe>`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="mr-2 flex items-center gap-2 text-sm">
        <Switch
          checked={active}
          disabled={pending}
          onCheckedChange={(next) => {
            setActive(next);
            start(async () => {
              const res = await setInterviewActiveAction(id, next);
              if (!res.ok) {
                setActive(!next);
                toast.error(res.error);
              } else toast.success(next ? "Interview is accepting responses" : "Interview paused");
            });
          }}
        />
        {active ? "Accepting responses" : "Paused"}
      </label>
      <Button onClick={() => setShareOpen(true)}>
        <Share2Icon /> Share
      </Button>
      <Button variant="outline" asChild>
        <Link href={`/dashboard/interviews/${id}/edit`}>
          <PencilIcon /> Edit
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={`/api/interviews/${id}/export`}>
              <DownloadIcon /> Export responses (CSV)
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`/i/${id}`} target="_blank" rel="noreferrer">
              <ExternalLinkIcon /> Open candidate page
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2Icon /> Delete interview
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share with candidates</DialogTitle>
            <DialogDescription>
              {invitationOnly ? "Candidates need their personal email invitation. Send one from the Invitations tab." : `Anyone with this link can take the interview${active ? "" : " once you turn it back on"}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="share-url">Interview link</Label>
              <div className="flex gap-2">
                <Input id="share-url" readOnly value={url} onFocus={(e) => e.target.select()} className="h-9" />
                <CopyButton text={url} label="Copy" variant="default" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="embed">Embed on your careers page</Label>
              <Textarea id="embed" readOnly rows={3} value={embed} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
              <CopyButton text={embed} label="Copy embed code" />
              <p className="text-xs text-muted-foreground">Use a top-level personal link for invitations. Cross-site embeds may block the secure session cookie; open the interview in a new tab if that happens.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this interview?</AlertDialogTitle>
            <AlertDialogDescription>
              Every response, recording and report for it is deleted too. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                start(async () => {
                  const res = await deleteInterviewAction(id);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Interview deleted");
                  router.push("/dashboard");
                })
              }
            >
              Delete interview
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
