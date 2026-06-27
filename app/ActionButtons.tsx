"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Input } from "@/lib/game/input";
import type { SkillHud } from "@/lib/game/engine";

interface ActionButtonsProps {
  input: Input;
  skills: SkillHud[];
}

const AIM_RADIUS = 40;
const SKILL_AIM_RADIUS = 50;
const CANCEL_THRESHOLD = 12; // drag back within this = cancel

export function ActionButtons({ input, skills }: ActionButtonsProps) {
  const atkRef = useRef<HTMLDivElement>(null);
  const atkThumbRef = useRef<HTMLDivElement>(null);
  const atkOriginRef = useRef({ x: 0, y: 0 });
  const atkTouchIdRef = useRef<number | null>(null);

  // Per-skill aiming state
  const skillTouchIds = useRef<(number | null)[]>([null, null, null]);
  const skillOrigins = useRef<{ x: number; y: number }[]>([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]);
  const skillAimDirs = useRef<{ x: number; y: number }[]>([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]);
  const [aimingSkill, setAimingSkill] = useState<number | null>(null);
  const [aimDir, setAimDir] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const skillBtnRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);

  // Attack joystick (unchanged logic)
  useEffect(() => {
    const el = atkRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      atkTouchIdRef.current = t.identifier;
      atkOriginRef.current = { x: t.clientX, y: t.clientY };
      input.virtualAimActive = true;
      input.virtualAimX = 0;
      input.virtualAimY = 0;
      input.virtualAttack = true;
    };

    const onMove = (e: TouchEvent) => {
      if (atkTouchIdRef.current === null) return;
      let ourTouch: Touch | null = null;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === atkTouchIdRef.current) {
          ourTouch = e.touches[i];
          break;
        }
      }
      if (!ourTouch) return;
      e.preventDefault();
      let dx = ourTouch.clientX - atkOriginRef.current.x;
      let dy = ourTouch.clientY - atkOriginRef.current.y;
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

    const onEnd = (e: TouchEvent) => {
      if (atkTouchIdRef.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === atkTouchIdRef.current) {
          atkTouchIdRef.current = null;
          input.virtualAimActive = false;
          input.virtualAttack = false;
          input.virtualAimX = 0;
          input.virtualAimY = 0;
          if (atkThumbRef.current) {
            atkThumbRef.current.style.transform = "translate(0,0)";
          }
          return;
        }
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

  // Skill aim joystick handlers
  useEffect(() => {
    const onMove = (e: TouchEvent) => {
      for (let si = 0; si < 3; si++) {
        const tid = skillTouchIds.current[si];
        if (tid === null) continue;
        let touch: Touch | null = null;
        for (let i = 0; i < e.touches.length; i++) {
          if (e.touches[i].identifier === tid) {
            touch = e.touches[i];
            break;
          }
        }
        if (!touch) continue;
        e.preventDefault();
        let dx = touch.clientX - skillOrigins.current[si].x;
        let dy = touch.clientY - skillOrigins.current[si].y;
        const dist = Math.hypot(dx, dy);
        if (dist > SKILL_AIM_RADIUS) {
          dx = (dx / dist) * SKILL_AIM_RADIUS;
          dy = (dy / dist) * SKILL_AIM_RADIUS;
        }
        skillAimDirs.current[si] = { x: dx, y: dy };
        input.virtualSkillAim[si].aimX = dx / SKILL_AIM_RADIUS;
        input.virtualSkillAim[si].aimY = dy / SKILL_AIM_RADIUS;
        input.virtualSkillAim[si].active = true;
        setAimingSkill(si);
        setAimDir({ x: dx, y: dy });
      }
    };

    const onEnd = (e: TouchEvent) => {
      for (let ci = 0; ci < e.changedTouches.length; ci++) {
        const tid = e.changedTouches[ci].identifier;
        for (let si = 0; si < 3; si++) {
          if (skillTouchIds.current[si] === tid) {
            skillTouchIds.current[si] = null;
            const dx = skillAimDirs.current[si].x;
            const dy = skillAimDirs.current[si].y;
            const dist = Math.hypot(dx, dy);

            if (dist < CANCEL_THRESHOLD) {
              // Quick tap or drag back = cast with current aim (no override)
              input.virtualSkillAim[si].cast = true;
              input.virtualSkillAim[si].aimX = 0;
              input.virtualSkillAim[si].aimY = 0;
            } else {
              // Aimed cast
              input.virtualSkillAim[si].cast = true;
            }

            input.virtualSkillAim[si].active = false;
            skillAimDirs.current[si] = { x: 0, y: 0 };
            setAimingSkill(null);
            setAimDir({ x: 0, y: 0 });
          }
        }
      }
    };

    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);

    return () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [input]);

  const onSkillTouchStart = useCallback((e: React.TouchEvent, index: number) => {
    e.preventDefault();
    if (!skills[index]?.ready) return;
    const t = e.changedTouches[0];
    skillTouchIds.current[index] = t.identifier;
    skillOrigins.current[index] = { x: t.clientX, y: t.clientY };
    skillAimDirs.current[index] = { x: 0, y: 0 };
    input.virtualSkillAim[index].active = true;
    input.virtualSkillAim[index].aimX = 0;
    input.virtualSkillAim[index].aimY = 0;
    input.virtualSkillAim[index].cast = false;
    input.virtualSkillAim[index].cancelled = false;
    setAimingSkill(index);
    setAimDir({ x: 0, y: 0 });
  }, [input, skills]);

  return (
    <div className="action-buttons">
      <div className="skill-buttons">
        {skills.map((s, i) => (
          <div
            key={i}
            ref={(el) => { skillBtnRefs.current[i] = el; }}
            className={`skill-btn${s.ready ? " ready" : ""}${aimingSkill === i ? " aiming" : ""}`}
            onTouchStart={(e) => onSkillTouchStart(e, i)}
          >
            <span className="skill-btn-key">{i + 1}</span>
            {!s.ready && <div className="skill-btn-cd" style={{ height: (1 - s.cdPct) * 100 + "%" }} />}
            {aimingSkill === i && (
              <div className="skill-aim-indicator">
                <div
                  className="skill-aim-arrow"
                  style={{
                    transform: `translate(${aimDir.x}px, ${aimDir.y}px)`,
                    opacity: Math.hypot(aimDir.x, aimDir.y) > CANCEL_THRESHOLD ? 1 : 0.4,
                  }}
                />
                {Math.hypot(aimDir.x, aimDir.y) > CANCEL_THRESHOLD && (
                  <div
                    className="skill-aim-line"
                    style={{
                      width: Math.hypot(aimDir.x, aimDir.y),
                      transform: `rotate(${Math.atan2(aimDir.y, aimDir.x)}rad)`,
                    }}
                  />
                )}
              </div>
            )}
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
