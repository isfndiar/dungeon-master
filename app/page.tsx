"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  HEROES, HERO_IDS, HeroId, hpForLevel, dmgForLevel, xpToNext,
} from "@/lib/game/heroes";
import { DUNGEONS, DUNGEON_IDS, DungeonId } from "@/lib/game/dungeons";
import { heroSprites, drawSprite } from "@/lib/game/sprites";
import { TownEngine, NpcDef, TownAction } from "@/lib/game/town";
import {
  loadSave, resetSave, writeSave, SaveData,
  heroBonusStats, equippedItems, equipItem, unequip, discardItem,
} from "@/lib/save";
import {
  Item, EquipSlot, EQUIP_SLOTS, SLOT_LABEL, RARITY_COLOR, RARITY_LABEL,
  itemStatLines, formatStat, itemPower,
} from "@/lib/game/items";

type Panel = "none" | "heroes" | "equipment" | "dungeon" | "market";

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
  const [panel, setPanel] = useState<Panel>("none");
  const [dialog, setDialog] = useState<{ name: string; lines: string[]; idx: number } | null>(null);
  const [nearbyName, setNearbyName] = useState<string | null>(null);
  const [invFilter, setInvFilter] = useState<EquipSlot | "all">("all");
  const [editorMode, setEditorMode] = useState(false);
  const [editorSelection, setEditorSelection] = useState<{ kind: "building" | "npc"; index: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<TownEngine | null>(null);
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

  const handleInteract = useCallback((npc: NpcDef) => {
    const action: TownAction = npc.action;
    if (action === "dungeon") setPanel("dungeon");
    else if (action === "endless" && save) router.push(`/raid?hero=${save.selectedHero}&dungeon=endless`);
    else if (action === "village2") setDialog({ name: npc.name, lines: ["Coming soon... The next village is under construction."], idx: 0 });
    else if (action === "equipment") setPanel("equipment");
    else if (action === "heroes") setPanel("heroes");
    else setDialog({ name: npc.name, lines: npc.lines, idx: 0 });
  }, [save, router]);

  // mount town engine once save is ready
  const ready = save !== null;
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

    engine.setEditorCallbacks({
      onSelect: (kind, index) => {
        if (kind && index !== null) setEditorSelection({ kind, index });
        else setEditorSelection(null);
      },
    });

    const ro = new ResizeObserver(() => engine.resize());
    ro.observe(canvas);
    const onWinResize = () => engine.resize();
    window.addEventListener("resize", onWinResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWinResize);
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (save && engineRef.current) engineRef.current.setHero(save.selectedHero);
  }, [save?.selectedHero]);

  useEffect(() => {
    engineRef.current?.setPaused(panel !== "none" || dialog !== null);
  }, [panel, dialog]);

  useEffect(() => {
    engineRef.current?.setEditorMode(editorMode);
  }, [editorMode]);

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

  if (!save) return null;

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
          {process.env.NODE_ENV === "development" && (
            <button
              className={"town-nav-btn" + (editorMode ? " active" : "")}
              style={{ flex: "none", padding: "6px 12px" }}
              onClick={() => setEditorMode(!editorMode)}
            >
              {editorMode ? "EXIT EDIT" : "EDITOR"}
            </button>
          )}
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
          <Modal title="Market" onClose={closePanel}>
            <div className="market-placeholder">
              <div className="market-icon">🏪</div>
              <div className="market-text">Coming Soon</div>
              <div className="market-sub">The market is under construction.</div>
            </div>
          </Modal>
        )}
        {editorMode && (
          <EditorPanel
            engine={engineRef.current!}
            selection={editorSelection}
            onClose={() => setEditorMode(false)}
          />
        )}
      </div>

      <div className="town-hint">
        WASD / Arrows: walk • E or click: interact • C: Character
        {editorMode && <span className="near"> — EDITOR MODE: click to select, drag to move</span>}
        {!editorMode && nearbyName && <span className="near"> — near {nearbyName}</span>}
      </div>
    </main>
  );
}

// ---------------- Editor Panel ----------------
function EditorPanel({
  engine, selection, onClose,
}: {
  engine: TownEngine;
  selection: { kind: "building" | "npc"; index: number } | null;
  onClose: () => void;
}) {
  const [refresh, setRefresh] = useState(0);

  if (!selection) {
    return (
      <div className="editor-panel">
        <div className="editor-panel-header">
          <span>Town Editor</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="editor-panel-body">
          <div className="editor-hint">Click a building or NPC to select it.</div>
          <div className="editor-actions">
            <button className="editor-btn" onClick={() => {
              engine.addBuilding({
                x: 400, y: 400, w: 120, h: 80,
                color: "#6a6a6a", roof: "#4a4a4a",
                asset: "", drawSize: 180, label: "NEW",
              });
              setRefresh((r) => r + 1);
            }}>+ Add Building</button>
            <button className="editor-btn" onClick={() => engine.doExportLayout()}>Export JSON</button>
            <button className="editor-btn" onClick={async () => { await engine.doImportLayout(); setRefresh((r) => r + 1); }}>Import JSON</button>
          </div>
        </div>
      </div>
    );
  }

  if (selection.kind === "building") {
    const b = engine.getSelectedBuilding();
    if (!b) return null;
    return (
      <div className="editor-panel">
        <div className="editor-panel-header">
          <span>Building</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="editor-panel-body">
          <label>X<input type="number" value={b.x} onChange={(e) => { b.x = +e.target.value; setRefresh((r) => r + 1); }} /></label>
          <label>Y<input type="number" value={b.y} onChange={(e) => { b.y = +e.target.value; setRefresh((r) => r + 1); }} /></label>
          <label>W<input type="number" value={b.w} onChange={(e) => { b.w = +e.target.value; setRefresh((r) => r + 1); }} /></label>
          <label>H<input type="number" value={b.h} onChange={(e) => { b.h = +e.target.value; setRefresh((r) => r + 1); }} /></label>
          <label>Label<input type="text" value={b.label ?? ""} onChange={(e) => { b.label = e.target.value; setRefresh((r) => r + 1); }} /></label>
          <label>Asset<input type="text" value={b.asset} onChange={(e) => { b.asset = e.target.value; setRefresh((r) => r + 1); }} /></label>
          <label>Draw Size<input type="number" value={b.drawSize} onChange={(e) => { b.drawSize = +e.target.value; setRefresh((r) => r + 1); }} /></label>
          <button className="editor-btn danger" onClick={() => { engine.removeSelected(); setRefresh((r) => r + 1); }}>Delete</button>
        </div>
      </div>
    );
  }

  const n = engine.getSelectedNpc();
  if (!n) return null;
  return (
    <div className="editor-panel">
      <div className="editor-panel-header">
        <span>NPC: {n.name}</span>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>
      <div className="editor-panel-body">
        <label>Name<input type="text" value={n.name} onChange={(e) => { n.name = e.target.value; setRefresh((r) => r + 1); }} /></label>
        <label>X<input type="number" value={n.x} onChange={(e) => { n.x = +e.target.value; setRefresh((r) => r + 1); }} /></label>
        <label>Y<input type="number" value={n.y} onChange={(e) => { n.y = +e.target.value; setRefresh((r) => r + 1); }} /></label>
        <label>Action
          <select value={n.action} onChange={(e) => { n.action = e.target.value as any; setRefresh((r) => r + 1); }}>
            <option value="talk">talk</option>
            <option value="heroes">heroes</option>
            <option value="equipment">equipment</option>
            <option value="dungeon">dungeon</option>
            <option value="endless">endless</option>
            <option value="shop">shop</option>
          </select>
        </label>
        <label>Facing
          <select value={n.facing} onChange={(e) => { n.facing = +e.target.value as 1 | -1; setRefresh((r) => r + 1); }}>
            <option value={1}>Right</option>
            <option value={-1}>Left</option>
          </select>
        </label>
        <label>Asset<input type="text" value={n.asset ?? ""} onChange={(e) => { n.asset = e.target.value || undefined; setRefresh((r) => r + 1); }} /></label>
        <label>Draw Size<input type="number" value={n.drawSize ?? 28} onChange={(e) => { n.drawSize = +e.target.value; setRefresh((r) => r + 1); }} /></label>
        <label>Dialog Lines
          <textarea
            value={n.lines.join("\n")}
            rows={3}
            onChange={(e) => { n.lines = e.target.value.split("\n"); setRefresh((r) => r + 1); }}
          />
        </label>
        <button className="editor-btn danger" onClick={() => { engine.removeSelected(); setRefresh((r) => r + 1); }}>Delete</button>
      </div>
    </div>
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
      <button
        className="raid-btn"
        disabled={!pick}
        onClick={() => pick && router.push(`/raid?hero=${hero}&dungeon=${pick}`)}
      >
        {pick ? `RAID AS ${HEROES[hero].name.toUpperCase()}: ${DUNGEONS[pick].name}` : "SELECT A DUNGEON"}
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
  invFilter: EquipSlot | "all";
  setInvFilter: (f: EquipSlot | "all") => void;
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
  if (invFilter !== "all") list = list.filter((it) => it.slot === invFilter);
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
                    <div className="slot-item-name" style={{ color: RARITY_COLOR[it.rarity] }}>
                      {it.name}
                    </div>
                    <div className="slot-item-stats">
                      {itemStatLines(it).map((l) => (
                        <span key={l.key}>{formatStat(l.key, l.value)}</span>
                      ))}
                    </div>
                    <button className="slot-btn" onClick={() => commit((s) => unequip(s, hero, slot))}>
                      Unequip
                    </button>
                  </div>
                ) : (
                  <div className="slot-empty">— empty —</div>
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
        </div>

        {list.length === 0 ? (
          <div className="inv-empty">No items. Raid dungeons to find loot!</div>
        ) : (
          <div className="inv-list">
            {list.map((it) => {
              const lockedWeapon = it.slot === "weapon" && it.hero !== "any" && it.hero !== hero;
              return (
                <div className="inv-item" key={it.id} style={{ borderColor: RARITY_COLOR[it.rarity] }}>
                  <div className="inv-item-head">
                    <span className="inv-item-name" style={{ color: RARITY_COLOR[it.rarity] }}>
                      {it.name}
                    </span>
                    <span className="inv-item-tag">
                      {RARITY_LABEL[it.rarity]} · {SLOT_LABEL[it.slot]}
                    </span>
                  </div>
                  <div className="inv-item-stats">
                    {itemStatLines(it).map((l) => (
                      <span key={l.key}>{formatStat(l.key, l.value)}</span>
                    ))}
                  </div>
                  <div className="inv-item-actions">
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

function bossLabel(boss: string): string {
  const map: Record<string, string> = {
    giant_slime: "Giant Slime",
    spider_queen: "Spider Queen",
    lich: "Lich",
    lava_golem: "Lava Golem",
  };
  return map[boss] ?? boss;
}
