"use client";

import { useEffect, useRef } from "react";
import type { Input } from "@/lib/game/input";

interface InteractButtonProps {
  input: Input;
}

export function InteractButton({ input }: InteractButtonProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => { e.preventDefault(); input.virtualInteract = true; };
    const onEnd = () => { input.virtualInteract = false; };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [input]);

  return (
    <div className="interact-btn" ref={ref}>
      E
    </div>
  );
}
