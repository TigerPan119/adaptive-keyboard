import assert from "node:assert/strict";
import {
  buildMidiEvents,
  buildMidiNoteSpans,
  createMidiMessage,
  MidiAutoplayController,
} from "../src/js/chord-theory/midi-autoplay.js";

const midi = {
  tracks: [
    {
      channel: 2,
      instrument: { number: 4 },
      notes: [
        { midi: 60, time: 0, duration: 1, velocity: 0.5 },
        { midi: 62, time: 1, duration: 0.5, velocity: 1 },
      ],
      controlChanges: { 64: [{ time: 0.5, value: 1 }, { time: 1.25, value: 0 }] },
    },
  ],
};

const events = buildMidiEvents(midi);
assert.deepEqual(events.map((event) => event.type), [
  "program",
  "noteOn",
  "sustain",
  "noteOff",
  "noteOn",
  "sustain",
  "noteOff",
]);
assert.equal(events[1].velocity, 64);
assert.equal(events[1].source, events[3].source);
assert.notEqual(events[1].source, events[4].source);

const noteSpans = buildMidiNoteSpans(events);
assert.deepEqual(noteSpans.map(({ note, start, end }) => ({ note, start, end })), [
  { note: 60, start: 0, end: 1 },
  { note: 62, start: 1, end: 1.5 },
]);

const overlappingEvents = buildMidiEvents({
  tracks: [{
    channel: 0,
    instrument: {},
    notes: [
      { midi: 60, time: 0, duration: 1, velocity: 0.7 },
      { midi: 60, time: 0.5, duration: 1, velocity: 0.8 },
    ],
    controlChanges: {},
  }],
});
assert.deepEqual(overlappingEvents.map((event) => event.type), ["noteOn", "noteOn", "noteOff", "noteOff"]);
assert.notEqual(overlappingEvents[0].source, overlappingEvents[1].source);
assert.equal(overlappingEvents[0].note, overlappingEvents[1].note);

assert.deepEqual(createMidiMessage(events[1], 12), [0x92, 72, 64]);
assert.deepEqual(createMidiMessage(events[3], 12), [0x82, 72, 0]);
assert.deepEqual(createMidiMessage(events[2]), [0xb2, 64, 127]);
assert.deepEqual(createMidiMessage(events[0]), [0xc2, 4]);
assert.deepEqual(createMidiMessage({ type: "noteOn", channel: 0, note: 125, velocity: 100 }, 12), [0x90, 127, 100]);

const sent = [];
const visualEvents = [];
const player = new MidiAutoplayController({
  onNoteOn: (note) => visualEvents.push(`on:${note}`),
  onNoteOff: (note) => visualEvents.push(`off:${note}`),
});
player.setOutput({
  send: (message) => sent.push(message),
  clear: () => {},
});
player.load({
  duration: 0.06,
  events: [
    { type: "noteOn", time: 0, note: 60, velocity: 100, channel: 0, source: "test:0" },
    { type: "noteOff", time: 0.05, note: 60, channel: 0, source: "test:0" },
  ],
});
assert.equal(player.play(), true);
await new Promise((resolve) => setTimeout(resolve, 100));
assert.equal(player.playing, false);
assert.deepEqual(visualEvents.slice(0, 2), ["on:60", "off:60"]);
assert.ok(sent.some((message) => message[0] === 0x90 && message[1] === 60));
assert.ok(sent.some((message) => message[0] === 0x80 && message[1] === 60));

const tailStates = [];
const tailPlayer = new MidiAutoplayController({
  getEndPosition: () => 0.14,
  onStateChange: (status) => tailStates.push(status),
});
tailPlayer.setOutput({ send() {}, clear() {} });
tailPlayer.load({
  duration: 0.04,
  events: [
    { type: "noteOn", time: 0, note: 60, velocity: 100, channel: 0, source: "tail:0" },
    { type: "noteOff", time: 0.03, note: 60, channel: 0, source: "tail:0" },
  ],
});
assert.equal(tailPlayer.play(), true);
await new Promise((resolve) => setTimeout(resolve, 75));
assert.equal(tailPlayer.playing, true, "Playback should remain active while the Roll tail exits.");
assert.equal(tailPlayer.visualTailActive, true);
await new Promise((resolve) => setTimeout(resolve, 110));
assert.equal(tailPlayer.playing, false);
assert.equal(tailStates.at(-1), "ended");

console.log("MIDI autoplay tests passed.");
