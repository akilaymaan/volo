"use client";

import { useEffect, useId, useRef } from "react";

const POINTS = 72;

/**
 * An organic blob that breathes when idle and ripples with `getLevel()` (0–1).
 * Reads the level every frame instead of via props so audio never re-renders React.
 * Pass a stable (memoized) `getLevel`.
 */
export function VoiceOrb({
  color,
  size = 160,
  getLevel,
  active = true,
  className,
}: {
  color: string;
  size?: number;
  getLevel?: () => number;
  active?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const path = useRef<SVGPathElement>(null);
  const halo = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let smooth = 0;
    const start = performance.now();

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      const lvl = Math.min(1, Math.max(0, getLevel?.() ?? 0));
      smooth += (lvl - smooth) * (lvl > smooth ? 0.35 : 0.08);
      const breathe = active && !reduce ? 1 : 0;
      let d = "";
      for (let i = 0; i <= POINTS; i++) {
        const a = (i / POINTS) * Math.PI * 2;
        const wobble =
          breathe * 0.025 * Math.sin(3 * a + t * 1.1) +
          breathe * 0.015 * Math.sin(5 * a - t * 0.8) +
          smooth * (0.09 * Math.sin(6 * a - t * 5) + 0.06 * Math.sin(9 * a + t * 3.7));
        const r = 33 * (1 + wobble + smooth * 0.06);
        d += `${i ? "L" : "M"}${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
      }
      path.current?.setAttribute("d", `${d}Z`);
      halo.current?.setAttribute("r", (36 + smooth * 12).toFixed(2));
      halo.current?.setAttribute("opacity", (0.18 + smooth * 0.35).toFixed(2));
      if (!reduce || getLevel) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, getLevel]);

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`g${id}`} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="35%" stopColor={color} stopOpacity="0.95" />
          <stop offset="100%" stopColor={color} />
        </radialGradient>
        <filter id={`b${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <circle ref={halo} cx="50" cy="50" r="36" fill={color} opacity="0.18" filter={`url(#b${id})`} />
      <path ref={path} fill={`url(#g${id})`} />
    </svg>
  );
}

/** Small static avatar for lists. */
export function PersonaDot({ color, name, size = 32 }: { color: string; name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-heading font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `radial-gradient(circle at 35% 30%, #ffffffb3, ${color} 45%, ${color})`,
      }}
      aria-hidden="true"
    >
      {name.replace(/^(Explorer|Empathetic|Technical|HR)\s+/i, "").charAt(0).toUpperCase()}
    </span>
  );
}
