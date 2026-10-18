"use client";

import { Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteTemplateAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="outline" size="icon" aria-label={`Delete template ${name}`} onClick={() => setOpen(true)} disabled={pending}>
        <Trash2Icon />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>Remove &ldquo;{name}&rdquo; from your library. Interviews already created from it are kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep template</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={(event) => {
              event.preventDefault();
              start(async () => {
                const res = await deleteTemplateAction(id);
                if (!res.ok) return void toast.error(res.error);
                setOpen(false);
                toast.success("Template deleted");
              });
            }}>{pending ? "Deleting…" : "Delete template"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
