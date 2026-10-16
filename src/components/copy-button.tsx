"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Copies `text`; a leading "/" is resolved against the current origin. */
export function CopyButton({
  text,
  label = "Copy link",
  variant = "outline",
  iconOnly = false,
}: {
  text: string;
  label?: string;
  variant?: "outline" | "ghost" | "default" | "secondary";
  iconOnly?: boolean;
}) {
  const [done, setDone] = useState(false);
  async function copy() {
    const value = text.startsWith("/") ? `${window.location.origin}${text}` : text;
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setDone(false), 1800);
    } catch {
      toast.error("Couldn't access the clipboard. Copy it manually.");
    }
  }
  const Icon = done ? CheckIcon : CopyIcon;
  return (
    <Button
      type="button"
      variant={variant}
      size={iconOnly ? "icon" : "default"}
      onClick={copy}
      aria-label={iconOnly ? label : undefined}
    >
      <Icon />
      {!iconOnly && (done ? "Copied" : label)}
    </Button>
  );
}
