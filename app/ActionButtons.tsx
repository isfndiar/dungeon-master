"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Input } from "@/lib/game/input";
import type { SkillHud } from "@/lib/game/engine";

interface ActionButtonsProps {
  input: Input;
  skills: SkillHud[];
}

const AIM_RADIUS = 40;

export function ActionButtons({ input, skills }: ActionButtonsProps) {
  const atkRef = useRef<HTMLDivElement>(null);
  const atkThumbRef = useRef<HTMLDivElement>(null);
  const atkOriginRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = atkRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      atkOriginRef.current = { x: t.clientX, y: t.clientY };
      input.virtualAimActive = true;
      input.virtualAimX = 0;
      input.virtualAimY = 0;
      input.virtualAttack = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!input.virtualAimActive) return;
      e.preventDefault();
      const t = e.touches[0];
      let dx = t.clientX - atkOriginRef.current.x;
      let dy = t.clientY - atkOriginRef.current.y;
      const dist = Math.hypot(dx, dy);
      if (dist > AIM_RADIUS) {
        dx = (dx / dist) * AIM_RADIUS;
        dy = (dy / dist) * AIM_RADIUS;
      }
      input.virtualAimX = dx / AIM_RADIUS;
      input.virtualAimY = dy / AIM_RADIUS;
      if (atkThumbRef.current) {
        atkThumbRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
      }
    };

    const onEnd = () => {
      input.virtualAimActive = false;
      input.virtualAttack = false;
      input.virtualAimX = 0;
      input.virtualAimY = 0;
      if (atkThumbRef.current) {
        atkThumbRef.current.style.transform = "translate(0,0)";
      }
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);

    return () => {
      el.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [input]);

  const triggerSkill = useCallback((index: number) => {
    input.virtualSkills[index] = true;
  }, [input]);

  return (
    <div className="action-buttons">
      <div className="skill-buttons">
        {skills.map((s, i) => (
          <div
            key={i}
            className={`skill-btn${s.ready ? " ready" : ""}`}
            onTouchStart={(e) => { e.preventDefault(); if (s.ready) triggerSkill(i); }}
          >
            <span className="skill-btn-key">{i + 1}</span>
            {!s.ready && <div className="skill-btn-cd" style={{ height: (1 - s.cdPct) * 100 + "%" }} />}
          </div>
        ))}
      </div>
      <div className="atk-joystick" ref={atkRef}>
        <div className="atk-joystick-thumb" ref={atkThumbRef} />
        <span className="atk-joystick-label">ATK</span>
      </div>
    </div>
  );
}
