"use client";

import { useRef, useCallback, useEffect } from "react";
import type { Input } from "@/lib/game/input";

interface JoystickProps {
  input: Input;
}

export function Joystick({ input }: JoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const activeRef = useRef(false);

  const RADIUS = 50;

  const updateThumb = useCallback((clientX: number, clientY: number) => {
    const base = baseRef.current;
    const thumb = thumbRef.current;
    if (!base || !thumb) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > RADIUS) {
      dx = (dx / dist) * RADIUS;
      dy = (dy / dist) * RADIUS;
    }
    thumb.style.transform = `translate(${dx}px, ${dy}px)`;
    input.virtualDirX = dx / RADIUS;
    input.virtualDirY = dy / RADIUS;
  }, [input]);

  const reset = useCallback(() => {
    activeRef.current = false;
    const thumb = thumbRef.current;
    if (thumb) thumb.style.transform = "translate(0,0)";
    input.virtualDirX = 0;
    input.virtualDirY = 0;
  }, [input]);

  useEffect(() => {
    const base = baseRef.current;
    if (!base) return;

    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      activeRef.current = true;
      const t = e.touches[0];
      updateThumb(t.clientX, t.clientY);
    };
    const onMove = (e: TouchEvent) => {
      if (!activeRef.current) return;
      e.preventDefault();
      const t = e.touches[0];
      updateThumb(t.clientX, t.clientY);
    };
    const onEnd = () => reset();

    base.addEventListener("touchstart", onStart, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);

    return () => {
      base.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [updateThumb, reset]);

  return (
    <div className="joystick-base" ref={baseRef}>
      <div className="joystick-thumb" ref={thumbRef} />
    </div>
  );
}
