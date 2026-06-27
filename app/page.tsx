"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  HEROES, HERO_IDS, HeroId, hpForLevel, dmgForLevel, xpToNext,
} from "@/lib/game/heroes";
import { DUNGEONS, DUNGEON_IDS, DungeonId, MODE_LIST, MODE_DEF, GameMode, isValidMode } from "@/lib/game/dungeons";
import { heroSprites, drawSprite } from "@/lib/game/sprites";
import { TownEngine, NpcDef, TownAction } from "@/lib/game/town";
import { preloadAssets } from "@/lib/game/preload";
import {
  loadSave, resetSave, writeSave, SaveData,
  heroBonusStats, equippedItems, equipItem, unequip, discardItem,
} from "@/lib/save";
import {
  Item, EquipSlot, EQUIP_SLOTS, SLOT_LABEL, RARITY_COLOR, RARITY_LABEL,
  itemStatLines, formatStat, itemPower,
  CONSUMABLE_DEFS, rollConsumableFromDef, formatEffect, getConsumableSellPrice, isConsumable,
} from "@/lib/game/items";
import { ItemIcon } from "./ItemIcon";
import { Joystick } from "./Joystick";
import { InteractButton } from "./InteractButton";

type Panel = "none" | "heroes" | "equipment" | "dungeon" | "market";

const TOWN_BGM_SRC = "/music/Kingdom_at_Last_Light.mp3";
const BGM_KEY = "dungeon-hunter-bgm-enabled";

function HeroPreview({ id, size = 64 }: { id: HeroId; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);

    const SHEET: Partial<Record<HeroId, string>> = {
      mage: "/custom/idle_6f/elf_mage_idle_6f_4dir_sheet.png",
      priest: "/sprites/paladin/idle_6f_4dir/paladin_idle_6f_4dir_sheet.png",
      knight: "/sprites/frost_knight/idle_6f_4dir/frost_knight_idle_6f_4dir_sheet.png",
      tank: "/sprites/hammer_guardian/idle-4f/final/idle-4f-4dir-spritesheet.png",
      archer: "/sprites/elf_archer/elf-archer-base-128x128.png",
    };

    const src = SHEET[id];
    if (src) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, 128, 128, 0, 0, size, size);
      };
      img.src = src;
    } else {
      drawSprite(ctx, "h_" + id, heroSprites[id], 0, 0, size);
    }
  }, [id, size]);
  return <canvas ref={ref} width={size} height={size} className="card-canvas" />;
}

export default function Town() {
  const router = useRouter();
  const [save, setSave] = useState<SaveData | null>(null);
  const [loadPct, setLoadPct] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [bgmEnabled, setBgmEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(BGM_KEY) !== "off";
  });
  const [panel, setPanel] = useState<Panel>("none");
  const [dialog, setDialog] = useState<{ name: string; lines: string[]; idx: number } | null>(null);
  const [nearbyName, setNearbyName] = useState<string | null>(null);
  const [invFilter, setInvFilter] = useState<EquipSlot | "all" | "consumable">("all");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<TownEngine | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const panelRef = useRef<Panel>("none");
  const dialogOpenRef = useRef(false);

  useEffect(() => { panelRef.current = panel; }, [panel]);
  useEffect(() => { dialogOpenRef.current = dialog !== null; }, [dialog]);

  const commit = useCallback((mutate: (s: SaveData) => void) => {
    setSave((prev) => {
      if (!prev) return prev;
      const next: SaveData = JSON.parse(JSON.stringify(prev));
      mutate(next);
      writeSave(next);
      return next;
    });
  }, []);

  useEffect(() => {
    setSave(loadSave());
  }, []);

  useEffect(() => {
    let cancelled = false;
    preloadAssets((pct) => {
      if (!cancelled) setLoadPct(pct);
    }).then(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const audio = new Audio(TOWN_BGM_SRC);
    audio.loop = true;
    audio.volume = 0.3;
    audioRef.current = audio;
    if (localStorage.getItem(BGM_KEY) !== "off") {
      audio.play().catch(() => {});
    }
    return () => { audio.pause(); audio.src = ""; };
  }, [loaded]);

  const toggleBgm = useCallback(() => {
    const next = !bgmEnabled;
    setBgmEnabled(next);
    localStorage.setItem(BGM_KEY, next ? "on" : "off");
    if (audioRef.current) {
      if (next) audioRef.current.play().catch(() => {});
      else audioRef.current.pause();
    }
  }, [bgmEnabled]);

  const handleInteract = useCallback((npc: NpcDef) => {
    const action: TownAction = npc.action;
    if (action === "dungeon") setPanel("dungeon");
    else if (action === "endless" && save) router.push(`/raid?hero=${save.selectedHero}&dungeon=endless`);
    else if (action === "village2") setDialog({ name: npc.name, lines: ["Coming soon... The next village is under construction."], idx: 0 });
    else if (action === "equipment") setPanel("equipment");
    else if (action === "heroes") setPanel("heroes");
    else if (action === "shop") setPanel("market");
    else setDialog({ name: npc.name, lines: npc.lines, idx: 0 });
  }, [save, router]);

  // mount town engine once save is ready
  const ready = save !== null && loaded;
  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    if (!canvas || engineRef.current) return;

    const engine = new TownEngine(canvas, loadSave().selectedHero, {
      onNearby: (n) => setNearbyName(n ? n.name : null),
      onInteract: (n) => {
        if (panelRef.current !== "none" || dialogOpenRef.current) return;
        handleInteract(n);
      },
    });
    engineRef.current = engine;
    engine.start();
    setEngineReady(true);

    const ro = new ResizeObserver(() => engine.resize());
    ro.observe(canvas);
    const onWinResize = () => engine.resize();
    window.addEventListener("resize", onWinResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWinResize);
      engine.destroy();
      engineRef.current = null;
      setEngineReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (save && engineRef.current) engineRef.current.setHero(save.selectedHero);
  }, [save?.selectedHero]);

  useEffect(() => {
    engineRef.current?.setPaused(panel !== "none" || dialog !== null);
  }, [panel, dialog]);

  // keyboard shortcut: C to open character select (only when canvas not focused)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || panel !== "none") return;
      if (document.activeElement === canvasRef.current) return;
      if (e.key.toLowerCase() === "c") setPanel("heroes");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, panel]);

  if (!save || !loaded) {
    return (
      <main className="loading-screen">
        <div className="loading-content">
          <div className="loading-title">DUNGEON HUNTER</div>
          <div className="loading-bar-track">
            <div className="loading-bar-fill" style={{ width: loadPct + "%" }} />
          </div>
          <div className="loading-text">Loading assets... {loadPct}%</div>
        </div>
      </main>
    );
  }

  const hero = save.selectedHero;
  const closePanel = () => { setPanel("none"); setDialog(null); };

  const doReset = () => {
    if (confirm("Reset all progress? This cannot be undone.")) {
      setSave(resetSave());
      closePanel();
    }
  };

  return (
    <main className="town-page">
      <div className="town-topbar">
        <div className="town-title">DUNGEON HUNTER</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div className="gold-badge">◆ {save.gold}</div>
          <div className="hero-chip">
            <HeroPreview id={hero} size={20} />
            <span>{HEROES[hero].name} Lv{save.heroes[hero].level}</span>
          </div>
          <button className="tiny-btn" onClick={doReset}>RESET</button>
        </div>
      </div>

      <div className="town-nav">
        {[
          { key: "heroes" as const, label: "Character", hotkey: "C" },
          { key: "market" as const, label: "Market" },
          { key: "equipment" as const, label: "Inventory" },
          { key: "dungeon" as const, label: "Dungeon" },
        ].map((item) => (
          <button
            key={item.key}
            className={"town-nav-btn" + (panel === item.key ? " active" : "")}
            onClick={() => setPanel(item.key)}
          >
            <span className="nav-label">{item.label}</span>
            {item.hotkey && <span className="nav-hotkey">{item.hotkey}</span>}
          </button>
        ))}
      </div>

      <div className="town-frame">
        <button className="bgm-btn town-bgm" onClick={toggleBgm} title={bgmEnabled ? "Mute music" : "Play music"}>
          {bgmEnabled ? "♫" : "♫̸"}
        </button>
        <canvas
          ref={canvasRef}
          tabIndex={0}
          style={{ width: "100%", height: "100%", display: "block", imageRendering: "pixelated" }}
          onClick={() => {
            canvasRef.current?.focus();
            if (panel === "none" && !dialog) engineRef.current?.interactNearby();
          }}
        />

        {dialog && (
          <div
            className="dialog-box"
            onClick={() => {
              if (dialog.idx + 1 < dialog.lines.length) setDialog({ ...dialog, idx: dialog.idx + 1 });
              else setDialog(null);
            }}
          >
            <div className="dialog-name">{dialog.name}</div>
            <div className="dialog-text">{dialog.lines[dialog.idx]}</div>
            <div className="dialog-cont">
              {dialog.idx + 1 < dialog.lines.length ? "▶ click to continue" : "▶ click to close"}
            </div>
          </div>
        )}

        {panel === "heroes" && (
          <Modal title="Choose Your Champion" onClose={closePanel}>
            <HeroSelect save={save} commit={commit} onPick={closePanel} />
          </Modal>
        )}
        {panel === "equipment" && (
          <Modal title={`${HEROES[hero].name} — Equipment`} onClose={closePanel}>
            <EquipmentPanel
              save={save} hero={hero}
              invFilter={invFilter} setInvFilter={setInvFilter}
              commit={commit}
            />
          </Modal>
        )}
        {panel === "dungeon" && (
          <Modal title="Choose a Dungeon" onClose={closePanel}>
            <DungeonSelect save={save} hero={hero} router={router} />
          </Modal>
        )}
        {panel === "market" && (
          <Modal title="Merchant Pell's Shop" onClose={closePanel}>
            <ShopPanel save={save} commit={commit} />
          </Modal>
        )}

        {engineReady && engineRef.current && (
          <div className="mobile-controls">
            <Joystick input={engineRef.current.input} />
            <InteractButton input={engineRef.current.input} />
          </div>
        )}
      </div>

      <div className="town-hint">
        {typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0)
          ? `Walk around • tap E to interact${nearbyName ? ` — near ${nearbyName}` : ""}`
          : `WASD / Arrows: walk • E or click: interact • C: Character${nearbyName ? ` — near ${nearbyName}` : ""}`}
      </div>
    </main>
  );
}

// ---------------- Modal shell ----------------
function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>{title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ---------------- Hero Select ----------------
function HeroSelect({ save, commit, onPick }: {
  save: SaveData; commit: (m: (s: SaveData) => void) => void; onPick: () => void;
}) {
  return (
    <div className="hero-grid">
      {HERO_IDS.map((id) => {
        const def = HEROES[id];
        const prog = save.heroes[id];
        const need = xpToNext(prog.level);
        const pct = Math.min(100, (prog.xp / need) * 100);
        const sel = save.selectedHero === id;
        return (
          <div
            key={id}
            className={"card" + (sel ? " selected" : "")}
            onClick={() => { commit((s) => { s.selectedHero = id; }); onPick(); }}
          >
            <HeroPreview id={id} />
            <div className="card-name">{def.name}</div>
            <div className="card-lv">Lv {prog.level}</div>
            <div className="card-desc">{def.desc}</div>
            <div className="stat-row"><span>HP</span><b>{hpForLevel(def, prog.level)}</b></div>
            <div className="stat-row"><span>DMG</span><b>{dmgForLevel(def, prog.level)}</b></div>
            <div className="skill-list">
              {def.skills.map((s) => (
                <div className="skill-line" key={s.key} title={s.desc}>
                  <span className="skill-key">{s.key}</span>
                  <span className="skill-nm">{s.name}</span>
                </div>
              ))}
            </div>
            <div className="xpbar"><div style={{ width: pct + "%" }} /></div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Dungeon Select ----------------
function DungeonSelect({ save, hero, router }: {
  save: SaveData; hero: HeroId; router: ReturnType<typeof useRouter>;
}) {
  const dungeons = DUNGEON_IDS.map((id) => DUNGEONS[id]).sort((a, b) => a.order - b.order);
  const [pick, setPick] = useState<DungeonId | null>(null);
  const [mode, setMode] = useState<GameMode>("normal");
  const selectedDungeon = pick ? DUNGEONS[pick] : null;
  return (
    <div>
      <div className="dungeon-grid">
        {dungeons.map((d) => {
          const cleared = save.cleared.includes(d.id);
          const diff = Math.min(4, Math.round(d.difficulty));
          return (
            <div
              key={d.id}
              className={"dungeon-card" + (pick === d.id ? " selected" : "")}
              onClick={() => setPick(d.id)}
              style={{ borderColor: pick === d.id ? "var(--gold)" : undefined }}
            >
              {cleared && <div className="cleared-tag">CLEARED</div>}
              <div className="dungeon-name" style={{ color: d.accent }}>{d.name}</div>
              <div className="dungeon-desc">{d.desc}</div>
              <div className="dungeon-meta">
                <span>{d.rooms + 2} rooms</span>
                <span>Boss: {bossLabel(d.boss)}</span>
              </div>
              <div className="diff-dots">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={i < diff ? "on" : ""} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {pick && (
        <div className="mode-select">
          <div className="mode-buttons">
            {MODE_LIST.map((m) => {
              const md = MODE_DEF[m];
              return (
                <button
                  key={m}
                  className={"mode-btn" + (mode === m ? " active" : "")}
                  onClick={() => setMode(m)}
                  style={{
                    borderColor: mode === m ? md.color : undefined,
                    color: mode === m ? md.color : undefined,
                  }}
                >
                  {md.label}
                </button>
              );
            })}
          </div>
          <div className="mode-info">
            <span style={{ color: MODE_DEF[mode].color }}>{MODE_DEF[mode].label}</span>
            <span>{MODE_DEF[mode].desc}</span>
            <span className="mode-stats">
              {selectedDungeon && (
                <>
                  {" "}Diff {MODE_DEF[mode].mult}x → {(selectedDungeon.difficulty * MODE_DEF[mode].mult).toFixed(2)}x
                  {"  ·  Rewards "}
                  {MODE_DEF[mode].rewardMult}x
                </>
              )}
            </span>
          </div>
        </div>
      )}
      <button
        className="raid-btn"
        disabled={!pick}
        onClick={() => pick && router.push(`/raid?hero=${hero}&dungeon=${pick}&mode=${mode}`)}
      >
        {pick ? `RAID AS ${HEROES[hero].name.toUpperCase()}: ${DUNGEONS[pick].name} (${MODE_DEF[mode].label})` : "SELECT A DUNGEON"}
      </button>
    </div>
  );
}

// ---------------- Equipment Panel ----------------
function EquipmentPanel({
  save, hero, invFilter, setInvFilter, commit,
}: {
  save: SaveData;
  hero: HeroId;
  invFilter: EquipSlot | "all" | "consumable";
  setInvFilter: (f: EquipSlot | "all" | "consumable") => void;
  commit: (mutate: (s: SaveData) => void) => void;
}) {
  const equipped = equippedItems(save, hero);
  const bonus = heroBonusStats(save, hero);
  const def = HEROES[hero];
  const prog = save.heroes[hero];

  const usable = (it: Item) =>
    it.slot !== "weapon" || it.hero === "any" || it.hero === hero;

  const equippedIds = new Set(
    EQUIP_SLOTS.map((s) => prog.equipped[s]).filter(Boolean) as string[]
  );

  let list = save.inventory
    .filter((it) => !equippedIds.has(it.id))
    .filter(usable);
  if (invFilter === "consumable") list = list.filter((it) => it.slot === "consumable");
  else if (invFilter !== "all") list = list.filter((it) => it.slot === invFilter);
  list = list.slice().sort((a, b) => itemPower(b) - itemPower(a));

  const totalHp = hpForLevel(def, prog.level) + bonus.hp;
  const totalDmg = dmgForLevel(def, prog.level) + bonus.dmg;

  return (
    <div className="equip-panel">
      <div className="equip-left">
        <div className="equip-slots">
          {EQUIP_SLOTS.map((slot, i) => {
            const it = equipped[i];
            return (
              <div key={slot} className="equip-slot">
                <div className="slot-label">{SLOT_LABEL[slot]}</div>
                {it ? (
                  <div className="slot-item" style={{ borderColor: RARITY_COLOR[it.rarity] }}>
                    <div className="slot-item-main">
                      <ItemIcon slot={it.slot} rarity={it.rarity} size={30} consumableType={it.consumableType} />
                      <div className="slot-item-body">
                        <div className="slot-item-name" style={{ color: RARITY_COLOR[it.rarity] }}>
                          {it.name}
                        </div>
                        <div className="slot-item-stats">
                          {itemStatLines(it).map((l) => (
                            <span key={l.key}>{formatStat(l.key, l.value)}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button className="slot-btn" onClick={() => commit((s) => unequip(s, hero, slot))}>
                      Unequip
                    </button>
                  </div>
                ) : (
                  <div className="slot-empty">
                    <ItemIcon slot={slot} rarity="common" size={26} />
                    <span>— empty —</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="equip-totals">
          <div className="tot"><span>HP</span><b>{totalHp}</b></div>
          <div className="tot"><span>DMG</span><b>{totalDmg}</b></div>
          <div className="tot"><span>SPD</span><b>+{bonus.speed}</b></div>
          <div className="tot"><span>CDR</span><b>{Math.round(bonus.cdr * 100)}%</b></div>
          <div className="tot"><span>CRIT</span><b>{Math.round(bonus.crit * 100)}%</b></div>
        </div>

        <div className="quickslot-section">
          <div className="quickslot-title">Quick Slots (4-7)</div>
          <div className="quickslot-row">
            {[0,1,2,3].map(i => {
              const qs = save.quickSlots[i];
              return (
                <div key={i} className="quickslot-box" title={qs ? qs.name : "Empty — assign from inventory"}>
                  {qs ? (
                    <>
                      <ItemIcon slot="consumable" rarity={qs.rarity} consumableType={qs.consumableType} size={20} />
                      <span className="quickslot-name">{qs.name.replace(" Potion","").replace(" Scroll","")}</span>
                    </>
                  ) : (
                    <span className="quickslot-empty">—</span>
                  )}
                  <span className="quickslot-key">{i + 4}</span>
                  {qs && (
                    <button className="quickslot-remove" onClick={() => commit(s => { s.quickSlots[i] = null; })}>✕</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="equip-right">
        <div className="inv-filters">
          {(["all", ...EQUIP_SLOTS] as const).map((f) => (
            <button
              key={f}
              className={"inv-filter" + (invFilter === f ? " on" : "")}
              onClick={() => setInvFilter(f)}
            >
              {f === "all" ? "All" : SLOT_LABEL[f]}
            </button>
          ))}
          <button
            className={"inv-filter" + (invFilter === "consumable" ? " on" : "")}
            onClick={() => setInvFilter("consumable")}
          >
            Potion
          </button>
        </div>

        {list.length === 0 ? (
          <div className="inv-empty">No items. Raid dungeons to find loot!</div>
        ) : (
          <div className="inv-list">
            {list.map((it) => {
              const lockedWeapon = it.slot === "weapon" && it.hero !== "any" && it.hero !== hero;
              const consum = isConsumable(it);
              return (
                <div className="inv-item" key={it.id} style={{ borderColor: RARITY_COLOR[it.rarity] }}>
                  <div className="inv-item-top">
                    <ItemIcon slot={it.slot} rarity={it.rarity} size={32} consumableType={it.consumableType} />
                    <div className="inv-item-info">
                      <div className="inv-item-head">
                        <span className="inv-item-name" style={{ color: RARITY_COLOR[it.rarity] }}>
                          {it.name}
                          {consum && (it.stackCount ?? 1) > 1 && <span className="stack-badge"> ×{it.stackCount}</span>}
                        </span>
                        <span className="inv-item-tag">
                          {RARITY_LABEL[it.rarity]} · {consum ? (it.consumableType === "scroll" ? "Scroll" : "Potion") : SLOT_LABEL[it.slot]}
                        </span>
                      </div>
                      {consum && it.effect ? (
                        <div className="consumable-effect">{formatEffect(it.effect)}</div>
                      ) : (
                        <div className="inv-item-stats">
                          {itemStatLines(it).map((l) => (
                            <span key={l.key}>{formatStat(l.key, l.value)}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="inv-item-actions">
                    {consum ? (
                      <>
                        <select className="inv-btn assign-select" value="" onChange={(e) => {
                          const slotIdx = parseInt(e.target.value);
                          if (isNaN(slotIdx)) return;
                          commit(s => {
                            const existing = s.quickSlots[slotIdx];
                            if (existing && existing.name === it.name) {
                              // same item — just ensure it's there
                              return;
                            }
                            s.quickSlots[slotIdx] = { ...it, stackCount: 1 };
                          });
                        }}>
                          <option value="">Assign to slot...</option>
                          {[0,1,2,3].map(i => <option key={i} value={i}>Slot {i+4}</option>)}
                        </select>
                        <button className="inv-btn discard" onClick={() => {
                          const price = getConsumableSellPrice(it.name);
                          commit((s) => {
                            s.gold += price;
                            const newCount = (it.stackCount ?? 1) - 1;
                            if (newCount <= 0) {
                              s.inventory = s.inventory.filter(i => i.id !== it.id);
                            } else {
                              const item = s.inventory.find(i => i.id === it.id);
                              if (item) item.stackCount = newCount;
                            }
                          });
                        }}>
                          Sell ◆{getConsumableSellPrice(it.name)}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="inv-btn equip"
                          disabled={lockedWeapon}
                          onClick={() => commit((s) => equipItem(s, hero, it))}
                        >
                          {lockedWeapon ? "Not for this hero" : "Equip"}
                        </button>
                        <button className="inv-btn discard" onClick={() => commit((s) => discardItem(s, it.id))}>
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Shop Panel ----------------
function ShopPanel({ save, commit }: {
  save: SaveData; commit: (m: (s: SaveData) => void) => void;
}) {
  const shopItems = CONSUMABLE_DEFS.filter(d => d.rarity === "common" || d.rarity === "uncommon");
  const [bought, setBought] = useState<string | null>(null);
  const getStack = (name: string) => {
    const items = save.inventory.filter(i => i.name === name);
    return items.reduce((sum, i) => sum + (i.stackCount ?? 1), 0);
  };
  return (
    <div>
      <div className="shop-gold">Your gold: ◆ {save.gold}</div>
      {bought && <div className="shop-bought">+1 {bought}!</div>}
      <div className="shop-grid">
        {shopItems.map((def) => {
          const canBuy = save.gold >= def.price;
          const owned = getStack(def.name);
          return (
            <div key={def.name} className="shop-card" style={{ borderColor: RARITY_COLOR[def.rarity] }}>
              <ItemIcon slot="consumable" rarity={def.rarity} consumableType={def.consumableType} size={32} />
              <div className="shop-name" style={{ color: RARITY_COLOR[def.rarity] }}>{def.name}</div>
              <div className="shop-effect">{formatEffect(def.effect)}</div>
              {owned > 0 && <div className="shop-owned">Owned: {owned}</div>}
              <div className="shop-price">◆ {def.price}</div>
              <button
                className="inv-btn"
                disabled={!canBuy}
                onClick={() => {
                  commit((s) => {
                    s.gold -= def.price;
                    const existing = s.inventory.find(i => i.name === def.name && (i.stackCount ?? 1) < (i.maxStack ?? 10));
                    if (existing) {
                      existing.stackCount = (existing.stackCount ?? 1) + 1;
                    } else {
                      s.inventory.push(rollConsumableFromDef(def));
                    }
                  });
                  setBought(def.name);
                  setTimeout(() => setBought(null), 1500);
                }}
              >
                {canBuy ? "Buy" : "Not enough gold"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function bossLabel(boss: string): string {
  const map: Record<string, string> = {
    giant_slime: "Giant Slime",
    spider_queen: "Spider Queen",
    lich: "Lich",
    lava_golem: "Lava Golem",
  };
  return map[boss] ?? boss;
}
