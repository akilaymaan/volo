"use client";

import { useCallback, useEffect, useState } from "react";
import { VoiceOrb } from "@/components/voice-orb";

const LINES = [
  { lang: "English", text: "Walk me through a production incident you owned. What was your first move?" },
  { lang: "हिन्दी", text: "आपने अपने पिछले प्रोजेक्ट में सबसे कठिन तकनीकी समस्या कैसे सुलझाई?" },
  { lang: "தமிழ்", text: "உங்கள் அணியில் கருத்து வேறுபாடு வந்தபோது நீங்கள் என்ன செய்தீர்கள்?" },
  { lang: "తెలుగు", text: "ఈ పాత్రకు మీరు ఎందుకు సరైన వ్యక్తి అని అనుకుంటున్నారు?" },
  { lang: "বাংলা", text: "আপনার তৈরি করা কোন ফিচার নিয়ে আপনি সবচেয়ে গর্বিত?" },
];

export function HeroDemo() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % LINES.length), 4200);
    return () => clearInterval(t);
  }, []);
  // Synthetic speech envelope so the orb looks like it's talking
  const level = useCallback(() => {
    const t = performance.now() / 1000;
    const phase = t % 4.2;
    if (phase > 3.4) return 0;
    return Math.max(0, 0.35 + 0.35 * Math.sin(t * 9) * Math.sin(t * 2.3) + 0.2 * Math.sin(t * 17));
  }, []);
  const line = LINES[i];

  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col items-center rounded-[2rem] bg-[#0b1716] px-6 pb-8 pt-10 text-[#e6f0ee] shadow-2xl shadow-primary/20 ring-1 ring-white/10">
      <div className="mb-2 flex w-full items-center justify-between text-xs text-[#8fa6a2]">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 animate-pulse rounded-full bg-[#3ddc97]" /> Live interview
        </span>
        <span>04:12 / 15:00</span>
      </div>
      <VoiceOrb color="#3ddc97" size={220} getLevel={level} />
      <p className="mt-1 text-xs text-[#8fa6a2]">Explorer Lisa is asking, in {line.lang}</p>
      <p
        key={i}
        lang={i === 0 ? "en" : undefined}
        className="mt-3 min-h-[5.5rem] text-center font-heading text-xl leading-snug animate-in fade-in slide-in-from-bottom-1 duration-500"
      >
        {line.text}
      </p>
    </div>
  );
}
