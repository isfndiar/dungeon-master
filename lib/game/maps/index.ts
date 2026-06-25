import { buildTownMap } from "./town";
import { buildWestVillageMap } from "./west_village";
import type { TownMap } from "./types";

export const MAP_BUILDERS: Record<string, () => TownMap> = {
  town: buildTownMap,
  west_village: buildWestVillageMap,
};

export function buildAllMaps(): Record<string, TownMap> {
  const maps: Record<string, TownMap> = {};
  for (const [id, build] of Object.entries(MAP_BUILDERS)) {
    maps[id] = build();
  }
  return maps;
}

export * from "./types";
