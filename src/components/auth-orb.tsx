"use client";

import { useEffect, useId, useRef, type PointerEvent } from "react";
import styles from "./auth-orb.module.css";

/** Decorative only: pointer updates stay outside React and never affect the form. */
export function AuthOrb() {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useRef(true);
  const clipId = useId().replace(/:/g, "");

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const reset = () => {
      element.style.removeProperty("--orb-x");
      element.style.removeProperty("--orb-y");
      element.style.removeProperty("--light-x");
      element.style.removeProperty("--light-y");
      element.dataset.tracking = "false";
    };
    const updatePreference = () => { reduced.current = preference.matches; reset(); };
    updatePreference();
    preference.addEventListener("change", updatePreference);
    let visible = false;
    const updateActivity = () => { element.dataset.running = String(visible && !document.hidden); };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      updateActivity();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", updateActivity);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", updatePreference);
      document.removeEventListener("visibilitychange", updateActivity);
    };
  }, []);

  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || reduced.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
    const style = event.currentTarget.style;
    style.setProperty("--orb-x", `${x * 12}px`);
    style.setProperty("--orb-y", `${y * 10}px`);
    style.setProperty("--light-x", `${36 + x * 12}%`);
    style.setProperty("--light-y", `${27 + y * 12}%`);
    event.currentTarget.dataset.tracking = "true";
  }

  function leave() {
    const element = root.current;
    if (!element) return;
    element.removeAttribute("style");
    element.dataset.tracking = "false";
  }

  return <div ref={root} className={styles.scene} aria-hidden="true" data-auth-orb="" data-running="false"
    onPointerMove={move} onPointerLeave={leave} onPointerCancel={leave}>
    <div className={styles.aura} />
    <div className={styles.motion}>
      <div className={styles.orbit} />
      <div className={styles.sphere}>
        <div className={styles.flow} />
        <svg className={styles.contours} viewBox="0 0 300 300" fill="none">
          <defs><clipPath id={clipId}><circle cx="150" cy="150" r="149" /></clipPath></defs>
          <g clipPath={`url(#${clipId})`} stroke="white" strokeWidth="0.65">
            {[-100, -65, -30, 10, 50, 90].map((offset) =>
              <ellipse key={offset} cx="150" cy={150 + offset} rx="151" ry="38" transform="rotate(-28 150 150)" />)}
            {[38, 76, 113].map((radius) =>
              <ellipse key={radius} cx="150" cy="150" rx={radius} ry="151" transform="rotate(-28 150 150)" />)}
          </g>
        </svg>
        <div className={styles.reflection} />
        <div className={styles.rim} />
      </div>
      <div className={styles.satellite} />
    </div>
    <div className={styles.shadow} />
  </div>;
}
