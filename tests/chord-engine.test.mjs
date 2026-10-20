import assert from "node:assert/strict";
import { analyzeChord } from "../src/js/chord-theory/chord-engine.js";

const chord = (notes, options) => analyzeChord(notes, options).primary?.name;

assert.equal(chord([60, 64, 67]), "C");
assert.equal(chord([60, 63, 67]), "Cm");
assert.equal(chord([64, 67, 72]), "C/E");
assert.equal(chord([60, 64, 67, 71]), "Cmaj7");
assert.equal(chord([48, 52, 55, 57]), "C6");
assert.equal(chord([57, 60, 64, 67]), "Am7");
assert.equal(chord([61, 65, 68], { spelling: "flat" }), "Db");
assert.equal(chord([60, 67]), "C5?");
assert.equal(chord([60, 67], { includePowerChords: true }), "C5");
assert.equal(chord([48, 52, 55, 58, 61]), "C7b9");
assert.equal(chord([48, 52, 55, 58, 63]), "C7#9");
assert.equal(chord([48, 52, 55, 58, 66]), "C7#11");
assert.equal(chord([48, 52, 55, 56, 58]), "C7b13");
assert.equal(chord([48, 52, 55, 58, 61, 66]), "C7(b9,#11)");
assert.equal(chord([48, 52, 55, 60, 62, 65]), "C(add9,add11)");
assert.equal(chord([48, 52, 55, 57, 62]), "C6/9");
assert.equal(chord([48, 51, 55, 58, 62, 65]), "Cm11");
assert.equal(chord([48, 52, 55, 61]), "Caddb9");
assert.equal(chord([48, 52, 54, 55]), "Cadd#11");
assert.equal(chord([48, 52, 55, 56]), "Caddb13");
assert.equal(chord([60, 64]), "C(no5)?");
assert.equal(chord([60]), undefined);
assert.equal(chord([48, 52, 58, 61]), "C7b9(no5)");
assert.equal(chord([48, 52, 58, 62]), "C9(no5)");
assert.equal(chord([48, 52, 58]), "C7(no5)");
assert.equal(chord([52, 58, 60]), "C7(no5)/E");
assert.equal(chord([48, 52, 57, 58]), "C13(no5,no9)");
assert.equal(chord([48, 58, 62, 65]), "C11(no3,no5)?");
assert.equal(chord([48, 52, 55, 58, 65]), "C7add11");
assert.equal(chord([48, 52, 55, 58, 62, 66, 69]), "C13#11");
assert.equal(chord([48, 53, 55, 58, 62]), "C9sus4");
assert.equal(chord([48, 52, 56]), "Caug?");
assert.equal(chord([48, 51, 54, 57]), "Cdim7?");
assert.equal(chord([48, 53, 55, 59]), "Cmaj7sus4");
assert.equal(chord([48, 50, 55, 59]), "Cmaj7sus2");
assert.equal(chord([52, 55, 60, 64, 67]), "C/E");
assert.equal(chord([48, 50, 52, 56, 58]), "C9#5");
assert.equal(chord([48, 50, 51, 54, 58]), "Cm9b5");
assert.equal(chord([48, 50, 53, 55, 57, 58]), "C13sus4");
assert.equal(chord([48, 50, 51, 55, 59]), "Cm(maj9)");
assert.equal(chord([48, 50, 51, 53, 55, 59]), "Cm(maj11)");
assert.equal(chord([48, 51, 54, 59]), "Cdim(maj7)");
assert.equal(chord([48, 49, 50]), undefined);
assert.equal(chord([48, 49, 50, 51, 52, 53, 54, 55]), undefined);

// Omission figures remain conservative: fifths can be inferred broadly, while
// missing thirds require enough chord-defining tones and remain ambiguous.
assert.equal(chord([60, 63]), "Cm(no5)?");
assert.equal(chord([60, 67, 70]), "C7(no3)?");
assert.equal(chord([60, 67, 71]), "Cmaj7(no3)?");
assert.equal(chord([60, 64, 70, 74]), "C9(no5)");
assert.equal(chord([60, 64, 74]), "Cadd9(no5)");
assert.equal(chord([60, 64, 67, 74]), "Cadd9");
assert.equal(chord([60, 64, 69]), "Am/C");
assert.equal(chord([60, 64], { assumePerfectFifth: false }), "C?");

const openVoicing = analyzeChord([48, 55, 60, 64, 67, 72]);
assert.equal(openVoicing.primary?.name, "C");
assert.deepEqual(openVoicing.notes, [48, 55, 60, 64, 67, 72]);
assert.equal(openVoicing.voicing.noteCount, 6);
assert.equal(openVoicing.voicing.uniqueNoteCount, 6);
assert.equal(openVoicing.voicing.pitchClassCount, 3);
assert.equal(openVoicing.voicing.spanSemitones, 24);
assert.equal(openVoicing.voicing.texture, "open");
assert.deepEqual(openVoicing.voicing.pitchClassCounts, [3, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0]);
assert.deepEqual(openVoicing.voicing.doublings.map(({ name, count }) => [name, count]), [["C", 3], ["G", 2]]);
assert.equal(openVoicing.primary?.voicingEvidence.rootCount, 3);
assert.equal(openVoicing.primary?.voicingEvidence.rootEmphasized, true);

const repeatedUnison = analyzeChord([60, 60, 64, 67]);
assert.deepEqual(repeatedUnison.notes, [60, 60, 64, 67]);
assert.deepEqual(repeatedUnison.uniqueNotes, [60, 64, 67]);
assert.deepEqual(repeatedUnison.noteNames, ["C4", "C4", "E4", "G4"]);
assert.equal(repeatedUnison.voicing.noteCount, 4);
assert.equal(repeatedUnison.voicing.uniqueNoteCount, 3);
assert.deepEqual(repeatedUnison.voicing.adjacentIntervals, [0, 4, 3]);

const transpositionCases = [
  { intervals: [0, 4, 7], symbol: "" },
  { intervals: [0, 3, 7], symbol: "m" },
  { intervals: [0, 4, 7, 10], symbol: "7" },
  { intervals: [0, 4, 7, 11], symbol: "maj7" },
  { intervals: [0, 3, 6, 10], symbol: "m7b5" },
  { intervals: [0, 4, 7, 10, 1], symbol: "7b9" },
  { intervals: [0, 4, 7, 10, 2, 6, 9], symbol: "13#11" },
  { intervals: [0, 5, 7, 11], symbol: "maj7sus4" },
];

for (let root = 0; root < 12; root += 1) {
  for (const testCase of transpositionCases) {
    const result = analyzeChord(testCase.intervals.map((interval) => 48 + root + interval));
    assert.equal(result.primary?.root, root, `Wrong root after transposing ${testCase.symbol || "major"} to ${root}`);
    assert.equal(result.primary?.symbol, testCase.symbol, `Wrong symbol after transposing root ${root}`);
  }
}

console.log("Chord engine tests passed.");
