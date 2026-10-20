// GeneralUser GS by S. Christian Collins; compressed copy from SpessaSynth.
// Pinned upstream revision keeps the default asset stable.
export const DEFAULT_SOUNDFONT_URL = "https://cdn.jsdelivr.net/gh/spessasus/SpessaSynth@5bef3d230d63e73946d4c77342eef953d6542fee/soundfonts/GeneralUserGS.sf3";
export const DEFAULT_SOUNDFONT_NAME = "GeneralUser GS";

export const SOUNDFONT_EXTENSIONS = [".sf2", ".sf3", ".dls", ".sfogg", ".sfont"];

export function isSoundFontFile(file) {
  const name = file?.name?.toLowerCase() || "";
  return SOUNDFONT_EXTENSIONS.some((extension) => name.endsWith(extension));
}

export function firstSoundFontFile(fileList) {
  return [...(fileList || [])].find(isSoundFontFile) || null;
}

export function hasDraggedFile(dataTransfer) {
  return [...(dataTransfer?.items || [])].some((item) => item.kind === "file") || (dataTransfer?.files?.length || 0) > 0;
}

export function presetBank(preset) {
  return preset?.bank ?? preset?.bankNumber ?? preset?.midiBank ?? 0;
}

export function presetProgram(preset) {
  return preset?.program ?? preset?.programNumber ?? preset?.preset ?? 0;
}

export function presetName(preset) {
  return preset?.name || preset?.presetName || preset?.patchName || "Preset";
}

export function presetLabel(preset) {
  return `${presetBank(preset)}:${presetProgram(preset)} ${presetName(preset)}`;
}

export function sortPresets(presets) {
  return [...(presets || [])].sort(
    (a, b) => presetBank(a) - presetBank(b) || presetProgram(a) - presetProgram(b),
  );
}

export class SoundFontPlayer {
  constructor({ context = null, moduleUrl, workletUrl, volume = 1 } = {}) {
    this.context = context;
    this.moduleUrl = moduleUrl;
    this.workletUrl = workletUrl;
    this.volume = volume;
    this.module = null;
    this.synth = null;
    this.gain = null;
    this.output = null;
    this.soundBankId = null;
    this.initializePromise = null;
  }

  async initialize() {
    if (this.synth) return this;
    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = this.initializeInternal();
    try {
      await this.initializePromise;
      return this;
    } catch (error) {
      this.initializePromise = null;
      throw error;
    }
  }

  async initializeInternal() {
    if (!window.AudioWorkletNode) {
      throw new Error("AudioWorklet is not supported in this browser.");
    }
    if (!this.moduleUrl || !this.workletUrl) {
      throw new Error("SoundFont engine URLs are not configured.");
    }

    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContextClass({ latencyHint: "interactive" });
    }

    this.context.resume().catch(() => {});
    this.module = await import(this.moduleUrl);
    await this.context.audioWorklet.addModule(this.workletUrl);
    this.synth = new this.module.WorkletSynthesizer(this.context);
    this.gain = this.context.createGain();
    this.gain.gain.value = this.volume;
    this.gain.connect(this.context.destination);
    this.output = this.synth.connect(this.gain);
    await this.synth.isReady;
  }

  async resume() {
    if (!this.context) return;
    await this.context.resume();
  }

  async loadSoundFont(buffer, bankId) {
    await this.initialize();
    if (this.soundBankId) {
      await this.synth.soundBankManager.deleteSoundBank(this.soundBankId).catch(() => {});
    }
    this.soundBankId = bankId;
    await this.synth.soundBankManager.addSoundBank(buffer, bankId);
    await this.synth.isReady;
    return sortPresets(this.synth.presetList || []);
  }

  applyPreset(channel, preset, sustainValue = 0) {
    if (!this.synth || !preset) return;
    const bank = presetBank(preset);
    this.synth.controllerChange(channel, 0, Math.floor(bank / 128));
    this.synth.controllerChange(channel, 32, bank % 128);
    this.synth.programChange(channel, presetProgram(preset));
    this.synth.controllerChange(channel, 64, sustainValue);
  }

  noteOn(channel, note, velocity) {
    if (!this.synth) return false;
    this.context?.resume?.();
    this.synth.noteOn(channel, note, velocity);
    return true;
  }

  noteOff(channel, note) {
    if (!this.synth) return;
    this.synth.noteOff(channel, note);
  }

  controllerChange(channel, controller, value) {
    if (!this.synth) return;
    this.synth.controllerChange(channel, controller, value);
  }

  setVolume(value) {
    this.volume = value;
    if (this.gain && this.context) {
      this.gain.gain.setTargetAtTime(value, this.context.currentTime, 0.01);
    }
  }
}
