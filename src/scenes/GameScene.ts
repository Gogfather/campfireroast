import Phaser from "phaser";

const MAX_HEAT = 100;
const HEAT_DECAY_PER_SEC = 4;
const STOKE_HEAT_ADD = 22;
const STOKE_COOLDOWN_MS = 900;

const BASE_COOK_RATE = 5.5; // doneness per second at full heat, distance = 0
const MIN_COOK_HEAT_FLOOR = 0.15; // marshmallow still cooks a little even at low heat

const CLOSE_THRESHOLD = 0.4; // distance below this risks scorching
const SCORCH_RATE_MULTIPLIER = 55;
const SCORCH_SAFE_DECAY_PER_SEC = 30;
const BLOW_SCORCH_REDUCTION_PER_SEC = 85;
const ON_FIRE_DONENESS_RATE = 34; // doneness/sec while actively on fire

const ROTATE_WINDOW_MS = 1800;
const EVENNESS_DECAY_PER_SEC = 14; // only applied once the rotate window has expired
const ROTATE_RESTORE_AMOUNT = 18;

const FIRE_CENTER_Y = 235;
const PIT_RADIUS_X = 80;
const PIT_RADIUS_Y = 34;

const INK = 0x1a120d;
const INK_WIDTH = 3;

const FLAME_SIZES = ["xs", "s", "m", "l", "xl"] as const;
type FlameSize = (typeof FLAME_SIZES)[number];
const FLAME_FRAME_COUNT = 12;
const FLAME_SOURCE_SIZE = 260; // native SVG canvas size (square)
const FLAME_ANCHOR_X = 130 / FLAME_SOURCE_SIZE; // fraction: flame base center
const FLAME_ANCHOR_Y = 183 / FLAME_SOURCE_SIZE; // fraction: flame base sits here across all frames/sizes
const FLAME_DISPLAY_SCALE = 0.6;

function flameSizeForHeat(heatFrac: number): FlameSize {
  const index = Math.min(FLAME_SIZES.length - 1, Math.floor(heatFrac * FLAME_SIZES.length));
  return FLAME_SIZES[index];
}

type Band = { name: string; max: number; color: number; scoreLabel: string };

const DONENESS_BANDS: Band[] = [
  { name: "Raw", max: 20, color: 0xf3e9d2, scoreLabel: "Raw" },
  { name: "Warm", max: 45, color: 0xe9c98a, scoreLabel: "Undercooked" },
  { name: "Toasted", max: 75, color: 0xc98a4b, scoreLabel: "Perfect!" },
  { name: "Well done", max: 95, color: 0x8a5324, scoreLabel: "Well done" },
  { name: "Charred", max: 100, color: 0x3a2416, scoreLabel: "Overcooked" },
];

function bandFor(doneness: number): Band {
  return DONENESS_BANDS.find((b) => doneness <= b.max) ?? DONENESS_BANDS[DONENESS_BANDS.length - 1];
}

export class GameScene extends Phaser.Scene {
  private heat!: number;
  private lastStokeAt!: number;

  private distance!: number; // 0 = in the fire, 1 = far away
  private doneness!: number;
  private evenness!: number;
  private lastRotateAt!: number;

  private scorch!: number;
  private onFire!: boolean;
  private isBlowing!: boolean;

  private gameOver!: boolean;

  // display objects, assigned in create()
  private flameSprite!: Phaser.GameObjects.Sprite;
  private currentFlameSize!: FlameSize;
  private marshmallowGfx!: Phaser.GameObjects.Ellipse;
  private fireWarningText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private playAgainButton!: Phaser.GameObjects.Rectangle;
  private playAgainText!: Phaser.GameObjects.Text;

  private heatBarFill!: Phaser.GameObjects.Rectangle;
  private donenessBarFill!: Phaser.GameObjects.Rectangle;
  private evennessBarFill!: Phaser.GameObjects.Rectangle;

  private sliderHandle!: Phaser.GameObjects.Ellipse;
  private sliderTrackY = 0;
  private sliderTrackHeight = 0;

  constructor() {
    super("GameScene");
  }

  preload(): void {
    for (const size of FLAME_SIZES) {
      for (let i = 1; i <= FLAME_FRAME_COUNT; i++) {
        const frame = String(i).padStart(2, "0");
        this.load.svg(this.flameFrameKey(size, i), `/flame/${size}/frame_${frame}.svg`, {
          width: FLAME_SOURCE_SIZE,
          height: FLAME_SOURCE_SIZE,
        });
      }
    }
  }

  private flameFrameKey(size: FlameSize, frame: number): string {
    return `flame-${size}-${frame}`;
  }

  private resetState(): void {
    this.heat = 30;
    this.lastStokeAt = -Infinity;
    this.distance = 0.7;
    this.doneness = 0;
    this.evenness = 100;
    this.lastRotateAt = this.time.now;
    this.scorch = 0;
    this.onFire = false;
    this.isBlowing = false;
    this.gameOver = false;
  }

  create(): void {
    this.resetState();
    const { width } = this.scale;

    this.add
      .text(width / 2, 40, "Campfire Roast — Proof of Concept", {
        fontFamily: "sans-serif",
        fontSize: "18px",
        color: "#f3e9d2",
      })
      .setOrigin(0.5);

    // --- Fire pit ---
    this.createFirePit(width / 2, FIRE_CENTER_Y);

    // --- Marshmallow (position moves along a line above the fire based on distance) ---
    this.marshmallowGfx = this.add.ellipse(width / 2, 160, 34, 26, 0xf3e9d2);
    this.marshmallowGfx.setStrokeStyle(INK_WIDTH, INK, 1);

    this.fireWarningText = this.add
      .text(width / 2, 220, "🔥 ON FIRE — BLOW! 🔥", {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: "#ff4d4d",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setVisible(false);

    // --- Meters ---
    this.buildMeter(width / 2, 330, "Fire heat", 0xff7a1a, (fill) => (this.heatBarFill = fill));
    this.buildMeter(width / 2, 380, "Doneness", 0xc98a4b, (fill) => (this.donenessBarFill = fill));
    this.buildMeter(width / 2, 430, "Evenness", 0x6fb2e0, (fill) => (this.evennessBarFill = fill));

    // --- Distance slider ---
    this.add
      .text(width / 2, 480, "Drag to move marshmallow closer / farther", {
        fontFamily: "sans-serif",
        fontSize: "12px",
        color: "#aaa",
      })
      .setOrigin(0.5);

    this.sliderTrackY = 505;
    this.sliderTrackHeight = 140;
    this.add
      .rectangle(width / 2, this.sliderTrackY + this.sliderTrackHeight / 2, 10, this.sliderTrackHeight, 0x333333)
      .setOrigin(0.5);
    this.add
      .text(width / 2, this.sliderTrackY - 14, "🔥 near", { fontFamily: "sans-serif", fontSize: "11px", color: "#ff7a1a" })
      .setOrigin(0.5);
    this.add
      .text(width / 2, this.sliderTrackY + this.sliderTrackHeight + 14, "far", {
        fontFamily: "sans-serif",
        fontSize: "11px",
        color: "#888",
      })
      .setOrigin(0.5);

    this.sliderHandle = this.add
      .ellipse(width / 2, this.sliderTrackY, 30, 30, 0xf3e9d2)
      .setStrokeStyle(2, 0x000000)
      .setInteractive({ draggable: true, useHandCursor: true });
    this.updateSliderHandlePosition();

    this.input.setDraggable(this.sliderHandle);
    this.sliderHandle.on("drag", (_pointer: Phaser.Input.Pointer, _x: number, y: number) => {
      const clampedY = Phaser.Math.Clamp(y, this.sliderTrackY, this.sliderTrackY + this.sliderTrackHeight);
      this.sliderHandle.y = clampedY;
      this.distance = (clampedY - this.sliderTrackY) / this.sliderTrackHeight;
    });

    // --- Buttons ---
    const buttonY = 700;
    this.makeButton(width / 2 - 165, buttonY, "🔥 Stoke", () => this.stoke());
    this.makeButton(width / 2 - 55, buttonY, "↻ Rotate", () => this.rotate());
    const blowBtn = this.makeButton(width / 2 + 55, buttonY, "💨 Blow", () => {});
    blowBtn.on("pointerdown", () => (this.isBlowing = true));
    blowBtn.on("pointerup", () => (this.isBlowing = false));
    blowBtn.on("pointerout", () => (this.isBlowing = false));
    this.makeButton(width / 2 + 165, buttonY, "🍡 Serve", () => this.serve());

    this.resultText = this.add
      .text(width / 2, 750, "", {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: "#fff",
        align: "center",
      })
      .setOrigin(0.5);

    this.playAgainButton = this.add
      .rectangle(width / 2, 785, 150, 34, 0x2f2733)
      .setStrokeStyle(2, 0x554466)
      .setVisible(false);
    this.playAgainText = this.add
      .text(width / 2, 785, "Tap to play again", {
        fontFamily: "sans-serif",
        fontSize: "13px",
        color: "#f3e9d2",
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.playAgainButton.on("pointerdown", () => this.scene.restart());
  }

  private createFirePit(centerX: number, centerY: number): void {
    // Dirt floor inside the stone ring, grounds the whole scene.
    this.add
      .ellipse(centerX, centerY, PIT_RADIUS_X * 1.7, PIT_RADIUS_Y * 1.7, 0x4a3a2f)
      .setStrokeStyle(INK_WIDTH, INK, 1);

    // Stone ring, block-shaded: flat base color + a lighter highlight facet, both hard-outlined.
    const stoneCount = 16;
    const stonePalette = [
      { base: 0x9c9485, highlight: 0xc7bdac },
      { base: 0x8a8378, highlight: 0xb5ac9c },
      { base: 0x7d7568, highlight: 0xa89f8e },
      { base: 0xaba290, highlight: 0xd4c9b0 },
    ];
    for (let i = 0; i < stoneCount; i++) {
      const angle = (i / stoneCount) * Math.PI * 2;
      const jitter = Phaser.Math.FloatBetween(-4, 4);
      const sx = centerX + Math.cos(angle) * (PIT_RADIUS_X + jitter);
      const sy = centerY + Math.sin(angle) * (PIT_RADIUS_Y + jitter * 0.4);
      const size = Phaser.Math.Between(11, 16);
      const { base, highlight } = Phaser.Utils.Array.GetRandom(stonePalette);
      this.add.ellipse(sx, sy, size, size * 0.8, base).setStrokeStyle(INK_WIDTH, INK, 1);
      this.add
        .ellipse(sx - size * 0.18, sy - size * 0.16, size * 0.42, size * 0.32, highlight)
        .setStrokeStyle(2, INK, 1);
    }

    // Randomly placed logs, drawn like cut firewood: flat body + a lighter cut-end cap with growth rings.
    const logCount = Phaser.Math.Between(5, 7);
    const logBodies = [0x6b4423, 0x5a3820, 0x7a5230, 0x4f3018];
    for (let i = 0; i < logCount; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const radiusFrac = Phaser.Math.FloatBetween(0, 0.7);
      const lx = centerX + Math.cos(angle) * PIT_RADIUS_X * 0.55 * radiusFrac;
      const ly = centerY + Math.sin(angle) * PIT_RADIUS_Y * 0.55 * radiusFrac;
      const length = Phaser.Math.Between(46, 72);
      const rot = Phaser.Math.FloatBetween(-1, 1);
      const logColor = Phaser.Utils.Array.GetRandom(logBodies);
      this.add.rectangle(lx, ly, length, 13, logColor).setStrokeStyle(INK_WIDTH, INK, 1).setRotation(rot);

      const capX = lx + Math.cos(rot) * (length / 2 - 2);
      const capY = ly + Math.sin(rot) * (length / 2 - 2);
      this.add.circle(capX, capY, 7, 0xe8c895).setStrokeStyle(2.5, INK, 1);
      this.add.circle(capX, capY, 3.5, 0xc9a06a).setStrokeStyle(1.5, INK, 1);
    }

    // Animated flame, drawn from hand-authored SVG frames. Size tier swaps with heat.
    this.ensureFlameAnimations();
    this.currentFlameSize = "s";
    this.flameSprite = this.add.sprite(centerX, centerY - 5, this.flameFrameKey(this.currentFlameSize, 1));
    this.flameSprite.setOrigin(FLAME_ANCHOR_X, FLAME_ANCHOR_Y);
    this.flameSprite.setScale(FLAME_DISPLAY_SCALE);
    this.flameSprite.play(this.flameAnimKey(this.currentFlameSize));
  }

  private flameAnimKey(size: FlameSize): string {
    return `flame-anim-${size}`;
  }

  private ensureFlameAnimations(): void {
    for (const size of FLAME_SIZES) {
      const key = this.flameAnimKey(size);
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: Array.from({ length: FLAME_FRAME_COUNT }, (_, i) => ({
          key: this.flameFrameKey(size, i + 1),
        })),
        frameRate: 12,
        repeat: -1,
      });
    }
  }

  private buildMeter(
    x: number,
    y: number,
    label: string,
    color: number,
    assign: (fill: Phaser.GameObjects.Rectangle) => void
  ): void {
    const width = 300;
    this.add.text(x - width / 2, y - 20, label, { fontFamily: "sans-serif", fontSize: "12px", color: "#ccc" });
    this.add.rectangle(x, y, width, 14, 0x2a2a2a).setOrigin(0.5).setStrokeStyle(1, 0x555555);
    const fill = this.add.rectangle(x - width / 2, y, 1, 14, color).setOrigin(0, 0.5);
    assign(fill);
  }

  private setMeter(fill: Phaser.GameObjects.Rectangle, pct: number): void {
    fill.width = Math.max(1, 300 * Phaser.Math.Clamp(pct, 0, 1));
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Rectangle {
    const rect = this.add
      .rectangle(x, y, 90, 60, 0x2f2733)
      .setStrokeStyle(2, 0x554466)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(x, y, label, { fontFamily: "sans-serif", fontSize: "13px", color: "#f3e9d2", align: "center" })
      .setOrigin(0.5);
    rect.on("pointerdown", () => {
      if (!this.gameOver) onClick();
    });
    return rect;
  }

  private updateSliderHandlePosition(): void {
    this.sliderHandle.y = this.sliderTrackY + this.distance * this.sliderTrackHeight;
  }

  private stoke(): void {
    const now = this.time.now;
    if (now - this.lastStokeAt < STOKE_COOLDOWN_MS) return;
    this.lastStokeAt = now;
    this.heat = Phaser.Math.Clamp(this.heat + STOKE_HEAT_ADD, 0, MAX_HEAT);
  }

  private rotate(): void {
    this.lastRotateAt = this.time.now;
    this.evenness = Phaser.Math.Clamp(this.evenness + ROTATE_RESTORE_AMOUNT, 0, 100);
  }

  private serve(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    const band = bandFor(this.doneness);
    const evenPenalty = this.evenness < 50;
    const label = evenPenalty && band.scoreLabel === "Perfect!" ? "Perfect, but unevenly toasted" : band.scoreLabel;
    this.resultText.setText(`${label}\nDoneness: ${this.doneness.toFixed(0)} | Evenness: ${this.evenness.toFixed(0)}`);
    this.showPlayAgain();
  }

  private burn(): void {
    this.gameOver = true;
    this.resultText.setText("Burnt to a crisp! 🖤");
    this.showPlayAgain();
  }

  private showPlayAgain(): void {
    this.playAgainButton.setVisible(true).setInteractive({ useHandCursor: true });
    this.playAgainText.setVisible(true);
  }

  update(_time: number, deltaMs: number): void {
    if (this.gameOver) return;
    const dt = deltaMs / 1000;

    // Fire heat decays over time, needs periodic stoking.
    this.heat = Phaser.Math.Clamp(this.heat - HEAT_DECAY_PER_SEC * dt, 0, MAX_HEAT);

    // Cooking: closer + hotter = faster doneness gain.
    const proximity = 1 - this.distance;
    const heatFactor = Math.max(MIN_COOK_HEAT_FLOOR, this.heat / MAX_HEAT);
    if (!this.onFire) {
      this.doneness = Phaser.Math.Clamp(this.doneness + BASE_COOK_RATE * heatFactor * proximity * dt, 0, 100);
    }

    // Evenness decays if the marshmallow hasn't been rotated recently while it's cooking.
    const sinceRotate = this.time.now - this.lastRotateAt;
    if (proximity > 0.2 && sinceRotate > ROTATE_WINDOW_MS) {
      this.evenness = Phaser.Math.Clamp(this.evenness - EVENNESS_DECAY_PER_SEC * dt, 0, 100);
    }

    // Scorch risk when too close to a hot fire.
    if (this.distance < CLOSE_THRESHOLD) {
      const closeness = CLOSE_THRESHOLD - this.distance;
      this.scorch = Phaser.Math.Clamp(
        this.scorch + closeness * (this.heat / MAX_HEAT) * SCORCH_RATE_MULTIPLIER * dt,
        0,
        100
      );
    } else {
      this.scorch = Phaser.Math.Clamp(this.scorch - SCORCH_SAFE_DECAY_PER_SEC * dt, 0, 100);
    }

    if (!this.onFire && this.scorch >= 100) {
      this.onFire = true;
    }

    if (this.onFire) {
      this.doneness = Phaser.Math.Clamp(this.doneness + ON_FIRE_DONENESS_RATE * dt, 0, 100);
      const reduction = this.isBlowing ? BLOW_SCORCH_REDUCTION_PER_SEC : -SCORCH_RATE_MULTIPLIER * 0.3;
      this.scorch = Phaser.Math.Clamp(this.scorch - reduction * dt, 0, 100);
      if (this.scorch <= 0) {
        this.onFire = false;
      }
      if (this.doneness >= 100) {
        this.burn();
        return;
      }
    }

    this.render();
  }

  private render(): void {
    // Fire visual intensity scales with heat: swap to a taller/shorter flame size tier.
    const heatFrac = this.heat / MAX_HEAT;
    const targetSize = flameSizeForHeat(heatFrac);
    if (targetSize !== this.currentFlameSize) {
      this.currentFlameSize = targetSize;
      this.flameSprite.play(this.flameAnimKey(targetSize));
    }

    // Marshmallow moves within a fixed zone above the fire, clear of the meters/slider below.
    const nearFireY = FIRE_CENTER_Y - PIT_RADIUS_Y - 20;
    const farAwayY = 95;
    this.marshmallowGfx.y = Phaser.Math.Linear(nearFireY, farAwayY, this.distance);
    this.marshmallowGfx.fillColor = bandFor(this.doneness).color;
    this.marshmallowGfx.setVisible(!this.onFire || Math.floor(this.time.now / 120) % 2 === 0);

    this.fireWarningText.setVisible(this.onFire);
    this.fireWarningText.y = this.marshmallowGfx.y;

    this.setMeter(this.heatBarFill, this.heat / MAX_HEAT);
    this.setMeter(this.donenessBarFill, this.doneness / 100);
    this.setMeter(this.evennessBarFill, this.evenness / 100);

    this.updateSliderHandlePosition();
  }
}
