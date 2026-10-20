import assert from "node:assert/strict";
import {
  cameraHighlightStrength,
  cameraQuadArea,
  cameraQuadHomography,
  containedMediaRect,
  DEFAULT_CAMERA_QUAD,
  isValidCameraQuad,
  normalizeCameraQuad,
  projectCameraQuadPoint,
} from "../src/js/chord-theory/camera-keyboard.js";

assert.equal(cameraHighlightStrength(0), 100);
assert.equal(cameraHighlightStrength(60), 40);
assert.equal(cameraHighlightStrength(100), 0);
assert.equal(cameraHighlightStrength(140), 0);

const rectangle = [
  { x: 0.1, y: 0.2 },
  { x: 0.9, y: 0.2 },
  { x: 0.9, y: 0.8 },
  { x: 0.1, y: 0.8 },
];

assert.equal(isValidCameraQuad(DEFAULT_CAMERA_QUAD), true);
assert.equal(isValidCameraQuad(rectangle), true);
assert.equal(isValidCameraQuad(null), false);
assert.equal(isValidCameraQuad([{ x: 0, y: 0 }]), false);
assert.ok(cameraQuadArea(rectangle) > 0.47);

const crossed = [rectangle[0], rectangle[2], rectangle[1], rectangle[3]];
assert.equal(isValidCameraQuad(crossed), false);

const normalized = normalizeCameraQuad([
  { x: -1, y: 0.25 },
  { x: 2, y: 0.25 },
  { x: 2, y: 0.75 },
  { x: -1, y: 0.75 },
]);
assert.deepEqual(normalized.map((point) => point.x), [0, 1, 1, 0]);

const homography = cameraQuadHomography(rectangle);
assert.equal(homography.length, 9);
assert.deepEqual(projectCameraQuadPoint(rectangle, 0, 0), rectangle[0]);
assert.deepEqual(projectCameraQuadPoint(rectangle, 1, 0), rectangle[1]);
assert.deepEqual(projectCameraQuadPoint(rectangle, 1, 1), rectangle[2]);
assert.deepEqual(projectCameraQuadPoint(rectangle, 0, 1), rectangle[3]);

const trapezoid = [
  { x: 0.2, y: 0.2 },
  { x: 0.8, y: 0.2 },
  { x: 0.95, y: 0.85 },
  { x: 0.05, y: 0.85 },
];
const center = projectCameraQuadPoint(trapezoid, 0.5, 0.5);
assert.ok(Math.abs(center.x - 0.5) < 1e-9);
assert.ok(center.y > 0.45 && center.y < 0.6);

assert.deepEqual(containedMediaRect(1000, 500, 1920, 1080), {
  left: 55.55555555555554,
  top: 0,
  width: 888.8888888888889,
  height: 500,
});
assert.deepEqual(containedMediaRect(500, 1000, 1000, 500), {
  left: 0,
  top: 375,
  width: 500,
  height: 250,
});

console.log("Camera keyboard tests passed.");
