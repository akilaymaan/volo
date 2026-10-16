import { redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import { VoiceOrb } from "@/components/voice-orb";
import { getUser } from "@/lib/auth";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getUser()) redirect("/dashboard");
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </div>
      <div className="relative hidden flex-col items-center justify-center overflow-hidden bg-[#0b1716] p-12 text-[#e6f0ee] lg:flex">
        <VoiceOrb color="#3ddc97" size={280} />
        <blockquote className="mt-8 max-w-sm text-center font-heading text-2xl leading-snug">
          “Tell me about a time a project didn&apos;t go to plan. What did you change?”
        </blockquote>
        <p className="mt-3 text-sm text-[#8fa6a2]">Every candidate gets the same thoughtful first round.</p>
      </div>
    </div>
  );
}
