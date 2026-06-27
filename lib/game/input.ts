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
  private el: HTMLElement;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

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

  constructor(el: HTMLElement) {
    this.el = el;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    el.addEventListener("mousemove", this.onMouseMove);
    el.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
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
    if (this.pressed("a", "arrowleft")) mx -= 1;
    if (this.pressed("d", "arrowright")) mx += 1;
    if (this.pressed("w", "arrowup")) my -= 1;
    if (this.pressed("s", "arrowdown")) my += 1;
    if (mx === 0 && my === 0 && (this.virtualDirX !== 0 || this.virtualDirY !== 0)) {
      return { x: this.virtualDirX, y: this.virtualDirY };
    }
    return { x: mx, y: my };
  }

  isAttackDown(): boolean {
    return this.mouseDown || this.pressed(" ") || this.virtualAttack;
  }

  consumeSkill(index: number): boolean {
    if (this.virtualSkills[index]) {
      this.virtualSkills[index] = false;
      return true;
    }
    return false;
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.el.removeEventListener("mousemove", this.onMouseMove);
    this.el.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
  }
}
