export interface BuildingLayout {
  x: number; y: number; w: number; h: number;
  color: string; roof: string;
  asset: string; drawSize: number;
  label?: string;
  banner?: string;
  portal?: boolean;
  drawHeight?: number;
}

export interface NpcLayout {
  id: string; name: string;
  x: number; y: number;
  action: string;
  facing: 1 | -1;
  lines: string[];
  asset?: string;
  drawSize?: number;
  headgear?: string;
  cloth?: string;
  trim?: string;
  hair?: string;
  wanderRadius?: number;
  wanderSpeed?: number;
}

export interface RoadRect {
  x: number; y: number; w: number; h: number;
}

export interface TownLayout {
  buildings: BuildingLayout[];
  npcs: NpcLayout[];
  roads: RoadRect[];
}

const STORAGE_KEY = "dungeon-hunter-town-layout";

export function saveTownLayout(layout: TownLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch { /* ignore */ }
}

export function loadTownLayout(): TownLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TownLayout;
  } catch { return null; }
}

export function exportTownLayout(layout: TownLayout): void {
  const blob = new Blob([JSON.stringify(layout, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "town-layout.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function importTownLayout(): Promise<TownLayout | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(reader.result as string) as TownLayout);
        } catch { resolve(null); }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}
