# Overworld Combat Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement overlay combat system for overworld encounters - combat appears as dark box overlay on town view without page navigation.

**Architecture:** Reuse existing Engine class in encounter mode (already supports single-room arena combat). Mount engine in overlay canvas, pause TownEngine during combat. No new engine needed - leverage existing encounter mode.

**Tech Stack:** Next.js, HTML5 Canvas, React, existing Engine class

---

## File Structure

```
app/
  OverworldCombat.tsx   # NEW: Overlay combat component
  page.tsx              # MODIFY: Replace router.push with overlay rendering
  globals.css           # MODIFY: Add overlay styles

lib/game/
  town.ts               # MODIFY: Add pause/resume/markEnemyDefeated methods
```

## Key Insight

The existing `Engine` class already has encounter mode support:
- `isEncounter` flag creates single-room arena
- `spawnEncounterEnemies()` spawns 2-5 monsters
- Win condition: all enemies dead
- Calculates gold, XP, loot rewards
- All combat logic (skills, projectiles, damage) already works

We only need to mount this engine in an overlay instead of a separate page.

---

### Task 1: Add pause/resume/markEnemyDefeated to TownEngine

**Files:**
- Modify: `lib/game/town.ts`

- [ ] **Step 1: Add pause/resume methods**

Find the `TownEngine` class and add these methods after the `start()` method:

```typescript
pause() {
  this.paused = true;
}

resume() {
  this.paused = false;
  this.last = performance.now();
}

markEnemyDefeated(id: string) {
  const enemy = this.currentMap.enemies?.find(e => e.id === id);
  if (enemy) {
    enemy.defeated = true;
    enemy.aggro = false;
    enemy.respawnCooldown = enemy.respawnTimer;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/game/town.ts
git commit -m "feat: add pause/resume/markEnemyDefeated to TownEngine"
```

---

### Task 2: Create OverworldCombat overlay component

**Files:**
- Create: `app/OverworldCombat.tsx`

- [ ] **Step 1: Create the component file**

```tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Engine, RaidResult } from "@/lib/game/engine";
import { HeroId } from "@/lib/game/heroes";
import { OverworldEnemy } from "@/lib/game/maps/types";
import { SaveData, heroBonusStats } from "@/lib/save";
import { DUNGEON_IDS } from "@/lib/game/dungeons";
import { Item, formatStat, itemStatLines, RARITY_COLOR, SLOT_LABEL } from "@/lib/game/items";
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

    engineRef.current = engine;
    engine.start();

    return () => {
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
          width={640}
          height={400}
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: No errors (some unused imports may need cleanup)

- [ ] **Step 3: Commit**

```bash
git add app/OverworldCombat.tsx
git commit -m "feat: create OverworldCombat overlay component"
```

---

### Task 3: Add overlay styles to globals.css

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add overlay styles**

Append to the end of `globals.css`:

```css
/* Overworld Combat Overlay */
.overworld-combat-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.overworld-combat-box {
  background: #0a0a0f;
  border: 2px solid #2a2a3a;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
  max-width: 90vw;
  max-height: 90vh;
}

.combat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  gap: 16px;
}

.combat-hero-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.combat-hero-name {
  font-weight: bold;
  color: #e0e0e0;
  min-width: 60px;
}

.combat-hp-bar {
  position: relative;
  width: 120px;
  height: 16px;
  background: #1a1a2a;
  border: 1px solid #3a3a4a;
  border-radius: 3px;
  overflow: hidden;
}

.combat-hp-fill {
  height: 100%;
  background: linear-gradient(to bottom, #5fff8f, #2a8a4a);
  transition: width 0.2s ease;
}

.combat-hp-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.combat-location {
  color: #8a8a9a;
  font-size: 12px;
}

.combat-gold {
  color: #ffd24a;
  font-size: 12px;
}

.combat-canvas {
  display: block;
  border: 2px solid #2a2a3a;
  border-radius: 4px;
  image-rendering: pixelated;
}

.combat-skills {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  justify-content: center;
}

.combat-result-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 12px;
}

.combat-result-box {
  background: #0a0a0f;
  border: 2px solid #2a2a3a;
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  min-width: 200px;
}

.result-win {
  color: #ffd24a;
  font-size: 24px;
  margin: 0 0 16px 0;
}

.result-lose {
  color: #ff5a5a;
  font-size: 24px;
  margin: 0 0 16px 0;
}

.result-rewards {
  margin-bottom: 16px;
}

.result-gold {
  color: #ffd24a;
  font-size: 14px;
  margin-bottom: 4px;
}

.result-xp {
  color: #5aa9ff;
  font-size: 14px;
  margin-bottom: 4px;
}

.result-loot {
  margin-bottom: 16px;
}

.result-loot h3 {
  color: #8a8a9a;
  font-size: 12px;
  margin: 0 0 8px 0;
}

.loot-item {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  margin-bottom: 4px;
}

.result-continue-btn {
  background: #2a4a2a;
  border: 1px solid #4a8a4a;
  color: #5fff8f;
  padding: 8px 24px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.result-continue-btn:hover {
  background: #3a5a3a;
}
```

- [ ] **Step 2: Verify no CSS syntax errors**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add overworld combat overlay styles"
```

---

### Task 4: Integrate overlay in page.tsx

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Import OverworldCombat component**

Add import at the top of `page.tsx`:

```tsx
import { OverworldCombat } from "./OverworldCombat";
```

- [ ] **Step 2: Add encounterEnemy state**

Find the state declarations near the top of the `Town` component and add:

```tsx
const [encounterEnemy, setEncounterEnemy] = useState<OverworldEnemy | null>(null);
```

- [ ] **Step 3: Update onEncounter callback**

Find the `onEncounter` callback in the TownEngine constructor (around line 177) and replace it:

```tsx
onEncounter: (enemy) => {
  // Pause town engine and show overlay combat
  engineRef.current?.pause();
  setEncounterEnemy(enemy);
},
```

- [ ] **Step 4: Add handleCombatEnd callback**

Add this callback in the Town component:

```tsx
const handleCombatEnd = useCallback((result: { win: boolean; gold: number; xp: number; loot: Item[] }) => {
  if (!encounterEnemy || !save) return;

  commit((s) => {
    // Add gold
    s.gold += result.gold;

    // Add XP and check level up
    const hero = s.heroes[s.selectedHero];
    hero.xp += result.xp;
    while (hero.xp >= xpToNext(hero.level)) {
      hero.xp -= xpToNext(hero.level);
      hero.level++;
    }

    // Add loot to inventory
    for (const item of result.loot) {
      s.inventory.push(item);
    }
  });

  // Mark enemy defeated in town
  engineRef.current?.markEnemyDefeated(encounterEnemy.id);
  engineRef.current?.resume();
  setEncounterEnemy(null);
}, [encounterEnemy, save, commit]);
```

- [ ] **Step 5: Render OverworldCombat overlay**

Find the return statement in the Town component and add the overlay rendering. Look for where the main JSX is returned and add before the closing `</div>`:

```tsx
{/* Overworld Combat Overlay */}
{encounterEnemy && save && (
  <OverworldCombat
    heroId={save.selectedHero}
    enemy={encounterEnemy}
    save={save}
    onEnd={handleCombatEnd}
  />
)}
```

- [ ] **Step 6: Remove old encounter routing**

Find and remove the old encounter routing code that uses `router.push` (around line 182-185). Also remove the sessionStorage encounter handling (around line 192-201).

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx
git commit -m "feat: integrate overworld combat overlay in town page"
```

---

### Task 5: Test end-to-end

**Files:**
- None (manual testing)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test town navigation**

1. Open browser to localhost:3000
2. Walk to volcanic wasteland (south exit)
3. Verify volcanic wasteland loads with enemies visible

- [ ] **Step 3: Test combat overlay**

1. Walk into an overworld enemy
2. Verify dark overlay appears with combat canvas
3. Verify hero and monsters spawn correctly
4. Test movement (WASD) and attack (click/space)
5. Test skills (1/2/3 keys)
6. Defeat all enemies

- [ ] **Step 4: Test rewards**

1. After victory, verify result screen shows
2. Check gold and XP rewards display
3. If loot dropped, verify it shows in result
4. Click Continue
5. Verify overlay closes and town resumes
6. Verify enemy is marked defeated (disappears)

- [ ] **Step 5: Test defeat**

1. Let enemies kill the player
2. Verify defeat screen shows
3. Verify small XP gain
4. Click Continue
5. Verify overlay closes and town resumes

- [ ] **Step 6: Commit final state**

```bash
git add -A
git commit -m "feat: complete overworld combat overlay system"
```

---

## Summary

**Total Tasks:** 5
**Estimated Time:** 30-45 minutes

**Key Design Decisions:**
1. Reuse existing Engine class in encounter mode (no new engine needed)
2. Overlay appears as dark box with blur backdrop
3. TownEngine pauses during combat, resumes after
4. Enemy marked defeated after combat (respawns after timer)
5. Rewards applied directly to save data
