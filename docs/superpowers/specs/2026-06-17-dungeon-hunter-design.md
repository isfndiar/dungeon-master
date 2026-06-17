# Dungeon Hunter — Design

Pixel-art web game. Player raids themed dungeons; each dungeon summons monsters
matching its theme. Player picks one of 5 heroes per raid and fights in real time
to reach the exit.

## Stack

- Next.js (App Router, TypeScript)
- HTML5 canvas for the raid game loop
- React for hub/menu UI
- localStorage for save data
- Code-drawn pixel sprites (no external image assets)

## Game Flow

```
Hub (pick hero, see gold/levels, pick dungeon)
  -> Raid (real-time action, reach exit)
  -> Results (gold + XP gained, level up)
  -> Hub
```

## Characters (pick 1 per raid)

| Hero   | Role          | Attack        | Skill (E)        | HP   | Dmg  | Speed |
|--------|---------------|---------------|------------------|------|------|-------|
| Knight | Balanced melee| Sword slash   | Spin slash (AoE) | med  | med  | med   |
| Mage   | Ranged glass  | Fireball      | Meteor (AoE)     | low  | high | med   |
| Priest | Melee + heal  | Staff strike  | Heal over time   | med  | low  | med   |
| Tank   | Bruiser       | Shield bash   | Taunt + shield   | high | low  | slow  |
| Archer | Ranged DPS    | Arrow         | Multishot        | low  | med  | fast  |

- Melee attacks: short-range hitbox in facing direction.
- Ranged attacks: spawn projectile toward aim.
- Skills have cooldowns shown on HUD.

## Controls

- WASD / arrow keys: move
- Mouse: aim direction
- Left click / Space: basic attack
- E: skill
- Character faces aim direction (or movement direction if no mouse move)

## Dungeons (themes + monsters)

| Dungeon  | Monsters            | Boss            |
|----------|---------------------|-----------------|
| Forest   | Slime, Wolf         | Giant Slime     |
| Cave     | Bat, Spider         | Spider Queen    |
| Crypt    | Skeleton, Ghost     | Lich            |
| Volcano  | Imp, Golem          | Lava Golem      |

Each dungeon = several rooms. Clear all monsters in a room -> exit door of that
room unlocks -> move to next room. Final room has the boss; defeat boss -> exit
door = dungeon complete. Each dungeon scales difficulty (more/tougher monsters).

## Monster behavior

- Melee monsters: chase player, deal touch/contact damage on cooldown.
- Ranged monsters (e.g. ghost, imp): keep distance, fire projectiles.
- Boss: more HP, mix of attacks, telegraphed.

## Progression

- Each monster gives gold + XP on death.
- XP levels each hero independently. Level up raises HP and Dmg.
- Gold currently a score/currency (future shop). Tracked globally.
- Persist to localStorage: hero levels/XP, gold, dungeons cleared.

## Rendering

- Fixed internal resolution (e.g. 320x180 or 480x270), scaled up with
  `image-rendering: pixelated` for crisp pixels.
- Sprites defined as small color-grid arrays in JS, drawn pixel-by-pixel to an
  offscreen canvas once, cached, then blitted each frame.
- Simple palette per entity. Idle + simple movement animation (2-frame).

## Architecture / Files

```
games/
  app/
    layout.tsx
    page.tsx              # Hub: hero select, dungeon select, stats
    raid/page.tsx         # Mounts the canvas raid; reads ?dungeon & ?hero
    globals.css
  lib/
    game/
      engine.ts           # game loop, state machine (playing/win/lose)
      entities.ts         # Player, Monster, Projectile classes/types
      heroes.ts           # hero stat definitions + attack/skill logic
      monsters.ts         # monster definitions per dungeon
      dungeons.ts         # dungeon configs: rooms, spawns, boss
      input.ts            # keyboard + mouse handling
      render.ts           # canvas draw helpers
      sprites.ts          # pixel-grid sprite data + draw/cache
      combat.ts           # damage, collision, hit resolution
    save.ts               # localStorage load/save
  package.json, tsconfig, next.config, etc.
```

## State machine (raid)

`loading -> playing -> (roomCleared -> playing) ... -> bossRoom -> win | lose`

- win: show results, grant gold/XP, return to hub.
- lose (player HP 0): show defeat, return to hub (partial or no reward).

## Error / edge handling

- Direct navigation to /raid without params -> redirect to hub.
- Corrupt/missing localStorage -> reset to defaults.
- Canvas not focused -> show "click to play" overlay to capture input.
- Pause on tab blur / Esc.

## Out of scope (v1)

- Multiplayer
- Item/gear loot system
- Sound (optional stretch; can add simple WebAudio beeps later)
- Shop spending gold
