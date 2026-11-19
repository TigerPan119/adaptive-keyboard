import assert from "node:assert/strict";
import { test } from "node:test";

test("Hand Split merges both pedals and restores each channel level after preset or MIDI resets", async (t) => {
  const elements = new Map();
  globalThis.document = {
    getElementById(id) {
      if (id === "cameraStep") return null;
      if (!elements.has(id)) {
        elements.set(id, {
          getContext: () => ({}),
          dataset: {},
          selectedOptions: [{ dataset: { bank: "0", program: "16" } }],
          classList: { contains: () => false },
        });
      }
      return elements.get(id);
    },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  t.after(() => { delete globalThis.document; });

  const { el, state } = await import("../src/js/core.js");
  const { applySelectedPresets, handleAllNotesOff, handleSustainPedal, setChannelVolume, setVirtualSustain } =
    await import("../src/js/audio.js");
  const { connectMidiInput } = await import("../src/js/midi.js");

  // The controls can be operated while the SoundFont is still loading.
  setVirtualSustain(true);
  setChannelVolume(0, 42);
  setChannelVolume(1, 78);
  const controls = [];
  state.sfSynth = {
    controllerChange(...change) { controls.push(change); },
    programChange() {},
  };
  state.soundFontLoaded = true;
  applySelectedPresets();
  assert.deepEqual(controls.filter(([, cc]) => cc === 7), [[0, 7, 42], [1, 7, 78]]);
  assert.deepEqual(controls.filter(([, cc]) => cc === 64), [[0, 64, 127], [1, 64, 127]]);

  controls.length = 0;
  handleSustainPedal(91);
  assert.deepEqual(controls, []);
  setVirtualSustain(false);
  assert.deepEqual(controls, [[0, 64, 91], [1, 64, 91]]);
  assert.equal(el.sustainPedalBtn.dataset.active, "true");

  setVirtualSustain(true);
  controls.length = 0;
  handleSustainPedal(0);
  assert.deepEqual(controls, []);
  setVirtualSustain(false);
  assert.deepEqual(controls, [[0, 64, 0], [1, 64, 0]]);
  assert.equal(el.sustainPedalBtn.dataset.active, "false");

  controls.length = 0;
  setChannelVolume(1, 0);
  assert.deepEqual(controls, [[1, 7, 0]]);
  assert.equal(state.soundFontVolume, 3);
  setVirtualSustain(true);
  handleAllNotesOff(121, 0);
  assert.deepEqual(controls.slice(-4), [[0, 64, 127], [1, 64, 127], [0, 7, 42], [1, 7, 0]]);

  const input = { id: "keyboard" };
  state.midiAccess = { inputs: new Map([[input.id, input]]) };
  connectMidiInput(input.id);
  input.onmidimessage({ data: [0xb0, 64, 127] });
  connectMidiInput("");
  assert.equal(input.onmidimessage, null);
  assert.equal(state.midiSustainValue, 0);
  assert.equal(state.sustainValue, 127);
  setVirtualSustain(false);
  assert.equal(state.sustainValue, 0);
});
