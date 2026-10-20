import assert from "node:assert/strict";
import { fittedFontSize } from "../src/js/chord-theory/stage-text-fit.js";

assert.equal(fittedFontSize(104, 600, 800), null);
assert.equal(fittedFontSize(104, 1200, 600), 50);
assert.equal(fittedFontSize(20, 10000, 100), 12);
assert.equal(fittedFontSize(0, 100, 50), null);
assert.equal(fittedFontSize(40, Number.NaN, 50), null);

console.log("Stage text fit tests passed.");
