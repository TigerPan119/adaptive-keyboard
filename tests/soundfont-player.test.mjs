import assert from "node:assert/strict";
import {
  firstSoundFontFile,
  isSoundFontFile,
  presetBank,
  presetLabel,
  presetProgram,
  sortPresets,
  SoundFontPlayer,
} from "../src/js/soundfont-player.js";

const piano = { bank: 0, program: 1, name: "Piano" };
const bass = { bankNumber: 1, programNumber: 4, presetName: "Bass" };

assert.equal(presetBank(bass), 1);
assert.equal(presetProgram(bass), 4);
assert.equal(presetLabel(piano), "0:1 Piano");
assert.deepEqual(sortPresets([bass, piano]), [piano, bass]);
assert.equal(isSoundFontFile({ name: "instrument.SF2" }), true);
assert.equal(isSoundFontFile({ name: "notes.txt" }), false);
assert.equal(firstSoundFontFile([{ name: "notes.txt" }, { name: "keys.sf3" }]).name, "keys.sf3");

const messages = [];
const player = new SoundFontPlayer({ volume: 3 });
player.synth = {
  controllerChange: (...args) => messages.push(["cc", ...args]),
  programChange: (...args) => messages.push(["program", ...args]),
};
player.applyPreset(2, { bank: 130, program: 9 }, 127);

assert.deepEqual(messages, [
  ["cc", 2, 0, 1],
  ["cc", 2, 32, 2],
  ["program", 2, 9],
  ["cc", 2, 64, 127],
]);

console.log("SoundFont player tests passed.");
