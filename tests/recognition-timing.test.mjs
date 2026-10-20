import assert from "node:assert/strict";
import {
  remainingHighlightMs,
  shouldCaptureBeforeNoteReduction,
} from "../src/js/chord-theory/recognition-timing.js";

assert.equal(shouldCaptureBeforeNoteReduction(true, 3, 2), true);
assert.equal(shouldCaptureBeforeNoteReduction(true, 5, 0), true);
assert.equal(shouldCaptureBeforeNoteReduction(true, 2, 1), false);
assert.equal(shouldCaptureBeforeNoteReduction(true, 3, 3), false);
assert.equal(shouldCaptureBeforeNoteReduction(false, 4, 3), false);

assert.equal(remainingHighlightMs(1000, 1025, 90), 65);
assert.equal(remainingHighlightMs(1000, 1090, 90), 0);
assert.equal(remainingHighlightMs(1000, 1140, 90), 0);

console.log("Recognition timing tests passed.");
