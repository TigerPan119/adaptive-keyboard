import { el, state } from "./core.js";
import { clamp, noteName, parseNoteValue } from "./music.js";

export { clamp, noteName, parseNoteValue } from "./music.js";

export function getKeyboardRange() {
  const low = parseNoteValue(el.lowNoteInput.value, 21);
  const high = parseNoteValue(el.highNoteInput.value, 108);
  return low < high ? { low, high } : { low: high, high: low };
}


export function keyboardReady() {
  return Number.isFinite(state.keyboardLeftX) && Number.isFinite(state.keyboardRightX);
}

export function toViewX(sourceX) {
  return state.mirrorCamera ? el.overlay.width - sourceX : sourceX;
}

export function xToNote(x) {
  if (!keyboardReady()) return null;
  const { low, high } = getKeyboardRange();
  const left = Math.min(state.keyboardLeftX, state.keyboardRightX);
  const right = Math.max(state.keyboardLeftX, state.keyboardRightX);
  const ratio = clamp((x - left) / Math.max(1, right - left), 0, 1);
  return low + ratio * (high - low);
}

export function noteToX(note) {
  if (!keyboardReady()) return null;
  const { low, high } = getKeyboardRange();
  const left = Math.min(state.keyboardLeftX, state.keyboardRightX);
  const right = Math.max(state.keyboardLeftX, state.keyboardRightX);
  const ratio = clamp((note - low) / Math.max(1, high - low), 0, 1);
  return left + ratio * (right - left);
}

export function updateSplit() {
  if (!state.leftHand || !state.rightHand || !keyboardReady()) {
    state.rawSplit = null;
    return;
  }

  const leftNote = xToNote(state.leftHand.x);
  const rightNote = xToNote(state.rightHand.x);
  state.leftHand.note = leftNote;
  state.rightHand.note = rightNote;
  state.rawSplit = (leftNote + rightNote) / 2;

  if (state.smoothedSplit === null) {
    state.smoothedSplit = state.rawSplit;
  } else {
    const hold = Number(el.smoothingInput.value);
    state.smoothedSplit = state.smoothedSplit * hold + state.rawSplit * (1 - hold);
  }
}
