/**
 * Hero skill execution module.
 * Extracted from engine.ts — all 15 hero skills (5 heroes × 3).
 * Supports skill levels (1-3) and branch specials at level 3.
 */

import type { SkillKind } from "./heroes";
import type { SkillContext, Enemy } from "./types";
import { FIELD, rand, clamp, dist } from "./types";

/**
 * Execute a hero skill.
 * ctx.skillLevel and ctx.skillBranch control upgrade scaling.
 */
export function executeSkill(ctx: SkillContext, k: SkillKind, mobileAim = false): void {
  const dmg = ctx.curDmg();
  const lv = ctx.skillLevel;
  const branch = ctx.skillBranch;

  switch (k) {
    // ---- Knight ----
    case "charge": {
      const dist0 = lv >= 2 ? 90 : 70;
      const dmgMult = branch === "battering_ram" ? 1.8 : branch === "shadow_rush" ? 1.3 : lv >= 2 ? 1.7 : 1.4;
      const tx = clamp(ctx.px + ctx.aimX * dist0, FIELD.x + 8, FIELD.x + FIELD.w - 8);
      const ty = clamp(ctx.py + ctx.aimY * dist0, FIELD.y + 8, FIELD.y + FIELD.h - 8);
      for (const e of ctx.enemies) {
        if (distToSegment(e.x, e.y, ctx.px, ctx.py, tx, ty) < 18 + e.size * 0.4) {
          ctx.damageEnemy(e, dmg * dmgMult);
          if (branch === "battering_ram") {
            const a = Math.atan2(e.y - ctx.py, e.x - ctx.px);
            e.x = clamp(e.x + Math.cos(a) * 40, FIELD.x + 6, FIELD.x + FIELD.w - 6);
            e.y = clamp(e.y + Math.sin(a) * 40, FIELD.y + 6, FIELD.y + FIELD.h - 6);
            e.frozen = Math.max(e.frozen, 1.0);
          }
        }
      }
      ctx.trail(ctx.px, ctx.py, tx, ty, "#c0c8d8");
      {
        const resolved = ctx.avoidObstacle(tx, ty, ctx.px, ctx.py, 7);
        ctx.setPx(resolved.x);
        ctx.setPy(resolved.y);
      }
      ctx.setInvuln(lv >= 2 ? 0.35 : 0.25);
      if (branch === "shadow_rush") {
        ctx.setDoubleVolley(0.3, dmg);
      }
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
      const dur = lv >= 2 ? 8 : 6;
      const mult = lv >= 2 ? 1.8 : 1.6;
      ctx.setDmgBuff(dur, mult);
      const lsFrac = branch === "bloodlust" ? 0.30 : 0.20;
      ctx.setLifeStealBuff(dur, lsFrac);
      if (branch === "rallying_cry") {
        ctx.setSpeedBuff(dur, 1.3);
        for (const e of ctx.enemies) {
          if (dist(e.x, e.y, ctx.px, ctx.py) < 80 + e.size * 0.4) {
            e.frozen = Math.max(e.frozen, 2.0);
          }
        }
      }
      ctx.spawnRing(ctx.px, ctx.py, "#ff5a5a", 40);
      ctx.float("WAR CRY!", ctx.px, ctx.py - 18, "#ffd24a");
      break;
    }
    case "swordstorm": {
      const count = lv >= 2 ? 7 : 5;
      const swordLife = lv >= 2 ? 4 : 3;
      const hitsPerSword = branch === "soul_blades" ? 999 : lv >= 2 ? 5 : 3;
      const swordDmgMult = branch === "soul_blades" ? 0.9 : branch === "blade_vortex" ? 1.3 : 1.1;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const ox = Math.cos(ang) * 18;
        const oy = Math.sin(ang) * 18;
        ctx.projectiles.push({
          x: ctx.px + ox,
          y: ctx.py + oy,
          vx: Math.cos(ang) * 160,
          vy: Math.sin(ang) * 160,
          dmg: dmg * swordDmgMult,
          from: "player",
          kind: "sword",
          life: swordLife,
          radius: 7,
          homing: branch !== "blade_vortex",
          homingTurn: 6,
          hitSet2: new Set<Enemy>(),
          hitsLeft: hitsPerSword,
        });
      }
      ctx.spawnRing(ctx.px, ctx.py, "#c0c8d8", 22);
      ctx.float("SWORD STORM", ctx.px, ctx.py - 18, "#c0c8d8");
      break;
    }
    // ---- Mage ----
    case "frostnova": {
      const novaMaxRadius = lv >= 2 ? 150 : 120;
      const frozenDur = lv >= 2 ? 3.5 : 2.5;
      const novaDmgMult = branch === "absolute_zero" ? 1.5 : 1.2;
      const novaSpeed = 260;
      const novaDuration = novaMaxRadius / novaSpeed;
      ctx.playerNovaWaves.push({
        x: ctx.px, y: ctx.py,
        radius: 0, maxRadius: novaMaxRadius,
        speed: novaSpeed,
        dmg: dmg * novaDmgMult,
        frozenDur,
        duration: novaDuration,
        time: 0,
        hitSet: new Set(),
      });
      ctx.float(branch === "permafrost" ? "PERMAFROST" : "FROST NOVA", ctx.px, ctx.py - 18, "#7ad7ff");
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
      const hitR = branch === "supernova" ? 120 : lv >= 2 ? 85 : 70;
      const meteorDmgMult = branch === "supernova" ? 3.5 : branch === "apocalypse" ? 2.0 : lv >= 2 ? 2.8 : 2.4;

      if (branch === "apocalypse") {
        for (let i = 0; i < 3; i++) {
          const ang = rand(0, Math.PI * 2);
          const off = rand(15, 45);
          const mx = clamp(tx + Math.cos(ang) * off, FIELD.x + 8, FIELD.x + FIELD.w - 8);
          const my = clamp(ty + Math.sin(ang) * off, FIELD.y + 8, FIELD.y + FIELD.h - 8);
          for (const e of ctx.enemies) {
            if (dist(e.x, e.y, mx, my) < 50 + e.size * 0.4) ctx.damageEnemy(e, dmg * meteorDmgMult);
          }
          ctx.spawnRing(mx, my, "#ff6a1a", 50);
          for (let p = 0; p < 12; p++) {
            const pa = rand(0, Math.PI * 2);
            const ps = rand(30, 80);
            ctx.particles.push({ x: mx, y: my, vx: Math.cos(pa) * ps, vy: Math.sin(pa) * ps, life: rand(0.3, 0.6), color: p % 2 === 0 ? "#ffd24a" : "#ff6a1a" });
          }
        }
      } else {
        for (const e of ctx.enemies) {
          if (dist(e.x, e.y, tx, ty) < hitR + e.size * 0.4) ctx.damageEnemy(e, dmg * meteorDmgMult);
        }
        ctx.spawnRing(tx, ty, "#ff6a1a", hitR);
        ctx.spawnRing(tx, ty, "#ffd24a", hitR * 0.6);
        for (let i = 0; i < 40; i++) {
          const ang = rand(0, Math.PI * 2);
          const spd = rand(40, 120);
          ctx.particles.push({ x: tx, y: ty, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: rand(0.4, 0.7), color: i % 3 === 0 ? "#ffd24a" : i % 3 === 1 ? "#ff6a1a" : "#ff3a1a" });
        }
      }
      for (let i = 0; i < 6; i++) {
        ctx.particles.push({ x: tx + rand(-20, 20), y: ty, vx: rand(-15, 15), vy: rand(-100, -50), life: 0.6, color: "#ff8a2a" });
      }
      break;
    }
    case "blink": {
      const bRange = lv >= 2 ? 120 : 90;
      let tx: number, ty: number;
      if (mobileAim) {
        tx = clamp(ctx.px + ctx.aimX * bRange, FIELD.x + 8, FIELD.x + FIELD.w - 8);
        ty = clamp(ctx.py + ctx.aimY * bRange, FIELD.y + 8, FIELD.y + FIELD.h - 8);
      } else {
        tx = clamp(ctx.input.mouseX, FIELD.x + 8, FIELD.x + FIELD.w - 8);
        ty = clamp(ctx.input.mouseY, FIELD.y + 8, FIELD.y + FIELD.h - 8);
      }
      if (branch === "phase_shift") {
        for (const e of ctx.enemies) {
          if (dist(e.x, e.y, ctx.px, ctx.py) < 40 + e.size * 0.4) {
            ctx.damageEnemy(e, dmg * 1.2);
          }
        }
        ctx.spawnRing(ctx.px, ctx.py, "#b388ff", 40);
      } else {
        ctx.spawnRing(ctx.px, ctx.py, "#b388ff", 18);
      }
      {
        const resolved = ctx.avoidObstacle(tx, ty, ctx.px, ctx.py, 7);
        ctx.setPx(resolved.x);
        ctx.setPy(resolved.y);
      }
      if (branch === "warp_strike") {
        for (const e of ctx.enemies) {
          if (dist(e.x, e.y, ctx.px, ctx.py) < 50 + e.size * 0.4) {
            ctx.damageEnemy(e, dmg * 1.5);
          }
        }
        ctx.spawnRing(ctx.px, ctx.py, "#b388ff", 50);
      } else {
        ctx.spawnRing(ctx.px, ctx.py, "#b388ff", 18);
      }
      ctx.setInvuln(lv >= 2 ? 0.4 : 0.2);
      break;
    }
    // ---- Priest ----
    case "smite": {
      const mark = ctx.getSmiteMark();
      const boltDmgMult = lv >= 2 ? 2.5 : 1.8;

      if (mark && ctx.enemies.includes(mark)) {
        const e = mark;
        const execMult = (branch === "divine_execute" && e.hp / e.maxHp < 0.3) ? 4.0 : lv >= 2 ? 2.8 : 2.2;
        const behind = e.faceLeft ? 1 : -1;
        const bx = clamp(e.x + behind * 28, FIELD.x + 8, FIELD.x + FIELD.w - 8);
        const by = clamp(e.y + 8, FIELD.y + 8, FIELD.y + FIELD.h - 8);
        ctx.spawnRing(ctx.px, ctx.py, "#ffd24a", 18);
        ctx.setPx(bx);
        ctx.setPy(by);
        ctx.spawnRing(ctx.px, ctx.py, "#ffd24a", 18);
        ctx.damageEnemy(e, dmg * execMult);
        ctx.setInvuln(0.15);
        ctx.setSmiteMark(null);
        ctx.float("SMITE!", ctx.px, ctx.py - 18, "#ffd24a");
      } else {
        ctx.firePiercing(ctx.aimX, ctx.aimY, dmg * boltDmgMult, "bolt");
        ctx.setSmiteMark(null);
      }
      break;
    }
    case "heal": {
      const healPct = branch === "renewal" ? 0.30 : lv >= 2 ? 0.50 : 0.40;
      const healAmt = Math.round(ctx.phpMax * healPct);
      ctx.setPhp(Math.min(ctx.phpMax, ctx.php + healAmt));
      const hotDur = branch === "renewal" ? 6 : lv >= 2 ? 5 : 4;
      const hotPct = branch === "renewal" ? 0.12 : lv >= 2 ? 0.10 : 0.08;
      ctx.setHealOverTime(hotDur, Math.round(ctx.phpMax * hotPct));
      ctx.setDivineHealTime(0.8);
      const aoeRadius = branch === "divine_wrath" ? 100 : 80;
      for (const e of ctx.enemies) {
        if (dist(e.x, e.y, ctx.px, ctx.py) < aoeRadius + e.size * 0.4) {
          ctx.damageEnemy(e, dmg * 0.8);
          if (branch === "divine_wrath") {
            e.frozen = Math.max(e.frozen, 1.5);
          }
        }
      }
      ctx.float("+" + healAmt, ctx.px, ctx.py - 18, "#5fff8f");
      ctx.spawnRing(ctx.px, ctx.py, "#ffd24a", aoeRadius);
      break;
    }
    case "sanctuary": {
      const zoneDur = lv >= 2 ? 7 : 5;
      ctx.setHealZone(ctx.px, ctx.py, zoneDur);
      ctx.setInvuln(1.5);
      ctx.spawnRing(ctx.px, ctx.py, "#ffd24a", lv >= 2 ? 60 : 46);
      ctx.float("SANCTUARY", ctx.px, ctx.py - 18, "#ffd24a");
      break;
    }
    // ---- Tank ----
    case "groundslam": {
      const slamRadius = lv >= 2 ? 100 : 80;
      const slamDmgMult = lv >= 2 ? 1.5 : 1.3;
      for (const e of ctx.enemies) {
        const d = dist(e.x, e.y, ctx.px, ctx.py);
        if (d < slamRadius + e.size * 0.4) {
          ctx.damageEnemy(e, dmg * slamDmgMult);
          const a = Math.atan2(e.y - ctx.py, e.x - ctx.px);
          e.x = clamp(e.x + Math.cos(a) * 45, FIELD.x + 6, FIELD.x + FIELD.w - 6);
          e.y = clamp(e.y + Math.sin(a) * 45, FIELD.y + 6, FIELD.y + FIELD.h - 6);
        }
      }
      ctx.spawnRing(ctx.px, ctx.py, "#8a8f99", slamRadius);
      if (branch === "fissure") {
        const fissureRange = 120;
        const fx = ctx.px + ctx.aimX * fissureRange;
        const fy = ctx.py + ctx.aimY * fissureRange;
        for (const e of ctx.enemies) {
          if (distToSegment(e.x, e.y, ctx.px, ctx.py, fx, fy) < 20 + e.size * 0.4) {
            ctx.damageEnemy(e, dmg * 1.8);
          }
        }
        ctx.trail(ctx.px, ctx.py, fx, fy, "#8a8f99");
      }
      break;
    }
    case "taunt": {
      const shieldDur = lv >= 2 ? 5 : 4;
      ctx.setShield(shieldDur);
      ctx.setInvuln(0.3);
      ctx.spawnRing(ctx.px, ctx.py, "#9aa3b5", 36);
      ctx.float("SHIELD", ctx.px, ctx.py - 16, "#c0c8d8");
      break;
    }
    case "berserk": {
      const dur = lv >= 2 ? 7 : 6;
      const bDmgMult = lv >= 2 ? 2.2 : 2.0;
      const spdMult = branch === "unstoppable" ? 3.0 : 1.6;
      const shockRadius = lv >= 2 ? 120 : 100;
      ctx.setDmgBuff(dur, bDmgMult);
      ctx.setSpeedBuff(dur, spdMult);
      for (const e of ctx.enemies) {
        if (dist(e.x, e.y, ctx.px, ctx.py) < shockRadius + e.size * 0.4) {
          ctx.damageEnemy(e, dmg * 1.2);
          e.taunted = 5;
        }
      }
      ctx.spawnRing(ctx.px, ctx.py, "#ff3a1a", shockRadius);
      ctx.float("BERSERK!", ctx.px, ctx.py - 18, "#ff3a1a");
      break;
    }
    // ---- Archer ----
    case "multishot": {
      const arrowCount = lv >= 2 ? 7 : 5;
      const arrowDmgMult = lv >= 2 ? 1.3 : 1.2;
      const base = Math.atan2(ctx.aimY, ctx.aimX);
      const half = Math.floor(arrowCount / 2);

      if (branch === "rain_of_arrows") {
        const range = 80;
        const tx = clamp(ctx.px + ctx.aimX * range, FIELD.x + 8, FIELD.x + FIELD.w - 8);
        const ty = clamp(ctx.py + ctx.aimY * range, FIELD.y + 8, FIELD.y + FIELD.h - 8);
        for (const e of ctx.enemies) {
          if (dist(e.x, e.y, tx, ty) < 80 + e.size * 0.4) {
            ctx.damageEnemy(e, dmg * 1.1);
          }
        }
        ctx.spawnRing(tx, ty, "#ffd24a", 80);
        for (let i = 0; i < 15; i++) {
          const ang = rand(0, Math.PI * 2);
          const spd = rand(20, 60);
          ctx.particles.push({ x: tx + rand(-30, 30), y: ty + rand(-30, 30), vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: rand(0.2, 0.5), color: "#ffd24a" });
        }
      } else {
        for (let i = -half; i <= half; i++) {
          const a = base + i * 0.18;
          ctx.fireProjectile(Math.cos(a), Math.sin(a), dmg * arrowDmgMult, "arrow");
        }
      }
      ctx.setDoubleVolley(0.2, dmg);
      break;
    }
    case "rapidfire": {
      const dur = lv >= 2 ? 5 : 4;
      ctx.setRapidFire(dur);
      if (branch === "bullet_time") {
        ctx.setDodgeTimer(dur);
      }
      ctx.float("RAPID FIRE", ctx.px, ctx.py - 18, "#3f8f5a");
      ctx.spawnRing(ctx.px, ctx.py, "#3f8f5a", 24);
      break;
    }
    case "snipe": {
      const snipeDmgMult = branch === "headshot" ? 6.0 : branch === "piercing_round" ? 4.5 : lv >= 2 ? 5.0 : 4.0;
      ctx.firePiercing(ctx.aimX, ctx.aimY, dmg * snipeDmgMult, "arrow", true);
      const dodgeDur = lv >= 2 ? 4 : 3;
      ctx.setDodgeTimer(dodgeDur);
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
