import assert from "node:assert/strict";
import {
  centeredRelativeTickX,
  centeredTickX,
  midiNoteToChordStaffKey,
  midiNoteToStaffKey,
  splitStaffVoicing,
} from "../src/js/chord-theory/chord-staff.js";

assert.equal(midiNoteToStaffKey(21), "a/0");
assert.equal(midiNoteToStaffKey(60), "c/4");
assert.equal(midiNoteToStaffKey(61, "sharp"), "c#/4");
assert.equal(midiNoteToStaffKey(61, "flat"), "db/4");
assert.equal(midiNoteToStaffKey(108), "c/8");
assert.equal(centeredTickX(12, 376, 28, 6), 192);
assert.equal(centeredRelativeTickX(12, 376, 28, 6, 70), 122);

assert.equal(midiNoteToChordStaffKey(63, { root: 0, rootName: "C", symbol: "m" }), "eb/4");
assert.equal(midiNoteToChordStaffKey(65, { root: 1, rootName: "C#", symbol: "" }), "e#/4");
assert.equal(midiNoteToChordStaffKey(64, { root: 1, rootName: "Db", symbol: "m" }), "fb/4");
assert.equal(midiNoteToChordStaffKey(57, { root: 0, rootName: "C", symbol: "dim7" }), "bbb/3");
assert.equal(midiNoteToChordStaffKey(51, { root: 0, rootName: "C", symbol: "7#9" }), "d#/3");

assert.deepEqual(splitStaffVoicing([48, 55, 60, 64, 67]), {
  notes: [48, 55, 60, 64, 67],
  bass: ["c/3", "g/3"],
  treble: ["c/4", "e/4", "g/4"],
  layout: "grand",
});
assert.equal(splitStaffVoicing([36, 43, 48]).layout, "bass");
assert.equal(splitStaffVoicing([60, 64, 67]).layout, "treble");
assert.equal(splitStaffVoicing([]).layout, "treble");
assert.equal(splitStaffVoicing([60, 64, 67], "sharp", true).layout, "grand");
assert.equal(splitStaffVoicing([36, 43, 48], "sharp", true).layout, "grand");
assert.deepEqual(
  splitStaffVoicing([60, 63, 67], "sharp", false, { root: 0, rootName: "C", symbol: "m" }).treble,
  ["c/4", "eb/4", "g/4"],
);
assert.deepEqual(splitStaffVoicing([60, 60, 64]).notes, [60, 64]);

console.log("Chord staff tests passed.");
