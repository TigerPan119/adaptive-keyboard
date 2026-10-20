import assert from "node:assert/strict";
import {
  createEarTrainingQuestion,
  matchesEarTrainingAnswer,
  normalizeEarTrainingDifficulty,
  normalizeEarTrainingQualities,
  pitchClassSignature,
} from "../src/js/chord-theory/ear-training.js";

assert.equal(normalizeEarTrainingDifficulty("medium"), "medium");
assert.equal(normalizeEarTrainingDifficulty("custom"), "custom");
assert.equal(normalizeEarTrainingDifficulty("unknown"), "easy");
assert.deepEqual(normalizeEarTrainingQualities(["sus4", "invalid", "sus4"]), ["sus4"]);
assert.deepEqual(normalizeEarTrainingQualities([]), ["major", "minor"]);

const easyQuestion = createEarTrainingQuestion("easy", { random: () => 0 });
assert.equal(easyQuestion.qualityId, "major");
assert.equal(easyQuestion.inversion, 0);
assert.deepEqual(easyQuestion.notes, [48, 52, 55]);
assert.equal(matchesEarTrainingAnswer([48, 52, 55], easyQuestion), true);
assert.equal(matchesEarTrainingAnswer([60, 64, 67, 72], easyQuestion), true);
assert.equal(matchesEarTrainingAnswer([52, 55, 60], easyQuestion), true);
assert.equal(matchesEarTrainingAnswer([48, 51, 55], easyQuestion), false);
assert.equal(matchesEarTrainingAnswer([48, 52, 55, 58], easyQuestion), false);
assert.equal(pitchClassSignature([72, 60, 64, 67, 60]), "0,4,7");

const advancedQuestion = createEarTrainingQuestion("advanced", { random: () => 0.999 });
assert.equal(advancedQuestion.qualityId, "diminished7");
assert.equal(advancedQuestion.notes.length, 4);
assert.ok(advancedQuestion.inversion > 0);

const customQuestion = createEarTrainingQuestion("custom", {
  qualityIds: ["sus4"],
  random: () => 0.999,
});
assert.equal(customQuestion.qualityId, "sus4");
assert.equal(customQuestion.rootPitchClass, 11);
assert.equal(customQuestion.inversion, 2);

const rootPositionCustomQuestion = createEarTrainingQuestion("custom", {
  qualityIds: ["diminished7"],
  allowInversions: false,
  random: () => 0.999,
});
assert.equal(rootPositionCustomQuestion.qualityId, "diminished7");
assert.equal(rootPositionCustomQuestion.inversion, 0);
assert.deepEqual(rootPositionCustomQuestion.pitchClasses, [2, 5, 8, 11]);

for (const [qualityId, pitchClasses] of [
  ["minorMajor7", [0, 3, 7, 11]],
  ["augmented7", [0, 4, 8, 10]],
  ["augmentedMajor7", [0, 4, 8, 11]],
  ["dominant7Sus4", [0, 5, 7, 10]],
]) {
  const question = createEarTrainingQuestion("custom", {
    qualityIds: [qualityId],
    allowInversions: false,
    random: () => 0,
  });
  assert.equal(question.qualityId, qualityId);
  assert.deepEqual(question.pitchClasses, pitchClasses);
}

console.log("Ear training tests passed.");
