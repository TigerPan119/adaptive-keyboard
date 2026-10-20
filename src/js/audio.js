import { DEFAULT_SOUNDFONT_NAME, DEFAULT_SOUNDFONT_URL, el, SPESSA_MODULE_URL, SPESSA_WORKLET_URL, state } from "./core.js";
import { clamp } from "./keyboard.js";
import { presetBank, presetLabel, presetProgram, SoundFontPlayer } from "./soundfont-player.js";
import { setStatus } from "./ui.js";

function getAudioContext() {
  if (state.audio?.context) return state.audio.context;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const context = new AudioCtx({ latencyHint: "interactive" });
  state.audio = { type: "context", context };
  return context;
}

async function ensureSoundFontSynth() {
  if (state.sfSynth) return state.sfSynth;

  const context = getAudioContext();
  setStatus(el.audioStatus, "Audio ready", "ok");
  if (!state.sfPlayer) {
    state.sfPlayer = new SoundFontPlayer({
      context,
      moduleUrl: SPESSA_MODULE_URL,
      workletUrl: SPESSA_WORKLET_URL,
      volume: state.soundFontVolume,
    });
  }
  await state.sfPlayer.initialize();
  state.sfModule = state.sfPlayer.module;
  state.sfSynth = state.sfPlayer.synth;
  state.sfGain = state.sfPlayer.gain;
  state.sfOutput = state.sfPlayer.output;
  state.sfSynthReady = state.sfSynth.isReady;
  state.audio.type = "soundfont";
  setStatus(el.soundFontTopStatus, "SF engine ready", "ok");
  return state.sfSynth;
}

function populatePresetSelects(presets) {
  const sorted = [...presets].sort((a, b) => {
    const bankA = a.bank ?? a.bankNumber ?? a.midiBank ?? 0;
    const bankB = b.bank ?? b.bankNumber ?? b.midiBank ?? 0;
    return bankA - bankB || presetProgram(a) - presetProgram(b);
  });

  for (const select of [el.leftPresetSelect, el.rightPresetSelect]) {
    select.innerHTML = "";
    sorted.forEach((preset, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = presetLabel(preset);
      option.dataset.bank = String(presetBank(preset));
      option.dataset.program = String(presetProgram(preset));
      select.append(option);
    });
    select.disabled = !sorted.length;
  }

  if (!sorted.length) return;

  const bassIndex = sorted.findIndex((preset) => /bass/i.test(preset.name || preset.presetName || ""));
  const pianoIndex = sorted.findIndex((preset) => /piano|keys|ep/i.test(preset.name || preset.presetName || ""));
  el.leftPresetSelect.value = String(bassIndex >= 0 ? bassIndex : 0);
  el.rightPresetSelect.value = String(pianoIndex >= 0 ? pianoIndex : Math.min(1, sorted.length - 1));
  applySelectedPresets();
}

function selectedProgram(select) {
  const option = select.selectedOptions[0];
  return option ? Number(option.dataset.program) || 0 : 0;
}

function selectedBank(select) {
  const option = select.selectedOptions[0];
  return option ? Number(option.dataset.bank) || 0 : 0;
}

function applyPresetToChannel(channel, select) {
  const bank = selectedBank(select);
  state.sfSynth.controllerChange(channel, 0, Math.floor(bank / 128));
  state.sfSynth.controllerChange(channel, 32, bank % 128);
  state.sfSynth.programChange(channel, selectedProgram(select));
  state.sfSynth.controllerChange(channel, 64, state.sustainValue);
}

export function applySelectedPresets() {
  if (!state.sfSynth || !state.soundFontLoaded) return;
  applyPresetToChannel(0, el.leftPresetSelect);
  applyPresetToChannel(1, el.rightPresetSelect);
}

export async function loadSoundFontFile(file) {
  if (!file) return;

  try {
    setStatus(el.soundFontTopStatus, "Loading SF", "warn");
    el.soundFontStatus.textContent = `Loading ${file.name}...`;
    const synth = await ensureSoundFontSynth();
    const buffer = await file.arrayBuffer();
    await installSoundFontBuffer(buffer, file.name, `user-upload-${Date.now()}`);
  } catch (error) {
    console.error(error);
    el.soundFontStatus.textContent = `Could not load SoundFont: ${error.message}`;
    setStatus(el.soundFontTopStatus, "SF failed", "bad");
  }
}

async function installSoundFontBuffer(buffer, displayName, bankId) {
  await ensureSoundFontSynth();
  const presets = await state.sfPlayer.loadSoundFont(buffer, bankId);
  state.soundBankId = state.sfPlayer.soundBankId;
  state.soundFontLoaded = true;
  populatePresetSelects(presets);
  el.soundFontStatus.textContent = `${displayName} loaded. ${presets.length} presets available.`;
  setStatus(el.soundFontTopStatus, "SF loaded", "ok");
}

export async function loadDefaultSoundFont() {
  try {
    setStatus(el.soundFontTopStatus, "Loading default SF", "warn");
    el.soundFontStatus.textContent = `Loading default ${DEFAULT_SOUNDFONT_NAME}...`;
    const response = await fetch(DEFAULT_SOUNDFONT_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    await installSoundFontBuffer(buffer, DEFAULT_SOUNDFONT_NAME, "default-undertale");
  } catch (error) {
    console.error(error);
    el.soundFontStatus.textContent = `Default SoundFont failed to load: ${error.message}. You can still upload one manually.`;
    setStatus(el.soundFontTopStatus, "Default SF failed", "bad");
  }
}

export async function startAudio() {
  if (state.audio) {
    await state.audio.context?.resume?.();
    setStatus(el.audioStatus, "Audio ready", "ok");
    return;
  }

  getAudioContext();
  await state.audio.context.resume();
  setStatus(el.audioStatus, "Audio ready", "ok");
}


export function playNote(note, velocity, side) {
  if (state.audio?.type === "soundfont" && state.sfSynth && state.soundFontLoaded) {
    state.audio.context?.resume?.();
    const channel = side === "left" ? 0 : 1;

    const previous = state.activeNotes.get(note);
    if (previous && Number.isFinite(previous.channel)) {
      state.sfSynth.noteOff(previous.channel, note);
    }

    state.sfSynth.noteOn(channel, note, velocity);
    state.activeNotes.set(note, { side, channel });
    return true;
  }

  if (!state.diagnosticsPaused) el.routeReadout.textContent = "Load SoundFont first";
  return false;
}

export function releaseNote(note) {
  const active = state.activeNotes.get(note);
  if (!active || !state.audio) return;

  if (state.audio.type === "soundfont" && state.sfSynth && Number.isFinite(active.channel)) {
    state.sfSynth.noteOff(active.channel, note);
  }
  state.activeNotes.delete(note);
}

export function handleSustainPedal(value) {
  state.sustainValue = clamp(value, 0, 127);

  if (state.sfSynth && state.soundFontLoaded) {
    state.sfSynth.controllerChange(0, 64, state.sustainValue);
    state.sfSynth.controllerChange(1, 64, state.sustainValue);
  }

  if (!state.diagnosticsPaused) {
    el.routeReadout.textContent = state.sustainValue >= 64 ? "Sustain pedal down" : "Sustain pedal up";
  }
}

export function handleAllNotesOff(controller, value) {
  if (!state.sfSynth || !state.soundFontLoaded) return;

  state.sfSynth.controllerChange(0, controller, value);
  state.sfSynth.controllerChange(1, controller, value);
  for (const [note, active] of state.activeNotes) {
    if (Number.isFinite(active.channel)) {
      state.sfSynth.noteOff(active.channel, note);
    }
  }
  state.activeNotes.clear();
  if (controller === 121) state.sustainValue = 0;
  if (!state.diagnosticsPaused) el.routeReadout.textContent = "All notes off";
}
