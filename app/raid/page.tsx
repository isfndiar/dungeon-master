"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Engine, HudState, RaidResult, MiniMap, VIEW_W, VIEW_H } from "@/lib/game/engine";
import { HEROES, HeroId, HERO_IDS, xpToNext } from "@/lib/game/heroes";
import { DUNGEONS, DungeonId, DUNGEON_IDS, MODE_DEF, GameMode, isValidMode } from "@/lib/game/dungeons";
import { loadSave, writeSave, heroBonusStats } from "@/lib/save";
import { Item, itemStatLines, formatStat, RARITY_COLOR, RARITY_LABEL, SLOT_LABEL } from "@/lib/game/items";

const SCALE = 2;

function Minimap({ data }: { data: MiniMap }) {
  const cell = 14;   // px per room
  const gap = 3;
  const pad = 6;
  const w = data.gridW * (cell + gap) - gap + pad * 2;
  const h = data.gridH * (cell + gap) - gap + pad * 2;
  return (
    <div className="minimap" style={{ width: w, height: h }}>
      {data.rooms.map((r, i) => {
        const x = pad + (r.gx - data.minX) * (cell + gap);
        const y = pad + (r.gy - data.minY) * (cell + gap);
        let bg = "rgba(255,255,255,0.25)"; // visited, uncleared
        if (r.isBoss) bg = "#ff3a3a";
        else if (r.isStart) bg = "#7ad7ff";
        else if (r.cleared) bg = "rgba(120,255,160,0.55)";
        return (
          <div key={i}>
            <div
              className={"mm-room" + (r.current ? " current" : "")}
              style={{ left: x, top: y, width: cell, height: cell, background: bg }}
            />
            {/* door connectors */}
            {r.doors.e && (
              <div className="mm-door" style={{ left: x + cell, top: y + cell / 2 - 1, width: gap, height: 2 }} />
            )}
            {r.doors.s && (
              <div className="mm-door" style={{ left: x + cell / 2 - 1, top: y + cell, width: 2, height: gap }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function RaidInner() {
  const router = useRouter();
  const params = useSearchParams();
  const heroParam = params.get("hero") as HeroId | null;
  const dungeonParam = params.get("dungeon") as DungeonId | null;
  const modeParamRaw = params.get("mode") as string | null;
  const modeParam: GameMode = isValidMode(modeParamRaw) ? modeParamRaw : "normal";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [result, setResult] = useState<RaidResult | null>(null);
  const [levelUps, setLevelUps] = useState<{ name: string; level: number }[]>([]);
  const [needFocus, setNeedFocus] = useState(true);

  const valid =
    heroParam && HERO_IDS.includes(heroParam) &&
    dungeonParam && DUNGEON_IDS.includes(dungeonParam);

  useEffect(() => {
    if (!valid) {
      router.replace("/");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    const save = loadSave();
    const heroLevel = save.heroes[heroParam!].level;
    const bonus = heroBonusStats(save, heroParam!);

    const engine = new Engine(canvas, heroParam!, heroLevel, dungeonParam!, {
      onHud: (h) => setHud(h),
      onEnd: (res) => finishRaid(res),
    }, bonus, modeParam);
    engine.setScale(SCALE);
    engineRef.current = engine;
    engine.start();

    const onVis = () => {
      if (document.hidden) engine.setPaused(true);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid]);

  const finishRaid = (res: RaidResult) => {
    const save = loadSave();
    const rewardMult = MODE_DEF[modeParam].rewardMult;
    const gold = Math.round(res.goldGained * rewardMult);
    const xp = Math.round(res.xpGained * rewardMult);
    save.gold += gold;
    const ups: { name: string; level: number }[] = [];
    const prog = save.heroes[heroParam!];
    prog.xp += xp;
    while (prog.xp >= xpToNext(prog.level)) {
      prog.xp -= xpToNext(prog.level);
      prog.level += 1;
      ups.push({ name: HEROES[heroParam!].name, level: prog.level });
    }
    if (res.win && !save.cleared.includes(dungeonParam!)) {
      save.cleared.push(dungeonParam!);
    }
    // add looted items to shared inventory
    if (res.loot.length) save.inventory.push(...res.loot);
    writeSave(save);
    setLevelUps(ups);
    setResult({ ...res, goldGained: gold, xpGained: xp });
  };

  const focusGame = () => {
    setNeedFocus(false);
    canvasRef.current?.focus();
    engineRef.current?.setPaused(false);
  };

  if (!valid) return null;

  const dungeon = DUNGEONS[dungeonParam!];

  return (
    <div className="raid-wrap">
      <div
        className="game-frame"
        style={{ width: VIEW_W * SCALE, height: VIEW_H * SCALE }}
      >
        <canvas
          ref={canvasRef}
          className="game-canvas"
          width={VIEW_W * SCALE}
          height={VIEW_H * SCALE}
          tabIndex={0}
          style={{ width: VIEW_W * SCALE, height: VIEW_H * SCALE }}
        />

        {hud && !result && (
          <>
            <div className="hud">
              <div className="hud-left">
                <div className="hero-tag">{hud.heroName}</div>
                <div className="hpbar">
                  <div style={{ width: (hud.hp / hud.maxHp) * 100 + "%" }} />
                  <span>{hud.hp} / {hud.maxHp}</span>
                </div>
              </div>
              <div className="hud-right">
                <div>{hud.dungeonName}</div>
                <div className="mode-badge" style={{ color: MODE_DEF[modeParam].color }}>
                  {MODE_DEF[modeParam].label} {MODE_DEF[modeParam].mult}x
                </div>
                {hud.isEndless ? (
                  <div>Wave {hud.wave ?? 0}</div>
                ) : (
                  <div>Rooms {hud.roomsCleared}/{hud.totalRooms}</div>
                )}
                <div>Enemies: {hud.enemiesLeft}</div>
                <div>◆ {hud.goldGained}</div>
                {hud.isEndless ? (
                  hud.bossFound ? <div style={{ color: "#ff5a5a" }}>☠ Boss wave!</div> : null
                ) : (
                  <div style={{ color: hud.bossFound ? "#ff5a5a" : "var(--muted)" }}>
                    {hud.bossFound ? "☠ Boss found!" : "Find the boss…"}
                  </div>
                )}
              </div>
            </div>

            {!hud.isEndless && <Minimap data={hud.minimap} />}

            <div className="skill-bar">
              {hud.skills.map((s, i) => (
                <div
                  key={i}
                  className={
                    "skill-pip" +
                    (s.active ? " active" : "") +
                    (s.ready ? " ready" : "")
                  }
                >
                  <div className="key">{s.key}</div>
                  <div className="nm">{s.name}</div>
                  {!s.ready && (
                    <div className="cd" style={{ height: (1 - s.cdPct) * 100 + "%" }} />
                  )}
                </div>
              ))}
            </div>

            {hud.bossName && hud.bossMax ? (
              <div className="boss-bar">
                <div className="nm">{hud.bossName}</div>
                <div className="track">
                  <div style={{ width: ((hud.bossHp ?? 0) / hud.bossMax) * 100 + "%" }} />
                </div>
              </div>
            ) : null}
          </>
        )}

        {needFocus && !result && (
          <div className="click-overlay" onClick={focusGame}>
            CLICK TO START<br />
            <span style={{ fontSize: 7, color: "var(--muted)" }}>
              WASD move • mouse aim • click/space attack • 1/2/3 skills
            </span>
          </div>
        )}

        {result && (
          <div className="overlay">
            <h2 className={result.win ? "win" : "lose"}>
              {result.win
                ? "DUNGEON CLEARED!"
                : result.wave != null
                  ? `SLAIN AT WAVE ${result.wave}`
                  : "YOU FELL..."}
            </h2>
            <div className="mode-badge result" style={{ color: MODE_DEF[modeParam].color }}>
              {MODE_DEF[modeParam].label} mode · {MODE_DEF[modeParam].rewardMult}x rewards
            </div>
            <div className="reward">
              ◆ Gold +{result.goldGained}<br />
              ✦ XP +{result.xpGained}<br />
              ☠ Monsters slain: {result.monstersKilled}
            </div>
            {levelUps.length > 0 && (
              <div className="lvlup">
                {levelUps.map((u, i) => (
                  <div key={i}>★ {u.name} reached Lv {u.level}!</div>
                ))}
              </div>
            )}
            {result.loot.length > 0 && (
              <div className="loot-box">
                <div className="loot-title">LOOT ({result.loot.length})</div>
                <div className="loot-list">
                  {result.loot.map((it) => (
                    <div className="loot-item" key={it.id}>
                      <span className="loot-name" style={{ color: RARITY_COLOR[it.rarity] }}>
                        {it.name}
                      </span>
                      <span className="loot-meta">
                        {RARITY_LABEL[it.rarity]} {SLOT_LABEL[it.slot]} —{" "}
                        {itemStatLines(it).map((l) => formatStat(l.key, l.value)).join(", ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button className="raid-btn" style={{ maxWidth: 280 }} onClick={() => router.push("/")}>
              RETURN TO TOWN
            </button>
          </div>
        )}
      </div>

      <div className="controls-hint">
        {dungeon.endless
          ? "WASD move, mouse aim, click/space attack, 1-3 skills. Survive endless waves!"
          : `${dungeon.name} — reach the glowing gate after each room. Defeat the boss to win.`}
      </div>
    </div>
  );
}

export default function RaidPage() {
  return (
    <Suspense fallback={null}>
      <RaidInner />
    </Suspense>
  );
}
