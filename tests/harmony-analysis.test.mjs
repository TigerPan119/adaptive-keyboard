import assert from "node:assert/strict";
import { analyzeChord } from "../src/js/chord-theory/chord-engine.js";
import { analyzeHarmony } from "../src/js/chord-theory/harmony-analysis.js";

function numeral(notes, options = {}) {
  const chord = analyzeChord(notes, { spelling: options.spelling });
  return analyzeHarmony(chord.primary, options)?.numeral;
}

assert.equal(numeral([60, 64, 67], { tonic: 0, mode: "major" }), "I");
assert.equal(numeral([62, 66, 69], { tonic: 0, mode: "major" }), "V/V");
assert.equal(numeral([62, 65, 69], { tonic: 0, mode: "major" }), "ii");
assert.equal(numeral([64, 68, 71], { tonic: 0, mode: "major" }), "V/vi");
assert.equal(numeral([65, 69, 72], { tonic: 0, mode: "major" }), "IV");
assert.equal(numeral([67, 71, 74], { tonic: 0, mode: "major" }), "V");
assert.equal(numeral([69, 73, 76], { tonic: 0, mode: "major" }), "V/ii");
assert.equal(numeral([71, 75, 78], { tonic: 0, mode: "major" }), "V/iii");
assert.equal(numeral([65, 68, 72], { tonic: 0, mode: "major" }), "iv");
assert.equal(numeral([58, 62, 65], { tonic: 0, mode: "major" }), "bVII");
assert.equal(numeral([64, 67, 72], { tonic: 0, mode: "major" }), "I6");
assert.equal(numeral([67, 72, 76], { tonic: 0, mode: "major" }), "I64");

assert.equal(numeral([62, 66, 69, 72], { tonic: 0, mode: "major" }), "V7/V");
assert.equal(numeral([64, 68, 71, 74], { tonic: 0, mode: "major" }), "V7/vi");
assert.equal(numeral([60, 64, 67, 70], { tonic: 0, mode: "major" }), "V7/IV");
assert.equal(numeral([62, 66, 69, 72, 75], { tonic: 0, mode: "major" }), "V7b9/V");
assert.equal(numeral([66, 69, 72, 75], { tonic: 0, mode: "major" }), "vii°7/V?");
assert.equal(numeral([61, 65, 68, 71], { tonic: 0, mode: "major" }), "subV7/I");
assert.equal(numeral([66, 69, 72, 74], { tonic: 0, mode: "major" }), "V65/V");
assert.equal(numeral([69, 72, 74, 78], { tonic: 0, mode: "major" }), "V43/V");
assert.equal(numeral([72, 74, 78, 81], { tonic: 0, mode: "major" }), "V42/V");

assert.equal(numeral([60, 63, 67], { tonic: 0, mode: "minor" }), "i");
assert.equal(numeral([67, 71, 74], { tonic: 0, mode: "minor" }), "V");
assert.equal(numeral([62, 66, 69], { tonic: 0, mode: "minor" }), "V/V");
assert.equal(numeral([62, 66, 69, 72], { tonic: 0, mode: "minor" }), "V7/V");

const borrowedIv = analyzeHarmony(analyzeChord([65, 68, 72]).primary, { tonic: 0, mode: "major" });
assert.equal(borrowedIv.functionName, "Borrowed chord / modal mixture");
const likelyApplied = analyzeHarmony(analyzeChord([62, 66, 69]).primary, { tonic: 0, mode: "major" });
assert.equal(likelyApplied.functionName, "Likely secondary dominant");

console.log("Harmony analysis tests passed.");
