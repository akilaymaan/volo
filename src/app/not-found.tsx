import Link from "next/link";
import { Button } from "@/components/ui/button";
import { VoiceOrb } from "@/components/voice-orb";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <VoiceOrb color="#7aa7a1" size={120} active={false} />
      <h1 className="mt-4 text-3xl font-bold">Page not found</h1>
      <p className="mt-2 text-muted-foreground">It may have been deleted, or the link is mistyped.</p>
      <Button asChild className="mt-6">
        <Link href="/dashboard">Go to your interviews</Link>
      </Button>
    </main>
  );
}
