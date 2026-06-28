/**
 * Boss spell logic extracted from engine.ts.
 * All helpers receive a GameContext instead of using `this`.
 */

import type { GameContext, Enemy, HazardAoE, HazardBeam, HazardPool, Projectile } from "./types";
import { FIELD, rand, clamp, dist } from "./types";
import type { BossKind, BossSpell, MonsterKind } from "./monsters";

// ---- exported utilities ----

export function bossKindOf(boss: Enemy): BossKind {
  return boss.spriteKey.replace("b_", "") as BossKind;
}

// ---- spell building blocks (module-private) ----

function spawnCone(ctx: GameContext, boss: Enemy, count: number, spreadRad: number, speed: number, dmgMult: number, tint: string, kind: "bolt" | "fireball" = "bolt") {
  const base = Math.atan2(ctx.py - boss.y, ctx.px - boss.x);
  for (let i = 0; i < count; i++) {
    const ang = base + (count > 1 ? (i - (count - 1) / 2) * (spreadRad / (count - 1)) : 0);
    ctx.projectiles.push({
      x: boss.x, y: boss.y,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      dmg: Math.round(boss.dmg * dmgMult),
      from: "enemy", kind, life: 2.5, radius: 4, tint,
    });
  }
}

function spawnBoltRing(ctx: GameContext, boss: Enemy, count: number, speed: number, dmgMult: number, tint: string, jitter = 0, kind: "bolt" | "fireball" = "bolt") {
  const base = rand(0, Math.PI * 2);
  for (let i = 0; i < count; i++) {
    const ang = base + (i / count) * Math.PI * 2 + (jitter ? rand(-jitter, jitter) : 0);
    ctx.projectiles.push({
      x: boss.x, y: boss.y,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      dmg: Math.round(boss.dmg * dmgMult),
      from: "enemy", kind, life: 2.6, radius: 4, tint,
    });
  }
}

function spawnPoolAt(ctx: GameContext, x: number, y: number, radius: number, time: number, dmgPerSec: number, slow: number, slowTime: number, snare: boolean, snareTime: number, color: string, kind: "slime" | "lava" | "web" | "ink", telegraph: number) {
  ctx.pools.push({
    x: clamp(x, FIELD.x + 16, FIELD.x + FIELD.w - 16),
    y: clamp(y, FIELD.y + 16, FIELD.y + FIELD.h - 16),
    radius, time, timeMax: time, dmgPerSec,
    slow, slowTime, snare, snareTime,
    color, kind, tickAcc: 0, spawnTelegraph: telegraph,
  });
}

function spawnExplosion(ctx: GameContext, x: number, y: number, radius: number, telegraph: number, dmgMult: number, color: string, boss: Enemy, knockback = 0, leavePool = false, poolColor = "#ff6a2a") {
  ctx.hazards.push({
    x: clamp(x, FIELD.x + 16, FIELD.x + FIELD.w - 16),
    y: clamp(y, FIELD.y + 16, FIELD.y + FIELD.h - 16),
    radius, telegraph, telegraphMax: telegraph,
    dmg: Math.round(boss.dmg * dmgMult),
    color, exploded: false, fade: 0, kind: "eruption",
    knockback, leavePool, poolColor,
  });
}

function spawnWall(ctx: GameContext, boss: Enemy, segs: number, gap: number, radius: number, time: number, dmgPerSec: number, slow: number, slowTime: number, snare: boolean, snareTime: number, color: string, kind: "slime" | "lava" | "web" | "ink") {
  const toPlayer = Math.atan2(ctx.py - boss.y, ctx.px - boss.x);
  const perp = toPlayer + Math.PI / 2;
  for (let i = 0; i < segs; i++) {
    const off = (i - (segs - 1) / 2) * gap;
    const x = ctx.px + Math.cos(perp) * off;
    const y = ctx.py + Math.sin(perp) * off;
    spawnPoolAt(ctx, x, y, radius, time, dmgPerSec, slow, slowTime, snare, snareTime, color, kind, 0.4);
  }
}

// ---- main spell dispatcher ----

export function castBossSpell(ctx: GameContext, boss: Enemy, spell: BossSpell): void {
  const t = spell.tier;
  switch (spell.kind) {
    // ----- lava family -----
    case "meteor": {
      const count = t === 1 ? 4 : t === 2 ? 6 : 8;
      const teleBase = t === 3 ? 0.25 : 0.35;
      for (let i = 0; i < count; i++) {
        const ang = rand(0, Math.PI * 2);
        const off = rand(20, 80);
        const tx = clamp(ctx.px + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
        const ty = clamp(ctx.py + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
        const tele = teleBase + i * 0.2;
        ctx.hazards.push({
          x: tx, y: ty, radius: 50,
          telegraph: tele, telegraphMax: tele,
          dmg: Math.round(boss.dmg * 1.2),
          color: "#ff6a2a",
          exploded: false, fade: 0, kind: "meteor",
        });
      }
      ctx.float("METEOR STORM!", boss.x, boss.y - 30, "#ff6a2a");
      break;
    }
    // ----- slime family (Stage B) -----
    case "split": {
      const count = t === 1 ? 2 : t === 2 ? 4 : 6;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + rand(-0.2, 0.2);
        const off = 30 + rand(0, 20);
        ctx.spawnMini("slime", boss.x + Math.cos(ang) * off, boss.y + Math.sin(ang) * off,
          Math.round(boss.maxHp * 0.08), Math.round(boss.dmg * 0.4), 14);
      }
      ctx.spawnRing(boss.x, boss.y, "#5fcc5f", 40);
      ctx.float("SPLIT!", boss.x, boss.y - 30, "#5fcc5f");
      break;
    }
    case "slimePool": {
      const count = t === 1 ? 1 : t === 2 ? 3 : 5;
      for (let i = 0; i < count; i++) {
        const ang = rand(0, Math.PI * 2);
        const off = rand(30, 90);
        const tx = clamp(boss.x + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
        const ty = clamp(boss.y + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
        ctx.pools.push({
          x: tx, y: ty, radius: 28,
          time: 5, timeMax: 5,
          dmgPerSec: Math.round(boss.dmg * 0.4),
          slow: 0.5, slowTime: 2, snare: false, snareTime: 0,
          color: "#5fcc5f", kind: "slime",
          tickAcc: 0, spawnTelegraph: 0.25,
        });
      }
      ctx.float("SLIME POOL!", boss.x, boss.y - 30, "#5fcc5f");
      break;
    }
    case "bounceSlam": {
      const slams = t === 1 ? 1 : t === 2 ? 2 : 1;
      const radius = t === 3 ? 80 : 50;
      const knock = t === 2 ? 45 : t === 3 ? 60 : 0;
      for (let i = 0; i < slams; i++) {
        const off = i === 0 ? 0 : 50;
        const ang = rand(0, Math.PI * 2);
        const tx = clamp(ctx.px + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
        const ty = clamp(ctx.py + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
        const tele = 0.4 + i * 0.25;
        ctx.hazards.push({
          x: tx, y: ty, radius,
          telegraph: tele, telegraphMax: tele,
          dmg: Math.round(boss.dmg * 1.0),
          color: "#5fcc5f",
          exploded: false, fade: 0, kind: "bounceSlam",
          knockback: knock,
        });
      }
      boss.castLock = 0.4 + slams * 0.25;
      ctx.float("BOUNCE SLAM!", boss.x, boss.y - 30, "#5fcc5f");
      break;
    }
    // ----- spider family (Stage C) -----
    case "webBarrage": {
      const count = t === 1 ? 6 : t === 2 ? 12 : 18;
      const baseAng = Math.atan2(ctx.py - boss.y, ctx.px - boss.x);
      for (let i = 0; i < count; i++) {
        let ang: number;
        if (t === 1) {
          ang = baseAng + (i - (count - 1) / 2) * (Math.PI / 3 / (count - 1));
        } else {
          ang = (i / count) * Math.PI * 2 + (t === 3 ? rand(-0.1, 0.1) : 0);
        }
        const speed = t === 3 ? 200 : 180;
        ctx.projectiles.push({
          x: boss.x, y: boss.y,
          vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
          dmg: Math.round(boss.dmg * 0.6),
          from: "enemy", kind: "bolt", life: 2.5, radius: 4,
          tint: "#dfe3e8",
        });
      }
      ctx.float("WEB BARRAGE!", boss.x, boss.y - 30, "#dfe3e8");
      break;
    }
    case "webTrap": {
      const count = t === 1 ? 1 : t === 2 ? 3 : 5;
      for (let i = 0; i < count; i++) {
        const ang = rand(0, Math.PI * 2);
        const off = rand(20, 80);
        const tx = clamp(ctx.px + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
        const ty = clamp(ctx.py + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
        ctx.pools.push({
          x: tx, y: ty, radius: 24,
          time: 4, timeMax: 4,
          dmgPerSec: 0,
          slow: 0, slowTime: 0, snare: true, snareTime: 1.5,
          color: "#e8e8f0", kind: "web",
          tickAcc: 0, spawnTelegraph: 0.3,
        });
      }
      ctx.float("WEB TRAP!", boss.x, boss.y - 30, "#e8e8f0");
      break;
    }
    case "summonSpiderlings": {
      const count = t === 1 ? 2 : t === 2 ? 4 : 6;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const off = 40;
        ctx.spawnMini("spider", boss.x + Math.cos(ang) * off, boss.y + Math.sin(ang) * off,
          Math.round(boss.maxHp * 0.06), Math.round(boss.dmg * 0.5), 14);
      }
      if (t === 3) {
        for (const e of ctx.enemies) {
          if (!e.isBoss) e.speed *= 1.4;
        }
        ctx.float("HASTE!", boss.x, boss.y - 30, "#ffd24a");
      }
      ctx.spawnRing(boss.x, boss.y, "#dfe3e8", 40);
      ctx.float("SUMMON!", boss.x, boss.y - 45, "#dfe3e8");
      break;
    }
    // ----- lich family (Stage D) -----
    case "deathBeam": {
      const beamCount = t === 1 ? 1 : t === 2 ? 2 : 1;
      const sweep = t === 3 ? 1.2 : 0;
      const tele = 0.5, active = 0.3;
      for (let i = 0; i < beamCount; i++) {
        let tx: number, ty: number;
        if (i === 0) {
          tx = ctx.px; ty = ctx.py;
        } else {
          const ang = Math.atan2(ctx.py - boss.y, ctx.px - boss.x) + rand(-0.8, 0.8);
          const len = dist(boss.x, boss.y, ctx.px, ctx.py);
          tx = boss.x + Math.cos(ang) * len;
          ty = boss.y + Math.sin(ang) * len;
        }
        const baseAng = Math.atan2(ty - boss.y, tx - boss.x);
        ctx.beams.push({
          x1: boss.x, y1: boss.y, x2: tx, y2: ty,
          telegraph: tele, telegraphMax: tele,
          active: 0, activeMax: active,
          dmgTick: 0, dmg: Math.round(boss.dmg * 1.5),
          color: "#a06cff",
          sweep, sweepAngle: 0, baseAngle: baseAng,
        });
      }
      boss.castLock = tele + active;
      ctx.float("DEATH BEAM!", boss.x, boss.y - 30, "#a06cff");
      break;
    }
    case "boneRing": {
      const count = t === 1 ? 8 : t === 2 ? 16 : 24;
      const baseAng = rand(0, Math.PI * 2);
      for (let i = 0; i < count; i++) {
        const ang = baseAng + (i / count) * Math.PI * 2 + (t === 3 ? Math.sin(i * 0.5) * 0.3 : 0);
        ctx.projectiles.push({
          x: boss.x, y: boss.y,
          vx: Math.cos(ang) * 200, vy: Math.sin(ang) * 200,
          dmg: Math.round(boss.dmg * 0.7),
          from: "enemy", kind: "bolt", life: 2.5, radius: 4,
          tint: "#c8b8e8",
        });
      }
      ctx.float("BONE RING!", boss.x, boss.y - 30, "#c8b8e8");
      break;
    }
    case "raiseDead": {
      const skel = t === 1 ? 2 : t === 2 ? 3 : 4;
      const ghosts = t === 1 ? 0 : t === 2 ? 1 : 2;
      for (let i = 0; i < skel; i++) {
        const ang = rand(0, Math.PI * 2);
        const off = rand(30, 60);
        ctx.spawnMini("skeleton", boss.x + Math.cos(ang) * off, boss.y + Math.sin(ang) * off,
          Math.round(boss.maxHp * 0.1), Math.round(boss.dmg * 0.5), 16);
      }
      for (let i = 0; i < ghosts; i++) {
        const ang = rand(0, Math.PI * 2);
        const off = rand(30, 60);
        ctx.spawnMini("ghost", boss.x + Math.cos(ang) * off, boss.y + Math.sin(ang) * off,
          Math.round(boss.maxHp * 0.08), Math.round(boss.dmg * 0.4), 16);
      }
      ctx.spawnRing(boss.x, boss.y, "#a06cff", 40);
      ctx.float("RAISE DEAD!", boss.x, boss.y - 30, "#a06cff");
      break;
    }
    // ----- lava pools/eruption (Stage E) -----
    case "lavaPool": {
      const count = t === 1 ? 1 : t === 2 ? 3 : 5;
      for (let i = 0; i < count; i++) {
        const ang = rand(0, Math.PI * 2);
        const off = rand(30, 100);
        const tx = clamp(ctx.px + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
        const ty = clamp(ctx.py + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
        ctx.pools.push({
          x: tx, y: ty, radius: 32,
          time: 6, timeMax: 6,
          dmgPerSec: Math.round(boss.dmg * 0.6),
          slow: 0.3, slowTime: 1, snare: false, snareTime: 0,
          color: "#ff6a2a", kind: "lava",
          tickAcc: 0, spawnTelegraph: 0.3,
        });
      }
      ctx.float("LAVA POOL!", boss.x, boss.y - 30, "#ff6a2a");
      break;
    }
    case "eruption": {
      const radius = t === 1 ? 60 : t === 2 ? 90 : 120;
      const knock = t === 1 ? 0 : t === 2 ? 45 : 60;
      const leavePool = t === 3;
      const tele = 0.4;
      ctx.hazards.push({
        x: boss.x, y: boss.y, radius,
        telegraph: tele, telegraphMax: tele,
        dmg: Math.round(boss.dmg * 1.3),
        color: "#ff3a2a",
        exploded: false, fade: 0, kind: "eruption",
        knockback: knock,
        leavePool,
        poolColor: "#ff6a2a",
      });
      boss.castLock = 0.5;
      ctx.float("ERUPTION!", boss.x, boss.y - 30, "#ff3a2a");
      break;
    }

    // ========== GIANT SLIME — phase 2 ==========
    case "acidSpray": {
      spawnCone(ctx, boss, 7, Math.PI * 0.55, 170, 0.55, "#9be04a");
      boss.castLock = 0.3;
      ctx.float("ACID SPRAY!", boss.x, boss.y - 30, "#9be04a");
      break;
    }
    case "slimeWall": {
      spawnWall(ctx, boss, 5, 30, 24, 5, Math.round(boss.dmg * 0.4), 0.5, 1.5, false, 0, "#5fcc5f", "slime");
      ctx.float("SLIME WALL!", boss.x, boss.y - 30, "#5fcc5f");
      break;
    }
    case "doubleSlam": {
      spawnExplosion(ctx, ctx.px, ctx.py, 52, 0.45, 1.0, "#5fcc5f", boss, 40);
      const a = Math.atan2(ctx.py - boss.y, ctx.px - boss.x);
      spawnExplosion(ctx, ctx.px + Math.cos(a) * 60, ctx.py + Math.sin(a) * 60, 52, 0.7, 1.0, "#5fcc5f", boss, 40);
      boss.castLock = 0.9;
      ctx.float("DOUBLE SLAM!", boss.x, boss.y - 30, "#5fcc5f");
      break;
    }

    // ========== GIANT SLIME — phase 3 ==========
    case "toxicFlood": {
      for (let i = 0; i < 6; i++) {
        const ang = rand(0, Math.PI * 2);
        const off = rand(30, 110);
        spawnPoolAt(ctx, ctx.px + Math.cos(ang) * off, ctx.py + Math.sin(ang) * off,
          30, 6, Math.round(boss.dmg * 0.5), 0.4, 1.2, false, 0, "#7ad04a", "slime", 0.3);
      }
      ctx.float("TOXIC FLOOD!", boss.x, boss.y - 30, "#7ad04a");
      break;
    }
    case "megaSplit": {
      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * Math.PI * 2 + rand(-0.2, 0.2);
        ctx.spawnMini("slime", boss.x + Math.cos(ang) * 36, boss.y + Math.sin(ang) * 36,
          Math.round(boss.maxHp * 0.16), Math.round(boss.dmg * 0.6), 22);
      }
      ctx.spawnRing(boss.x, boss.y, "#5fcc5f", 48);
      ctx.float("MEGA SPLIT!", boss.x, boss.y - 30, "#5fcc5f");
      break;
    }
    case "groundPound": {
      spawnExplosion(ctx, boss.x, boss.y, 120, 0.6, 1.3, "#5fcc5f", boss, 70, true, "#7ad04a");
      boss.castLock = 0.8;
      ctx.float("GROUND POUND!", boss.x, boss.y - 30, "#5fcc5f");
      break;
    }

    // ========== SPIDER QUEEN — phase 2 ==========
    case "venomSpit": {
      spawnCone(ctx, boss, 5, Math.PI * 0.35, 200, 0.6, "#b06ad0");
      spawnPoolAt(ctx, ctx.px, ctx.py, 22, 4, Math.round(boss.dmg * 0.4), 0.3, 1, false, 0, "#b06ad0", "slime", 0.4);
      boss.castLock = 0.3;
      ctx.float("VENOM SPIT!", boss.x, boss.y - 30, "#b06ad0");
      break;
    }
    case "webWall": {
      spawnWall(ctx, boss, 5, 28, 22, 4, 0, 0, 0, true, 1.2, "#e8e8f0", "web");
      ctx.float("WEB WALL!", boss.x, boss.y - 30, "#e8e8f0");
      break;
    }
    case "leapStrike": {
      spawnExplosion(ctx, ctx.px, ctx.py, 60, 0.7, 1.2, "#dfe3e8", boss, 55);
      boss.castLock = 0.8;
      ctx.float("LEAP STRIKE!", boss.x, boss.y - 30, "#dfe3e8");
      break;
    }

    // ========== SPIDER QUEEN — phase 3 ==========
    case "spiderRain": {
      for (let i = 0; i < 7; i++) {
        const ang = rand(0, Math.PI * 2);
        const off = rand(20, 100);
        spawnExplosion(ctx, ctx.px + Math.cos(ang) * off, ctx.py + Math.sin(ang) * off,
          34, 0.4 + i * 0.15, 0.9, "#dfe3e8", boss);
      }
      ctx.float("SPIDER RAIN!", boss.x, boss.y - 30, "#dfe3e8");
      break;
    }
    case "broodSwarm": {
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        ctx.spawnMini("spider", boss.x + Math.cos(ang) * 42, boss.y + Math.sin(ang) * 42,
          Math.round(boss.maxHp * 0.06), Math.round(boss.dmg * 0.5), 14);
      }
      for (const e of ctx.enemies) if (!e.isBoss) e.speed *= 1.4;
      ctx.spawnRing(boss.x, boss.y, "#dfe3e8", 46);
      ctx.float("BROOD SWARM!", boss.x, boss.y - 30, "#dfe3e8");
      break;
    }
    case "silkPrison": {
      spawnPoolAt(ctx, ctx.px, ctx.py, 40, 4, 0, 0, 0, true, 1.6, "#e8e8f0", "web", 0.5);
      spawnBoltRing(ctx, boss, 12, 170, 0.5, "#dfe3e8");
      ctx.float("SILK PRISON!", boss.x, boss.y - 30, "#e8e8f0");
      break;
    }

    // ========== LICH — phase 2 ==========
    case "soulLance": {
      const tele = 0.5, active = 0.3;
      for (let i = 0; i < 2; i++) {
        const angOff = i === 0 ? 0 : rand(-0.6, 0.6);
        const baseAng = Math.atan2(ctx.py - boss.y, ctx.px - boss.x) + angOff;
        const len = dist(boss.x, boss.y, ctx.px, ctx.py) + 40;
        ctx.beams.push({
          x1: boss.x, y1: boss.y,
          x2: boss.x + Math.cos(baseAng) * len, y2: boss.y + Math.sin(baseAng) * len,
          telegraph: tele, telegraphMax: tele, active: 0, activeMax: active,
          dmgTick: 0, dmg: Math.round(boss.dmg * 1.4), color: "#b06cff",
          sweep: 0, sweepAngle: 0, baseAngle: baseAng,
        });
      }
      boss.castLock = tele + active;
      ctx.float("SOUL LANCE!", boss.x, boss.y - 30, "#b06cff");
      break;
    }
    case "boneSpear": {
      spawnCone(ctx, boss, 5, Math.PI * 0.25, 240, 0.7, "#c8b8e8");
      boss.castLock = 0.3;
      ctx.float("BONE SPEAR!", boss.x, boss.y - 30, "#c8b8e8");
      break;
    }
    case "curseZone": {
      for (let i = 0; i < 3; i++) {
        const ang = rand(0, Math.PI * 2);
        const off = rand(30, 80);
        spawnPoolAt(ctx, ctx.px + Math.cos(ang) * off, ctx.py + Math.sin(ang) * off,
          28, 5, Math.round(boss.dmg * 0.5), 0.4, 1.2, false, 0, "#8a5ad0", "slime", 0.4);
      }
      ctx.float("CURSE ZONE!", boss.x, boss.y - 30, "#8a5ad0");
      break;
    }

    // ========== LICH — phase 3 ==========
    case "deathNova": {
      spawnBoltRing(ctx, boss, 20, 190, 0.6, "#b06cff");
      spawnExplosion(ctx, boss.x, boss.y, 90, 0.4, 1.0, "#8a5ad0", boss, 50);
      boss.castLock = 0.4;
      ctx.float("DEATH NOVA!", boss.x, boss.y - 30, "#b06cff");
      break;
    }
    case "boneStorm": {
      spawnBoltRing(ctx, boss, 24, 170, 0.6, "#c8b8e8");
      spawnBoltRing(ctx, boss, 24, 230, 0.6, "#c8b8e8", 0.1);
      ctx.float("BONE STORM!", boss.x, boss.y - 30, "#c8b8e8");
      break;
    }
    case "undeadArmy": {
      for (let i = 0; i < 4; i++) {
        const ang = rand(0, Math.PI * 2), off = rand(30, 60);
        ctx.spawnMini("skeleton", boss.x + Math.cos(ang) * off, boss.y + Math.sin(ang) * off,
          Math.round(boss.maxHp * 0.1), Math.round(boss.dmg * 0.5), 16);
      }
      for (let i = 0; i < 2; i++) {
        const ang = rand(0, Math.PI * 2), off = rand(30, 60);
        ctx.spawnMini("ghost", boss.x + Math.cos(ang) * off, boss.y + Math.sin(ang) * off,
          Math.round(boss.maxHp * 0.08), Math.round(boss.dmg * 0.4), 16);
      }
      ctx.spawnRing(boss.x, boss.y, "#b06cff", 48);
      ctx.float("UNDEAD ARMY!", boss.x, boss.y - 30, "#b06cff");
      break;
    }

    // ========== LAVA GOLEM — phase 2 ==========
    case "fireWall": {
      spawnWall(ctx, boss, 5, 30, 26, 5, Math.round(boss.dmg * 0.6), 0.3, 1, false, 0, "#ff6a2a", "lava");
      ctx.float("FIRE WALL!", boss.x, boss.y - 30, "#ff6a2a");
      break;
    }
    case "magmaWave": {
      spawnCone(ctx, boss, 7, Math.PI * 0.5, 180, 0.6, "#ff8a2a", "fireball");
      boss.castLock = 0.3;
      ctx.float("MAGMA WAVE!", boss.x, boss.y - 30, "#ff8a2a");
      break;
    }
    case "emberBurst": {
      spawnBoltRing(ctx, boss, 14, 180, 0.6, "#ff8a2a", 0, "fireball");
      ctx.float("EMBER BURST!", boss.x, boss.y - 30, "#ff8a2a");
      break;
    }

    // ========== LAVA GOLEM — phase 3 ==========
    case "volcano": {
      for (let i = 0; i < 10; i++) {
        const ang = rand(0, Math.PI * 2);
        const off = rand(20, 110);
        const tx = clamp(ctx.px + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
        const ty = clamp(ctx.py + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
        const tele = 0.3 + i * 0.12;
        ctx.hazards.push({
          x: tx, y: ty, radius: 46,
          telegraph: tele, telegraphMax: tele,
          dmg: Math.round(boss.dmg * 1.1), color: "#ff6a2a",
          exploded: false, fade: 0, kind: "meteor",
        });
      }
      ctx.float("VOLCANO!", boss.x, boss.y - 30, "#ff6a2a");
      break;
    }
    case "lavaTsunami": {
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 4; i++) {
          const x = FIELD.x + 40 + i * (FIELD.w / 4);
          const y = FIELD.y + 50 + row * (FIELD.h / 3);
          spawnPoolAt(ctx, x, y, 30, 5, Math.round(boss.dmg * 0.6), 0.3, 1, false, 0, "#ff6a2a", "lava", 0.4 + row * 0.3);
        }
      }
      ctx.float("LAVA TSUNAMI!", boss.x, boss.y - 30, "#ff3a2a");
      break;
    }
    case "infernoNova": {
      spawnExplosion(ctx, boss.x, boss.y, 130, 0.6, 1.4, "#ff3a2a", boss, 65, true, "#ff6a2a");
      spawnBoltRing(ctx, boss, 12, 160, 0.5, "#ff8a2a", 0, "fireball");
      boss.castLock = 0.8;
      ctx.float("INFERNO NOVA!", boss.x, boss.y - 30, "#ff3a2a");
      break;
    }

    // ----- octopus family -----
    case "inkBlast": {
      const count = t === 1 ? 3 : t === 2 ? 5 : 7;
      for (let i = 0; i < count; i++) {
        const ang = rand(0, Math.PI * 2);
        const off = rand(20, 70);
        const tx = clamp(ctx.px + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
        const ty = clamp(ctx.py + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
        const tele = 0.4 + i * 0.15;
        spawnExplosion(ctx, tx, ty, 45, tele, 1.0, "#2a4a6a", boss, 0, true, "#1a2a4a");
      }
      ctx.float("INK BLAST!", boss.x, boss.y - 30, "#2a4a6a");
      break;
    }
    case "tentacleSlam": {
      const segs = t === 1 ? 4 : t === 2 ? 6 : 8;
      spawnWall(ctx, boss, segs, 24, 22, 4, Math.round(boss.dmg * 0.3), 0.4, 1.5, false, 0, "#2a4a6a", "ink");
      ctx.float("TENTACLE SLAM!", boss.x, boss.y - 30, "#6a3a8a");
      break;
    }
    case "bubbleRing": {
      const count = t === 1 ? 10 : t === 2 ? 14 : 18;
      const speed = t === 3 ? 180 : 140;
      spawnBoltRing(ctx, boss, count, speed, 0.7, "#5ac8ff", 0.15, "bolt");
      ctx.float("BUBBLE RING!", boss.x, boss.y - 30, "#5ac8ff");
      break;
    }
    case "inkCloud": {
      const count = t === 1 ? 4 : t === 2 ? 7 : 10;
      for (let i = 0; i < count; i++) {
        const ang = rand(0, Math.PI * 2);
        const off = rand(20, 100);
        const tx = clamp(ctx.px + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
        const ty = clamp(ctx.py + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
        spawnPoolAt(ctx, tx, ty, 26, 5, Math.round(boss.dmg * 0.35), 0.5, 2, false, 0, "#2a4a6a", "ink", 0.4);
      }
      ctx.float("INK CLOUD!", boss.x, boss.y - 30, "#2a4a6a");
      break;
    }
    case "whirlpool": {
      const count = t === 1 ? 3 : t === 2 ? 5 : 7;
      const spread = t === 1 ? 40 : 60;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const tx = clamp(ctx.px + Math.cos(ang) * spread, FIELD.x + 20, FIELD.x + FIELD.w - 20);
        const ty = clamp(ctx.py + Math.sin(ang) * spread, FIELD.y + 20, FIELD.y + FIELD.h - 20);
        spawnPoolAt(ctx, tx, ty, 24, 4, Math.round(boss.dmg * 0.25), 0.3, 1, true, 1.5, "#1a3a5a", "ink", 0.5);
      }
      ctx.float("WHIRLPOOL!", boss.x, boss.y - 30, "#1a3a5a");
      break;
    }
    case "tentacleSweep": {
      const count = t === 1 ? 6 : t === 2 ? 9 : 12;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + rand(-0.2, 0.2);
        const off = rand(30, 80);
        const tx = clamp(boss.x + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
        const ty = clamp(boss.y + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
        const tele = 0.3 + i * 0.1;
        spawnExplosion(ctx, tx, ty, 40, tele, 0.9, "#6a3a8a", boss, 0, true, "#2a4a6a");
      }
      ctx.float("TENTACLE SWEEP!", boss.x, boss.y - 30, "#6a3a8a");
      break;
    }
    case "deepCrush": {
      const radius = t === 1 ? 100 : t === 2 ? 130 : 160;
      spawnExplosion(ctx, boss.x, boss.y, radius, 0.6, 1.5, "#2a4a6a", boss, 20, true, "#1a2a4a");
      const count = t === 1 ? 4 : 6;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const tx = clamp(boss.x + Math.cos(ang) * 70, FIELD.x + 20, FIELD.x + FIELD.w - 20);
        const ty = clamp(boss.y + Math.sin(ang) * 70, FIELD.y + 20, FIELD.y + FIELD.h - 20);
        spawnExplosion(ctx, tx, ty, 35, 0.8, 0.8, "#6a3a8a", boss);
      }
      ctx.spawnRing(boss.x, boss.y, "#2a4a6a", radius);
      ctx.float("DEEP CRUSH!", boss.x, boss.y - 30, "#2a4a6a");
      break;
    }
    case "krakensGrasp": {
      const count = t === 1 ? 2 : t === 2 ? 3 : 4;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
        const off = 40 + rand(0, 20);
        ctx.spawnMini("anglerfish",
          boss.x + Math.cos(ang) * off,
          boss.y + Math.sin(ang) * off,
          Math.round(boss.maxHp * 0.06), Math.round(boss.dmg * 0.4), 14);
      }
      ctx.spawnRing(boss.x, boss.y, "#2a4a6a", 50);
      ctx.float("KRAKEN'S GRASP!", boss.x, boss.y - 30, "#2a4a6a");
      break;
    }
    case "abyssalSurge": {
      const count = t === 1 ? 8 : t === 2 ? 12 : 16;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const off = rand(40, 100);
        const tx = clamp(boss.x + Math.cos(ang) * off, FIELD.x + 20, FIELD.x + FIELD.w - 20);
        const ty = clamp(boss.y + Math.sin(ang) * off, FIELD.y + 20, FIELD.y + FIELD.h - 20);
        spawnExplosion(ctx, tx, ty, 30, 0.2 + i * 0.08, 0.7, "#1a3a5a", boss, 0, true, "#2a4a6a");
      }
      spawnExplosion(ctx, boss.x, boss.y, 60, 0.5, 1.2, "#2a4a6a", boss, 15, true, "#1a2a4a");
      ctx.spawnRing(boss.x, boss.y, "#5ac8ff", 100);
      ctx.float("ABYSSAL SURGE!", boss.x, boss.y - 30, "#5ac8ff");
      break;
    }
  }
}
