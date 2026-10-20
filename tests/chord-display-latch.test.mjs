import assert from "node:assert/strict";
import { updateChordDisplayLatch } from "../src/js/chord-theory/chord-display-latch.js";

const empty = { status: "empty", primary: null };
const partial = { status: "partial", primary: null, notes: [60, 64] };
const cMajor = { status: "recognized", primary: { name: "C" }, notes: [60, 64, 67] };
const gMajor = { status: "recognized", primary: { name: "G" }, notes: [55, 59, 62] };

let latch = updateChordDisplayLatch(empty, null, true);
assert.equal(latch.displayResult, empty);
assert.equal(latch.retainedResult, null);
assert.equal(latch.isRetained, false);

latch = updateChordDisplayLatch(cMajor, null, true);
assert.equal(latch.displayResult, cMajor);
assert.equal(latch.retainedResult, cMajor);
assert.equal(latch.isRetained, false);

latch = updateChordDisplayLatch(partial, latch.retainedResult, true);
assert.equal(latch.displayResult, cMajor);
assert.equal(latch.retainedResult, cMajor);
assert.equal(latch.isRetained, true);

latch = updateChordDisplayLatch(empty, latch.retainedResult, true);
assert.equal(latch.displayResult, cMajor);
assert.equal(latch.isRetained, true);

latch = updateChordDisplayLatch(gMajor, latch.retainedResult, true);
assert.equal(latch.displayResult, gMajor);
assert.equal(latch.retainedResult, gMajor);
assert.equal(latch.isRetained, false);

latch = updateChordDisplayLatch(empty, latch.retainedResult, false);
assert.equal(latch.displayResult, empty);
assert.equal(latch.retainedResult, gMajor);
assert.equal(latch.isRetained, false);

console.log("Chord display latch tests passed.");
