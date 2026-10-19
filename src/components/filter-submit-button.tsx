"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function FilterSubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending} aria-busy={pending}>{pending ? "Applying…" : children}</Button>;
}
