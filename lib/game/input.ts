import { KeyBindings, loadKeybinds } from "./keybinds";

export class Input {
  keys = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  // virtual joystick / button state (set by mobile UI components)
  virtualDirX = 0;
  virtualDirY = 0;
  virtualAttack = false;
  virtualInteract = false;
  virtualSkills: boolean[] = [false, false, false];
  // virtual aim (from attack joystick drag)
  virtualAimX = 0;
  virtualAimY = 0;
  virtualAimActive = false;
  // per-skill aim (MLBB-style drag to aim, release to cast)
  virtualSkillAim: { active: boolean; aimX: number; aimY: number; cast: boolean; cancelled: boolean }[] = [
    { active: false, aimX: 0, aimY: 0, cast: false, cancelled: false },
    { active: false, aimX: 0, aimY: 0, cast: false, cancelled: false },
    { active: false, aimX: 0, aimY: 0, cast: false, cancelled: false },
  ];

  private el: HTMLElement;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private bindings: KeyBindings;

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
      e.preventDefault();
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };
  private onMouseMove = (e: MouseEvent) => {
    const r = this.el.getBoundingClientRect();
    this.mouseX = (e.clientX - r.left) / this.scale;
    this.mouseY = (e.clientY - r.top) / this.scale;
  };
  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false;
  };

  constructor(el: HTMLElement, bindings?: KeyBindings) {
    this.el = el;
    this.bindings = bindings || loadKeybinds();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    el.addEventListener("mousemove", this.onMouseMove);
    el.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
  }

  setBindings(bindings: KeyBindings) {
    this.bindings = bindings;
  }

  getBindings(): KeyBindings {
    return this.bindings;
  }

  getScale(): number {
    return this.scale;
  }

  setScale(scale: number) {
    this.scale = scale;
  }

  pressed(...keys: string[]): boolean {
    return keys.some((k) => this.keys.has(k));
  }

  getMoveDir(): { x: number; y: number } {
    let mx = 0, my = 0;
    if (this.keys.has(this.bindings.moveLeft) || this.pressed("arrowleft")) mx -= 1;
    if (this.keys.has(this.bindings.moveRight) || this.pressed("arrowright")) mx += 1;
    if (this.keys.has(this.bindings.moveUp) || this.pressed("arrowup")) my -= 1;
    if (this.keys.has(this.bindings.moveDown) || this.pressed("arrowdown")) my += 1;
    if (mx === 0 && my === 0 && (this.virtualDirX !== 0 || this.virtualDirY !== 0)) {
      return { x: this.virtualDirX, y: this.virtualDirY };
    }
    return { x: mx, y: my };
  }

  isAttackDown(): boolean {
    return this.mouseDown || this.keys.has(this.bindings.attack) || this.virtualAttack;
  }

  isSkillDown(index: number): boolean {
    const key = index === 0 ? this.bindings.skill1 : index === 1 ? this.bindings.skill2 : this.bindings.skill3;
    return this.keys.has(key);
  }

  isQuickSlotDown(index: number): boolean {
    const key = index === 0 ? this.bindings.quickSlot1 : index === 1 ? this.bindings.quickSlot2 : index === 2 ? this.bindings.quickSlot3 : this.bindings.quickSlot4;
    return this.keys.has(key);
  }

  consumeSkill(index: number): boolean {
    if (this.virtualSkills[index]) {
      this.virtualSkills[index] = false;
      return true;
    }
    // MLBB-style: skill was aimed and released (cast)
    if (this.virtualSkillAim[index]?.cast) {
      this.virtualSkillAim[index].cast = false;
      return true;
    }
    return false;
  }

  consumeSkillAim(index: number): { aimX: number; aimY: number } | null {
    const sa = this.virtualSkillAim[index];
    if (!sa) return null;
    const len = Math.hypot(sa.aimX, sa.aimY);
    if (len > 0.1) {
      return { aimX: sa.aimX / len, aimY: sa.aimY / len };
    }
    return null;
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.el.removeEventListener("mousemove", this.onMouseMove);
    this.el.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
  }
}
