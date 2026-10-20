import assert from "node:assert/strict";
import {
  eventGroupAt,
  findUpcomingNoteTime,
  heldNotesSatisfy,
  MidiPiecePracticeController,
  requiredNotesForGroup,
  upcomingGuideLevels,
  upcomingGuideNotes,
} from "../src/js/chord-theory/midi-piece-practice.js";

const events = [
  { type: "noteOn", time: 1, note: 60 },
  { type: "noteOn", time: 1, note: 64 },
  { type: "noteOff", time: 2, note: 60 },
  { type: "noteOff", time: 2, note: 64 },
];

const firstGroup = eventGroupAt(events, 0);
assert.equal(firstGroup.endIndex, 2);
assert.deepEqual(requiredNotesForGroup(firstGroup.events), [60, 64]);
assert.equal(heldNotesSatisfy([60, 64], new Set([60, 64, 67])), true);
assert.equal(heldNotesSatisfy([60, 64], new Set([60])), false);
assert.deepEqual(
  [...upcomingGuideNotes([
    { note: 48, start: 0.5 },
    { note: 60, start: 1 },
    { note: 64, start: 1 },
    { note: 67, start: 4.5 },
  ], 1, 4)],
  [60, 64],
);
const guideLevels = upcomingGuideLevels([
  { note: 60, start: 1 },
  { note: 64, start: 3 },
  { note: 64, start: 4 },
], 1, 5);
assert.equal(guideLevels.get(60), 1);
assert.equal(guideLevels.get(64), 0.5);
assert.equal(findUpcomingNoteTime([
  { note: 60, start: 1 },
  { note: 64, start: 2.25 },
  { note: 60, start: 3 },
], 60, 1, 4), null);
assert.equal(findUpcomingNoteTime([
  { note: 60, start: 1 },
  { note: 64, start: 2.25 },
], 67, 1, 4), null);
assert.equal(findUpcomingNoteTime([
  { note: 60, start: 1 },
  { note: 60, start: 3 },
], 60, 0.97, 4), null);
assert.equal(findUpcomingNoteTime([
  { note: 60, start: 1 },
  { note: 60, start: 3 },
], 60, 1.1, 4), 3);

const states = [];
const waits = [];
const passed = [];
const controller = new MidiPiecePracticeController({
  onStateChange: (state) => states.push(state),
  onWait: (notes) => waits.push(notes),
  onGatePassed: (notes) => passed.push(notes),
  getHeldNotes: () => new Set([60, 64]),
});
controller.load({ duration: 3, events });
assert.equal(controller.advanceTo(1.5, new Set([60])), false);
assert.deepEqual(waits, [[60, 64]]);
assert.equal(controller.position, 1);
assert.equal(controller.waiting.requiredNotes.join(","), "60,64");
assert.equal(controller.acceptHeldNotes(new Set([60, 64])), true);
controller.pause();
assert.deepEqual(passed, [[60, 64]]);

const waitingController = new MidiPiecePracticeController();
waitingController.load({ duration: 3, events });
waitingController.advanceTo(1.5, new Set([60]));
waitingController.pause();
assert.equal(waitingController.waiting, null);
assert.equal(waitingController.eventIndex, 0);

const preHeldController = new MidiPiecePracticeController();
preHeldController.load({ duration: 3, events });
assert.equal(preHeldController.advanceTo(1.5, new Set([60, 64])), true);
assert.equal(preHeldController.position, 1.5);
assert.equal(preHeldController.waiting, null);

console.log("MIDI piece practice tests passed.");
