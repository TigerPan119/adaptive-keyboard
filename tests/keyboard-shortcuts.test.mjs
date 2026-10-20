import assert from "node:assert/strict";
import { resolveChordShortcut } from "../src/js/chord-theory/keyboard-shortcuts.js";

assert.equal(resolveChordShortcut({ code: "KeyF" }), "fullscreen");
assert.equal(resolveChordShortcut({ key: "f" }), "fullscreen");
assert.equal(resolveChordShortcut({ key: "F" }), "fullscreen");
assert.equal(resolveChordShortcut({ code: "KeyF", controlTarget: true }), null);
assert.equal(resolveChordShortcut({ code: "KeyF", repeat: true }), null);
assert.equal(resolveChordShortcut({ code: "F11" }), null);
assert.equal(resolveChordShortcut({
  code: "Space",
  autoplayEnabled: true,
  hasAutoplaySong: true,
}), "autoplay-toggle");
assert.equal(resolveChordShortcut({
  code: "Space",
  autoplayEnabled: true,
  hasAutoplaySong: true,
  controlTarget: true,
}), null);
assert.equal(resolveChordShortcut({ code: "Space", autoplayEnabled: true }), null);
assert.equal(resolveChordShortcut({ code: "Space", hasAutoplaySong: true }), null);
assert.equal(resolveChordShortcut({ code: "Space", repeat: true, autoplayEnabled: true, hasAutoplaySong: true }), null);

console.log("Keyboard shortcut tests passed.");
