/**
 * Hero skill execution module.
 * Extracted from engine.ts — all 15 hero skills (5 heroes × 3).
 */

import type { SkillKind } from "./heroes";
import type { SkillContext, Enemy } from "./types";
import { FIELD, rand, clamp, dist } from "./types";

/**
 * Execute a hero skill.
 * @param ctx - Skill context with access to engine state
 * @param k - Which skill to execute
 * @param mobileAim - Whether skill aim was set via mobile joystick (affects meteor/blink targeting)
 */
export function executeSkill(ctx: SkillContext, k: SkillKind, mobileAim = false): void {
  const dmg = ctx.curDmg();
  switch (k) {
    // ---- Knight ----
    case "charge": {
      const dist0 = 70;
      const tx = clamp(ctx.px + ctx.aimX * dist0, FIELD.x + 8, FIELD.x + FIELD.w - 8);
      const ty = clamp(ctx.py + ctx.aimY * dist0, FIELD.y + 8, FIELD.y + FIELD.h - 8);
      for (const e of ctx.enemies) {
        if (distToSegment(e.x, e.y, ctx.px, ctx.py, tx, ty) < 18 + e.size * 0.4) {
          ctx.damageEnemy(e, dmg * 1.4);
        }
      }
      ctx.trail(ctx.px, ctx.py, tx, ty, "#c0c8d8");
      {
        const resolved = ctx.avoidObstacle(tx, ty, ctx.px, ctx.py, 7);
        ctx.setPx(resolved.x);
        ctx.setPy(resolved.y);
      }
      ctx.setInvuln(0.25);
      break;
    }
    case "spin": {
      for (const e of ctx.enemies) {
        if (dist(e.x, e.y, ctx.px, ctx.py) < 48 + e.size * 0.4) ctx.damageEnemy(e, dmg * 1.6);
      }
      ctx.spawnRing(ctx.px, ctx.py, "#ffd24a", 48);
      break;
    }
    case "warcry": {
      ctx.setDmgBuff(6, 1.6);
      ctx.setLifeStealBuff(6, 0.20);
      ctx.spawnRing(ctx.px, ctx.py, "#ff5a5a", 40);
      ctx.float("WAR CRY!", ctx.px, ctx.py - 18, "#ffd24a");
      break;
    }
    case "swordstorm": {
      const count = 5;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const ox = Math.cos(ang) * 18;
        const oy = Math.sin(ang) * 18;
        ctx.projectiles.push({
          x: ctx.px + ox,
          y: ctx.py + oy,
          vx: Math.cos(ang) * 160,
          vy: Math.sin(ang) * 160,
          dmg: dmg * 1.1,
          from: "player",
          kind: "sword",
          life: 3,
          radius: 7,
          homing: true,
          homingTurn: 6,
          hitSet2: new Set<Enemy>(),
          hitsLeft: 3,
        });
      }
      ctx.spawnRing(ctx.px, ctx.py, "#c0c8d8", 22);
      ctx.float("SWORD STORM", ctx.px, ctx.py - 18, "#c0c8d8");
      break;
    }
    // ---- Mage ----
    case "frostnova": {
      const novaMaxRadius = 120;
      const novaSpeed = 260;
      const novaDuration = novaMaxRadius / novaSpeed;
      ctx.playerNovaWaves.push({
        x: ctx.px, y: ctx.py,
        radius: 0, maxRadius: novaMaxRadius,
        speed: novaSpeed,
        dmg: dmg * 1.2,
        frozenDur: 2.5,
        duration: novaDuration,
        time: 0,
        hitSet: new Set(),
      });
      ctx.float("FROST NOVA", ctx.px, ctx.py - 18, "#7ad7ff");
      break;
    }
    case "meteor": {
      let tx: number, ty: number;
      if (mobileAim) {
        const mRange = 90;
        tx = clamp(ctx.px + ctx.aimX * mRange, FIELD.x + 8, FIELD.x + FIELD.w - 8);
        ty = clamp(ctx.py + ctx.aimY * mRange, FIELD.y + 8, FIELD.y + FIELD.h - 8);
      } else {
        tx = ctx.input.mouseX;
        ty = ctx.input.mouseY;
      }
      const hitR = 70;
      for (const e of ctx.enemies) {
        if (dist(e.x, e.y, tx, ty) < hitR + e.size * 0.4) ctx.damageEnemy(e, dmg * 2.4);
      }
      ctx.spawnRing(tx, ty, "#ff6a1a", hitR);
      ctx.spawnRing(tx, ty, "#ffd24a", hitR * 0.6);
      for (let i = 0; i < 40; i++) {
        const ang = rand(0, Math.PI * 2);
        const spd = rand(40, 120);
        ctx.particles.push({ x: tx, y: ty, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: rand(0.4, 0.7), color: i % 3 === 0 ? "#ffd24a" : i % 3 === 1 ? "#ff6a1a" : "#ff3a1a" });
      }
      for (let i = 0; i < 6; i++) {
        ctx.particles.push({ x: tx + rand(-20, 20), y: ty, vx: rand(-15, 15), vy: rand(-100, -50), life: 0.6, color: "#ff8a2a" });
      }
      break;
    }
    case "blink": {
      let tx: number, ty: number;
      if (mobileAim) {
        const bRange = 90;
        tx = clamp(ctx.px + ctx.aimX * bRange, FIELD.x + 8, FIELD.x + FIELD.w - 8);
        ty = clamp(ctx.py + ctx.aimY * bRange, FIELD.y + 8, FIELD.y + FIELD.h - 8);
      } else {
        tx = clamp(ctx.input.mouseX, FIELD.x + 8, FIELD.x + FIELD.w - 8);
        ty = clamp(ctx.input.mouseY, FIELD.y + 8, FIELD.y + FIELD.h - 8);
      }
      ctx.spawnRing(ctx.px, ctx.py, "#b388ff", 18);
      {
        const resolved = ctx.avoidObstacle(tx, ty, ctx.px, ctx.py, 7);
        ctx.setPx(resolved.x);
        ctx.setPy(resolved.y);
      }
      ctx.spawnRing(ctx.px, ctx.py, "#b388ff", 18);
      ctx.setInvuln(0.2);
      break;
    }
    // ---- Priest ----
    case "smite": {
      const mark = ctx.getSmiteMark();
      if (mark && ctx.enemies.includes(mark)) {
        const e = mark;
        const behind = e.faceLeft ? 1 : -1;
        const bx = clamp(e.x + behind * 28, FIELD.x + 8, FIELD.x + FIELD.w - 8);
        const by = clamp(e.y + 8, FIELD.y + 8, FIELD.y + FIELD.h - 8);
        ctx.spawnRing(ctx.px, ctx.py, "#ffd24a", 18);
        ctx.setPx(bx);
        ctx.setPy(by);
        ctx.spawnRing(ctx.px, ctx.py, "#ffd24a", 18);
        ctx.damageEnemy(e, dmg * 2.2);
        ctx.setInvuln(0.15);
        ctx.setSmiteMark(null);
        ctx.float("SMITE!", ctx.px, ctx.py - 18, "#ffd24a");
      } else {
        ctx.firePiercing(ctx.aimX, ctx.aimY, dmg * 1.8, "bolt");
        ctx.setSmiteMark(null);
      }
      break;
    }
    case "heal": {
      const healAmt = Math.round(ctx.phpMax * 0.4);
      ctx.setPhp(Math.min(ctx.phpMax, ctx.php + healAmt));
      ctx.setHealOverTime(4, Math.round(ctx.phpMax * 0.08));
      ctx.setDivineHealTime(0.8);
      for (const e of ctx.enemies) {
        if (dist(e.x, e.y, ctx.px, ctx.py) < 80 + e.size * 0.4) {
          ctx.damageEnemy(e, dmg * 0.8);
        }
      }
      ctx.float("+" + healAmt, ctx.px, ctx.py - 18, "#5fff8f");
      ctx.spawnRing(ctx.px, ctx.py, "#ffd24a", 80);
      break;
    }
    case "sanctuary": {
      ctx.setHealZone(ctx.px, ctx.py, 5);
      ctx.setInvuln(1.5);
      ctx.spawnRing(ctx.px, ctx.py, "#ffd24a", 46);
      ctx.float("SANCTUARY", ctx.px, ctx.py - 18, "#ffd24a");
      break;
    }
    // ---- Tank ----
    case "groundslam": {
      const slamRadius = 80;
      for (const e of ctx.enemies) {
        const d = dist(e.x, e.y, ctx.px, ctx.py);
        if (d < slamRadius + e.size * 0.4) {
          ctx.damageEnemy(e, dmg * 1.3);
          const a = Math.atan2(e.y - ctx.py, e.x - ctx.px);
          e.x = clamp(e.x + Math.cos(a) * 45, FIELD.x + 6, FIELD.x + FIELD.w - 6);
          e.y = clamp(e.y + Math.sin(a) * 45, FIELD.y + 6, FIELD.y + FIELD.h - 6);
        }
      }
      ctx.spawnRing(ctx.px, ctx.py, "#8a8f99", slamRadius);
      break;
    }
    case "taunt": {
      ctx.setShield(4);
      ctx.setInvuln(0.3);
      ctx.spawnRing(ctx.px, ctx.py, "#9aa3b5", 36);
      ctx.float("SHIELD", ctx.px, ctx.py - 16, "#c0c8d8");
      break;
    }
    case "berserk": {
      ctx.setDmgBuff(6, 2.0);
      ctx.setSpeedBuff(6, 1.6);
      for (const e of ctx.enemies) {
        if (dist(e.x, e.y, ctx.px, ctx.py) < 100 + e.size * 0.4) {
          ctx.damageEnemy(e, dmg * 1.2);
          e.taunted = 5;
        }
      }
      ctx.spawnRing(ctx.px, ctx.py, "#ff3a1a", 100);
      ctx.float("BERSERK!", ctx.px, ctx.py - 18, "#ff3a1a");
      break;
    }
    // ---- Archer ----
    case "multishot": {
      const base = Math.atan2(ctx.aimY, ctx.aimX);
      for (let i = -2; i <= 2; i++) {
        const a = base + i * 0.18;
        ctx.fireProjectile(Math.cos(a), Math.sin(a), dmg * 1.2, "arrow");
      }
      ctx.setDoubleVolley(0.2, dmg);
      break;
    }
    case "rapidfire": {
      ctx.setRapidFire(4);
      ctx.float("RAPID FIRE", ctx.px, ctx.py - 18, "#3f8f5a");
      ctx.spawnRing(ctx.px, ctx.py, "#3f8f5a", 24);
      break;
    }
    case "snipe": {
      ctx.firePiercing(ctx.aimX, ctx.aimY, dmg * 4, "arrow", true);
      ctx.setDodgeTimer(3);
      ctx.float("DODGE", ctx.px, ctx.py - 18, "#7ab8ff");
      ctx.spawnRing(ctx.px, ctx.py, "#7ab8ff", 24);
      break;
    }
  }
}

// ---- Helper ----

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
