import assert from "node:assert/strict";
import {
  createNarrativeBackgroundPalette,
  createSmartPalette,
  createSmartPaletteFromColors,
  paletteCssGradient,
} from "../src/js/chord-theory/smart-palette.js";

function imageData(color, pixelCount = 64) {
  const data = new Uint8ClampedArray(pixelCount * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = 255;
  }
  return { data };
}

function multiColorImageData(colors, repeats = 32) {
  const data = new Uint8ClampedArray(colors.length * repeats * 4);
  let offset = 0;
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    for (const color of colors) {
      data.set([...color, 255], offset);
      offset += 4;
    }
  }
  return { data };
}

function hue([red, green, blue]) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (!delta) return null;
  const value = max === r ? 60 * (((g - b) / delta) % 6)
    : max === g ? 60 * ((b - r) / delta + 2)
      : 60 * ((r - g) / delta + 4);
  return (value + 360) % 360;
}

const hueDistance = (first, second) => Math.min(Math.abs(first - second), 360 - Math.abs(first - second));

const darkPalette = createSmartPalette(imageData([18, 32, 48]), 0.5);
assert.equal(darkPalette.stops.length, 2);
assert.ok(darkPalette.stops.every(([, color]) => color.every((channel) => channel >= 0 && channel <= 255)));
assert.ok(darkPalette.stops.every(([, color]) => Math.max(...color) > 150), "dark backgrounds should produce bright accents");

const lightPalette = createSmartPalette(imageData([235, 225, 205]), 0);
assert.ok(lightPalette.stops.every(([, color]) => Math.min(...color) < 180), "light backgrounds should produce darker accents");

const redBluePalette = createSmartPalette(multiColorImageData([[210, 35, 55], [25, 80, 210]]), 0.45);
const outputHues = redBluePalette.stops.map(([, color]) => hue(color));
assert.ok(outputHues.every((value) => hueDistance(value, 353) < 15 || hueDistance(value, 223) < 15), "output hues must come from image hues");

const earthyYellow = createSmartPalette(imageData([118, 96, 38]), 0.55);
assert.ok(earthyYellow.stops.every(([, color]) => Math.max(...color) > 190), "yellow-family accents should be luminous on dark backgrounds");
assert.ok(earthyYellow.stops.every(([, color]) => hueDistance(hue(color), 46) < 12), "yellow correction must preserve the source hue family");
assert.match(paletteCssGradient(darkPalette), /^linear-gradient\(135deg,/);

const presetPalette = createSmartPaletteFromColors([[9, 36, 33], [33, 23, 44]], 0);
assert.equal(presetPalette.stops.length, 2);
assert.ok(presetPalette.stops.every(([, color]) => Math.max(...color) > 150), "dark preset backgrounds should produce visible smart colors");

assert.deepEqual(createNarrativeBackgroundPalette("nebula").stops, [
  [0, [116, 211, 177]],
  [1, [205, 225, 213]],
]);
assert.deepEqual(createNarrativeBackgroundPalette("satin").stops, [
  [0, [255, 139, 115]],
  [1, [111, 207, 190]],
]);
assert.deepEqual(createNarrativeBackgroundPalette("halo").stops, [
  [0, [164, 208, 181]],
  [1, [240, 205, 116]],
]);
assert.equal(createNarrativeBackgroundPalette("studio"), null);

console.log("Smart palette tests passed.");
