import { el, state } from "./core.js";
import { handleAllNotesOff, handleSustainPedal, playNote, releaseNote } from "./audio.js";
import { getKeyboardRange, noteName } from "./keyboard.js";
import { setMidiLearnMessage, setStatus, syncMidiLearnUI } from "./ui.js";

const MIDI_LEARN_TIMEOUT_MS = 10000;
const midiHooks = { onLearnedNote: null };

export function configureMidi(hooks) {
  Object.assign(midiHooks, hooks);
}

function clearMidiLearnTimers() {
  if (state.midiLearnTimeoutId) clearTimeout(state.midiLearnTimeoutId);
  if (state.midiLearnIntervalId) clearInterval(state.midiLearnIntervalId);
  state.midiLearnTimeoutId = null;
  state.midiLearnIntervalId = null;
}

function updateMidiLearnCountdown() {
  if (!state.midiLearnTarget) return;
  const secondsRemaining = Math.max(1, Math.ceil((state.midiLearnDeadline - Date.now()) / 1000));
  syncMidiLearnUI(state.midiLearnTarget, secondsRemaining);
}

export function cancelMidiLearn(message = "", kind = "muted") {
  clearMidiLearnTimers();
  state.midiLearnTarget = null;
  state.midiLearnDeadline = 0;
  syncMidiLearnUI();
  setMidiLearnMessage(message, kind);
}

export function beginMidiLearn(target) {
  if (!["low", "high"].includes(target)) return;
  if (state.midiLearnTarget === target) {
    cancelMidiLearn("MIDI learn cancelled.");
    return;
  }

  clearMidiLearnTimers();
  state.midiLearnTarget = target;
  state.midiLearnDeadline = Date.now() + MIDI_LEARN_TIMEOUT_MS;
  updateMidiLearnCountdown();
  state.midiLearnIntervalId = setInterval(updateMidiLearnCountdown, 250);
  state.midiLearnTimeoutId = setTimeout(() => {
    cancelMidiLearn("MIDI learn timed out. No note was changed.", "warn");
  }, MIDI_LEARN_TIMEOUT_MS);
}

function learnMidiNote(note) {
  const target = state.midiLearnTarget;
  if (!target) return;
  const fieldName = target === "low" ? "Lowest note" : "Highest note";
  midiHooks.onLearnedNote?.(target, note);
  cancelMidiLearn(`${fieldName} learned: ${noteName(note)}.`, "ok");
}

export function routeNoteOn(note, velocity) {
  const { low, high } = getKeyboardRange();
  const split = state.smoothedSplit ?? (low + high) / 2;

  const side = note < Math.round(split) ? "left" : "right";
  const didPlay = playNote(note, velocity, side);
  if (!state.diagnosticsPaused) el.lastNoteReadout.textContent = `${noteName(note)} (${note})`;
  if (didPlay) {
    const fallbackText = state.smoothedSplit === null ? " (fallback split)" : "";
    if (!state.diagnosticsPaused) {
      el.routeReadout.textContent = side === "left" ? `Left sound${fallbackText}` : `Right sound${fallbackText}`;
    }
  }
}

function handleMidiMessage(event) {
  const [status, note, velocity] = event.data;
  const command = status & 0xf0;

  if (command === 0x90 && velocity > 0) {
    learnMidiNote(note);
    if (!state.diagnosticsPaused) setStatus(el.lastMidiStatus, `MIDI ${noteName(note)} on`, "ok");
    routeNoteOn(note, velocity);
  } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
    if (!state.diagnosticsPaused) setStatus(el.lastMidiStatus, `MIDI ${noteName(note)} off`, "muted");
    releaseNote(note);
  } else if (command === 0xb0 && note === 64) {
    if (!state.diagnosticsPaused) setStatus(el.lastMidiStatus, `MIDI sustain ${velocity}`, velocity >= 64 ? "ok" : "muted");
    handleSustainPedal(velocity);
  } else if (command === 0xb0 && (note === 120 || note === 121 || note === 123)) {
    if (!state.diagnosticsPaused) setStatus(el.lastMidiStatus, `MIDI CC${note}`, "warn");
    handleAllNotesOff(note, velocity);
  }
}

export function refreshMidiInputs() {
  if (!state.midiAccess) return;
  const inputs = [...state.midiAccess.inputs.values()];
  el.midiInputSelect.innerHTML = "";

  if (!inputs.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No MIDI inputs found";
    el.midiInputSelect.append(option);
    setStatus(el.midiStatus, "No MIDI input", "warn");
    return;
  }

  inputs.forEach((input) => {
    const option = document.createElement("option");
    option.value = input.id;
    option.textContent = input.name || input.id;
    el.midiInputSelect.append(option);
  });

  connectMidiInput(inputs[0].id);
  setStatus(el.midiStatus, `${inputs.length} MIDI input${inputs.length === 1 ? "" : "s"}`, "ok");
}

export function connectMidiInput(id) {
  if (!state.midiAccess) return;
  if (state.selectedMidiInput) state.selectedMidiInput.onmidimessage = null;
  state.selectedMidiInput = state.midiAccess.inputs.get(id);
  if (state.selectedMidiInput) {
    state.selectedMidiInput.onmidimessage = handleMidiMessage;
    el.midiInputSelect.value = id;
  }
}

export async function initMidi() {
  if (!navigator.requestMIDIAccess) {
    setStatus(el.midiStatus, "Web MIDI unsupported", "bad");
    return;
  }

  try {
    state.midiAccess = await navigator.requestMIDIAccess();
    state.midiAccess.onstatechange = refreshMidiInputs;
    refreshMidiInputs();
  } catch (error) {
    setStatus(el.midiStatus, "MIDI blocked", "bad");
    console.error(error);
  }
}
