"use client";

import { Loader2Icon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Button that runs a server action and reports the result as a toast. */
export function ActionButton({
  action,
  success,
  children,
  variant = "outline",
  size = "default",
  disabled,
}: {
  action: () => Promise<{ ok: true } | { ok: false; error: string }>;
  success?: string;
  children: React.ReactNode;
  variant?: "outline" | "default" | "ghost" | "secondary";
  size?: "default" | "sm";
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      size={size}
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          const res = await action();
          if (!res.ok) toast.error(res.error);
          else if (success) toast.success(success);
        })
      }
    >
      {pending && <Loader2Icon className="animate-spin" />}
      {children}
    </Button>
  );
}
