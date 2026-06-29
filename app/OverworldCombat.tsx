"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Engine, RaidResult, VIEW_W, VIEW_H } from "@/lib/game/engine";
import { HeroId } from "@/lib/game/heroes";
import { OverworldEnemy } from "@/lib/game/maps/types";
import { SaveData, heroBonusStats } from "@/lib/save";
import { Item, RARITY_COLOR } from "@/lib/game/items";
import { xpToNext } from "@/lib/game/heroes";
import { ItemIcon } from "./ItemIcon";

interface OverworldCombatProps {
  heroId: HeroId;
  enemy: OverworldEnemy;
  save: SaveData;
  onEnd: (result: { win: boolean; gold: number; xp: number; loot: Item[] }) => void;
}

export function OverworldCombat({ heroId, enemy, save, onEnd }: OverworldCombatProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [hp, setHp] = useState(0);
  const [maxHp, setMaxHp] = useState(0);
  const [gold, setGold] = useState(0);
  const [skills, setSkills] = useState<{ key: string; name: string; ready: boolean; cdPct: number }[]>([]);
  const [result, setResult] = useState<RaidResult | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const heroLevel = save.heroes[heroId].level;
    const bonus = heroBonusStats(save, heroId);
    const quickSlots = save.quickSlots;
    const skillLevels = save.heroes[heroId].skillLevels;
    const skillBranches = save.heroes[heroId].skillBranches;

    const engine = new Engine(
      canvas,
      heroId,
      heroLevel,
      "volcano", // use volcano dungeon for encounter
      {
        onEnd: (r) => {
          setResult(r);
        },
        onHud: (hud) => {
          setHp(hud.hp);
          setMaxHp(hud.maxHp);
          setGold(hud.goldGained);
          setSkills(hud.skills.map(s => ({
            key: s.key,
            name: s.name,
            ready: s.ready,
            cdPct: s.cdPct,
          })));
        },
      },
      bonus,
      "normal",
      quickSlots,
      skillLevels,
      skillBranches,
      enemy.monsterKind, // encounter mode
    );

    // Scale calculation - same as raid page
    const updateScale = () => {
      const frame = canvas.parentElement;
      if (!frame) return;
      const fw = frame.clientWidth;
      const fh = frame.clientHeight;
      const scaleX = fw / VIEW_W;
      const scaleY = fh / VIEW_H;
      const s = Math.min(scaleX, scaleY);
      engine.setScale(s);
      canvas.style.width = Math.floor(VIEW_W * s) + "px";
      canvas.style.height = Math.floor(VIEW_H * s) + "px";
    };
    updateScale();
    window.addEventListener("resize", updateScale);

    // Touch aim support
    const onTouchAim = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const rect = canvas.getBoundingClientRect();
      const s = engine.input.getScale() || 1;
      engine.input.mouseX = (t.clientX - rect.left) / s;
      engine.input.mouseY = (t.clientY - rect.top) / s;
    };
    canvas.addEventListener("touchstart", onTouchAim, { passive: true });
    canvas.addEventListener("touchmove", onTouchAim, { passive: true });

    engineRef.current = engine;
    engine.start();

    return () => {
      window.removeEventListener("resize", updateScale);
      canvas.removeEventListener("touchstart", onTouchAim);
      canvas.removeEventListener("touchmove", onTouchAim);
      engine.destroy();
      engineRef.current = null;
    };
  }, [heroId, enemy, save]);

  const handleContinue = useCallback(() => {
    if (result) {
      onEnd({
        win: result.win,
        gold: result.goldGained,
        xp: result.xpGained,
        loot: result.loot,
      });
    }
  }, [result, onEnd]);

  return (
    <div className="overworld-combat-overlay">
      <div className="overworld-combat-box">
        {/* Header */}
        <div className="combat-header">
          <div className="combat-hero-info">
            <span className="combat-hero-name">{heroId.charAt(0).toUpperCase() + heroId.slice(1)}</span>
            <div className="combat-hp-bar">
              <div className="combat-hp-fill" style={{ width: `${(hp / maxHp) * 100}%` }} />
              <span className="combat-hp-text">{hp}/{maxHp}</span>
            </div>
          </div>
          <div className="combat-location">Volcanic Wasteland</div>
          <div className="combat-gold">Gold: {gold}</div>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          width={VIEW_W * 2}
          height={VIEW_H * 2}
          className="combat-canvas"
        />

        {/* Skill Bar */}
        <div className="combat-skills">
          {skills.map((s, i) => (
            <div
              key={i}
              className={`skill-pip ${s.ready ? "ready" : "cooldown"}`}
              title={`${s.name} (${s.key})`}
            >
              <span className="skill-key">{s.key}</span>
              {!s.ready && <div className="skill-cd-overlay" style={{ height: `${s.cdPct * 100}%` }} />}
            </div>
          ))}
        </div>

        {/* Result Overlay */}
        {result && (
          <div className="combat-result-overlay">
            <div className="combat-result-box">
              <h2 className={result.win ? "result-win" : "result-lose"}>
                {result.win ? "VICTORY!" : "DEFEATED"}
              </h2>

              <div className="result-rewards">
                {result.win && (
                  <>
                    <div className="result-gold">Gold: +{result.goldGained}</div>
                    <div className="result-xp">XP: +{result.xpGained}</div>
                  </>
                )}
                {!result.win && (
                  <div className="result-xp">XP: +{result.xpGained}</div>
                )}
              </div>

              {result.loot.length > 0 && (
                <div className="result-loot">
                  <h3>Loot:</h3>
                  {result.loot.map((item) => (
                    <div key={item.id} className="loot-item">
                      <ItemIcon slot={item.slot} rarity={item.rarity} size={24} />
                      <span style={{ color: RARITY_COLOR[item.rarity] }}>{item.name}</span>
                    </div>
                  ))}
                </div>
              )}

              <button className="result-continue-btn" onClick={handleContinue}>
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
