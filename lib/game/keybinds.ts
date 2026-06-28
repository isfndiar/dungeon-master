/**
 * Keybind system for customizable raid controls.
 * Stores bindings in localStorage, provides defaults and conflict resolution.
 */

export type RaidAction =
  | "moveUp"
  | "moveDown"
  | "moveLeft"
  | "moveRight"
  | "attack"
  | "skill1"
  | "skill2"
  | "skill3"
  | "quickSlot1"
  | "quickSlot2"
  | "quickSlot3"
  | "quickSlot4";

export const RAID_ACTIONS: RaidAction[] = [
  "moveUp", "moveDown", "moveLeft", "moveRight",
  "attack",
  "skill1", "skill2", "skill3",
  "quickSlot1", "quickSlot2", "quickSlot3", "quickSlot4",
];

export const ACTION_LABELS: Record<RaidAction, string> = {
  moveUp: "Move Up",
  moveDown: "Move Down",
  moveLeft: "Move Left",
  moveRight: "Move Right",
  attack: "Attack",
  skill1: "Skill 1",
  skill2: "Skill 2",
  skill3: "Skill 3",
  quickSlot1: "Quick Slot 1",
  quickSlot2: "Quick Slot 2",
  quickSlot3: "Quick Slot 3",
  quickSlot4: "Quick Slot 4",
};

export type KeyBindings = Record<RaidAction, string>;

export const DEFAULT_KEYBINDS: KeyBindings = {
  moveUp: "w",
  moveDown: "s",
  moveLeft: "a",
  moveRight: "d",
  attack: " ",
  skill1: "1",
  skill2: "2",
  skill3: "3",
  quickSlot1: "4",
  quickSlot2: "5",
  quickSlot3: "6",
  quickSlot4: "7",
};

const KEYBINDS_KEY = "dungeon-hunter-keybinds";

export function loadKeybinds(): KeyBindings {
  if (typeof window === "undefined") return { ...DEFAULT_KEYBINDS };
  try {
    const raw = localStorage.getItem(KEYBINDS_KEY);
    if (!raw) return { ...DEFAULT_KEYBINDS };
    const parsed = JSON.parse(raw) as Partial<KeyBindings>;
    // Merge with defaults (in case new actions were added)
    const result = { ...DEFAULT_KEYBINDS };
    for (const action of RAID_ACTIONS) {
      if (parsed[action] && typeof parsed[action] === "string") {
        result[action] = parsed[action]!;
      }
    }
    return result;
  } catch {
    return { ...DEFAULT_KEYBINDS };
  }
}

export function saveKeybinds(bindings: KeyBindings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEYBINDS_KEY, JSON.stringify(bindings));
  } catch { /* ignore */ }
}

/**
 * Assign a new key to an action. If the key is already used by another action,
 * swap them (the other action gets the old key of this action).
 */
export function assignKey(bindings: KeyBindings, action: RaidAction, newKey: string): KeyBindings {
  const updated = { ...bindings };
  const oldKey = updated[action];

  // Find if another action already uses this key
  for (const a of RAID_ACTIONS) {
    if (a !== action && updated[a] === newKey) {
      // Swap: other action gets our old key
      updated[a] = oldKey;
      break;
    }
  }

  updated[action] = newKey;
  return updated;
}

/**
 * Format a key for display (e.g., " " → "SPACE", "arrowup" → "↑")
 */
export function formatKey(key: string): string {
  switch (key) {
    case " ": return "SPACE";
    case "arrowup": return "↑";
    case "arrowdown": return "↓";
    case "arrowleft": return "←";
    case "arrowright": return "→";
    case "shift": return "SHIFT";
    case "control": return "CTRL";
    case "alt": return "ALT";
    case "tab": return "TAB";
    case "enter": return "ENTER";
    case "escape": return "ESC";
    case "backspace": return "BKSP";
    default: return key.toUpperCase();
  }
}
