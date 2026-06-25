# AGENTS.md — Dungeon Hunter v2

Pixel-art dungeon crawler. Next.js + HTML5 Canvas. Player picks hero, raids dungeons, fights monsters in real-time, collects loot.

## Stack

- **Next.js** (App Router, TypeScript)
- **HTML5 Canvas** for raid game loop + town exploration
- **React** for hub/menu UI (panels, dialogs, inventory)
- **localStorage** for save data (`lib/save.ts`)

## Game Flow

```
Town (hub) → pick dungeon → Raid (real-time combat) → Results → Town
```

## Project Structure

```
app/
  page.tsx              # Town hub: hero select, dungeon select, equipment, market
  raid/page.tsx         # Raid canvas: mounts Engine, HUD, minimap, results
  layout.tsx            # Root layout
  globals.css           # All styles (town nav, panels, raid HUD)

lib/
  game/
    engine.ts           # Raid game loop, combat, skills, projectiles, endless mode
    town.ts             # TownEngine: camera, NPC, buildings, wandering NPCs, portal
    heroes.ts           # Hero definitions (knight/mage/priest/tank/archer)
    monsters.ts         # Monster + boss definitions
    dungeons.ts         # Dungeon configs (forest/cave/crypt/volcano/endless)
    items.ts            # Item system: slots, stats, rarity, rolling
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

| Hero   | Sprite ID | Skills (1/2/3)                           | Notes |
|--------|-----------|------------------------------------------|-------|
| Knight | `knight`  | Charge / Sword Storm / War Cry           | Frost knight sprite. War Cry = +dmg & lifesteal |
| Mage   | `mage`    | Frost Nova / Meteor / Blink              | Elf mage sprite. Ranged fireball |
| Priest | `priest`  | Smite / Divine Heal / Sanctuary          | Paladin sprite |
| Tank   | `tank`    | Ground Slam / Bulwark / Berserk          | Hammer guardian sprite. Passive: low HP = +dmg & enemy miss |
| Archer | `archer`  | Multishot / Rapid Fire / Snipe           | Elf archer sprite. Arrow projectile with rotation |

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
- **Projectiles**: fireball, arrow, bolt, sword (sword storm)
- **Passives**: 
  - Tank: low HP → +damage multiplier + enemy miss chance
  - Knight (frost_knight): War Cry → lifesteal on hit
- **Skills**: 3 per hero (keys 1/2/3), cooldown-based

## Items (`items.ts`)

- **Slots**: weapon, helmet, armor, boots, ring
- **Stats**: dmg, hp, speed, cdr, crit
- **Rarity**: common → uncommon → rare → epic → legendary
- Items drop from dungeon completion, equip in town

## UI (`app/page.tsx`)

- **Town nav bar**: Character (C) | Market | Inventory | Dungeon
- Keyboard shortcut `C` for Character panel (only when canvas not focused)
- **HeroPreview**: canvas-based hero sprite preview in character select
- **Dialog system**: NPC interaction with text lines
- **Inventory panel**: filter by slot, equip/unequip/discard

## Save Data (`lib/save.ts`)

Persisted to localStorage:
- Hero levels + XP per hero
- Gold
- Inventory items
- Equipped items per hero
- Dungeons cleared

## Conventions

- Hero IDs: `"knight"` | `"mage"` | `"priest"` | `"tank"` | `"archer"`
- Dungeon IDs: `"forest"` | `"cave"` | `"crypt"` | `"volcano"` | `"endless"`
- All sprite sheets use 128×128 cells
- Keyed PNGs = chroma-keyed (transparent background) versions of sprites
- `_keyed.png` suffix = processed version used in game
- Non-keyed = raw source (not loaded by code)
