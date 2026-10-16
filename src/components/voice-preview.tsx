"use client";

import { Loader2Icon, PauseIcon, Volume2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

let current: HTMLAudioElement | null = null;

export function VoicePreviewButton({ voice, lang = "en-IN" }: { voice: string; lang?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => audio.current?.pause(), []);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (state === "playing") {
      audio.current?.pause();
      setState("idle");
      return;
    }
    current?.pause();
    const el = new Audio(`/api/voices/preview?voice=${encodeURIComponent(voice)}&lang=${encodeURIComponent(lang)}`);
    audio.current = el;
    current = el;
    el.onended = el.onpause = () => setState("idle");
    el.onplaying = () => setState("playing");
    setState("loading");
    try {
      await el.play();
    } catch {
      setState("idle");
      toast.error("Voice preview isn't available. Check SARVAM_API_KEY.");
    }
  }

  const Icon = state === "loading" ? Loader2Icon : state === "playing" ? PauseIcon : Volume2Icon;
  return (
    <Button type="button" variant="ghost" size="sm" onClick={toggle} aria-label={`Preview voice ${voice}`}>
      <Icon className={state === "loading" ? "animate-spin" : undefined} />
      {state === "playing" ? "Stop" : "Hear voice"}
    </Button>
  );
}
