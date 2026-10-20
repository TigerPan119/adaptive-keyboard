const TRAIL_SPEED = 185;
const GROW_IN_DURATION = 0.11;
const RETRIGGER_GAP = 5;
const FALL_TRAVEL_SECONDS = 3.2;
const ROLL_TRAVEL_SECONDS = 4.8;
const ROLL_RENDER_OVERSCAN = 48;
const ROLL_PRESS_DURATION = 0.09;
const ROLL_RELEASE_DURATION = 0.24;
const FALL_INDEX_BUCKET_SECONDS = 1;
const TRAIL_OVERSCAN = 20;

const GRADIENT_PALETTES = {
  aurora: {
    stops: [[0, [100, 210, 255]], [0.5, [64, 156, 255]], [1, [175, 145, 255]]],
    edge: [188, 230, 255],
    glow: [92, 166, 255],
  },
  spectrum: {
    stops: [[0, [90, 200, 250]], [0.46, [94, 92, 230]], [0.76, [175, 82, 222]], [1, [255, 95, 135]]],
    edge: [164, 214, 255],
    glow: [142, 108, 238],
  },
  solar: {
    stops: [[0, [255, 105, 120]], [0.52, [255, 159, 72]], [1, [255, 214, 112]]],
    edge: [255, 184, 168],
    glow: [255, 142, 82],
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(value) {
  return 1 - (1 - value) ** 3;
}

function easeOutBack(value) {
  const overshoot = 1.70158;
  const shifted = value - 1;
  return 1 + (overshoot + 1) * shifted ** 3 + overshoot * shifted ** 2;
}

function hexToRgb(value) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value || "");
  return match ? match.slice(1).map((channel) => Number.parseInt(channel, 16)) : [255, 213, 46];
}

export function normalizePlaybackVisualization(mode) {
  return ["fall", "roll"].includes(mode) ? mode : "rise";
}

export function isSequencedPlaybackVisualization(mode) {
  return ["fall", "roll"].includes(mode);
}

export function fallLookaheadSeconds(speedMultiplier = 1, playbackSpeed = 1) {
  const travelSeconds = clamp(FALL_TRAVEL_SECONDS / Math.max(0.01, speedMultiplier), 1.6, 6.4);
  return travelSeconds * Math.max(0.25, playbackSpeed);
}

export function fallingNoteBounds(noteEvent, position, playbackSpeed, travelSeconds, keyboardTop, travelHeight) {
  const speed = Math.max(0.25, playbackSpeed);
  const startY = keyboardTop - ((noteEvent.start - position) / speed / travelSeconds) * travelHeight;
  const endY = keyboardTop - ((noteEvent.end - position) / speed / travelSeconds) * travelHeight;
  return { top: Math.min(startY, endY), bottom: Math.max(startY, endY) };
}

export function horizontalRollNoteBounds(noteEvent, position, playbackSpeed, travelSeconds, playheadX, travelWidth) {
  const speed = Math.max(0.25, playbackSpeed);
  const pixelsPerSecond = travelWidth / travelSeconds;
  return {
    left: playheadX + ((noteEvent.start - position) / speed) * pixelsPerSecond,
    right: playheadX + ((noteEvent.end - position) / speed) * pixelsPerSecond,
    active: noteEvent.start <= position && position < noteEvent.end,
  };
}

export function horizontalRollTimeWindow(position, playbackSpeed, pixelsPerSecond, playheadX, width, overscan = ROLL_RENDER_OVERSCAN) {
  const timelinePerPixel = Math.max(0.25, playbackSpeed) / Math.max(1, pixelsPerSecond);
  return {
    start: position - (playheadX + overscan) * timelinePerPixel,
    end: position + (width - playheadX + overscan) * timelinePerPixel,
  };
}

export function horizontalRollExitPosition(lastNoteEnd, playbackSpeed, pixelsPerSecond, playheadX, overscan = ROLL_RENDER_OVERSCAN) {
  const timelinePerPixel = Math.max(0.25, playbackSpeed) / Math.max(1, pixelsPerSecond);
  return Math.max(0, Number(lastNoteEnd) || 0) + (Math.max(0, playheadX) + overscan) * timelinePerPixel;
}

export function rollPressOffset(pressState, now, enabled, depth) {
  if (!enabled || !pressState) return 0;
  const pressedFor = Math.max(0, (pressState.releasedAt ?? now) - pressState.pressedAt);
  const pressedDepth = depth * easeOutCubic(clamp(pressedFor / ROLL_PRESS_DURATION, 0, 1));
  if (pressState.releasedAt === null) return pressedDepth;
  const releaseProgress = clamp((now - pressState.releasedAt) / ROLL_RELEASE_DURATION, 0, 1);
  return pressedDepth * (1 - easeOutBack(releaseProgress));
}

export function liveTrailBounds(keyboardTop, offset, length, overscan = TRAIL_OVERSCAN) {
  const bottom = keyboardTop - 2 - offset;
  const top = bottom - Math.max(length, 6);
  const drawTop = Math.max(-overscan, top);
  return {
    top,
    bottom,
    drawTop,
    drawHeight: Math.max(0, bottom - drawTop),
    expired: bottom < -overscan,
  };
}

export function snowParticleTargetCount(intensity, crossSection, travelDistance) {
  const density = clamp(Number(intensity) || 0, 0, 1);
  if (!density) return 0;
  const spawnRate = density * (4 + Math.max(5, Math.max(1, crossSection) / 80));
  const averageSpeed = 28.5 + density * 9;
  return Math.min(320, Math.max(1, Math.round(spawnRate * Math.max(80, travelDistance) / averageSpeed)));
}

export function createFallingNoteIndex(notes, bucketSeconds = FALL_INDEX_BUCKET_SECONDS) {
  const sortedNotes = [...(notes || [])].sort((first, second) => first.start - second.start || first.note - second.note);
  const buckets = new Map();
  sortedNotes.forEach((note, index) => {
    const firstBucket = Math.floor(note.start / bucketSeconds);
    const lastBucket = Math.floor(note.end / bucketSeconds);
    for (let bucket = firstBucket; bucket <= lastBucket; bucket += 1) {
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket).push(index);
    }
  });
  return { notes: sortedNotes, buckets, bucketSeconds };
}

export function fallingNotesInWindow(index, start, end) {
  if (!index?.notes?.length) return [];
  const firstBucket = Math.floor(start / index.bucketSeconds);
  const lastBucket = Math.floor(end / index.bucketSeconds);
  const noteIndexes = new Set();
  for (let bucket = firstBucket; bucket <= lastBucket; bucket += 1) {
    for (const noteIndex of index.buckets.get(bucket) || []) noteIndexes.add(noteIndex);
  }
  return [...noteIndexes]
    .sort((first, second) => first - second)
    .map((noteIndex) => index.notes[noteIndex])
    .filter((note) => note.end >= start && note.start <= end);
}

export class NoteTrailVisualizer {
  constructor(canvas, keyboard, options = {}) {
    this.canvas = canvas;
    this.keyboard = keyboard;
    this.context = canvas.getContext("2d", { alpha: true });
    this.enabled = options.enabled ?? true;
    this.reducedMotion = options.reducedMotion ?? false;
    this.palette = options.palette || "classic";
    this.customColor = options.customColor || "#ffd52e";
    this.smartPalette = options.smartPalette || GRADIENT_PALETTES.aurora;
    this.particleIntensity = clamp(options.particleIntensity ?? 0.45, 0, 1);
    this.upwardSnowIntensity = this.reducedMotion ? 0 : clamp(options.upwardSnowIntensity ?? 0, 0, 1);
    this.glowIntensity = clamp(options.glowIntensity ?? 0.35, 0, 1);
    this.speedMultiplier = clamp(options.speedMultiplier ?? 1, 0.5, 2);
    this.squareCorners = options.squareCorners ?? false;
    this.playbackVisualization = "rise";
    this.rollPressMotionEnabled = options.rollPressMotionEnabled ?? true;
    this.rollPressStates = new Map();
    this.fallingNotes = [];
    this.fallingNoteEnd = 0;
    this.fallingNoteIndex = createFallingNoteIndex([]);
    this.fallingPitchRange = { min: 48, max: 84 };
    this.playbackActive = false;
    this.playbackPlaying = false;
    this.playbackPosition = 0;
    this.playbackUpdatedAt = 0;
    this.playbackSpeed = 1;
    this.playbackTranspose = 0;
    this.trails = new Map();
    this.burstParticles = [];
    this.snowParticles = [];
    this.snowSpawnClock = 0;
    this.activeTrails = new Map();
    this.nextTrailId = 1;
    this.keyMetrics = new Map();
    this.root = null;
    this.bass = null;
    this.frameId = 0;
    this.lastTime = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resizeObserver.observe(keyboard);
    this.resize();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.trails.clear();
      this.activeTrails.clear();
      this.burstParticles = [];
      this.snowParticles = [];
      this.rollPressStates.clear();
      this.stop();
      this.clear();
    } else if (this.upwardSnowIntensity > 0 || this.playbackActive) {
      this.rebuildSnowField();
      this.start();
    }
  }

  setHarmony(root, bass) {
    this.root = Number.isFinite(root) ? root : null;
    this.bass = Number.isFinite(bass) ? bass : null;
  }

  setEffects(options = {}) {
    if (options.palette) this.palette = [...Object.keys(GRADIENT_PALETTES), "classic", "custom", "smart"].includes(options.palette) ? options.palette : "classic";
    if (options.customColor) this.customColor = options.customColor;
    if (options.smartPalette) this.smartPalette = options.smartPalette;
    if (options.particleIntensity !== undefined) {
      this.particleIntensity = clamp(Number(options.particleIntensity) || 0, 0, 1);
      if (!this.particleIntensity) {
        this.burstParticles = [];
        for (const trail of this.trails.values()) trail.particles = [];
      }
    }
    if (options.upwardSnowIntensity !== undefined) {
      const previousIntensity = this.upwardSnowIntensity;
      this.upwardSnowIntensity = this.reducedMotion
        ? 0
        : clamp(Number(options.upwardSnowIntensity) || 0, 0, 1);
      if (!this.upwardSnowIntensity) {
        this.snowParticles = [];
        this.snowSpawnClock = 0;
      } else if (this.upwardSnowIntensity !== previousIntensity) {
        this.reconcileSnowField();
      }
    }
    if (options.glowIntensity !== undefined) this.glowIntensity = clamp(Number(options.glowIntensity) || 0, 0, 1);
    if (options.speedMultiplier !== undefined) this.speedMultiplier = clamp(Number(options.speedMultiplier) || 1, 0.5, 2);
    if (options.squareCorners !== undefined) this.squareCorners = Boolean(options.squareCorners);
    if (this.trails.size || this.burstParticles.length || this.upwardSnowIntensity > 0 || this.playbackActive) this.start();
  }

  setPlaybackVisualization(mode) {
    const nextMode = normalizePlaybackVisualization(mode);
    if (this.playbackVisualization === nextMode) return;
    this.playbackVisualization = nextMode;
    this.rebuildSnowField();
    this.start();
  }

  setRollPressMotionEnabled(enabled) {
    this.rollPressMotionEnabled = Boolean(enabled);
    if (!this.rollPressMotionEnabled) this.rollPressStates.clear();
    this.start();
  }

  rollNoteOn(source) {
    if (!source) return;
    if (this.rollPressMotionEnabled && !this.reducedMotion) {
      this.rollPressStates.set(source, {
        pressedAt: performance.now() / 1000,
        releasedAt: null,
      });
    }
    this.start();
  }

  rollNoteOff(source) {
    if (!this.rollPressMotionEnabled || this.reducedMotion || !source) return;
    const now = performance.now() / 1000;
    const pressState = this.rollPressStates.get(source);
    if (pressState) pressState.releasedAt = now;
    else this.rollPressStates.set(source, { pressedAt: now - ROLL_PRESS_DURATION, releasedAt: now });
    this.start();
  }

  setFallingNotes(notes) {
    this.fallingNoteIndex = createFallingNoteIndex(notes);
    this.fallingNotes = this.fallingNoteIndex.notes;
    this.fallingNoteEnd = this.fallingNotes.reduce((latest, note) => Math.max(latest, note.end), 0);
    if (this.fallingNotes.length) {
      let min = 127;
      let max = 0;
      for (const noteEvent of this.fallingNotes) {
        min = Math.min(min, noteEvent.note);
        max = Math.max(max, noteEvent.note);
      }
      min = Math.max(0, min - 2);
      max = Math.min(127, max + 2);
      const missingRange = Math.max(0, 14 - (max - min));
      min = Math.max(0, min - Math.ceil(missingRange / 2));
      max = Math.min(127, max + Math.floor(missingRange / 2));
      this.fallingPitchRange = { min, max };
    } else {
      this.fallingPitchRange = { min: 48, max: 84 };
    }
    this.start();
  }

  resetMotion() {
    this.trails.clear();
    this.activeTrails.clear();
    this.burstParticles = [];
    this.snowParticles = [];
    this.snowSpawnClock = 0;
    this.rollPressStates.clear();
    this.clear();
    this.reconcileSnowField();
    this.start();
  }

  setPlaybackState(options = {}) {
    const previousSnowDirection = this.snowDirection();
    if (options.active !== undefined) this.playbackActive = Boolean(options.active);
    if (options.playing !== undefined) this.playbackPlaying = Boolean(options.playing);
    if (options.position !== undefined) this.playbackPosition = Math.max(0, Number(options.position) || 0);
    if (options.speed !== undefined) this.playbackSpeed = clamp(Number(options.speed) || 1, 0.25, 2);
    if (options.transpose !== undefined) this.playbackTranspose = clamp(Math.round(Number(options.transpose) || 0), -24, 24);
    if (previousSnowDirection !== this.snowDirection()) this.rebuildSnowField();
    this.playbackUpdatedAt = performance.now() / 1000;
    this.start();
  }

  noteImpact(note, velocity = 100) {
    if (!this.enabled) return;
    this.emitKeyBurst(note, velocity);
    this.start();
  }

  noteOn(note, velocity = 100) {
    if (!this.enabled) return;
    const now = performance.now() / 1000;
    const initialLength = 8 + clamp(velocity / 127, 0, 1) * 4;
    const previousId = this.activeTrails.get(note);
    const previous = previousId ? this.trails.get(previousId) : null;
    if (previous && previous.releasedAt === null) {
      previous.releasedAt = now;
      previous.offset += RETRIGGER_GAP;
    }

    const id = this.nextTrailId;
    this.nextTrailId += 1;
    this.trails.set(id, {
      id,
      note,
      velocity,
      startedAt: now,
      releasedAt: null,
      length: initialLength,
      offset: 0,
      particles: [],
      particleClock: 0,
      keyParticleClock: 0,
    });
    this.activeTrails.set(note, id);
    this.emitKeyBurst(note, velocity);
    this.start();
  }

  noteOff(note) {
    const id = this.activeTrails.get(note);
    const trail = id ? this.trails.get(id) : null;
    if (!trail || trail.releasedAt !== null) return;
    trail.releasedAt = performance.now() / 1000;
    this.activeTrails.delete(note);
    this.start();
  }

  allNotesOff() {
    const now = performance.now() / 1000;
    for (const trail of this.trails.values()) {
      if (trail.releasedAt === null) trail.releasedAt = now;
    }
    this.activeTrails.clear();
    this.rollPressStates.clear();
    this.start();
  }

  resize() {
    const displayRect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(displayRect.width));
    const height = Math.max(1, Math.round(displayRect.height));
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const previousWidth = this.width;
    const previousHeight = this.height;
    const previousKeyboardTop = this.keyboardTop;
    this.width = width;
    this.height = height;

    this.keyMetrics.clear();
    this.keyboard.querySelectorAll(".piano-key").forEach((key) => {
      const rect = key.getBoundingClientRect();
      this.keyMetrics.set(Number(key.dataset.note), {
        x: rect.left - displayRect.left + rect.width / 2,
        width: rect.width,
      });
    });
    const keyboardRect = this.keyboard.getBoundingClientRect();
    this.keyboardTop = keyboardRect.top - displayRect.top;
    const geometryChanged = previousWidth !== width
      || previousHeight !== height
      || Math.abs((previousKeyboardTop ?? this.keyboardTop) - this.keyboardTop) > 1;
    if (geometryChanged) this.rebuildSnowField();
    if (this.trails.size || this.playbackActive || this.upwardSnowIntensity > 0) this.start();
  }

  start() {
    if (!this.enabled || this.frameId) return;
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame((time) => this.draw(time));
  }

  stop() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.lastTime = 0;
  }

  clear() {
    this.context.clearRect(0, 0, this.width || 1, this.height || 1);
  }

  paletteFor(note) {
    if (this.palette === "custom") {
      const body = hexToRgb(this.customColor);
      return { stops: [[0, body], [1, body]], edge: body, glow: body };
    }
    if (this.palette === "smart") return this.smartPalette;
    if (this.palette !== "classic") return GRADIENT_PALETTES[this.palette];
    if (note % 12 === this.root) {
      const body = [10, 132, 255];
      return { stops: [[0, body], [1, body]], edge: note === this.bass ? [255, 69, 58] : [100, 185, 255], glow: body };
    }
    if (note === this.bass) {
      const body = [255, 69, 58];
      return { stops: [[0, body], [1, body]], edge: [255, 132, 124], glow: body };
    }
    const body = [255, 213, 46];
    return { stops: [[0, body], [1, body]], edge: [255, 235, 143], glow: body };
  }

  themeColorForNote(note) {
    const normalizedNote = clamp(Number.isFinite(note) ? note : 60, 0, 127);
    const metric = this.keyMetrics.get(normalizedNote);
    const x = metric?.x ?? this.width / 2;
    const y = Number.isFinite(this.keyboardTop) ? this.keyboardTop * 0.5 : this.height * 0.5;
    return this.samplePalette(this.paletteFor(normalizedNote), x, y).color;
  }

  ambientPalette() {
    if (this.palette === "custom") return this.paletteFor(0);
    if (this.palette === "smart") return this.smartPalette;
    if (this.palette !== "classic") return GRADIENT_PALETTES[this.palette];
    const body = [255, 213, 46];
    return { stops: [[0, body], [1, body]], edge: [255, 235, 143], glow: body };
  }

  applyGlow(color, scale = 1) {
    if (!this.glowIntensity) return;
    this.context.shadowBlur = 5 + this.glowIntensity * 36 * scale;
    this.context.shadowColor = `rgba(${color.join(",")},${0.26 + this.glowIntensity * 0.52})`;
  }

  samplePalette(palette, x, y) {
    if (this.palette === "classic" || this.palette === "custom") return { color: palette.edge, glow: palette.glow };
    const horizontal = clamp(x / Math.max(1, this.width), 0, 1);
    const vertical = 1 - clamp(y / Math.max(1, this.height), 0, 1);
    const position = clamp(horizontal * 0.72 + vertical * 0.28, 0, 1);
    let left = palette.stops[0];
    let right = palette.stops.at(-1);
    for (let index = 1; index < palette.stops.length; index += 1) {
      if (position <= palette.stops[index][0]) {
        left = palette.stops[index - 1];
        right = palette.stops[index];
        break;
      }
    }
    const span = Math.max(0.0001, right[0] - left[0]);
    const mix = clamp((position - left[0]) / span, 0, 1);
    const color = left[1].map((channel, index) => Math.round(channel + (right[1][index] - channel) * mix));
    return { color, glow: color };
  }

  createTrailGradient(palette, top, bottom, velocityScale) {
    if (this.palette === "classic" || this.palette === "custom") {
      const gradient = this.context.createLinearGradient(0, top, 0, bottom);
      gradient.addColorStop(0, `rgba(${palette.stops[0][1].join(",")},${0.34 * velocityScale})`);
      gradient.addColorStop(1, `rgba(${palette.stops.at(-1)[1].join(",")},${0.82 * velocityScale})`);
      return gradient;
    }

    // Every trail samples the same canvas-space gradient, so the notes read as
    // windows into one continuous color field rather than isolated gradients.
    const gradient = this.context.createLinearGradient(0, this.height, this.width, 0);
    for (const [position, color] of palette.stops) {
      gradient.addColorStop(position, `rgba(${color.join(",")},${0.8 * velocityScale})`);
    }
    return gradient;
  }

  emitKeyBurst(note, velocity) {
    if (this.reducedMotion || !this.particleIntensity) return;
    const metric = this.keyMetrics.get(note);
    if (!metric) return;
    const velocityScale = 0.55 + clamp(velocity / 127, 0, 1) * 0.45;
    const count = Math.round((4 + this.particleIntensity * 12) * velocityScale);
    for (let index = 0; index < count; index += 1) {
      this.burstParticles.push({
        x: metric.x + (Math.random() - 0.5) * metric.width * 0.9,
        y: this.keyboardTop - 3 - Math.random() * 4,
        vx: (Math.random() - 0.5) * (22 + this.particleIntensity * 34),
        vy: -(24 + Math.random() * (34 + this.particleIntensity * 30)),
        gravity: 22 + Math.random() * 16,
        age: 0,
        life: 0.42 + Math.random() * 0.42,
        size: 0.75 + Math.random() * (0.8 + this.particleIntensity * 1.15),
        note,
      });
    }
  }

  emitHeldKeyParticles(trail, dt, metric) {
    if (this.reducedMotion || !this.particleIntensity || trail.releasedAt !== null) return;
    trail.keyParticleClock += dt;
    const interval = 0.095 - this.particleIntensity * 0.055;
    if (trail.keyParticleClock < interval) return;
    trail.keyParticleClock = 0;
    const count = this.particleIntensity > 0.72 ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      this.burstParticles.push({
        x: metric.x + (Math.random() - 0.5) * metric.width * 0.82,
        y: this.keyboardTop - 2 - Math.random() * 2,
        vx: (Math.random() - 0.5) * (10 + this.particleIntensity * 18),
        vy: -(18 + Math.random() * (18 + this.particleIntensity * 20)),
        gravity: 16 + Math.random() * 12,
        age: 0,
        life: 0.28 + Math.random() * 0.3,
        size: 0.5 + Math.random() * (0.55 + this.particleIntensity * 0.7),
        note: trail.note,
      });
    }
  }

  updateParticles(trail, dt, headY, metric, palette) {
    if (this.reducedMotion || !this.particleIntensity) return;
    trail.particleClock += dt;
    const interval = 0.15 - this.particleIntensity * 0.1 + (1 - trail.velocity / 127) * 0.04;
    if (trail.releasedAt === null && headY >= -TRAIL_OVERSCAN && trail.particleClock >= interval) {
      trail.particleClock = 0;
      trail.particles.push({
        x: metric.x + (Math.random() - 0.5) * metric.width * 0.65,
        y: headY + Math.random() * 5,
        vx: (Math.random() - 0.5) * 11,
        vy: -8 - Math.random() * 14,
        age: 0,
        life: 0.42 + Math.random() * 0.25,
        size: 1 + Math.random() * 1.4,
      });
    }
    trail.particles = trail.particles.filter((particle) => {
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      if (particle.age >= particle.life) return false;
      const alpha = (1 - particle.age / particle.life) * 0.42;
      const sampled = this.samplePalette(palette, particle.x, particle.y);
      this.context.save();
      this.applyGlow(sampled.glow, 0.55);
      this.context.fillStyle = `rgba(${sampled.color.join(",")},${alpha * (0.55 + this.particleIntensity * 0.45)})`;
      this.context.fillRect(particle.x, particle.y, particle.size, particle.size);
      this.context.restore();
      return true;
    });
  }

  drawBurstParticles(dt) {
    this.burstParticles = this.burstParticles.filter((particle) => {
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      if (particle.age >= particle.life) return false;
      const progress = particle.age / particle.life;
      const alpha = (1 - easeOutCubic(progress)) * (0.55 + this.particleIntensity * 0.4);
      const palette = this.paletteFor(particle.note);
      const sampled = this.samplePalette(palette, particle.x, particle.y);
      this.context.save();
      this.applyGlow(sampled.glow, 0.7);
      this.context.fillStyle = `rgba(${sampled.color.join(",")},${alpha})`;
      this.context.beginPath();
      this.context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      this.context.fill();
      this.context.restore();
      return true;
    });
  }

  snowDirection() {
    if (this.playbackVisualization === "roll" && this.playbackActive) return "left";
    if (this.playbackVisualization === "fall" && this.playbackActive) return "down";
    return "up";
  }

  createSnowParticle(direction, prefilled = false) {
    const density = this.upwardSnowIntensity;
    const size = 0.65 + Math.random() * (1.1 + density * 0.65);
    const travelHeight = Math.max(1, this.keyboardTop);
    const horizontal = direction === "left";
    return {
      x: horizontal
        ? (prefilled ? Math.random() * this.width : this.width - 1 + Math.random() * 9)
        : Math.random() * this.width,
      y: horizontal
        ? Math.random() * this.height
        : (prefilled
          ? -8 + Math.random() * (travelHeight + 8)
          : (direction === "down" ? -8 + Math.random() * 9 : this.keyboardTop - 2 + Math.random() * 9)),
      speed: 17 + Math.random() * (23 + density * 18),
      drift: (Math.random() - 0.5) * (8 + density * 9),
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.7 + Math.random() * 1.25,
      size,
      alpha: 0.18 + Math.random() * (0.2 + density * 0.16),
      cross: size > 1.65 && Math.random() > 0.72,
    };
  }

  reconcileSnowField() {
    if (!this.enabled || this.reducedMotion || this.upwardSnowIntensity <= 0) {
      this.snowParticles = [];
      this.snowSpawnClock = 0;
      return;
    }
    const direction = this.snowDirection();
    const horizontal = direction === "left";
    const targetCount = snowParticleTargetCount(
      this.upwardSnowIntensity,
      horizontal ? this.height : this.width,
      horizontal ? this.width : this.keyboardTop,
    );
    if (this.snowParticles.length > targetCount) this.snowParticles.length = targetCount;
    while (this.snowParticles.length < targetCount) {
      this.snowParticles.push(this.createSnowParticle(direction, true));
    }
  }

  rebuildSnowField() {
    this.snowParticles = [];
    this.snowSpawnClock = 0;
    this.reconcileSnowField();
  }

  drawSnow(dt) {
    if (this.upwardSnowIntensity <= 0 || this.reducedMotion) return;
    const density = this.upwardSnowIntensity;
    const direction = this.snowDirection();
    const horizontal = direction === "left";
    const crossSection = horizontal ? this.height : this.width;
    const travelDistance = horizontal ? this.width : this.keyboardTop;
    this.snowSpawnClock = Math.min(4, this.snowSpawnClock + dt * density * (4 + Math.max(5, crossSection / 80)));
    const targetCount = snowParticleTargetCount(density, crossSection, travelDistance);
    const availableSlots = Math.max(0, targetCount - this.snowParticles.length);
    const spawnCount = Math.min(4, availableSlots, Math.floor(this.snowSpawnClock));
    this.snowSpawnClock -= spawnCount;
    for (let index = 0; index < spawnCount; index += 1) {
      this.snowParticles.push(this.createSnowParticle(direction));
    }

    const palette = this.ambientPalette();
    this.snowParticles = this.snowParticles.filter((particle) => {
      particle.phase += particle.phaseSpeed * dt;
      if (horizontal) {
        particle.x -= particle.speed * dt;
        particle.y += (particle.drift + Math.sin(particle.phase) * 7) * dt;
      } else {
        particle.x += (particle.drift + Math.sin(particle.phase) * 7) * dt;
        particle.y += particle.speed * dt * (direction === "down" ? 1 : -1);
      }
      const outsideTravel = horizontal
        ? particle.x < -12
        : (direction === "down" ? particle.y > this.keyboardTop + 12 : particle.y < -12);
      const outsideCrossSection = horizontal
        ? particle.y < -18 || particle.y > this.height + 18
        : particle.x < -18 || particle.x > this.width + 18;
      if (outsideTravel || outsideCrossSection) return false;
      const sampled = this.samplePalette(palette, particle.x, particle.y);
      const fadeIn = horizontal
        ? clamp((this.width + 12 - particle.x) / 34, 0, 1)
        : (direction === "down"
          ? clamp((particle.y + 12) / 34, 0, 1)
          : clamp((this.keyboardTop - particle.y) / 34, 0, 1));
      const fadeOut = horizontal
        ? clamp((particle.x + 12) / 80, 0, 1)
        : (direction === "down"
          ? clamp((this.keyboardTop + 12 - particle.y) / 80, 0, 1)
          : clamp((particle.y + 12) / 80, 0, 1));
      const alpha = particle.alpha * Math.min(fadeIn, fadeOut);
      this.context.save();
      this.applyGlow(sampled.glow, 0.32);
      this.context.fillStyle = `rgba(${sampled.color.join(",")},${alpha})`;
      this.context.beginPath();
      this.context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      this.context.fill();
      if (particle.cross) {
        this.context.globalAlpha = 0.58;
        this.context.lineWidth = 0.55;
        this.context.strokeStyle = `rgba(${sampled.color.join(",")},${alpha})`;
        this.context.beginPath();
        this.context.moveTo(particle.x - particle.size * 1.8, particle.y);
        this.context.lineTo(particle.x + particle.size * 1.8, particle.y);
        this.context.moveTo(particle.x, particle.y - particle.size * 1.8);
        this.context.lineTo(particle.x, particle.y + particle.size * 1.8);
        this.context.stroke();
      }
      this.context.restore();
      return true;
    });
  }

  drawTrail(trail, now, dt) {
    const metric = this.keyMetrics.get(trail.note);
    if (!metric) return false;
    const heldFor = Math.max(0, now - trail.startedAt);
    const growth = easeOutCubic(clamp(heldFor / GROW_IN_DURATION, 0, 1));
    const speed = (this.reducedMotion ? TRAIL_SPEED * 0.68 : TRAIL_SPEED) * this.speedMultiplier;
    if (trail.releasedAt === null) {
      trail.length += speed * dt * growth;
    } else {
      trail.offset += speed * dt;
    }

    const fade = 1;
    const velocityScale = 0.58 + clamp(trail.velocity / 127, 0, 1) * 0.42;
    const width = clamp(metric.width * (metric.width < 10 ? 0.58 : 0.7), 2.4, 11);
    const visibleLength = Math.max(trail.length, 6);
    const bounds = liveTrailBounds(this.keyboardTop, trail.offset, visibleLength);
    if (bounds.expired) return false;
    const { top, bottom, drawTop, drawHeight } = bounds;
    const palette = this.paletteFor(trail.note);
    const radius = this.squareCorners ? 0 : Math.min(width / 2, drawHeight / 2, 4);
    const gradient = this.createTrailGradient(palette, top, bottom, velocityScale);
    const sampled = this.samplePalette(palette, metric.x, Math.max(0, top));

    this.context.save();
    this.applyGlow(sampled.glow);
    this.context.beginPath();
    this.context.roundRect(metric.x - width / 2, drawTop, width, drawHeight, radius);
    this.context.fillStyle = gradient;
    this.context.fill();

    if (top >= -TRAIL_OVERSCAN) {
      this.context.fillStyle = `rgba(${sampled.color.join(",")},${0.9 * fade})`;
      this.context.fillRect(metric.x - width / 2, top, width, Math.min(2, visibleLength));
    }
    this.context.restore();
    this.updateParticles(trail, dt, top, metric, palette);
    this.emitHeldKeyParticles(trail, dt, metric);
    return true;
  }

  currentPlaybackPosition(now) {
    if (!this.playbackPlaying) return this.playbackPosition;
    return this.playbackPosition + Math.max(0, now - this.playbackUpdatedAt) * this.playbackSpeed;
  }

  drawFallingNotes(now) {
    if (this.playbackVisualization !== "fall" || !this.playbackActive || !this.fallingNotes.length) return;
    const position = this.currentPlaybackPosition(now);
    const playbackSpeed = Math.max(0.25, this.playbackSpeed);
    const travelSeconds = clamp(FALL_TRAVEL_SECONDS / this.speedMultiplier, 1.6, 6.4);
    const horizon = position + fallLookaheadSeconds(this.speedMultiplier, playbackSpeed);
    const travelHeight = Math.max(80, this.keyboardTop - 8);

    for (const noteEvent of fallingNotesInWindow(this.fallingNoteIndex, position, horizon)) {
      const note = clamp(noteEvent.note + this.playbackTranspose, 0, 127);
      const metric = this.keyMetrics.get(note);
      if (!metric) continue;

      const bounds = fallingNoteBounds(
        noteEvent,
        position,
        playbackSpeed,
        travelSeconds,
        this.keyboardTop,
        travelHeight,
      );
      const unclippedTop = bounds.top;
      const unclippedBottom = bounds.bottom;
      if (unclippedBottom < -16 || unclippedTop > this.keyboardTop) continue;

      const top = Math.max(-12, unclippedTop);
      const bottom = Math.min(this.keyboardTop - 2, unclippedBottom);
      if (bottom <= top) continue;
      const height = bottom - top;

      const velocityScale = 0.58 + clamp((Number(noteEvent.velocity) || 96) / 127, 0, 1) * 0.42;
      const width = clamp(metric.width * (metric.width < 10 ? 0.58 : 0.7), 2.4, 11);
      const palette = this.paletteFor(note);
      const sampled = this.samplePalette(palette, metric.x, bottom);
      const gradient = this.createTrailGradient(palette, top, bottom, velocityScale);
      const radius = this.squareCorners ? 0 : Math.min(width / 2, 4);

      this.context.save();
      this.applyGlow(sampled.glow, 1.08);
      this.context.beginPath();
      this.context.roundRect(metric.x - width / 2, top, width, height, radius);
      this.context.fillStyle = gradient;
      this.context.fill();
      this.context.fillStyle = `rgba(${sampled.color.join(",")},0.94)`;
      this.context.fillRect(metric.x - width / 2, bottom - Math.min(2, height), width, Math.min(2, height));
      this.context.restore();
    }
  }

  rollPitchRange() {
    return {
      min: clamp(this.fallingPitchRange.min + this.playbackTranspose, 0, 127),
      max: clamp(this.fallingPitchRange.max + this.playbackTranspose, 0, 127),
    };
  }

  rollPlaybackEndPosition(playbackSpeed = 1, fallbackPosition = 0) {
    if (!this.enabled || this.playbackVisualization !== "roll" || !this.fallingNotes.length) {
      return fallbackPosition;
    }
    const travelSeconds = clamp(ROLL_TRAVEL_SECONDS / this.speedMultiplier, 2.4, 9.6);
    const playheadX = this.width / 2;
    const horizontalPadding = clamp(this.width * 0.035, 18, 42);
    const rightTravel = Math.max(120, this.width - playheadX - horizontalPadding);
    const pixelsPerSecond = rightTravel / travelSeconds;
    return Math.max(
      fallbackPosition,
      horizontalRollExitPosition(
        this.fallingNoteEnd,
        playbackSpeed,
        pixelsPerSecond,
        playheadX,
      ),
    );
  }

  drawHorizontalRoll(now) {
    if (this.playbackVisualization !== "roll" || !this.playbackActive) return;
    const position = this.currentPlaybackPosition(now);
    const playbackSpeed = Math.max(0.25, this.playbackSpeed);
    const travelSeconds = clamp(ROLL_TRAVEL_SECONDS / this.speedMultiplier, 2.4, 9.6);
    const playheadX = this.width / 2;
    const horizontalPadding = clamp(this.width * 0.035, 18, 42);
    const rightTravel = Math.max(120, this.width - playheadX - horizontalPadding);
    const top = clamp(this.height * 0.13, 58, 82);
    const bottom = this.height - clamp(this.height * 0.07, 24, 42);
    const laneAreaHeight = Math.max(120, bottom - top);
    const pitchRange = this.rollPitchRange();
    const laneCount = pitchRange.max - pitchRange.min + 1;
    const laneHeight = laneAreaHeight / laneCount;
    const noteHeight = clamp(laneHeight * 0.66, 3, 13);
    const pixelsPerSecond = rightTravel / travelSeconds;
    const visibleWindow = horizontalRollTimeWindow(
      position,
      playbackSpeed,
      pixelsPerSecond,
      playheadX,
      this.width,
    );
    const visibleNotes = fallingNotesInWindow(
      this.fallingNoteIndex,
      visibleWindow.start,
      visibleWindow.end,
    );

    const inactiveNotes = [];
    const activeNotes = [];
    for (const noteEvent of visibleNotes) {
      const bounds = horizontalRollNoteBounds(
        noteEvent,
        position,
        playbackSpeed,
        travelSeconds,
        playheadX,
        rightTravel,
      );
      const left = Math.max(-ROLL_RENDER_OVERSCAN, bounds.left);
      const right = Math.min(this.width + ROLL_RENDER_OVERSCAN, bounds.right);
      if (right <= left) continue;
      (bounds.active ? activeNotes : inactiveNotes).push({ noteEvent, bounds, left, right });
    }

    const gradientPalette = this.palette === "classic" || this.palette === "custom"
      ? null
      : this.ambientPalette();
    let canvasGradient = null;
    if (gradientPalette) {
      canvasGradient = this.context.createLinearGradient(0, 0, this.width, 0);
      for (const [stop, color] of gradientPalette.stops) {
        canvasGradient.addColorStop(stop, `rgb(${color.join(",")})`);
      }
    }

    const noteY = (noteEvent, includePress = true) => {
      const note = clamp(noteEvent.note + this.playbackTranspose, 0, 127);
      const pressDepth = clamp(noteHeight * 0.38, 2, 5);
      const pressOffset = includePress
        ? rollPressOffset(
          this.rollPressStates.get(noteEvent.source),
          now,
          this.rollPressMotionEnabled && !this.reducedMotion,
          pressDepth,
        )
        : 0;
      return top + (pitchRange.max - note) * laneHeight + (laneHeight - noteHeight) / 2 + pressOffset;
    };

    const drawNote = ({ noteEvent, left, right }, active) => {
      const note = clamp(noteEvent.note + this.playbackTranspose, 0, 127);
      const y = noteY(noteEvent);
      const width = right - left;
      const radius = this.squareCorners ? 0 : Math.min(noteHeight / 2, 5);
      const velocityScale = 0.58 + clamp((Number(noteEvent.velocity) || 96) / 127, 0, 1) * 0.42;
      const palette = this.paletteFor(note);
      const sampled = active ? { color: [255, 255, 255], glow: [255, 255, 255] } : this.samplePalette(palette, (left + right) / 2, y);

      this.context.save();
      this.applyGlow(sampled.glow, active ? 1.15 : 0.58);
      this.context.globalAlpha = active ? 0.98 : 0.48 + velocityScale * 0.4;
      this.context.fillStyle = active
        ? "rgb(255,255,255)"
        : canvasGradient || `rgb(${sampled.color.join(",")})`;
      this.context.beginPath();
      this.context.roundRect(left, y, width, noteHeight, radius);
      this.context.fill();
      this.context.restore();
    };

    inactiveNotes.forEach((note) => drawNote(note, false));
    activeNotes.forEach((note) => drawNote(note, true));

    for (const [source, pressState] of this.rollPressStates) {
      if (pressState.releasedAt !== null && now - pressState.releasedAt >= ROLL_RELEASE_DURATION) {
        this.rollPressStates.delete(source);
      }
    }

  }

  hasRollPressAnimation(now) {
    if (!this.rollPressMotionEnabled || this.reducedMotion) return false;
    for (const pressState of this.rollPressStates.values()) {
      if (pressState.releasedAt === null) {
        if (now - pressState.pressedAt < ROLL_PRESS_DURATION) return true;
      } else if (now - pressState.releasedAt < ROLL_RELEASE_DURATION) {
        return true;
      }
    }
    return false;
  }

  draw(timeMs) {
    this.frameId = 0;
    const now = timeMs / 1000;
    const dt = clamp((timeMs - this.lastTime) / 1000, 0, 0.034);
    this.lastTime = timeMs;
    this.clear();
    const horizontalPlayback = this.playbackVisualization === "roll" && this.playbackActive;
    if (horizontalPlayback) {
      this.drawSnow(dt);
      this.drawHorizontalRoll(now);
    } else {
      this.drawFallingNotes(now);
      for (const [id, trail] of this.trails) {
        if (!this.drawTrail(trail, now, dt)) {
          this.trails.delete(id);
          if (this.activeTrails.get(trail.note) === id) this.activeTrails.delete(trail.note);
        }
      }
      this.drawBurstParticles(dt);
      this.drawSnow(dt);
    }
    const animateSequencedPlayback = isSequencedPlaybackVisualization(this.playbackVisualization)
      && this.playbackActive
      && this.playbackPlaying;
    const hasAnimatedContent = horizontalPlayback
      ? animateSequencedPlayback || this.hasRollPressAnimation(now) || this.snowParticles.length || this.upwardSnowIntensity > 0
      : this.trails.size || this.burstParticles.length || this.snowParticles.length || this.upwardSnowIntensity > 0 || animateSequencedPlayback;
    if (hasAnimatedContent && this.enabled) {
      this.frameId = requestAnimationFrame((nextTime) => this.draw(nextTime));
    }
  }
}
