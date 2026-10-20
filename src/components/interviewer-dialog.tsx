"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { type InterviewerInput, saveInterviewerAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { VoiceOrb } from "@/components/voice-orb";
import { VoicePreviewButton } from "@/components/voice-preview";
import { AVATAR_COLORS, TRAITS, VOICES } from "@/lib/constants";
import { cn } from "@/lib/utils";


const BLANK: InterviewerInput = {
  name: "",
  description: "",
  voice: VOICES[0].id,
  color: AVATAR_COLORS[0],
  empathy: 7,
  exploration: 7,
  rapport: 7,
  speed: 5,
};

export function InterviewerDialog({
  id,
  initial,
  trigger,
  title,
}: {
  id: string | null;
  initial?: InterviewerInput;
  trigger: React.ReactNode;
  title: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<InterviewerInput>(initial ?? BLANK);
  const [pending, start] = useTransition();
  const set = <K extends keyof InterviewerInput>(k: K, val: InterviewerInput[K]) => setV((p) => ({ ...p, [k]: val }));

  function save() {
    start(async () => {
      const res = await saveInterviewerAction(id, v);
      if (!res.ok) return void toast.error(res.error);
      toast.success(id ? "Interviewer updated" : "Interviewer created");
      setOpen(false);
      if (!id) setV(initial ?? BLANK);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Personality shapes how the interviewer talks and follows up.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <VoiceOrb color={v.color} size={72} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="iv-name">Name</Label>
              <Input id="iv-name" value={v.name} maxLength={60} placeholder="Interviewer name" onChange={(e) => set("name", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="iv-desc">Description</Label>
            <Textarea
              id="iv-desc"
              rows={2}
              maxLength={500}
              value={v.description}
              placeholder="Describe this interviewer's approach and suitable roles."
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Voice</Label>
              <div className="flex items-center gap-1">
                <Select value={v.voice} onValueChange={(x) => set("voice", x)}>
                  <SelectTrigger className="min-w-0 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICES.map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.label} <span className="text-muted-foreground">{x.tone}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <VoicePreviewButton voice={v.voice} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    aria-pressed={v.color === c}
                    onClick={() => set("color", c)}
                    className={cn("size-7 rounded-full ring-offset-2 ring-offset-background", v.color === c && "ring-2 ring-foreground")}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            {TRAITS.map((t) => (
              <div key={t.key} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <Label>{t.label}</Label>
                  <span className="text-muted-foreground">{v[t.key]}/10</span>
                </div>
                <Slider min={1} max={10} step={1} value={[v[t.key]]} onValueChange={([x]) => set(t.key, x)} aria-label={t.label} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{t.low}</span>
                  <span>{t.high}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            {id ? "Save changes" : "Create interviewer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
