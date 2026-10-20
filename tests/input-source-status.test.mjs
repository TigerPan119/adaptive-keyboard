import assert from "node:assert/strict";
import { resolveInputSourceStatus } from "../src/js/chord-theory/input-source-status.js";

assert.deepEqual(resolveInputSourceStatus().label, "Screen keyboard");
assert.equal(resolveInputSourceStatus({ midiInputName: "Roland FP-60X" }).label, "Roland FP-60X");
assert.equal(
  resolveInputSourceStatus({ autoplayEnabled: true, midiInputName: "Roland FP-60X" }).label,
  "Autoplay",
  "Autoplay should take priority while it is the active input mode.",
);
assert.equal(
  resolveInputSourceStatus({ midiFallbackMessage: "MIDI unavailable." }).help,
  "MIDI unavailable.",
);

console.log("Input source status tests passed.");
