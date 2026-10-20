import assert from "node:assert/strict";
import {
  createFallingNoteIndex,
  fallLookaheadSeconds,
  fallingNoteBounds,
  fallingNotesInWindow,
  horizontalRollNoteBounds,
  horizontalRollExitPosition,
  horizontalRollTimeWindow,
  isSequencedPlaybackVisualization,
  liveTrailBounds,
  normalizePlaybackVisualization,
  NoteTrailVisualizer,
  rollPressOffset,
  snowParticleTargetCount,
} from "../src/js/chord-theory/note-trails.js";

const note = { start: 4, end: 5 };
const keyboardTop = 600;
const travelHeight = 592;
const travelSeconds = 3.2;
assert.equal(fallLookaheadSeconds(1, 1), 3.2);
assert.equal(fallLookaheadSeconds(2, 1), 1.6);
assert.ok(Math.abs(fallLookaheadSeconds(1, 1.5) - 4.8) < 0.0001);

const atImpact = fallingNoteBounds(note, 4, 1, travelSeconds, keyboardTop, travelHeight);
assert.equal(atImpact.bottom, keyboardTop);
assert.ok(atImpact.top < keyboardTop);

const atSpawn = fallingNoteBounds(note, 0.8, 1, travelSeconds, keyboardTop, travelHeight);
assert.ok(Math.abs(atSpawn.bottom - 8) < 0.0001);

const doubleSpeedSpawn = fallingNoteBounds(note, -2.4, 2, travelSeconds, keyboardTop, travelHeight);
assert.ok(Math.abs(doubleSpeedSpawn.bottom - 8) < 0.0001);

const indexedNotes = createFallingNoteIndex([
  { source: "long", note: 48, start: 0, end: 30 },
  { source: "near", note: 60, start: 10, end: 10.5 },
  { source: "future", note: 72, start: 18, end: 19 },
]);
assert.deepEqual(
  fallingNotesInWindow(indexedNotes, 9.5, 12).map(({ source }) => source),
  ["long", "near"],
);
assert.deepEqual(
  fallingNotesInWindow(indexedNotes, 17, 18.5).map(({ source }) => source),
  ["long", "future"],
);

const clippedLiveTrail = liveTrailBounds(600, 10, 1200);
assert.equal(clippedLiveTrail.top, -612);
assert.equal(clippedLiveTrail.drawTop, -20);
assert.equal(clippedLiveTrail.drawHeight, 608);
assert.equal(clippedLiveTrail.expired, false);

const expiredLiveTrail = liveTrailBounds(600, 625, 1200);
assert.equal(expiredLiveTrail.bottom, -27);
assert.equal(expiredLiveTrail.expired, true);

const rollUpcoming = horizontalRollNoteBounds(note, 3, 1, 4, 500, 460);
assert.equal(rollUpcoming.left, 615);
assert.equal(rollUpcoming.right, 730);
assert.equal(rollUpcoming.active, false);

const rollActive = horizontalRollNoteBounds(note, 4.5, 1, 4, 500, 460);
assert.equal(rollActive.left, 442.5);
assert.equal(rollActive.right, 557.5);
assert.equal(rollActive.active, true);

const rollFinished = horizontalRollNoteBounds(note, 5, 1, 4, 500, 460);
assert.equal(rollFinished.right, 500);
assert.equal(rollFinished.active, false);

const rollAtDoubleSpeed = horizontalRollNoteBounds(note, 3, 2, 4, 500, 460);
assert.equal(rollAtDoubleSpeed.left, 557.5);

const rollWindow = horizontalRollTimeWindow(10, 1, 100, 500, 1000, 48);
assert.deepEqual(rollWindow, { start: 4.52, end: 15.48 });
const enteringOutside = horizontalRollNoteBounds(
  { start: rollWindow.end, end: rollWindow.end + 1 },
  10,
  1,
  4.6,
  500,
  460,
);
assert.ok(Math.abs(enteringOutside.left - 1048) < 0.0001);
const leavingOutside = horizontalRollNoteBounds(
  { start: rollWindow.start - 1, end: rollWindow.start },
  10,
  1,
  4.6,
  500,
  460,
);
assert.ok(Math.abs(leavingOutside.right + 48) < 0.0001);
assert.equal(normalizePlaybackVisualization("roll"), "roll");
assert.equal(normalizePlaybackVisualization("fall"), "fall");
assert.equal(normalizePlaybackVisualization("unknown"), "rise");
assert.equal(isSequencedPlaybackVisualization("roll"), true);
assert.equal(isSequencedPlaybackVisualization("rise"), false);
assert.equal(horizontalRollExitPosition(10, 1, 100, 500), 15.48);
assert.equal(horizontalRollExitPosition(10, 2, 100, 500), 20.96);

assert.equal(snowParticleTargetCount(0, 1000, 500), 0);
assert.ok(snowParticleTargetCount(0.45, 1000, 500) > 100);
assert.ok(snowParticleTargetCount(1, 1920, 900) <= 320);

const heldPress = { pressedAt: 1, releasedAt: null };
assert.equal(rollPressOffset(heldPress, 1, true, 4), 0);
assert.ok(rollPressOffset(heldPress, 1.09, true, 4) > 3.99);
assert.equal(rollPressOffset(heldPress, 1.09, false, 4), 0);
const releasedPress = { pressedAt: 1, releasedAt: 1.2 };
assert.ok(rollPressOffset(releasedPress, 1.2, true, 4) > 3.99);
assert.equal(rollPressOffset(releasedPress, 1.44, true, 4), 0);

const fills = [];
const roundedRects = [];
const fakeContext = {
  save() {},
  restore() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  roundRect(_x, _y, width, _height, radius) { roundedRects.push({ width, radius }); },
  fill() { fills.push(this.fillStyle); },
  stroke() {},
};
const rollVisualizer = Object.assign(Object.create(NoteTrailVisualizer.prototype), {
  context: fakeContext,
  width: 1000,
  height: 600,
  palette: "custom",
  customColor: "#4aa3ff",
  glowIntensity: 0,
  squareCorners: true,
  playbackVisualization: "roll",
  rollPressMotionEnabled: true,
  rollPressStates: new Map([["active", { pressedAt: 4.4, releasedAt: null }]]),
  particleIntensity: 0.45,
  reducedMotion: false,
  enabled: true,
  playbackActive: true,
  playbackPlaying: false,
  playbackPosition: 4.5,
  playbackUpdatedAt: 0,
  playbackSpeed: 1,
  playbackTranspose: 0,
  speedMultiplier: 1,
  fallingNotes: [{ source: "active", note: 60, start: 4, end: 5, velocity: 100 }],
  fallingNoteIndex: createFallingNoteIndex([{ source: "active", note: 60, start: 4, end: 5, velocity: 100 }]),
  fallingPitchRange: { min: 58, max: 62 },
  root: null,
  bass: null,
});
rollVisualizer.drawHorizontalRoll(4.5);
assert.ok(fills.includes("rgb(255,255,255)"));
const noteRects = roundedRects.filter(({ width }) => width > 10);
assert.ok(noteRects.length > 0);
assert.ok(noteRects.every(({ radius }) => radius === 0));

const themeVisualizer = Object.assign(Object.create(NoteTrailVisualizer.prototype), {
  palette: "custom",
  customColor: "#4aa3ff",
  keyMetrics: new Map([[60, { x: 500, width: 12 }]]),
  width: 1000,
  height: 600,
  keyboardTop: 500,
  root: null,
  bass: null,
});
assert.deepEqual(themeVisualizer.themeColorForNote(60), [74, 163, 255]);

const snowVisualizer = Object.assign(Object.create(NoteTrailVisualizer.prototype), {
  enabled: true,
  reducedMotion: false,
  upwardSnowIntensity: 0.45,
  playbackVisualization: "rise",
  playbackActive: false,
  width: 1000,
  height: 600,
  keyboardTop: 500,
  snowParticles: [],
  snowSpawnClock: 3,
});
snowVisualizer.rebuildSnowField();
assert.equal(snowVisualizer.snowParticles.length, snowParticleTargetCount(0.45, 1000, 500));
assert.equal(snowVisualizer.snowSpawnClock, 0);
assert.ok(snowVisualizer.snowParticles.every(({ x, y }) => x >= 0 && x <= 1000 && y >= -8 && y <= 500));

snowVisualizer.playbackVisualization = "roll";
snowVisualizer.playbackActive = true;
snowVisualizer.rebuildSnowField();
assert.equal(snowVisualizer.snowDirection(), "left");
assert.equal(snowVisualizer.snowParticles.length, snowParticleTargetCount(0.45, 600, 1000));
assert.ok(snowVisualizer.snowParticles.every(({ x, y }) => x >= 0 && x <= 1000 && y >= 0 && y <= 600));

console.log("Note trail timing tests passed.");
