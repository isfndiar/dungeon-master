# Overworld Combat Overlay System

## Overview

Sistem combat overlay untuk area di luar dungeon (Volcanic Wasteland). Saat player menyentuh overworld enemy, combat room muncul sebagai overlay di atas town view tanpa navigasi halaman.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Town Canvas                          │
│  (TownEngine - paused during combat)                        │
│                                                             │
│    ┌─────────────────────────────────────────────────┐      │
│    │           Combat Overlay Box                    │      │
│    │  ┌─────────────────────────────────────────┐    │      │
│    │  │     Combat Canvas (320×200)             │    │      │
│    │  │     OverworldCombatEngine               │    │      │
│    │  │     - Hero + 2-3 monsters               │    │      │
│    │  │     - Skills, projectiles, particles     │    │      │
│    │  └─────────────────────────────────────────┘    │      │
│    │  ┌─────────────────────────────────────────┐    │      │
│    │  │     HUD: HP bar, skill pips, gold       │    │      │
│    │  └─────────────────────────────────────────┘    │      │
│    └─────────────────────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
lib/game/
  overworldCombat.ts    # OverworldCombatEngine class (~500 lines)

app/
  OverworldCombat.tsx   # React overlay component
  page.tsx              # Modified: onEncounter triggers overlay instead of router.push
```

## OverworldCombatEngine

**Location:** `lib/game/overworldCombat.ts`

### Constructor
```typescript
constructor(
  canvas: HTMLCanvasElement,
  heroId: HeroId,
  monsterKinds: MonsterKind[],
  save: SaveData,
  callbacks: { onEnd: (result: CombatResult) => void }
)
```

### State
- **Player:** `px, py, hp, maxHp, facing, atkTimer, skillCds[3], invuln, dmgBuff, speedBuff`
- **Enemies:** array `{ x, y, hp, maxHp, dmg, speed, size, sprite, atkTimer, frozen }`
- **Projectiles, particles, floatTexts** (reuse interfaces from engine.ts)
- **Phase:** `"playing" | "win" | "lose"`

### Combat Flow
1. Spawn hero at center, monsters at random edges
2. Player moves with WASD/arrow keys, aims with mouse
3. Click/1/2/3 for skills, 4-7 for consumables
4. Defeat all enemies → win, player HP 0 → lose
5. Win: gold + XP + loot roll. Lose: XP only (no loot)

### Stats Calculation
- Reuse `hpForLevel()`, `dmgForLevel()` from heroes.ts
- Equipment bonuses from save data via `heroBonusStats()`

## Overlay UI Component

**Location:** `app/OverworldCombat.tsx`

### Props
```typescript
interface OverworldCombatProps {
  heroId: HeroId;
  enemy: OverworldEnemy;
  save: SaveData;
  onEnd: (result: CombatResult) => void;
}
```

### Layout
```
┌──────────────────────────────────────┐
│ [Hero Name]          [Volcanic Wastes] │
│ ████████ HP          Gold: 120         │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │       Combat Canvas              │ │
│ │       (320 × 200)                │ │
│ └──────────────────────────────────┘ │
│                                      │
│ [1:Charge] [2:SwordStorm] [3:WarCry] │
│ [4:Potion] [5:Empty] [6:Empty] [7:]  │
└──────────────────────────────────────┘
```

### Styling
- Dark box (#0a0a0f background) with border (#2a2a3a)
- Rounded corners, drop shadow
- Canvas centered with 2px border
- Skill pips below canvas (reuse `.skill-pip` from globals.css)
- HP bar top-left (reuse `.hp-bar` style)

### Behavior
- Component mount → create OverworldCombatEngine
- Engine callbacks update React state (HP, skill CDs, result)
- `onEnd(result)` → parent marks enemy defeated, update save (gold, XP, loot)
- Keyboard: 1/2/3 = skills, 4-7 = consumables, Escape = escape scroll

## Integration with TownEngine

### Changes to `lib/game/town.ts`
- Add `pause()` method — stop game loop, save state
- Add `resume()` method — restart game loop
- Add `markEnemyDefeated(id: string)` — set enemy.defeated = true, start respawn timer

### Changes to `app/page.tsx`
- New state: `encounterEnemy: OverworldEnemy | null`
- `onEncounter` callback: set encounterEnemy, engine.pause()
- Render `<OverworldCombat>` when encounterEnemy !== null
- `onEnd` callback:
  - Update save (gold, XP, inventory, loot)
  - engine.markEnemyDefeated(encounterEnemy.id)
  - engine.resume()
  - setEncounterEnemy(null)

### Data Flow
```
TownEngine.onEncounter(enemy)
  → page.tsx: setEncounterEnemy(enemy), engine.pause()
  → Render <OverworldCombat>
  → Combat ends
  → onEnd(result): updateSave(), engine.markEnemyDefeated(), engine.resume()
  → setEncounterEnemy(null) → overlay unmount
```

## Combat Mechanics

### Arena
- 320×200 px, no walls (open field)
- Player spawns center, monsters spawn at random edges

### Movement
- WASD/arrow keys
- Speed from hero def + equipment bonus
- Collision with monsters (push apart)

### Attack
- Auto-attack: click direction, fire projectile (ranged) or melee swing (melee)
- Skills: 1/2/3 key, reuse `executeSkill()` from skills.ts
- OverworldCombatEngine builds `SkillContext` from its own state:
  - Map player state (px, py, aimX, aimY, php, phpMax) to context fields
  - Map enemies array to context
  - Implement required methods: `float()`, `spawnRing()`, `damageEnemy()`, `fireProjectile()`, etc.
  - Skill level/branch from `save.heroes[heroId].skillLevels` and `skillBranches`

### Enemy AI
- Chase player if within aggroRange
- Attack if within atkRange, cooldown-based
- Simple: move directly toward player, no pathfinding

### Damage Calculation
- Player → Enemy: `dmgForLevel(hero, level) + equipment.bonus.dmg`
- Enemy → Player: `enemy.dmg` reduced by equipment bonus HP buffer
- Crit: `Math.random() < critChance` → damage × 2
- Invuln frame: 0.3s after hit

### Consumables
- Quick slots from save data (4 slots)
- Keys 4-7 to use
- Reuse effect routing from items.ts (heal, buff, revive, escape)
- Escape: immediately end combat, player gets gold but no loot

### Win/Lose Conditions
- **Win:** All enemies defeated
- **Lose:** Player HP 0 (and no revive scroll)

## Rewards & Loot

### On Win
- Gold: `enemy.gold * modeMult` (from monster def)
- XP: `enemy.xp * modeMult`
- Loot: `rollItem()` with luck from dungeon/mode
- Loot chance: 40% (same as boss kill in raid)

### On Lose
- Gold: 0
- XP: `Math.round(enemy.xp * 0.3)` — small XP consolation
- Loot: none

### Save Update
- `save.gold += goldGained`
- `hero.xp += xpGained` — check level up
- `save.inventory.push(loot)` — if loot dropped
- `writeSave(save)`

### Level Up
- `xpToNext(level)` threshold
- Auto level up, increment `hero.level`
- Float text "LEVEL UP!" in combat canvas

### Result Display
```
┌─────────────────────────┐
│      VICTORY!           │
│                         │
│  Gold: +50              │
│  XP: +120               │
│                         │
│  Loot: [Rare Sword]     │
│                         │
│      [Continue]         │
└─────────────────────────┘
```
- Click "Continue" → close overlay, return to town

## Implementation Order

1. Create `overworldCombat.ts` — engine class
2. Create `OverworldCombat.tsx` — overlay component
3. Modify `town.ts` — add pause/resume/markEnemyDefeated
4. Modify `page.tsx` — integrate overlay, update onEncounter
5. Test combat flow end-to-end
6. Polish visuals and balance stats
