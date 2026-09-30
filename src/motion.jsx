// Motion helpers for the Onyx UI: numbers that glide to new values, and a
// check for people who asked their device for less motion.
import { useEffect, useRef, useState } from "react";
import { fmt } from "./calc.js";

export function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// A number that glides to each new value instead of jumping. With `from`, it
// also counts up from there the first time it's shown.
export function useTweened(value, { duration = 600, from = null } = {}) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(from == null ? target : from);
  const shownRef = useRef(from == null ? target : from);
  useEffect(() => {
    const start = shownRef.current;
    if (prefersReducedMotion() || Math.abs(target - start) < 0.5) {
      shownRef.current = target;
      setShown(target);
      return undefined;
    }
    let raf;
    let t0 = null;
    const step = (now) => {
      if (t0 == null) t0 = now;
      const k = Math.min((now - t0) / duration, 1);
      const v = start + (target - start) * easeOutCubic(k);
      shownRef.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return shown;
}

// Money that animates: counts up on first show (`countUp`) and glides between
// values after. `signed` writes a loss with a true minus.
export function Amount({ value, countUp = false, signed = false, format = fmt, className = "" }) {
  const shown = useTweened(value, { from: countUp ? 0 : null, duration: countUp ? 900 : 600 });
  const text = signed && value < 0 ? "−" + format(Math.abs(shown)) : format(shown);
  return (
    <span className={("ox-num " + className).trim()} aria-label={signed && value < 0 ? "−" + format(-value) : format(value)}>
      {text}
    </span>
  );
}
