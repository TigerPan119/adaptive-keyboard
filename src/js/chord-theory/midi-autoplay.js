const MIDI_PARSER_URL = "https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/+esm";
const SCHEDULER_INTERVAL_MS = 20;
const MIDI_LOOKAHEAD_MS = 120;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createMidiMessage(event, transpose = 0) {
  const channel = clamp(event.channel || 0, 0, 15);
  if (event.type === "noteOn") {
    return [0x90 | channel, clamp(event.note + transpose, 0, 127), clamp(event.velocity, 1, 127)];
  }
  if (event.type === "noteOff") {
    return [0x80 | channel, clamp(event.note + transpose, 0, 127), 0];
  }
  if (event.type === "sustain") {
    return [0xb0 | channel, 64, event.value >= 0.5 ? 127 : 0];
  }
  if (event.type === "program") {
    return [0xc0 | channel, clamp(event.program, 0, 127)];
  }
  return null;
}

export function buildMidiEvents(midi) {
  const events = [];
  midi.tracks.forEach((track, trackIndex) => {
    const channel = clamp(track.channel || 0, 0, 15);
    if (track.notes.length && Number.isFinite(track.instrument?.number)) {
      events.push({ type: "program", time: 0, channel, program: track.instrument.number });
    }
    track.notes.forEach((note, noteIndex) => {
      const source = `autoplay:${trackIndex}:${noteIndex}`;
      const velocity = clamp(Math.round((note.velocity || 0.8) * 127), 1, 127);
      events.push({ type: "noteOn", time: note.time, note: note.midi, velocity, channel, source });
      events.push({ type: "noteOff", time: note.time + note.duration, note: note.midi, channel, source });
    });
    const sustainEvents = track.controlChanges?.[64] || track.controlChanges?.sustain || [];
    sustainEvents.forEach((cc) => {
      events.push({ type: "sustain", time: cc.time, value: cc.value, channel });
    });
  });
  const order = { program: 0, sustain: 1, noteOff: 2, noteOn: 3 };
  events.sort((a, b) => a.time - b.time || order[a.type] - order[b.type]);
  return events;
}

export function buildMidiNoteSpans(events) {
  const active = new Map();
  const spans = [];
  for (const event of events || []) {
    if (event.type === "noteOn") {
      active.set(event.source, event);
      continue;
    }
    if (event.type !== "noteOff") continue;
    const noteOn = active.get(event.source);
    if (!noteOn) continue;
    active.delete(event.source);
    spans.push({
      source: event.source,
      note: noteOn.note,
      velocity: noteOn.velocity,
      start: noteOn.time,
      end: Math.max(noteOn.time + 0.01, event.time),
    });
  }
  return spans.sort((first, second) => first.start - second.start || first.note - second.note);
}

export async function parseMidiFile(file) {
  const { Midi } = await import(MIDI_PARSER_URL);
  const midi = new Midi(await file.arrayBuffer());
  return {
    name: midi.name || file.name.replace(/\.(mid|midi)$/i, ""),
    duration: midi.duration,
    events: buildMidiEvents(midi),
    trackCount: midi.tracks.filter((track) => track.notes.length).length,
  };
}

export class MidiAutoplayController {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.song = null;
    this.output = null;
    this.playing = false;
    this.loop = false;
    this.speed = 1;
    this.transpose = 0;
    this.position = 0;
    this.uiIndex = 0;
    this.outputIndex = 0;
    this.anchorPosition = 0;
    this.anchorTime = 0;
    this.timer = null;
    this.visualTailActive = false;
    this.activeSources = new Map();
    this.activeSustainChannels = new Set();
  }

  load(song) {
    this.stop(false);
    this.song = song;
    this.position = 0;
    this.uiIndex = 0;
    this.outputIndex = 0;
    this.emitProgress();
    this.callbacks.onStateChange?.("ready");
  }

  setOutput(output) {
    if (this.output === output) return;
    this.pause();
    this.output = output || null;
  }

  setLoop(enabled) {
    this.loop = Boolean(enabled);
  }

  setSpeed(value) {
    const wasPlaying = this.playing;
    const position = this.currentPosition();
    if (wasPlaying) this.pause();
    this.speed = clamp(Number(value) || 1, 0.25, 2);
    this.seek(position);
    if (wasPlaying) this.play();
  }

  setTranspose(value) {
    const wasPlaying = this.playing;
    const position = this.currentPosition();
    if (wasPlaying) this.pause();
    this.transpose = clamp(Math.round(Number(value) || 0), -24, 24);
    this.seek(position);
    if (wasPlaying) this.play();
  }

  play() {
    if (!this.song || !this.output || this.playing) return false;
    const playbackEnd = this.playbackEndPosition();
    if (this.position >= playbackEnd || (this.position >= this.song.duration && !this.visualTailActive)) this.seek(0);
    this.playing = true;
    this.uiIndex = this.firstEventAfter(this.position);
    this.outputIndex = this.uiIndex;
    this.anchorPosition = this.position;
    this.anchorTime = performance.now();
    if (this.visualTailActive) {
      this.uiIndex = this.song.events.length;
      this.outputIndex = this.song.events.length;
    } else {
      this.rebuildAtPosition(this.position, true);
    }
    this.timer = setInterval(() => this.tick(), SCHEDULER_INTERVAL_MS);
    this.tick();
    this.callbacks.onStateChange?.("playing");
    return true;
  }

  pause() {
    if (!this.playing) return;
    this.position = this.currentPosition();
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    this.silence();
    this.callbacks.onStateChange?.("paused");
    this.emitProgress();
  }

  stop(notify = true) {
    this.playing = false;
    this.visualTailActive = false;
    clearInterval(this.timer);
    this.timer = null;
    this.silence();
    this.position = 0;
    this.uiIndex = 0;
    this.outputIndex = 0;
    this.emitProgress();
    if (notify) this.callbacks.onStateChange?.(this.song ? "ready" : "empty");
  }

  seek(seconds) {
    if (!this.song) return;
    const wasPlaying = this.playing;
    if (wasPlaying) {
      this.playing = false;
      clearInterval(this.timer);
      this.timer = null;
    }
    this.silence();
    this.visualTailActive = false;
    this.position = clamp(Number(seconds) || 0, 0, this.song.duration);
    this.uiIndex = this.firstEventAfter(this.position);
    this.outputIndex = this.uiIndex;
    if (wasPlaying) {
      this.playing = true;
      this.anchorPosition = this.position;
      this.anchorTime = performance.now();
      this.rebuildAtPosition(this.position, true);
      this.timer = setInterval(() => this.tick(), SCHEDULER_INTERVAL_MS);
      this.tick();
    }
    this.emitProgress();
  }

  currentPosition() {
    if (!this.playing) return this.position;
    return clamp(
      this.anchorPosition + ((performance.now() - this.anchorTime) / 1000) * this.speed,
      0,
      this.playbackEndPosition(),
    );
  }

  playbackEndPosition() {
    const duration = this.song?.duration || 0;
    if (!this.song || this.loop) return duration;
    const requestedEnd = Number(this.callbacks.getEndPosition?.(duration, this.speed));
    return Number.isFinite(requestedEnd) ? Math.max(duration, requestedEnd) : duration;
  }

  firstEventAfter(position) {
    const events = this.song?.events || [];
    let low = 0;
    let high = events.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (events[mid].time <= position) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  rebuildAtPosition(position, sendOutput) {
    if (!this.song) return;
    const noteOns = new Map();
    const sustainedNotes = new Map();
    const sustain = new Map();
    for (const event of this.song.events) {
      if (event.time > position) break;
      if (event.type === "noteOn") noteOns.set(event.source, event);
      else if (event.type === "noteOff") {
        const noteOn = noteOns.get(event.source);
        if (noteOn && sustain.get(event.channel)) sustainedNotes.set(event.source, noteOn);
        noteOns.delete(event.source);
      } else if (event.type === "sustain") {
        const enabled = event.value >= 0.5;
        sustain.set(event.channel, enabled);
        if (!enabled) {
          for (const [source, note] of sustainedNotes) {
            if (note.channel === event.channel) sustainedNotes.delete(source);
          }
        }
      }
      else if (event.type === "program" && sendOutput) this.sendNow(event);
    }
    for (const [channel, enabled] of sustain) {
      if (!enabled) continue;
      const event = { type: "sustain", channel, value: 1 };
      this.dispatchUi(event);
      if (sendOutput) this.sendNow(event);
    }
    for (const event of noteOns.values()) {
      this.dispatchUi(event);
      if (sendOutput) this.sendNow(event);
    }
    for (const event of sustainedNotes.values()) {
      const noteOff = { ...event, type: "noteOff" };
      this.dispatchUi(event);
      this.dispatchUi(noteOff);
      if (sendOutput) {
        this.sendNow(event);
        this.sendNow(noteOff);
      }
    }
  }

  tick() {
    if (!this.playing || !this.song) return;
    const now = performance.now();
    const position = this.currentPosition();
    const uiHorizon = position + 0.012 * this.speed;
    const outputHorizon = position + (MIDI_LOOKAHEAD_MS / 1000) * this.speed;

    while (this.uiIndex < this.song.events.length && this.song.events[this.uiIndex].time <= uiHorizon) {
      this.dispatchUi(this.song.events[this.uiIndex]);
      this.uiIndex += 1;
    }
    while (this.outputIndex < this.song.events.length && this.song.events[this.outputIndex].time <= outputHorizon) {
      const event = this.song.events[this.outputIndex];
      const timestamp = this.anchorTime + ((event.time - this.anchorPosition) / this.speed) * 1000;
      const message = createMidiMessage(event, this.transpose);
      if (message) this.output?.send(message, Math.max(now, timestamp));
      this.outputIndex += 1;
    }

    this.position = position;
    this.emitProgress();
    const playbackEnd = this.playbackEndPosition();
    if (!this.loop && !this.visualTailActive && position >= this.song.duration && playbackEnd > this.song.duration) {
      this.visualTailActive = true;
      this.silence();
    }
    if (position >= playbackEnd) this.finish();
  }

  finish() {
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    this.silence();
    if (this.loop) {
      this.visualTailActive = false;
      this.position = 0;
      this.uiIndex = 0;
      this.outputIndex = 0;
      this.play();
      return;
    }
    this.position = this.playbackEndPosition();
    this.visualTailActive = false;
    this.emitProgress();
    this.callbacks.onStateChange?.("ended");
  }

  dispatchUi(event) {
    const note = event.note === undefined ? undefined : clamp(event.note + this.transpose, 0, 127);
    if (event.type === "noteOn") {
      this.activeSources.set(event.source, note);
      this.callbacks.onNoteOn?.(note, event.velocity, event.source);
    } else if (event.type === "noteOff") {
      const activeNote = this.activeSources.get(event.source) ?? note;
      this.activeSources.delete(event.source);
      this.callbacks.onNoteOff?.(activeNote, event.source);
    } else if (event.type === "sustain") {
      const enabled = event.value >= 0.5;
      if (enabled) this.activeSustainChannels.add(event.channel);
      else this.activeSustainChannels.delete(event.channel);
      this.callbacks.onSustain?.(this.activeSustainChannels.size > 0);
    }
  }

  sendNow(event) {
    const message = createMidiMessage(event, this.transpose);
    if (message) this.output?.send(message);
  }

  silence() {
    this.output?.clear?.();
    if (this.output) {
      for (let channel = 0; channel < 16; channel += 1) {
        this.output.send([0xb0 | channel, 64, 0]);
        this.output.send([0xb0 | channel, 123, 0]);
      }
    }
    for (const [source, note] of this.activeSources) this.callbacks.onNoteOff?.(note, source);
    this.activeSources.clear();
    this.activeSustainChannels.clear();
    this.callbacks.onSustain?.(false);
  }

  emitProgress() {
    const duration = this.song?.duration || 0;
    this.callbacks.onProgress?.(Math.min(this.position, duration), duration);
  }
}
