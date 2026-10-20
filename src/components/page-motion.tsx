"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** Animate committed route content, never delay navigation or remount its forms. */
export function PageMotion({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches || !content.current) return;
    // Opacity only: no transformed ancestor to displace sticky/fixed UI.
    // Run on mount too: sign-in -> dashboard mounts a fresh layout, rather than
    // changing the pathname of an already-mounted PageMotion instance.
    const animation = content.current.animate([{ opacity: 0.12 }, { opacity: 1 }], {
      duration: 420,
      easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
    });
    const cancel = () => { if (preference.matches) animation.cancel(); };
    preference.addEventListener("change", cancel);
    return () => {
      animation.cancel();
      preference.removeEventListener("change", cancel);
    };
  }, [pathname]);

  return <div ref={content} data-page-motion="">{children}</div>;
}
