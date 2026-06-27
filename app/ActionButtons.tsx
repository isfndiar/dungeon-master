"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Input } from "@/lib/game/input";
import type { SkillHud } from "@/lib/game/engine";

interface ActionButtonsProps {
  input: Input;
  skills: SkillHud[];
}

export function ActionButtons({ input, skills }: ActionButtonsProps) {
  const atkRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = atkRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => { e.preventDefault(); input.virtualAttack = true; };
    const onEnd = () => { input.virtualAttack = false; };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
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
      <div className="atk-btn" ref={atkRef}>
        ATK
      </div>
    </div>
  );
}
