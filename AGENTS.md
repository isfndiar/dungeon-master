# AGENTS.md — Dungeon Hunter v2

Pixel-art dungeon crawler. Next.js + HTML5 Canvas. Player picks hero, raids dungeons, fights monsters in real-time, collects loot.

## Stack

- **Next.js** (App Router, TypeScript)
- **HTML5 Canvas** for raid game loop + town exploration
- **React** for hub/menu UI (panels, dialogs, inventory)
- **localStorage** for save data (`lib/save.ts`)

## Game Flow

```
Town (hub) → pick dungeon + mode → Raid (real-time combat) → Results → Town
```

## Project Structure

```
app/
  page.tsx              # Town hub: hero select, dungeon select (with mode buttons), equipment, market
  raid/page.tsx         # Raid canvas: mounts Engine, HUD (boss bar w/ shield/phase pips), minimap, results
  ItemIcon.tsx          # SVG pixel-art item icon component (per slot × rarity tint)
  layout.tsx            # Root layout
  globals.css           # All styles (town nav, panels, raid HUD, boss bar, mode buttons)

lib/
  game/
    engine.ts           # Raid game loop (~3600 lines): combat, skills, projectiles, boss spells, shield-break, hazard AoE, nova waves, endless mode
    town.ts             # TownEngine: camera, NPC, buildings, wandering NPCs, portal
    heroes.ts           # Hero definitions (knight/mage/priest/tank/archer) with skill cooldowns
    monsters.ts         # Monster + boss definitions, 45 BossSpellKind types, 9 spells per boss
    dungeons.ts         # Dungeon configs (7 total) + GameMode system (5 modes)
    items.ts            # Item system: slots, stats, rarity, rolling, luck formula
    map.ts              # Dungeon room generation
    input.ts            # Keyboard + mouse input
    render.ts           # Canvas draw helpers
    sprites.ts          # Code-drawn pixel sprites (legacy)
    spriteLoader.ts     # PNG sprite loading: hero directional sprites, projectiles
    pixelgen.ts         # Procedural NPC sprite generation
  save.ts               # localStorage load/save

public/
  sprites/              # All game sprites
    mage/               # Elf mage: idle/walk/attack sheets + fireball (128px cells, 4dir)
    elf_archer/         # Archer: idle/walk/attack sheets + arrow projectile
    frost_knight/       # Knight: idle/walk/attack sheets (128px cells, 4dir)
    hammer_guardian/    # Tank: idle/walk/attack sheets (128px cells, 4dir)
    paladin/            # Priest: idle/walk/attack sheets (128px cells, 4dir)
    king/               # King Aldric NPC sprite
    nobleman/           # Lord Castellan NPC sprite
    villager/           # 11 villager variants + blacksmith + merchant (keyed PNGs)
    building/           # Town buildings: manors, castle, dungeon entrance
    {hero}_{dir}.png    # Legacy 3-image hero sprites (knight/tank/archer only)
  custom/               # Elf mage source sprites (idle/walk/attack/fireball sheets + frames)
  terrain/              # Tiles: grass, gray-brick-road, water
```

## Heroes

| Hero   | Sprite ID | HP   | DMG | Speed | AtkCD | Attack | Skills (1/2/3)                           | Notes |
|--------|-----------|------|-----|-------|-------|--------|------------------------------------------|-------|
| Knight | `knight`  | 120  | 18  | 90    | 0.45  | melee  | Charge / Sword Storm / War Cry           | Frost knight sprite |
| Mage   | `mage`    | 70   | 26  | 85    | 0.45  | ranged | Frost Nova / Meteor / Blink              | Elf mage sprite. Projectile: fireball |
| Priest | `priest`  | 100  | 14  | 85    | 0.5   | melee  | Smite / Divine Heal / Sanctuary          | Paladin sprite |
| Tank   | `tank`    | 200  | 12  | 65    | 0.6   | melee  | Ground Slam / Bulwark / Berserk          | Hammer guardian sprite |
| Archer | `archer`  | 75   | 16  | 110   | 0.35  | ranged | Multishot / Rapid Fire / Snipe           | Elf archer sprite. Projectile: arrow |

**Level scaling:** `hpForLevel = baseHp * (1 + 0.12 * (level-1))`, `dmgForLevel = baseDmg * (1 + 0.1 * (level-1))`

### Hero Skill Details

#### Knight
| Key | Skill | Cooldown | Behavior |
|-----|-------|----------|----------|
| 1 | **Charge** | 5s | Dash 70px toward aim. `dmg * 1.4` along path. Trail particles. Invuln 0.25s. |
| 2 | **Sword Storm** | 6s | 5 homing swords circle player. Each: `dmg * 1.1`, `homingTurn = 6 rad/s`, `hitsLeft = 3`, `life = 3s`. |
| 3 | **War Cry** | 14s | `dmgBuffMult = 1.6` for 6s. `lifeStealBuffFrac = 0.20` for 6s. Ring + float FX. |

**Passive:** Base 5% lifesteal on kill. War Cry boosts to 25% total.

#### Mage
| Key | Skill | Cooldown | Behavior |
|-----|-------|----------|----------|
| 1 | **Frost Nova** | 7s | Expanding NovaWave from player. `maxRadius = 120`, `speed = 260 px/s`, `dmg * 1.2`, `frozenDur = 2.5s`. Frost ring + shard particles. |
| 2 | **Meteor** | 8s | Instant AoE at mouse pos. `hitR = 70`, `dmg * 2.4`. 40 fire particles + ring + shockwave. |
| 3 | **Blink** | 3s | Teleport to mouse pos (clamped to field). Avoids obstacles. Invuln 0.2s. Purple rings at origin + dest. |

#### Priest
| Key | Skill | Cooldown | Behavior |
|-----|-------|----------|----------|
| 1 | **Smite** | 4s | Mark+blink combo: first cast fires piercing bolt (`dmg * 1.8`), marks first enemy hit, resets cooldown. Re-cast blinks behind marked enemy + `dmg * 2.2` strike + invuln 0.15s. |
| 2 | **Divine Heal** | 9s | Burst 40% maxHP + HoT (8% maxHP/s for 4s) + AoE holy light (`dmg * 0.8` in 80px). Pillar-of-light visual. |
| 3 | **Sanctuary** | 16s | Healing zone at player pos (46px radius, 30 HP/s for 5s) + invuln 1.5s. |

#### Tank
| Key | Skill | Cooldown | Behavior |
|-----|-------|----------|----------|
| 1 | **Ground Slam** | 6s | AoE 80px radius, `dmg * 1.3` + 45px knockback on all enemies hit. |
| 2 | **Bulwark** | 6s | `shield = 4s` (blocks all damage), `invuln = 0.3s`. |
| 3 | **Berserk** | 7s | `dmgBuffMult = 2.0` for 6s, `speedBuffMult = 1.6` for 6s. AoE shockwave 100px: `dmg * 1.2` + taunts enemies 5s. |

**Passives:**
- 25% flat damage reduction (all incoming)
- Low HP damage bonus: `dmg *= 1 + missingRatio * 0.8` (up to +80% at 0 HP)
- Miss chance: `missingRatio * 0.5` (up to 50% at 0 HP)
- 12% maxHP lifesteal on kill while Berserk active

#### Archer
| Key | Skill | Cooldown | Behavior |
|-----|-------|----------|----------|
| 1 | **Multishot** | 5s | Double staggered volley: 5 arrows in 0.9rad fan (`dmg * 1.2`), then 5 more at 0.2s delay. |
| 2 | **Rapid Fire** | 10s | `rapidFire = 4s`. Attack cooldown × 0.35 (nearly 3x attack speed). |
| 3 | **Snipe** | 8s | Piercing arrow (`dmg * 4`), `wallPass = true` (ignores obstacles), `big = true`. Grants `dodgeTimer = 3s` (auto-miss all incoming hits). |

## Sprite System (`spriteLoader.ts`)

All hero sprites are **128×128 cell** sheets with 4 directions (down/left/right/up as rows 0-3).

### Sprite loading order
1. **Custom draw functions** checked first per hero ID (mage→drawCustomMage, priest→drawPaladin, knight→drawFrostKnight, archer→drawElfArcher, tank→drawHammerGuardian)
2. Falls back to legacy 3-image system (`{id}_front.png`, `{id}_back.png`, `{id}_side.png`)

### Sheet layout
- **4-direction sheets**: rows = down(0), left(1), right(2), up(3). Used by mage, paladin, frost_knight, hammer_guardian
- **3-direction sheets** (elf archer idle/attack): rows = down(0), left(1), up(2). Right = mirror of left
- **Walk sheets** (elf archer): 4-direction (has dedicated right row)
- **Arrow projectile**: 3-frame strip (left=0, up=1, down=2). Mirrored for right direction

### Key constants
- `MAGE_CELL = 128` — cell size for all sheets
- `MAGE_DIR_ROW` — 4dir row mapping: {down:0, left:1, right:2, up:3}
- `ELF_ARCHER_DIR_ROW_3DIR` — 3dir row mapping: {down:0, left:1, right:1, up:2}

### Adding a new hero sprite
1. Create sprite sheet PNGs (idle/walk/attack) with 128×128 cells
2. Place in `public/sprites/{hero_name}/`
3. Add image interface + loading in `spriteLoader.ts` (`preloadHeroSprites`)
4. Add draw function (follow `drawFrostKnight` pattern)
5. Add routing in `drawHeroDir` (line ~187)

## Town System (`town.ts`)

- **Viewport**: 480×270, **World**: 1280×800, **PIXEL_SCALE**: 3
- Camera follows player with translate
- Buildings + NPCs depth-sorted by Y
- **NPCs**: procedural sprites (`pixelgen.ts`) or static PNG assets
- **Wandering NPCs**: have `wander` property, walk images derived from asset name (`*_walkingup_keyed.png` etc.)
- **TownAction** types: `"dungeon"` | `"equipment"` | `"heroes"` | `"talk"` | `"shop"` | `"endless"` | `"village2"`

### Buildings (code references)
- Castle: `/sprites/building/noble-manor-royal.png`
- Smithy: `/sprites/building/noble-manor-forest.png`
- Market: `/sprites/building/noble-manor-renaissance.png`
- Royal Castle: `/sprites/building/castle_keyed.png`
- Dungeon Gate: `/sprites/building/noble-manor-gothic.png`
- Raid Endless: `/sprites/building/dungeon-cave-entrance.png`

### Key NPCs
- Captain Mara (procedural) → heroes panel
- Borin the Smith (`blachsmith_keyed.png`) → equipment
- Merchant Pell (`merchant_keyed.png`) → talk
- King Aldric (`king_keyed.png`) → talk
- Lord Castellan (`nobleman_keyed.png`) → talk
- Gate Guard (procedural) → dungeon select
- Portal Keeper (procedural) → endless mode

## Raid Engine (`engine.ts`)

- **VIEW**: 480×270, **RENDER_SCALE**: 2
- Room-based dungeon crawl: clear monsters → unlock door → next room
- **Endless mode**: wave-based arena, boss every 10 waves, open field
- Uses `ctx.setTransform` (not `ctx.scale`) for camera — prevents StrictMode double-mount zoom bug
- **FIELD**: `{ x: 16, y: 16, w: 448, h: 238 }` (playable area inset from walls)

### Projectile System

**Interface fields:** `x, y, vx, vy, dmg, from, kind, life, radius, pierce?, hitSet?, big?, homing?, homingTurn?, tint?, wallPass?`

- **kinds**: fireball, arrow, bolt, sword, tentacle
- **wallPass**: passes through obstacles (archer snipe). Normal projectiles die on obstacle contact.
- **homing**: sword storm swords auto-steer toward nearest enemy
- **big**: 16px instead of 10px, +glow trail
- **pierce**: passes through enemies (doesn't die on hit)
- Custom draw: archer arrow uses `drawElfArrow` with rotation, mage fireball uses `drawMageFireball`

### HazardAoE System

Telegraphed ground explosions that damage **both enemies AND player**.

**Interface:** `x, y, radius, telegraph, telegraphMax, dmg, color, exploded, fade, kind, knockback?, leavePool?, poolColor?`

- **kinds**: meteor, bounceSlam, eruption
- **Telegraph phase**: pulsing ground circle + dashed stroke + crosshair. Meteor kind shows falling ball.
- **Explosion phase**: radial gradient expanding + fading, white flash first 0.1s
- **knockback**: px to push player on hit
- **leavePool**: eruption tier 3 spawns persistent pool at center

### NovaWave System

Expanding ring sweep (used by mage Frost Nova).

**Interface:** `x, y, radius, maxRadius, speed, dmg, frozenDur, duration, time, hitSet`

- Expands from player outward, damages enemies on ring edge
- `hitSet` prevents multi-hit on same enemy
- Frost visual: inner glow gradient, frost shard particles rotating along edge

### Boss Shield-Break System (Sekiro-style)

**Constants:** `SHIELD_FRAC = 0.4` (shield = 40% maxHP), `BREAK_WINDOW = 5s`, `BREAK_DMG_AMP = 1.5x`

**Enemy fields:** `bossState ("shielded"|"broken"), shield, shieldMax, breakTimer, phase`

**Flow:**
1. Boss spawns with `bossState = "shielded"`, shield HP = 40% maxHP
2. While shielded: all damage chips shield only, HP locked. Overflow discarded.
3. Shield hits 0 → `breakShield()`: boss enters "broken" state for 5s, spell casting stops
4. During break: damage amplified 1.5x, goes directly to HP
5. After 5s → `endBreak()`: restores shield, resumes spell casting
6. Phase change → immediate shield restore + end break

**Visuals:**
- Shield bubble: radial gradient fill + ring, alpha scales with shield %
- Broken: stagger shake, grey wash overlay, 3 spinning stun stars
- HUD boss bar: `.shield` fill bar over `.hp` fill bar, `.break-label` timer

### Phase System & Enrage

**3 phases** based on HP ratio:
- Phase 1: > 66% HP (tier 1 spells)
- Phase 2: > 33% HP (tier 2 spells)
- Phase 3: ≤ 33% HP (tier 3 spells) → **ENRAGED**

**Enrage (Phase 3):**
- Spell timer drains 60% faster (`timeScale = 1.6`)
- Spell cooldowns shortened to 60% (`cdScale = 0.6`)
- Move speed + attack speed × 1.5
- Red aura pulsing overlay on boss sprite
- "ENRAGED!" float text on phase transition

**Phase transitions:** update `spellPool` to new tier, float "PHASE N!" text, immediate shield restore.

### Boss Spell System

Each boss has **9 unique spells**: 3 per phase tier. Selected randomly from current tier pool when timer expires. Timer only ticks while `bossState === "shielded"`.

**Spell selection flow:** `bossSpellTimer` ticks → picks random from `spellPool` → sets `castAnim = 1` (windup visual) → `castBossSpell()` executes spell → next cooldown = `spell.cooldown * cdScale`

**5 bosses, 45 spell kinds total:**

| Boss | Phase 1 Spells | Phase 2 Spells | Phase 3 Spells |
|------|---------------|---------------|---------------|
| **Giant Slime** (420 HP) | split, slimePool, bounceSlam | acidSpray, slimeWall, doubleSlam | toxicFlood, megaSplit, groundPound |
| **Spider Queen** (560 HP) | webBarrage, webTrap, summonSpiderlings | venomSpit, webWall, leapStrike | spiderRain, broodSwarm, silkPrison |
| **Lich** (680 HP) | deathBeam, boneRing, raiseDead | soulLance, boneSpear, curseZone | deathNova, boneStorm, undeadArmy |
| **Octopus/Kraken** (750 HP) | inkBlast, tentacleSlam, bubbleRing | inkCloud, whirlpool, tentacleSweep | deepCrush, krakensGrasp, abyssalSurge |
| **Lava Golem** (900 HP) | meteor, lavaPool, eruption | fireWall, magmaWave, emberBurst | volcano, lavaTsunami, infernoNova |

**Spell helpers:** `spawnCone()` (fan of bolts), `spawnBoltRing()` (360° ring), `spawnPoolAt()` (persistent ground), `spawnExplosion()` (telegraphed AoE), `spawnWall()` (line of pools), `spawnMini()` (summon add)

### Boss Attack Animations

**Per-boss basic attack swing (`atkAnim`):**
- giant_slime: bounce (`oy -= 3 * sin`)
- spider_queen: lunge (`ox += dir * 4 * sin`)
- lich: lunge (`ox += dir * 3 * sin`)
- lava_golem: stomp (`oy -= 3 * sin`)
- octopus: recoil + tentacle swipe arc

**Per-boss cast windup (`castAnim`) squash/stretch:**
- giant_slime: squash down
- spider_queen: rear back
- lich: lean back
- lava_golem: grow outward
- octopus: pulse outward

**Per-boss cast FX:**
- giant_slime: green charge glow at body center
- spider_queen: white web orb at mouth + 4 silk strands
- lich: purple staff orb above head + orbiting sparks
- lava_golem: red-hot core glow + ember particles rising
- octopus: pulsing dark aura

### Enemy Pool System

Regular monsters (non-boss) have all boss-only fields set to defaults:
`shield: 0, phase: 0, spellPool: [], castLock: 0, atkAnim: 0, castAnim: 0, bossState: "shielded", taunted: false, tauntTimer: 0`

### Render Pipeline

1. Floor fill + floor tiles (24x24 checkerboard)
2. Walls (4 rectangles, 16px `WALL` border) + brick pattern
3. Doors (carved openings, frame, locked bars, boss indicator)
4. Room terrain (obstacles + static hazards)
5. Heal zone (sanctuary circle)
6. Divine heal burst (pillar of light + expanding ring)
7. Y-sorted entity draw list (enemies + player sorted by Y)
8. Projectiles (translated + rotated, custom sprites)
9. Boss spell hazards (AoE telegraphs/explosions + beams + pools)
10. Nova waves (frost nova expanding ring)
11. Particles (2x2 px rects, alpha = life*2)
12. Float texts (8px monospace, shadow + color)
13. Door transition fade overlay
14. Phase banners (intro, room cleared)

## Dungeons

| ID | Name | Base Diff | Monsters | Boss |
|----|------|-----------|----------|------|
| `forest` | Whispering Woods | 1.0 | slime, spider | giant_slime |
| `cave` | Crystal Caverns | 1.25 | spider, slime | spider_queen |
| `crypt` | Shadow Crypt | 1.5 | skeleton, ghost | lich |
| `ruins` | Sunken Ruins | 1.4 | skeleton, ghost | octopus |
| `volcano` | Inferno Peak | 1.9 | fire_elemental, lava_slime | lava_golem |
| `atlantis` | Lost Atlantis | 2.0 | sea_serpent, ancient_guardian | octopus |
| `endless` | Endless Abyss | 1.0 | all types | all bosses (rotating, every 10 waves) |

### Difficulty Modes (GameMode)

`type GameMode = "default" | "normal" | "hard" | "extreme" | "hell"`

`modeDifficulty(dungeon, mode) = dungeon.difficulty * MODE_DEF[mode].mult`

| Mode | mult | rewardMult | luck | Effect |
|------|------|-----------|------|--------|
| Default | 0.5 | 0.7 | -2 | Easiest, worse loot |
| Normal | 1.0 | 1.0 | 0 | Baseline |
| Hard | 2.0 | 1.5 | +2 | 2x enemy stats, better loot |
| Extreme | 3.0 | 2.0 | +4 | 3x enemy stats, good loot |
| Hell | 5.0 | 3.0 | +6 | 5x enemy stats, best loot |

**Applied to:** all enemy HP/dmg on spawn (`Math.round(def.hp * d)`, `Math.round(def.dmg * d)`)

**UI:** Mode selector in dungeon select screen with colored buttons. `mode-badge` shown in raid HUD + results.

## Items (`items.ts`)

- **Slots**: weapon, helmet, armor, boots, ring
- **Stats**: dmg, hp, speed, cdr (cooldown reduction), crit
- **Rarity**: common → uncommon → rare → epic → legendary

**Rarity weights (base):** common 60, uncommon 26, rare 10, epic 3, legendary 0.3
**Luck formula:** common reduced by `luck*30` (min 5), uncommon `+luck*9`, rare `+luck*13`, epic `+max(0,luck)*3`, legendary `+max(0,luck)*1.0`
**Rarity stat multiplier:** common 1, uncommon 1.4, rare 1.9, epic 2.6, legendary 3.6
**Stat count:** common 1, uncommon 1, rare 2, epic 3, legendary 3
**Clamp caps:** cdr max 0.5/roll 0.6 total, crit max 0.6/roll 0.75 total

**Items drop from:** dungeon completion (rarity rolled with dungeon luck), equip in town

### ItemIcon Component (`app/ItemIcon.tsx`)

SVG pixel-art icon per slot, tinted by rarity color.

- **Props:** `{ slot: EquipSlot; rarity: Rarity; size?: number }` (default 28px)
- **Grid:** 16×16 viewBox, `shapeRendering="crispEdges"`
- **Palette:** derived from `RARITY_COLOR[rarity]` → [base, dark(-0.5), light(+0.45), metal(#7a6a52)]
- **Designs:** sword (weapon), dome+plume (helmet), chest plate (armor), boot pair (boots), ring+gem (ring)
- Used in: equipment panel, inventory list, loot results

## UI

### Town Hub (`app/page.tsx`)
- **Town nav bar**: Character (C) | Market | Inventory | Dungeon
- Keyboard shortcut `C` for Character panel (only when canvas not focused)
- **HeroPreview**: canvas-based hero sprite preview in character select
- **Dialog system**: NPC interaction with text lines
- **Inventory panel**: filter by slot, equip/unequip/discard
- **Dungeon select**: grid of dungeon cards + mode selector buttons below
- **Equipment panel**: left column (5 equip slots + totals summary), right column (filtered inventory list)
- Weapon hero-lock: can't equip weapon if `weapon.hero` mismatches current hero

### Raid HUD (`app/raid/page.tsx`)
- **Left HUD**: hero name, HP bar
- **Right HUD**: dungeon name, `mode-badge` (colored), room/wave counter, enemies count, gold
- **Boss bar** (`.boss-bar`): boss name + 3 phase pips + HP fill + shield fill overlay + break timer label
  - `.phase-pips .pip.on` = completed phase indicators
  - `.shield` bar overlays `.hp` bar when shielded
  - `.break-label` shows "SHIELD BROKEN — STRIKE! Xs" during break window
- **Skill bar**: 3 `.skill-pip` with active/ready/cooldown states
- **Minimap**: room grid with current room highlight + door connectors
- **Results overlay**: win/lose heading, rewards, level up, loot list with `ItemIcon` per item

## Save Data (`lib/save.ts`)

Persisted to localStorage:
- Hero levels + XP per hero
- Gold
- Inventory items
- Equipped items per hero
- Dungeons cleared

## Conventions

- Hero IDs: `"knight"` | `"mage"` | `"priest"` | `"tank"` | `"archer"`
- Dungeon IDs: `"forest"` | `"cave"` | `"crypt"` | `"ruins"` | `"volcano"` | `"atlantis"` | `"endless"`
- Boss IDs: `"giant_slime"` | `"spider_queen"` | `"lich"` | `"lava_golem"` | `"octopus"`
- GameMode IDs: `"default"` | `"normal"` | `"hard"` | `"extreme"` | `"hell"`
- All sprite sheets use 128×128 cells
- Keyed PNGs = chroma-keyed (transparent background) versions of sprites
- `_keyed.png` suffix = processed version used in game
- Non-keyed = raw source (not loaded by code)
- `ctx.setTransform` used (not `ctx.scale`) for camera — prevents React StrictMode double-mount zoom stacking
- Boss-only enemy fields (shield, phase, spellPool, castLock, atkAnim, castAnim, bossState, taunted, etc.) set to defaults on regular monster spawns
