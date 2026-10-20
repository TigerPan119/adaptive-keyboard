export const SHARP_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const FLAT_NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function pitchClass(note) {
  return ((Math.round(note) % 12) + 12) % 12;
}

export function pitchClassName(note, spelling = "sharp") {
  const names = spelling === "flat" ? FLAT_NOTE_NAMES : SHARP_NOTE_NAMES;
  return names[pitchClass(note)];
}

export function noteName(note, spelling = "sharp") {
  const rounded = Math.round(note);
  const octave = Math.floor(rounded / 12) - 1;
  return `${pitchClassName(rounded, spelling)}${octave}`;
}

export function parseNoteValue(value, fallback) {
  const input = String(value).trim().toUpperCase();
  if (!input) return fallback;

  if (/^\d+$/.test(input)) {
    return clamp(Number(input), 0, 127);
  }

  const match = input.match(/^([A-G])([#B]?)(-?\d+)$/);
  if (!match) return fallback;

  const [, letter, accidental, octaveText] = match;
  const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let note = semitones[letter] + (Number(octaveText) + 1) * 12;
  if (accidental === "#") note += 1;
  if (accidental === "B") note -= 1;
  return clamp(note, 0, 127);
}
