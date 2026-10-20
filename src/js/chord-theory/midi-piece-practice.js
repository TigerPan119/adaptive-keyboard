const PRACTICE_SCHEDULER_INTERVAL_MS = 16;
const EVENT_TIME_EPSILON = 0.001;
const EARLY_JUMP_MINIMUM_LEAD_SECONDS = 0.06;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function eventGroupAt(events, startIndex) {
  const first = events?.[startIndex];
  if (!first) return { endIndex: startIndex, events: [], time: 0 };
  let endIndex = startIndex + 1;
  while (
    endIndex < events.length
    && Math.abs(events[endIndex].time - first.time) <= EVENT_TIME_EPSILON
  ) {
    endIndex += 1;
  }
  return { endIndex, events: events.slice(startIndex, endIndex), time: first.time };
}

export function requiredNotesForGroup(events, transpose = 0) {
  return [...new Set((events || [])
    .filter((event) => event.type === "noteOn")
    .map((event) => clamp(event.note + transpose, 0, 127)))]
    .sort((first, second) => first - second);
}

export function heldNotesSatisfy(requiredNotes, heldNotes) {
  const held = heldNotes instanceof Set ? heldNotes : new Set(heldNotes || []);
  return (requiredNotes || []).every((note) => held.has(note));
}

export function upcomingGuideNotes(noteSpans, position, horizon) {
  return new Set(upcomingGuideLevels(noteSpans, position, horizon).keys());
}

export function upcomingGuideLevels(noteSpans, position, horizon) {
  const spans = noteSpans || [];
  const start = Math.max(0, Number(position) || 0);
  const end = Math.max(start, Number(horizon) || start);
  const range = Math.max(EVENT_TIME_EPSILON, end - start);
  let low = 0;
  let high = spans.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (spans[middle].start < start - EVENT_TIME_EPSILON) low = middle + 1;
    else high = middle;
  }

  const levels = new Map();
  for (let index = low; index < spans.length; index += 1) {
    const span = spans[index];
    if (span.start > end + EVENT_TIME_EPSILON) break;
    const note = clamp(span.note, 0, 127);
    const level = clamp(1 - (span.start - start) / range, 0, 1);
    levels.set(note, Math.max(levels.get(note) || 0, level));
  }
  return levels;
}

export function findUpcomingNoteTime(
  noteSpans,
  note,
  position,
  horizon,
  minimumLead = EARLY_JUMP_MINIMUM_LEAD_SECONDS,
) {
  const spans = noteSpans || [];
  const targetNote = clamp(Number(note) || 0, 0, 127);
  const start = Math.max(0, Number(position) || 0);
  const end = Math.max(start, Number(horizon) || start);
  const lead = Math.max(0, Number(minimumLead) || 0);
  let low = 0;
  let high = spans.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (spans[middle].start < start - EVENT_TIME_EPSILON) low = middle + 1;
    else high = middle;
  }

  for (let index = low; index < spans.length; index += 1) {
    const span = spans[index];
    if (span.start > end + EVENT_TIME_EPSILON) break;
    if (clamp(span.note, 0, 127) !== targetNote) continue;
    if (span.start <= start + lead) return null;
    return span.start;
  }
  return null;
}

export class MidiPiecePracticeController {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.song = null;
    this.playing = false;
    this.waiting = null;
    this.speed = 1;
    this.transpose = 0;
    this.position = 0;
    this.eventIndex = 0;
    this.anchorPosition = 0;
    this.anchorTime = 0;
    this.timer = null;
  }

  load(song) {
    this.stop(false);
    this.song = song;
    this.emitProgress();
    this.callbacks.onStateChange?.("ready");
  }

  play() {
    if (!this.song || this.playing || this.waiting) return false;
    if (this.position >= this.song.duration) this.seek(0);
    this.playing = true;
    this.anchorPosition = this.position;
    this.anchorTime = performance.now();
    this.timer = setInterval(() => this.tick(), PRACTICE_SCHEDULER_INTERVAL_MS);
    this.callbacks.onStateChange?.("playing");
    this.tick();
    return true;
  }

  pause() {
    if (!this.playing && !this.waiting) return;
    if (this.playing) this.position = this.currentPosition();
    this.playing = false;
    this.waiting = null;
    clearInterval(this.timer);
    this.timer = null;
    this.eventIndex = this.firstEventAtOrAfter(this.position);
    this.emitProgress();
    this.callbacks.onStateChange?.("paused");
  }

  stop(notify = true) {
    this.playing = false;
    this.waiting = null;
    clearInterval(this.timer);
    this.timer = null;
    this.position = 0;
    this.eventIndex = 0;
    this.emitProgress();
    if (notify) this.callbacks.onStateChange?.(this.song ? "ready" : "empty");
  }

  seek(seconds) {
    if (!this.song) return;
    const resume = this.playing;
    this.playing = false;
    this.waiting = null;
    clearInterval(this.timer);
    this.timer = null;
    this.position = clamp(Number(seconds) || 0, 0, this.song.duration);
    this.eventIndex = this.firstEventAtOrAfter(this.position);
    this.emitProgress();
    if (resume) this.play();
  }

  setSpeed(value) {
    const resume = this.playing;
    const position = this.currentPosition();
    if (resume) this.pause();
    this.speed = clamp(Number(value) || 1, 0.25, 2);
    this.seek(position);
    if (resume) this.play();
  }

  currentPosition() {
    if (!this.playing) return this.position;
    return clamp(
      this.anchorPosition + ((performance.now() - this.anchorTime) / 1000) * this.speed,
      0,
      this.song?.duration || 0,
    );
  }

  firstEventAtOrAfter(position) {
    const events = this.song?.events || [];
    let low = 0;
    let high = events.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (events[middle].time < position - EVENT_TIME_EPSILON) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  tick() {
    if (!this.playing || !this.song) return;
    this.advanceTo(this.currentPosition(), this.callbacks.getHeldNotes?.());
  }

  advanceTo(targetPosition, heldNotes = new Set()) {
    if (!this.song || this.waiting) return false;
    const events = this.song.events || [];
    const target = clamp(Number(targetPosition) || 0, this.position, this.song.duration);

    while (this.eventIndex < events.length) {
      const group = eventGroupAt(events, this.eventIndex);
      if (group.time > target + EVENT_TIME_EPSILON) break;
      const requiredNotes = requiredNotesForGroup(group.events, this.transpose);
      if (requiredNotes.length && !heldNotesSatisfy(requiredNotes, heldNotes)) {
        this.position = group.time;
        this.playing = false;
        clearInterval(this.timer);
        this.timer = null;
        this.waiting = { ...group, requiredNotes };
        this.emitProgress();
        this.callbacks.onWait?.(requiredNotes, group.time);
        this.callbacks.onStateChange?.("waiting");
        return false;
      }
      this.eventIndex = group.endIndex;
      if (requiredNotes.length) this.callbacks.onGatePassed?.(requiredNotes, group.time);
    }

    this.position = target;
    this.emitProgress();
    if (this.position >= this.song.duration) this.finish();
    return true;
  }

  acceptHeldNotes(heldNotes) {
    if (!this.waiting || !heldNotesSatisfy(this.waiting.requiredNotes, heldNotes)) return false;
    const passed = this.waiting;
    this.waiting = null;
    this.eventIndex = passed.endIndex;
    this.callbacks.onGatePassed?.(passed.requiredNotes, passed.time);
    this.playing = true;
    this.anchorPosition = this.position;
    this.anchorTime = performance.now();
    this.timer = setInterval(() => this.tick(), PRACTICE_SCHEDULER_INTERVAL_MS);
    this.callbacks.onStateChange?.("playing");
    this.tick();
    return true;
  }

  finish() {
    this.playing = false;
    this.waiting = null;
    clearInterval(this.timer);
    this.timer = null;
    this.position = this.song?.duration || 0;
    this.emitProgress();
    this.callbacks.onStateChange?.("ended");
  }

  emitProgress() {
    this.callbacks.onProgress?.(this.position, this.song?.duration || 0);
  }
}
