// SOLMAR — keyboard and mouse input. Held keys are read every frame;
// one-shot presses are queued and taken once, so a press between two
// frames is never lost and never counted twice. Mouse look uses pointer
// lock on the game canvas; clicking also fires the weapon.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.locked = false;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys.add(event.code);
      this.pressed.add(event.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    // A key released while the tab is hidden never sends keyup: let go on blur.
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (event) => {
      if (!this.locked) return;
      this.mouseDX += event.movementX;
      this.mouseDY += event.movementY;
    });
    canvas.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      if (!this.locked) {
        canvas.requestPointerLock();
        return;
      }
      this.mouseDown = true;
      this.mouseClicked = true;
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouseDown = false;
    });
  }

  held(code) {
    return this.keys.has(code);
  }

  /** True once for a key pressed since the last frame; consumed on read. */
  wasPressed(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  /** -1..1 forward/back from W/S or Up/Down. */
  moveY() {
    const f = (this.held('KeyW') || this.held('ArrowUp') ? 1 : 0);
    const b = (this.held('KeyS') || this.held('ArrowDown') ? 1 : 0);
    return f - b;
  }

  /** -1..1 left/right strafe (on foot) or steering (in a car). */
  moveX() {
    const r = (this.held('KeyD') || this.held('ArrowRight') ? 1 : 0);
    const l = (this.held('KeyA') || this.held('ArrowLeft') ? 1 : 0);
    return r - l;
  }

  get sprint() {
    return this.held('ShiftLeft') || this.held('ShiftRight');
  }

  /** Mouse look accumulated since the last frame, in pixels; consumed on read. */
  takeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  /** True once for a mouse click since the last frame; consumed on read. */
  takeClick() {
    const clicked = this.mouseClicked;
    this.mouseClicked = false;
    return clicked;
  }

  /** Clear the one-shot queues (used when switching screens). */
  flush() {
    this.pressed.clear();
    this.mouseClicked = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
