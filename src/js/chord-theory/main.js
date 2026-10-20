import { noteName, pitchClass } from "../music.js";
import {
  firstSoundFontFile,
  hasDraggedFile,
  presetLabel,
  presetName,
  SoundFontPlayer,
  sortPresets,
} from "../soundfont-player.js";
import { analyzeChord } from "./chord-engine.js";
import { ChordStaffRenderer } from "./chord-staff.js";
import { updateChordDisplayLatch } from "./chord-display-latch.js";
import { analyzeHarmony } from "./harmony-analysis.js";
import { resolveChordShortcut } from "./keyboard-shortcuts.js";
import { remainingHighlightMs, shouldCaptureBeforeNoteReduction } from "./recognition-timing.js";
import { loadCustomBackground, saveCustomBackground } from "./background-store.js";
import {
  buildVistaBackgroundRequestUrl,
  normalizeBackgroundMode,
  normalizeBackgroundApiUrl,
  parseBackgroundApiResponse,
  parseVistaBackgroundResponse,
} from "./background-presets.js";
import {
  fallLookaheadSeconds,
  isSequencedPlaybackVisualization,
  normalizePlaybackVisualization,
  NoteTrailVisualizer,
} from "./note-trails.js";
import {
  createNarrativeBackgroundPalette,
  createSmartPaletteFromBlob,
  createSmartPaletteFromColors,
  paletteCssGradient,
} from "./smart-palette.js";
import { ScreenWakeLockController } from "./wake-lock.js";
import { buildMidiNoteSpans, MidiAutoplayController, parseMidiFile } from "./midi-autoplay.js";
import { formatStageDisplayText, normalizeStageFont } from "./stage-fonts.js";
import { fittedFontSize } from "./stage-text-fit.js";
import { resolveInputSourceStatus } from "./input-source-status.js";
import {
  createEarTrainingQuestion,
  DEFAULT_EAR_TRAINING_CUSTOM_QUALITIES,
  matchesEarTrainingAnswer,
  normalizeEarTrainingDifficulty,
  normalizeEarTrainingQualities,
  pitchClassSignature,
} from "./ear-training.js";
import {
  findUpcomingNoteTime,
  MidiPiecePracticeController,
  upcomingGuideLevels,
} from "./midi-piece-practice.js";
import {
  cameraHighlightStrength,
  DEFAULT_CAMERA_QUAD,
  isValidCameraQuad,
  KeyboardCameraController,
  normalizeCameraQuad,
} from "./camera-keyboard.js";

const DEFAULT_SOUNDFONT_URL = "./assets/undertale.sf2";
const DEFAULT_SOUNDFONT_NAME = "undertale.sf2";
const SPESSA_MODULE_URL = "https://cdn.jsdelivr.net/npm/spessasynth_lib@4.3.8/+esm";
const SPESSA_WORKLET_URL = "https://cdn.jsdelivr.net/npm/spessasynth_lib@4.3.8/dist/spessasynth_processor.min.js";
const AUDIO_CHANNEL = 0;
const NO_MIDI_OUTPUT_ID = "none";
const LOCAL_SOUNDFONT_OUTPUT_ID = "local-soundfont";
const LOCAL_SOUNDFONT_OUTPUT = {
  id: LOCAL_SOUNDFONT_OUTPUT_ID,
  name: "Local SoundFont",
  send() {},
  clear() {},
};
const HARMONY_LEARN_TIMEOUT_MS = 10000;
const AUTOPLAY_PROGRESS_UI_INTERVAL_MS = 80;
const collapsibleHideTimers = new WeakMap();
const MINIMUM_KEY_HIGHLIGHT_MS = 90;
const EAR_TRAINING_NOTE_DURATION_MS = 900;
const KEYBOARD_CAMERA_FIT_STORAGE_KEY = "chord-theory-keyboard-camera-fit";
const KEYBOARD_CAMERA_DEVICE_STORAGE_KEY = "chord-theory-keyboard-camera-device";
const KEYBOARD_CAMERA_MIRROR_STORAGE_KEY = "chord-theory-keyboard-camera-mirror";
const KEYBOARD_CAMERA_OVERLAY_STORAGE_KEY = "chord-theory-keyboard-camera-overlay";
const KEYBOARD_CAMERA_HIGHLIGHT_STORAGE_KEY = "chord-theory-keyboard-camera-highlight-transparency";
const TONIC_NAMES = {
  sharp: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  flat: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"],
};
const NETWORK_BACKGROUND_FALLBACK_URL = "https://www.sourcesplash.com/i/random";
const VISTA_SEARCH_PAGE_LIMIT = 80;
const VISTA_BACKGROUND_LOAD_ATTEMPTS = 1;
const RECENT_BACKGROUND_ID_LIMIT = 30;
const NETWORK_BACKGROUND_QUERIES = [
  "mountain landscape",
  "dramatic coast",
  "misty forest",
  "alpine lake",
  "desert canyon",
  "northern wilderness",
  "volcanic valley",
  "glacial lagoon",
  "rolling green hills",
  "ocean cliffs sunset",
  "foggy pine mountains",
  "remote tropical beach",
  "waterfall rainforest",
  "snowy mountain sunrise",
  "starry desert landscape",
  "wildflower meadow mountains",
  "black sand beach",
  "fjord aerial landscape",
  "autumn forest lake",
  "coastal sea stacks",
  "icy mountain lake",
  "cloudy highlands",
  "red rock valley",
  "moonlit ocean landscape",
];
const PRESET_BACKGROUND_COLORS = {
  none: [[5, 5, 6], [22, 22, 24]],
  studio: [[48, 49, 53], [28, 29, 32], [8, 9, 10]],
  atmosphere: [[7, 37, 31], [24, 83, 91], [73, 65, 126], [112, 39, 88]],
  nebula: [[7, 9, 9], [24, 34, 29], [89, 119, 99], [145, 68, 57], [194, 164, 108]],
  satin: [[15, 18, 19], [64, 55, 52], [151, 95, 77], [177, 137, 105], [43, 65, 60]],
  halo: [[8, 9, 10], [25, 30, 27], [94, 105, 91], [151, 82, 65], [194, 166, 112]],
  api: [[32, 34, 40], [92, 104, 124], [186, 194, 210]],
};
const NETWORK_QUERY_COLORS = {
  "mountain landscape": [[56, 82, 98], [142, 154, 164]],
  "dramatic coast": [[24, 86, 108], [102, 164, 181]],
  "misty forest": [[20, 68, 50], [103, 139, 92]],
  "alpine lake": [[34, 98, 119], [166, 198, 207]],
  "desert canyon": [[142, 83, 52], [214, 158, 99]],
  "northern wilderness": [[34, 70, 64], [99, 132, 151]],
};

const el = {
  midiHeaderStatus: document.getElementById("midiHeaderStatus"),
  midiInputSelect: document.getElementById("midiInputSelect"),
  refreshMidiBtn: document.getElementById("refreshMidiBtn"),
  lastMidiMessage: document.getElementById("lastMidiMessage"),
  autoplayToggle: document.getElementById("autoplayToggle"),
  autoplayContent: document.getElementById("autoplayContent"),
  autoplayFileInput: document.getElementById("autoplayFileInput"),
  midiFileDropZone: document.getElementById("midiFileDropZone"),
  autoplayFileName: document.getElementById("autoplayFileName"),
  autoplayFileMeta: document.getElementById("autoplayFileMeta"),
  autoplayOutputSelect: document.getElementById("autoplayOutputSelect"),
  autoplayStageLabelInput: document.getElementById("autoplayStageLabelInput"),
  autoplayPlaybackControls: document.getElementById("autoplayPlaybackControls"),
  autoplayPlayBtn: document.getElementById("autoplayPlayBtn"),
  autoplayStopBtn: document.getElementById("autoplayStopBtn"),
  autoplayProgress: document.getElementById("autoplayProgress"),
  autoplayTime: document.getElementById("autoplayTime"),
  autoplaySpeed: document.getElementById("autoplaySpeed"),
  autoplayTranspose: document.getElementById("autoplayTranspose"),
  autoplayLoopToggle: document.getElementById("autoplayLoopToggle"),
  autoplayVisualizationButtons: document.querySelectorAll("[data-autoplay-visualization]"),
  rollPressSetting: document.getElementById("rollPressSetting"),
  rollPressToggle: document.getElementById("rollPressToggle"),
  autoplayStatus: document.getElementById("autoplayStatus"),
  soundFontInput: document.getElementById("soundFontInput"),
  soundFontToggle: document.getElementById("soundFontToggle"),
  soundFontContent: document.getElementById("soundFontContent"),
  chordPresetSelect: document.getElementById("chordPresetSelect"),
  soundFontStatus: document.getElementById("soundFontStatus"),
  soundFontVolumeInput: document.getElementById("soundFontVolumeInput"),
  soundFontDropOverlay: document.getElementById("soundFontDropOverlay"),
  chordDisplayStatus: document.getElementById("chordDisplayStatus"),
  listeningStatus: document.getElementById("listeningStatus"),
  compactChordBadge: document.getElementById("compactChordBadge"),
  sustainBadge: document.getElementById("sustainBadge"),
  chordQuality: document.getElementById("chordQuality"),
  chordName: document.getElementById("chordName"),
  chordMeta: document.getElementById("chordMeta"),
  alternativeChords: document.getElementById("alternativeChords"),
  chordStaff: document.getElementById("chordStaff"),
  chordStaffCanvas: document.getElementById("chordStaffCanvas"),
  chordStaffMessage: document.getElementById("chordStaffMessage"),
  activeNoteList: document.getElementById("activeNoteList"),
  chordKeyboard: document.getElementById("chordKeyboard"),
  keyboardCameraCanvas: document.getElementById("keyboardCameraCanvas"),
  keyboardCameraVideo: document.getElementById("keyboardCameraVideo"),
  keyboardCameraToggle: document.getElementById("keyboardCameraToggle"),
  keyboardCameraContent: document.getElementById("keyboardCameraContent"),
  keyboardCameraSelect: document.getElementById("keyboardCameraSelect"),
  keyboardCameraRefreshBtn: document.getElementById("keyboardCameraRefreshBtn"),
  keyboardCameraMirrorToggle: document.getElementById("keyboardCameraMirrorToggle"),
  keyboardCameraOverlayToggle: document.getElementById("keyboardCameraOverlayToggle"),
  keyboardCameraHighlightTransparency: document.getElementById("keyboardCameraHighlightTransparency"),
  keyboardCameraFitBtn: document.getElementById("keyboardCameraFitBtn"),
  keyboardCameraStatus: document.getElementById("keyboardCameraStatus"),
  keyboardCameraCalibration: document.getElementById("keyboardCameraCalibration"),
  keyboardCameraFitViewport: document.getElementById("keyboardCameraFitViewport"),
  keyboardCameraFitPolygon: document.getElementById("keyboardCameraFitPolygon"),
  keyboardCameraCornerHandles: document.querySelectorAll(".camera-corner-handle"),
  keyboardCameraFitHint: document.getElementById("keyboardCameraFitHint"),
  keyboardCameraFitCancelBtn: document.getElementById("keyboardCameraFitCancelBtn"),
  keyboardCameraFitResetBtn: document.getElementById("keyboardCameraFitResetBtn"),
  keyboardCameraFitApplyBtn: document.getElementById("keyboardCameraFitApplyBtn"),
  keyGuideLegend: document.getElementById("keyGuideLegend"),
  chordMarkerLegend: document.querySelector(".chord-marker-legend"),
  chordDisplay: document.querySelector(".chord-display"),
  chordFullscreenBtn: document.getElementById("chordFullscreenBtn"),
  noteTrailCanvas: document.getElementById("noteTrailCanvas"),
  noteTrailsToggle: document.getElementById("noteTrailsToggle"),
  visualizationColorModeSetting: document.getElementById("visualizationColorModeSetting"),
  visualizationColorModeButtons: document.querySelectorAll("[data-visualization-color-mode]"),
  visualizationSettings: document.getElementById("visualizationSettings"),
  trailOptions: document.getElementById("trailOptions"),
  visualizationBackground: document.getElementById("visualizationBackground"),
  visualizationBackgroundIncoming: document.getElementById("visualizationBackgroundIncoming"),
  visualizationBackgroundShade: document.getElementById("visualizationBackgroundShade"),
  trailPaletteButtons: document.querySelectorAll("[data-trail-palette]"),
  smartTrailButton: document.querySelector('[data-trail-palette="smart"]'),
  customTrailColorRow: document.getElementById("customTrailColorRow"),
  customTrailColorInput: document.getElementById("customTrailColorInput"),
  trailParticleInput: document.getElementById("trailParticleInput"),
  upwardSnowInput: document.getElementById("upwardSnowInput"),
  trailGlowInput: document.getElementById("trailGlowInput"),
  trailSpeedInput: document.getElementById("trailSpeedInput"),
  trailSquareCornersToggle: document.getElementById("trailSquareCornersToggle"),
  trailSpeedRow: document.getElementById("trailSpeedRow"),
  trailColorGroup: document.getElementById("trailColorGroup"),
  trailEffectsHeading: document.getElementById("trailEffectsHeading"),
  trailParticleRow: document.getElementById("trailParticleRow"),
  trailGlowRow: document.getElementById("trailGlowRow"),
  backgroundPresetButtons: document.querySelectorAll("[data-visual-background]"),
  backgroundApiEntryBtn: document.getElementById("backgroundApiEntryBtn"),
  backgroundApiPanel: document.getElementById("backgroundApiPanel"),
  backgroundApiUrlInput: document.getElementById("backgroundApiUrlInput"),
  backgroundApiLoadBtn: document.getElementById("backgroundApiLoadBtn"),
  backgroundApiStatus: document.getElementById("backgroundApiStatus"),
  solidBackgroundColorRow: document.getElementById("solidBackgroundColorRow"),
  solidBackgroundColorInput: document.getElementById("solidBackgroundColorInput"),
  backgroundUploadBtn: document.getElementById("backgroundUploadBtn"),
  backgroundUploadStatus: document.getElementById("backgroundUploadStatus"),
  backgroundImageInput: document.getElementById("backgroundImageInput"),
  backgroundBlurInput: document.getElementById("backgroundBlurInput"),
  backgroundDarknessInput: document.getElementById("backgroundDarknessInput"),
  backgroundAdjustments: document.getElementById("backgroundAdjustments"),
  backgroundBlurRow: document.getElementById("backgroundBlurRow"),
  backgroundDarknessRow: document.getElementById("backgroundDarknessRow"),
  brightModeToggle: document.getElementById("brightModeToggle"),
  stageFontButtons: document.querySelectorAll("[data-stage-font]"),
  cleanModeToggle: document.getElementById("cleanModeToggle"),
  hideHarmonyMarkersToggle: document.getElementById("hideHarmonyMarkersToggle"),
  alwaysGrandStaffToggle: document.getElementById("alwaysGrandStaffToggle"),
  wakeLockToggle: document.getElementById("wakeLockToggle"),
  wakeLockStatus: document.getElementById("wakeLockStatus"),
  experimentalPanel: document.getElementById("experimentalPanel"),
  educationalModeToggle: document.getElementById("educationalModeToggle"),
  educationViewSwitcher: document.getElementById("educationViewSwitcher"),
  educationViewButtons: document.querySelectorAll("[data-education-view]"),
  setupCardGroup: document.getElementById("setupCardGroup"),
  learningCardGroup: document.getElementById("learningCardGroup"),
  learningPathView: document.getElementById("learningPathView"),
  earTrainingEntryBtn: document.getElementById("earTrainingEntryBtn"),
  earTrainingView: document.getElementById("earTrainingView"),
  earTrainingBackBtn: document.getElementById("earTrainingBackBtn"),
  earTrainingDifficultyButtons: document.querySelectorAll("[data-ear-training-difficulty]"),
  earTrainingCustomPanel: document.getElementById("earTrainingCustomPanel"),
  earTrainingQualityInputs: document.querySelectorAll("[data-ear-training-quality]"),
  earTrainingInversionsToggle: document.getElementById("earTrainingInversionsToggle"),
  earTrainingOutputSelect: document.getElementById("earTrainingOutputSelect"),
  earTrainingPrompt: document.getElementById("earTrainingPrompt"),
  earTrainingPromptTitle: document.getElementById("earTrainingPromptTitle"),
  earTrainingPromptText: document.getElementById("earTrainingPromptText"),
  earTrainingNewBtn: document.getElementById("earTrainingNewBtn"),
  earTrainingNewBtnLabel: document.getElementById("earTrainingNewBtnLabel"),
  earTrainingReplayBtn: document.getElementById("earTrainingReplayBtn"),
  earTrainingRevealBtn: document.getElementById("earTrainingRevealBtn"),
  earTrainingCorrectScore: document.getElementById("earTrainingCorrectScore"),
  earTrainingStreakScore: document.getElementById("earTrainingStreakScore"),
  piecePracticeEntryBtn: document.getElementById("piecePracticeEntryBtn"),
  piecePracticeView: document.getElementById("piecePracticeView"),
  piecePracticeBackBtn: document.getElementById("piecePracticeBackBtn"),
  piecePracticeDropZone: document.getElementById("piecePracticeDropZone"),
  piecePracticeFileInput: document.getElementById("piecePracticeFileInput"),
  piecePracticeFileName: document.getElementById("piecePracticeFileName"),
  piecePracticeFileMeta: document.getElementById("piecePracticeFileMeta"),
  piecePracticePrompt: document.getElementById("piecePracticePrompt"),
  piecePracticePromptTitle: document.getElementById("piecePracticePromptTitle"),
  piecePracticePromptText: document.getElementById("piecePracticePromptText"),
  piecePracticeControls: document.getElementById("piecePracticeControls"),
  piecePracticePlayBtn: document.getElementById("piecePracticePlayBtn"),
  piecePracticeStopBtn: document.getElementById("piecePracticeStopBtn"),
  piecePracticeProgress: document.getElementById("piecePracticeProgress"),
  piecePracticeTime: document.getElementById("piecePracticeTime"),
  piecePracticeSpeed: document.getElementById("piecePracticeSpeed"),
  piecePracticeKeyGuidesToggle: document.getElementById("piecePracticeKeyGuidesToggle"),
  piecePracticeEarlyJumpToggle: document.getElementById("piecePracticeEarlyJumpToggle"),
  chordHistory: document.getElementById("chordHistory"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  spellingButtons: document.querySelectorAll("[data-spelling]"),
  displayModeButtons: document.querySelectorAll("[data-display-mode]"),
  chordPresentationButtons: document.querySelectorAll("[data-chord-presentation]"),
  centeredContentSetting: document.getElementById("centeredContentSetting"),
  centeredContentButtons: document.querySelectorAll("[data-centered-content]"),
  holdLastChordToggle: document.getElementById("holdLastChordToggle"),
  harmonyTonicValue: document.getElementById("harmonyTonicValue"),
  harmonyTonicDownBtn: document.getElementById("harmonyTonicDownBtn"),
  harmonyTonicUpBtn: document.getElementById("harmonyTonicUpBtn"),
  harmonyTonicLearnBtn: document.getElementById("harmonyTonicLearnBtn"),
  harmonyModeButtons: document.querySelectorAll("[data-harmony-mode]"),
  harmonyOptions: document.getElementById("harmonyOptions"),
  controlPanel: document.getElementById("controlPanel"),
  controlScrollShell: document.getElementById("controlScrollShell"),
  helpWindow: document.getElementById("helpWindow"),
  helpCloseBtn: document.getElementById("helpCloseBtn"),
  helpToggleBtn: document.getElementById("helpToggleBtn"),
  helpTitle: document.getElementById("helpTitle"),
  helpText: document.getElementById("helpText"),
};

const state = {
  midiAccess: null,
  selectedMidiInput: null,
  midiFallbackMessage: "Use the on-screen piano now, or connect a MIDI keyboard from the MIDI card.",
  selectedMidiOutput: null,
  autoplayUseLocalSoundFont: false,
  autoplayOutputTarget: NO_MIDI_OUTPUT_ID,
  autoplayOutputManuallySelected: false,
  autoplayEnabled: false,
  autoplayController: null,
  autoplayNoteSpans: [],
  autoplaySeeking: false,
  autoplayProgressRenderedAt: 0,
  autoplayStageLabel: "",
  autoplayVisualization: "rise",
  rollPressMotionEnabled: true,
  noteSources: new Map(),
  soundFontNoteSources: new Map(),
  pointerNotes: new Map(),
  pressedNotes: new Set(),
  soundingNotes: new Set(),
  keyboardKeys: new Map(),
  keyboardHighlightedNotes: new Set(),
  keyboardHighlightStartedAt: new Map(),
  keyboardHighlightTimers: new Map(),
  keyboardCameraController: null,
  keyboardCameraEnabled: false,
  keyboardCameraStarting: false,
  keyboardCameraError: "",
  keyboardCameraSelectedId: "",
  keyboardCameraMirrored: true,
  keyboardCameraOverlayEnabled: true,
  keyboardCameraHighlightTransparency: 60,
  keyboardCameraFitted: false,
  keyboardCameraPoints: DEFAULT_CAMERA_QUAD.map((point) => ({ ...point })),
  sustainSources: new Set(),
  sustain: false,
  soundFontPlayer: null,
  soundFontEnabled: false,
  soundFontLoading: false,
  soundFontLoadPromise: null,
  soundFontLoaded: false,
  soundFontName: "",
  soundFontPresets: [],
  soundFontVolume: 3,
  spelling: "sharp",
  displayMode: "chord",
  chordPresentation: "full",
  centeredContentMode: "name",
  displayedChordResult: null,
  chordStaffRenderer: null,
  chordStaffFrameId: null,
  chordStaffResizeTimer: null,
  holdLastChord: false,
  retainedChordResult: null,
  harmonyTonic: 0,
  harmonyMode: "major",
  harmonyLearnDeadline: 0,
  harmonyLearnIntervalId: null,
  harmonyLearnTimeoutId: null,
  currentResult: null,
  currentSignature: "",
  renderTimer: null,
  historyTimer: null,
  history: [],
  noteTrailsEnabled: true,
  visualizationColorMode: "note",
  preferredVisualizationColorMode: "note",
  trailPalette: "classic",
  smartTrailPalette: null,
  customTrailColor: "#ffd52e",
  trailParticleIntensity: 45,
  upwardSnowIntensity: 0,
  trailGlowIntensity: 35,
  trailSpeed: 100,
  trailSquareCorners: false,
  backgroundMode: "none",
  solidBackgroundColor: "#101014",
  backgroundBlur: 8,
  backgroundDarkness: 58,
  brightMode: false,
  brightSolidOverride: false,
  stageFont: "system",
  cleanMode: false,
  hideHarmonyMarkers: false,
  alwaysGrandStaff: false,
  educationalModeEnabled: false,
  educationView: "setup",
  learningView: "path",
  earTrainingDifficulty: "easy",
  earTrainingCustomQualities: [...DEFAULT_EAR_TRAINING_CUSTOM_QUALITIES],
  earTrainingCustomAllowInversions: true,
  earTrainingOutputTarget: LOCAL_SOUNDFONT_OUTPUT_ID,
  earTrainingQuestion: null,
  earTrainingPhase: "idle",
  earTrainingAttempts: 0,
  earTrainingCorrect: 0,
  earTrainingStreak: 0,
  earTrainingLastAttemptSignature: "",
  earTrainingPlayback: null,
  earTrainingPlaybackTimerId: 0,
  piecePracticeController: null,
  piecePracticeNoteSpans: [],
  piecePracticeOutputRoute: null,
  piecePracticeForwardedNotes: new Map(),
  piecePracticeSeeking: false,
  piecePracticeProgressRenderedAt: 0,
  piecePracticeLoading: false,
  piecePracticeKeyGuidesEnabled: false,
  piecePracticeGuidedNotes: new Set(),
  piecePracticeEarlyJumpEnabled: false,
  customBackgroundUrl: "",
  customBackgroundName: "",
  customBackgroundBlob: null,
  networkBackgroundUrl: "",
  networkBackgroundBlob: null,
  networkBackgroundQuery: "mountain landscape",
  networkBackgroundRequestId: 0,
  networkBackgroundQueryOffset: Math.floor(Math.random() * NETWORK_BACKGROUND_QUERIES.length),
  networkBackgroundSeenIds: [],
  apiBackgroundUrl: "",
  apiBackgroundBlob: null,
  apiBackgroundRequestId: 0,
  backgroundTransitionTimer: 0,
  smartPaletteRequestId: 0,
  wakeLockEnabled: false,
  wakeLockController: null,
  noteTrailVisualizer: null,
};

const DEFAULT_HELP = {
  title: "Help Window",
  text: "Move the pointer over an element to see what it does.",
};

function syncInputSourceStatus() {
  const status = resolveInputSourceStatus({
    autoplayEnabled: state.autoplayEnabled,
    midiInputName: state.selectedMidiInput?.name,
    midiFallbackMessage: state.midiFallbackMessage,
  });
  const icon = document.createElement("i");
  icon.dataset.lucide = status.icon;
  icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "header-input-label";
  label.textContent = status.label;
  el.midiHeaderStatus.replaceChildren(icon, label);
  el.midiHeaderStatus.className = `pill${status.kind === "neutral" ? "" : ` ${status.kind}`}`;
  el.midiHeaderStatus.dataset.help = status.help;
  el.midiHeaderStatus.setAttribute("aria-label", `Current input: ${status.label}`);
  window.lucide?.createIcons?.();
}

function setHelp(title, text) {
  el.helpTitle.textContent = title;
  el.helpText.textContent = text;
}

function setSoundFontStatus(text, status = "loading") {
  el.soundFontStatus.textContent = text;
  el.soundFontStatus.dataset.status = status;
}

function updateWakeLockState({ state: wakeState, message, supported }) {
  el.wakeLockStatus.textContent = message;
  el.wakeLockStatus.dataset.state = wakeState;
  el.wakeLockToggle.disabled = !supported;
  el.wakeLockToggle.setAttribute("aria-checked", String(state.wakeLockEnabled && supported));
}

async function setWakeLockEnabled(enabled, persist = true) {
  state.wakeLockEnabled = Boolean(enabled) && state.wakeLockController?.supported;
  el.wakeLockToggle.setAttribute("aria-checked", String(state.wakeLockEnabled));
  if (persist) {
    try {
      localStorage.setItem("chord-theory-wake-lock", state.wakeLockEnabled ? "on" : "off");
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }
  await state.wakeLockController?.setEnabled(state.wakeLockEnabled);
}

function initializeWakeLock() {
  state.wakeLockController = new ScreenWakeLockController(updateWakeLockState);
  if (!state.wakeLockController.supported) {
    updateWakeLockState({ state: "unsupported", message: "Not supported by this browser.", supported: false });
    return;
  }
  let saved = false;
  try {
    saved = localStorage.getItem("chord-theory-wake-lock") === "on";
  } catch {
    saved = false;
  }
  setWakeLockEnabled(saved, false);
}

function updateVolumeProgress() {
  updateRangeProgress(el.soundFontVolumeInput);
}

function updateRangeProgress(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 1;
  const value = Number(input.value) || 0;
  const progress = ((value - min) / Math.max(1, max - min)) * 100;
  input.style.setProperty("--range-progress", `${Math.max(0, Math.min(100, progress))}%`);
}

async function ensureSoundFontPlayer() {
  if (!state.soundFontPlayer) {
    state.soundFontPlayer = new SoundFontPlayer({
      moduleUrl: SPESSA_MODULE_URL,
      workletUrl: SPESSA_WORKLET_URL,
      volume: state.soundFontVolume,
    });
  }
  await state.soundFontPlayer.initialize();
  return state.soundFontPlayer;
}

function applyChordPreset() {
  if (!state.soundFontLoaded || !state.soundFontPlayer) return;
  const preset = state.soundFontPresets[Number(el.chordPresetSelect.value)];
  state.soundFontPlayer.applyPreset(AUDIO_CHANNEL, preset, state.sustain ? 127 : 0);
}

function populateChordPresets(presets) {
  state.soundFontPresets = sortPresets(presets);
  el.chordPresetSelect.innerHTML = "";

  for (const [index, preset] of state.soundFontPresets.entries()) {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = presetLabel(preset);
    el.chordPresetSelect.append(option);
  }

  el.chordPresetSelect.disabled = !state.soundFontEnabled || !state.soundFontPresets.length;
  if (!state.soundFontPresets.length) return;
  const pianoIndex = state.soundFontPresets.findIndex((preset) => /piano|keys|ep/i.test(presetName(preset)));
  el.chordPresetSelect.value = String(pianoIndex >= 0 ? pianoIndex : 0);
  applyChordPreset();
}

async function installSoundFont(buffer, displayName, bankId) {
  const player = await ensureSoundFontPlayer();
  const presets = await player.loadSoundFont(buffer, bankId);
  state.soundFontLoaded = true;
  state.soundFontName = displayName;
  populateChordPresets(presets);
  if (state.soundFontEnabled) {
    setSoundFontStatus(`${displayName} loaded. ${presets.length} presets available.`, "ready");
  } else {
    setSoundFontStatus("SoundFont audio is off.", "idle");
  }
  syncAutoplayTransport("ready");
}

async function loadSoundFontFile(file) {
  if (!file || !state.soundFontEnabled) return;
  try {
    setSoundFontStatus(`Loading ${file.name}...`);
    const buffer = await file.arrayBuffer();
    await installSoundFont(buffer, file.name, `chord-upload-${Date.now()}`);
  } catch (error) {
    console.error(error);
    setSoundFontStatus(state.soundFontEnabled ? `Could not load SoundFont: ${error.message}` : "SoundFont audio is off.", state.soundFontEnabled ? "error" : "idle");
  } finally {
    el.soundFontInput.value = "";
  }
}

async function loadDefaultSoundFont() {
  try {
    setSoundFontStatus(`Loading default ${DEFAULT_SOUNDFONT_NAME}...`);
    const response = await fetch(DEFAULT_SOUNDFONT_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    await installSoundFont(buffer, DEFAULT_SOUNDFONT_NAME, "chord-default-undertale");
  } catch (error) {
    console.error(error);
    setSoundFontStatus(state.soundFontEnabled ? `Default SoundFont failed: ${error.message}. Drop a local file to retry.` : "SoundFont audio is off.", state.soundFontEnabled ? "error" : "idle");
  }
}

function setSoundFontVolume(value) {
  state.soundFontVolume = Math.max(0, Math.min(8, Number(value) || 0));
  state.soundFontPlayer?.setVolume(state.soundFontVolume);
  updateVolumeProgress();
}

function playSoundFontNote(note, velocity) {
  if (!state.soundFontEnabled || !state.soundFontLoaded || !state.soundFontPlayer) return;
  state.soundFontPlayer.noteOn(AUDIO_CHANNEL, note, velocity);
}

function releaseSoundFontNote(note) {
  if (!state.soundFontLoaded || !state.soundFontPlayer) return;
  state.soundFontPlayer.noteOff(AUDIO_CHANNEL, note);
}

function syncSoundFontControls() {
  const enabled = state.soundFontEnabled;
  el.soundFontToggle.setAttribute("aria-checked", String(enabled));
  el.soundFontContent.classList.toggle("is-collapsed", !enabled);
  el.soundFontContent.setAttribute("aria-hidden", String(!enabled));
  el.soundFontContent.inert = !enabled;
  el.soundFontInput.disabled = !enabled;
  el.soundFontVolumeInput.disabled = !enabled;
  el.chordPresetSelect.disabled = !enabled || !state.soundFontPresets.length;
  el.soundFontInput.closest(".soundfont-drop-zone")?.classList.toggle("is-disabled", !enabled);
  el.soundFontVolumeInput.closest(".soundfont-volume-row")?.classList.toggle("is-disabled", !enabled);
  el.chordPresetSelect.closest(".chord-preset-field")?.classList.toggle("is-disabled", !enabled);
}

async function setSoundFontEnabled(enabled) {
  state.soundFontEnabled = Boolean(enabled);
  syncSoundFontControls();

  if (!state.soundFontEnabled) {
    if (state.autoplayUseLocalSoundFont) state.autoplayController?.pause();
    if (state.soundFontPlayer && state.soundFontLoaded) {
      state.soundFontPlayer.controllerChange(AUDIO_CHANNEL, 123, 0);
      state.soundFontPlayer.controllerChange(AUDIO_CHANNEL, 64, 0);
    }
    setSoundFontStatus("SoundFont audio is off.", "idle");
    syncAutoplayTransport("ready");
    return;
  }

  if (state.soundFontLoaded) {
    applyChordPreset();
    setSoundFontStatus(`${state.soundFontName} ready.`, "ready");
    syncAutoplayTransport("ready");
    return;
  }
  if (state.soundFontLoading) {
    await state.soundFontLoadPromise;
    return;
  }
  state.soundFontLoading = true;
  const loadPromise = loadDefaultSoundFont();
  state.soundFontLoadPromise = loadPromise;
  try {
    await loadPromise;
  } finally {
    if (state.soundFontLoadPromise === loadPromise) {
      state.soundFontLoading = false;
      state.soundFontLoadPromise = null;
    }
  }
}

function earTrainingQuestionName(question = state.earTrainingQuestion) {
  if (!question) return "Unknown chord";
  return `${TONIC_NAMES[state.spelling][question.rootPitchClass]} ${question.qualityLabel}`;
}

function setEarTrainingPrompt(title, text, status = "idle") {
  el.earTrainingPromptTitle.textContent = title;
  el.earTrainingPromptText.textContent = text;
  el.earTrainingPrompt.dataset.status = status;
}

function syncEarTrainingControls() {
  const busy = ["loading", "playing"].includes(state.earTrainingPhase);
  const hasQuestion = Boolean(state.earTrainingQuestion);
  el.earTrainingNewBtn.disabled = busy;
  el.earTrainingNewBtnLabel.textContent = hasQuestion ? "Next" : "Play";
  el.earTrainingNewBtn.classList.toggle(
    "is-secondary",
    hasQuestion && state.earTrainingPhase !== "correct",
  );
  el.earTrainingReplayBtn.disabled = busy || !hasQuestion;
  el.earTrainingRevealBtn.disabled = busy
    || !hasQuestion
    || ["correct", "revealed"].includes(state.earTrainingPhase);
  el.earTrainingOutputSelect.disabled = busy;
  el.earTrainingDifficultyButtons.forEach((button) => {
    button.disabled = busy;
  });
  el.earTrainingQualityInputs.forEach((input) => {
    input.disabled = busy;
  });
  el.earTrainingInversionsToggle.disabled = busy;
  el.earTrainingCorrectScore.textContent = `${state.earTrainingCorrect} / ${state.earTrainingAttempts}`;
  el.earTrainingStreakScore.textContent = String(state.earTrainingStreak);
}

function releaseEarTrainingPlayback() {
  if (state.earTrainingPlaybackTimerId) {
    clearTimeout(state.earTrainingPlaybackTimerId);
    state.earTrainingPlaybackTimerId = 0;
  }
  const playback = state.earTrainingPlayback;
  state.earTrainingPlayback = null;
  if (!playback) return;
  for (const note of playback.notes) {
    try {
      if (playback.kind === "local") state.soundFontPlayer?.noteOff(AUDIO_CHANNEL, note);
      else if (playback.kind === "midi") playback.output?.send([0x80 | AUDIO_CHANNEL, note, 0]);
    } catch (error) {
      console.warn("Could not release ear-training note.", error);
    }
  }
}

async function prepareEarTrainingOutput() {
  if (state.earTrainingOutputTarget === NO_MIDI_OUTPUT_ID) {
    return { kind: "none", output: null };
  }
  if (state.earTrainingOutputTarget === LOCAL_SOUNDFONT_OUTPUT_ID) {
    await setSoundFontEnabled(true);
    if (!state.soundFontLoaded || !state.soundFontPlayer) {
      throw new Error("Local SoundFont could not be loaded. Choose a MIDI output or load a SoundFont in Setup.");
    }
    // A browser may leave resume() pending after the original user activation
    // expires. noteOn also requests a resume, so this must not block the UI.
    state.soundFontPlayer.resume().catch(() => {});
    return { kind: "local", output: state.soundFontPlayer };
  }
  const output = state.midiAccess?.outputs.get(state.earTrainingOutputTarget);
  if (!output) throw new Error("The selected MIDI output is no longer available.");
  return { kind: "midi", output };
}

async function playEarTrainingQuestion() {
  const question = state.earTrainingQuestion;
  if (!question) return;
  releaseEarTrainingPlayback();
  state.earTrainingPhase = "loading";
  setEarTrainingPrompt("Preparing sound", "The exercise output is getting ready.", "playing");
  syncEarTrainingControls();

  try {
    const route = await prepareEarTrainingOutput();
    if (state.earTrainingQuestion !== question) return;
    if (!state.educationalModeEnabled
      || state.educationView !== "learn"
      || state.learningView !== "ear-training") {
      state.earTrainingPhase = "idle";
      syncEarTrainingControls();
      return;
    }
    state.earTrainingPhase = "playing";
    setEarTrainingPrompt("Listen carefully", "Play the same chord after the sound stops.", "playing");
    state.earTrainingPlayback = {
      ...route,
      notes: [...question.notes],
      questionSignature: question.signature,
    };
    for (const note of question.notes) {
      if (route.kind === "local") route.output.noteOn(AUDIO_CHANNEL, note, 96);
      else if (route.kind === "midi") route.output.send([0x90 | AUDIO_CHANNEL, note, 96]);
    }
    state.earTrainingPlaybackTimerId = setTimeout(() => {
      const questionSignature = state.earTrainingPlayback?.questionSignature;
      releaseEarTrainingPlayback();
      if (state.earTrainingQuestion?.signature !== questionSignature) return;
      state.earTrainingPhase = "awaiting";
      state.earTrainingLastAttemptSignature = "";
      setEarTrainingPrompt("Your turn", "Play the chord you just heard.", "awaiting");
      syncEarTrainingControls();
    }, EAR_TRAINING_NOTE_DURATION_MS);
  } catch (error) {
    console.error(error);
    state.earTrainingPhase = "error";
    setEarTrainingPrompt("Output unavailable", error.message, "error");
    syncEarTrainingControls();
  }
}

function startNewEarTrainingQuestion() {
  if (state.autoplayEnabled) setAutoplayEnabled(false);
  releaseEarTrainingPlayback();
  clearNotes();
  const previousSignature = state.earTrainingQuestion?.signature;
  state.earTrainingQuestion = createEarTrainingQuestion(state.earTrainingDifficulty, {
    previousSignature,
    qualityIds: state.earTrainingCustomQualities,
    allowInversions: state.earTrainingCustomAllowInversions,
  });
  state.earTrainingLastAttemptSignature = "";
  playEarTrainingQuestion();
}

function revealEarTrainingAnswer() {
  if (!state.earTrainingQuestion || ["correct", "revealed"].includes(state.earTrainingPhase)) return;
  releaseEarTrainingPlayback();
  state.earTrainingPhase = "revealed";
  state.earTrainingAttempts += 1;
  state.earTrainingStreak = 0;
  setEarTrainingPrompt(
    earTrainingQuestionName(),
    "Answer revealed. Play it on the keyboard, or continue with a new chord.",
    "revealed",
  );
  syncEarTrainingControls();
}

function handleEarTrainingInput(notes) {
  if (!state.educationalModeEnabled
    || state.educationView !== "learn"
    || state.learningView !== "ear-training"
    || !state.earTrainingQuestion
    || !["awaiting", "incorrect"].includes(state.earTrainingPhase)) return;

  const signature = pitchClassSignature(notes);
  const pitchClassCount = signature ? signature.split(",").length : 0;
  if (pitchClassCount < state.earTrainingQuestion.pitchClasses.length) {
    state.earTrainingLastAttemptSignature = "";
    return;
  }
  if (signature === state.earTrainingLastAttemptSignature) return;
  state.earTrainingLastAttemptSignature = signature;

  if (matchesEarTrainingAnswer(notes, state.earTrainingQuestion)) {
    state.earTrainingPhase = "correct";
    state.earTrainingAttempts += 1;
    state.earTrainingCorrect += 1;
    state.earTrainingStreak += 1;
    setEarTrainingPrompt(
      "Correct",
      `${earTrainingQuestionName()}.`,
      "correct",
    );
  } else {
    state.earTrainingPhase = "incorrect";
    state.earTrainingStreak = 0;
    setEarTrainingPrompt("Not quite", "Release the notes, listen again if needed, and try another voicing.", "incorrect");
  }
  syncEarTrainingControls();
}

function setEarTrainingDifficulty(value, persist = true) {
  state.earTrainingDifficulty = normalizeEarTrainingDifficulty(value);
  syncChoiceButtons(el.earTrainingDifficultyButtons, "earTrainingDifficulty", state.earTrainingDifficulty);
  syncEarTrainingCustomPanel();
  releaseEarTrainingPlayback();
  state.earTrainingQuestion = null;
  state.earTrainingPhase = "idle";
  state.earTrainingLastAttemptSignature = "";
  setEarTrainingPrompt("Ready to listen", "Start a new chord with the selected difficulty.", "idle");
  syncEarTrainingControls();
  if (persist) {
    try {
      localStorage.setItem("chord-theory-ear-training-difficulty", state.earTrainingDifficulty);
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }
}

function syncEarTrainingCustomPanel() {
  const custom = state.earTrainingDifficulty === "custom";
  el.earTrainingCustomPanel.classList.toggle("is-collapsed", !custom);
  el.earTrainingCustomPanel.setAttribute("aria-hidden", String(!custom));
  el.earTrainingCustomPanel.inert = !custom;
  el.earTrainingQualityInputs.forEach((input) => {
    input.checked = state.earTrainingCustomQualities.includes(input.value);
  });
  el.earTrainingInversionsToggle.setAttribute(
    "aria-checked",
    String(state.earTrainingCustomAllowInversions),
  );
  requestAnimationFrame(syncAllChordSegmentThumbs);
}

function setEarTrainingCustomQualities(values, persist = true) {
  state.earTrainingCustomQualities = normalizeEarTrainingQualities(values);
  syncEarTrainingCustomPanel();
  if (state.earTrainingDifficulty === "custom") {
    releaseEarTrainingPlayback();
    state.earTrainingQuestion = null;
    state.earTrainingPhase = "idle";
    state.earTrainingLastAttemptSignature = "";
    setEarTrainingPrompt("Ready to listen", "Play a chord from your customized selection.", "idle");
    syncEarTrainingControls();
  }
  if (persist) {
    try {
      localStorage.setItem(
        "chord-theory-ear-training-custom-qualities",
        JSON.stringify(state.earTrainingCustomQualities),
      );
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }
}

function setEarTrainingCustomInversions(enabled, persist = true) {
  state.earTrainingCustomAllowInversions = Boolean(enabled);
  syncEarTrainingCustomPanel();
  if (state.earTrainingDifficulty === "custom") {
    releaseEarTrainingPlayback();
    state.earTrainingQuestion = null;
    state.earTrainingPhase = "idle";
    state.earTrainingLastAttemptSignature = "";
    setEarTrainingPrompt(
      "Ready to listen",
      state.earTrainingCustomAllowInversions
        ? "Customized chords may appear in any inversion."
        : "Customized chords will use root position only.",
      "idle",
    );
    syncEarTrainingControls();
  }
  if (persist) {
    try {
      localStorage.setItem(
        "chord-theory-ear-training-custom-inversions",
        state.earTrainingCustomAllowInversions ? "on" : "off",
      );
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }
}

function refreshEarTrainingOutputs(outputs = []) {
  const previousTarget = state.earTrainingOutputTarget;
  el.earTrainingOutputSelect.innerHTML = "";
  const noneOption = document.createElement("option");
  noneOption.value = NO_MIDI_OUTPUT_ID;
  noneOption.textContent = "None";
  el.earTrainingOutputSelect.append(noneOption);
  const localOption = document.createElement("option");
  localOption.value = LOCAL_SOUNDFONT_OUTPUT_ID;
  localOption.textContent = "Local SoundFont";
  el.earTrainingOutputSelect.append(localOption);
  for (const output of outputs) {
    const option = document.createElement("option");
    option.value = output.id;
    option.textContent = output.name || output.id;
    el.earTrainingOutputSelect.append(option);
  }
  const hasPreviousTarget = [NO_MIDI_OUTPUT_ID, LOCAL_SOUNDFONT_OUTPUT_ID].includes(previousTarget)
    || outputs.some((output) => output.id === previousTarget);
  state.earTrainingOutputTarget = hasPreviousTarget
    ? previousTarget
    : LOCAL_SOUNDFONT_OUTPUT_ID;
  el.earTrainingOutputSelect.value = state.earTrainingOutputTarget;
}

function setLearningView(view) {
  const nextView = ["ear-training", "piece"].includes(view) ? view : "path";
  const previousView = state.learningView;
  const leavingExercise = previousView === "ear-training" && nextView !== "ear-training";
  const leavingPiecePractice = previousView === "piece" && nextView !== "piece";
  state.learningView = nextView;
  el.learningPathView.hidden = nextView !== "path";
  el.learningPathView.inert = nextView !== "path";
  el.earTrainingView.hidden = nextView !== "ear-training";
  el.earTrainingView.inert = nextView !== "ear-training";
  el.piecePracticeView.hidden = nextView !== "piece";
  el.piecePracticeView.inert = nextView !== "piece";

  const visibleView = {
    path: el.learningPathView,
    "ear-training": el.earTrainingView,
    piece: el.piecePracticeView,
  }[nextView];
  visibleView.classList.remove("is-entering");
  requestAnimationFrame(() => {
    visibleView.classList.add("is-entering");
    syncAllChordSegmentThumbs();
  });

  if (leavingExercise && ["loading", "playing"].includes(state.earTrainingPhase)) {
    releaseEarTrainingPlayback();
    state.earTrainingPhase = "idle";
    setEarTrainingPrompt("Exercise paused", "Open the exercise and replay the current chord.", "idle");
    syncEarTrainingControls();
  }
  if (leavingPiecePractice) {
    state.piecePracticeController?.pause();
    clearPiecePracticeOutput();
    clearPiecePracticeKeyGuides();
    syncAutoplayVisualization();
  } else if (nextView === "piece") {
    if (state.autoplayEnabled) setAutoplayEnabled(false);
    syncPiecePracticeVisualization();
    syncPiecePracticeKeyGuides();
  }
}

function setEducationView(view, persist = true) {
  const nextView = state.educationalModeEnabled && view === "learn" ? "learn" : "setup";
  state.educationView = nextView;
  syncChoiceButtons(el.educationViewButtons, "educationView", nextView);
  el.setupCardGroup.hidden = nextView !== "setup";
  el.setupCardGroup.inert = nextView !== "setup";
  el.learningCardGroup.hidden = nextView !== "learn";
  el.learningCardGroup.inert = nextView !== "learn";
  setLearningView("path");
  if (nextView !== "learn" && ["loading", "playing"].includes(state.earTrainingPhase)) {
    releaseEarTrainingPlayback();
    state.earTrainingPhase = "idle";
    setEarTrainingPrompt("Playback stopped", "Return to Learn Music Theory and replay the current chord.", "idle");
    syncEarTrainingControls();
  }
  el.controlPanel.scrollTo({ top: 0, behavior: persist ? "smooth" : "auto" });
  requestAnimationFrame(() => {
    syncAllChordSegmentThumbs();
    updateControlScrollHints();
  });
  if (persist) {
    try {
      localStorage.setItem("chord-theory-education-view", nextView);
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }
}

function setEducationalMode(enabled, persist = true) {
  state.educationalModeEnabled = Boolean(enabled);
  el.educationalModeToggle.setAttribute("aria-checked", String(state.educationalModeEnabled));
  el.educationViewSwitcher.hidden = !state.educationalModeEnabled;
  setEducationView(state.educationalModeEnabled ? state.educationView : "setup", false);
  if (persist) {
    try {
      localStorage.setItem("chord-theory-educational-mode", state.educationalModeEnabled ? "on" : "off");
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }
}

function initializeEducationalMode() {
  try {
    state.educationalModeEnabled = localStorage.getItem("chord-theory-educational-mode") === "on";
    state.educationView = localStorage.getItem("chord-theory-education-view") === "learn" ? "learn" : "setup";
    state.earTrainingDifficulty = normalizeEarTrainingDifficulty(
      localStorage.getItem("chord-theory-ear-training-difficulty"),
    );
    try {
      state.earTrainingCustomQualities = normalizeEarTrainingQualities(JSON.parse(
        localStorage.getItem("chord-theory-ear-training-custom-qualities") || "null",
      ));
    } catch {
      state.earTrainingCustomQualities = [...DEFAULT_EAR_TRAINING_CUSTOM_QUALITIES];
    }
    state.earTrainingCustomAllowInversions = localStorage.getItem(
      "chord-theory-ear-training-custom-inversions",
    ) !== "off";
  } catch {
    state.educationalModeEnabled = false;
    state.educationView = "setup";
    state.earTrainingDifficulty = "easy";
    state.earTrainingCustomQualities = [...DEFAULT_EAR_TRAINING_CUSTOM_QUALITIES];
    state.earTrainingCustomAllowInversions = true;
  }
  syncChoiceButtons(el.earTrainingDifficultyButtons, "earTrainingDifficulty", state.earTrainingDifficulty);
  syncEarTrainingCustomPanel();
  syncEarTrainingControls();
  setEducationalMode(state.educationalModeEnabled, false);
}

function syncFullscreenButton() {
  const fullscreen = document.fullscreenElement === el.chordDisplay;
  el.chordFullscreenBtn.classList.toggle("is-fullscreen", fullscreen);
  el.chordFullscreenBtn.setAttribute("aria-pressed", String(fullscreen));
  el.chordFullscreenBtn.setAttribute("aria-label", fullscreen ? "Exit fullscreen" : "Enter fullscreen");
  el.chordFullscreenBtn.title = fullscreen ? "Exit fullscreen" : "Enter fullscreen";
  el.chordFullscreenBtn.innerHTML = `<i data-lucide="${fullscreen ? "minimize-2" : "maximize-2"}" aria-hidden="true"></i>`;
  window.lucide?.createIcons?.();
  state.noteTrailVisualizer?.resize();
  scheduleChordStaffRender();
}

async function toggleChordFullscreen() {
  try {
    if (document.fullscreenElement === el.chordDisplay) await document.exitFullscreen();
    else await el.chordDisplay.requestFullscreen();
  } catch (error) {
    console.error("Fullscreen request failed", error);
  }
}

function setCleanMode(enabled, persist = true) {
  state.cleanMode = Boolean(enabled);
  el.cleanModeToggle.setAttribute("aria-checked", String(state.cleanMode));
  el.chordDisplay.dataset.cleanMode = String(state.cleanMode);
  el.chordDisplayStatus.setAttribute("aria-hidden", String(state.cleanMode));
  el.chordDisplayStatus.inert = state.cleanMode;
  if (!persist) return;
  try {
    localStorage.setItem("chord-theory-clean-mode", state.cleanMode ? "on" : "off");
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function initializeCleanMode() {
  try {
    state.cleanMode = localStorage.getItem("chord-theory-clean-mode") === "on";
  } catch {
    state.cleanMode = false;
  }
  setCleanMode(state.cleanMode, false);
}

function setHideHarmonyMarkers(enabled, persist = true) {
  state.hideHarmonyMarkers = Boolean(enabled);
  el.hideHarmonyMarkersToggle.setAttribute("aria-checked", String(state.hideHarmonyMarkers));
  el.chordDisplay.dataset.hideHarmonyMarkers = String(state.hideHarmonyMarkers);
  el.chordMarkerLegend.dataset.hideHarmonyMarkers = String(state.hideHarmonyMarkers);
  if (!persist) return;
  try {
    localStorage.setItem("chord-theory-hide-harmony-markers", state.hideHarmonyMarkers ? "on" : "off");
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function initializeHideHarmonyMarkers() {
  try {
    state.hideHarmonyMarkers = localStorage.getItem("chord-theory-hide-harmony-markers") === "on";
  } catch {
    state.hideHarmonyMarkers = false;
  }
  setHideHarmonyMarkers(state.hideHarmonyMarkers, false);
}

function setStageFont(mode, persist = true) {
  state.stageFont = normalizeStageFont(mode);
  el.chordDisplay.dataset.stageFont = state.stageFont;
  syncChoiceButtons(el.stageFontButtons, "stageFont", state.stageFont);
  syncStageDisplayText();
  if (!persist) return;
  try {
    localStorage.setItem("chord-theory-stage-font", state.stageFont);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function initializeStageFont() {
  try {
    state.stageFont = normalizeStageFont(localStorage.getItem("chord-theory-stage-font"));
  } catch {
    state.stageFont = "system";
  }
  setStageFont(state.stageFont, false);
}

function setAnimatedHidden(node, hidden) {
  if (hidden) {
    node.classList.add("is-hidden");
    window.setTimeout(() => {
      if (node.classList.contains("is-hidden")) node.hidden = true;
    }, 170);
    return;
  }

  node.hidden = false;
  requestAnimationFrame(() => node.classList.remove("is-hidden"));
}

function setHelpCollapsed(collapsed) {
  setAnimatedHidden(el.helpWindow, collapsed);
  setAnimatedHidden(el.helpToggleBtn, !collapsed);
}

function isBlackKey(note) {
  return [1, 3, 6, 8, 10].includes(pitchClass(note));
}

function buildKeyboard() {
  const whiteKeys = [];
  const blackKeys = [];
  let whiteCount = 0;

  for (let note = 21; note <= 108; note += 1) {
    const key = document.createElement("span");
    const guideMarker = document.createElement("i");
    guideMarker.className = "key-guide-marker";
    guideMarker.setAttribute("aria-hidden", "true");
    key.append(guideMarker);
    key.dataset.note = String(note);
    key.title = noteName(note);
    key.setAttribute("aria-hidden", "true");
    state.keyboardKeys.set(note, key);

    if (isBlackKey(note)) {
      key.className = "piano-key black-key";
      key.style.left = `${(whiteCount / 52) * 100}%`;
      blackKeys.push(key);
      continue;
    }

    key.className = "piano-key white-key";
    if (pitchClass(note) === 0 || note === 21) {
      key.dataset.label = noteName(note);
    }
    whiteKeys.push(key);
    whiteCount += 1;
  }

  const whiteLayer = document.createElement("div");
  whiteLayer.className = "white-key-layer";
  whiteLayer.append(...whiteKeys);
  el.chordKeyboard.append(whiteLayer, ...blackKeys);
}

function setKeyboardCameraStatus(message, status = "idle") {
  el.keyboardCameraStatus.textContent = message;
  el.keyboardCameraStatus.dataset.status = status;
}

function persistKeyboardCameraFit() {
  try {
    localStorage.setItem(KEYBOARD_CAMERA_FIT_STORAGE_KEY, JSON.stringify({
      version: 1,
      points: state.keyboardCameraPoints,
      fitted: state.keyboardCameraFitted,
    }));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function syncKeyboardCameraControls() {
  const controllerReady = Boolean(state.keyboardCameraController);
  const contentVisible = state.keyboardCameraEnabled || state.keyboardCameraStarting || Boolean(state.keyboardCameraError);
  el.keyboardCameraToggle.setAttribute("aria-checked", String(state.keyboardCameraEnabled || state.keyboardCameraStarting));
  el.keyboardCameraToggle.setAttribute("aria-busy", String(state.keyboardCameraStarting));
  el.keyboardCameraToggle.disabled = state.keyboardCameraStarting || !controllerReady;
  el.keyboardCameraSelect.disabled = state.keyboardCameraStarting;
  el.keyboardCameraRefreshBtn.disabled = state.keyboardCameraStarting;
  el.keyboardCameraMirrorToggle.disabled = state.keyboardCameraStarting;
  el.keyboardCameraMirrorToggle.setAttribute("aria-checked", String(state.keyboardCameraMirrored));
  el.keyboardCameraOverlayToggle.disabled = state.keyboardCameraStarting;
  el.keyboardCameraOverlayToggle.setAttribute("aria-checked", String(state.keyboardCameraOverlayEnabled));
  el.chordKeyboard.dataset.cameraKeyOverlay = String(state.keyboardCameraOverlayEnabled);
  el.keyboardCameraHighlightTransparency.disabled = state.keyboardCameraStarting;
  el.keyboardCameraFitBtn.disabled = !state.keyboardCameraEnabled || state.keyboardCameraStarting;
  el.keyboardCameraFitBtn.querySelector("span").textContent = state.keyboardCameraFitted ? "Refit keyboard" : "Fit keyboard";
  setConditionalRegionVisible(el.keyboardCameraContent, contentVisible);
  requestAnimationFrame(updateControlScrollHints);
}

async function refreshKeyboardCameraDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = (await navigator.mediaDevices.enumerateDevices())
    .filter((device) => device.kind === "videoinput");
  const currentValue = state.keyboardCameraSelectedId || el.keyboardCameraSelect.value;
  el.keyboardCameraSelect.replaceChildren();

  if (!devices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Default camera";
    el.keyboardCameraSelect.append(option);
    return;
  }

  devices.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || `Camera ${index + 1}`;
    el.keyboardCameraSelect.append(option);
  });

  const activeDeviceId = state.keyboardCameraController?.stream
    ?.getVideoTracks?.()[0]?.getSettings?.().deviceId;
  const nextValue = [currentValue, activeDeviceId]
    .find((value) => value && devices.some((device) => device.deviceId === value))
    || devices[0].deviceId;
  state.keyboardCameraSelectedId = nextValue;
  el.keyboardCameraSelect.value = nextValue;
}

async function startKeyboardCamera() {
  if (!state.keyboardCameraController || state.keyboardCameraStarting) return;
  state.keyboardCameraStarting = true;
  state.keyboardCameraError = "";
  setKeyboardCameraStatus("Requesting camera access...", "loading");
  syncKeyboardCameraControls();
  try {
    try {
      await state.keyboardCameraController.start(state.keyboardCameraSelectedId);
    } catch (error) {
      if (!state.keyboardCameraSelectedId || !["NotFoundError", "OverconstrainedError"].includes(error?.name)) throw error;
      state.keyboardCameraSelectedId = "";
      await state.keyboardCameraController.start("");
    }
    state.keyboardCameraEnabled = true;
    await refreshKeyboardCameraDevices();
    try {
      localStorage.setItem(KEYBOARD_CAMERA_DEVICE_STORAGE_KEY, state.keyboardCameraSelectedId);
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
    setKeyboardCameraStatus(
      state.keyboardCameraFitted
        ? "Camera is mapped to the screen keyboard."
        : "Camera is ready. Fit the physical keyboard to continue.",
      state.keyboardCameraFitted ? "ready" : "idle",
    );
  } catch (error) {
    state.keyboardCameraController.stop();
    state.keyboardCameraEnabled = false;
    state.keyboardCameraError = error?.name === "NotAllowedError"
      ? "Camera permission was not granted."
      : (error?.message || "Could not start this camera.");
    setKeyboardCameraStatus(state.keyboardCameraError, "error");
  } finally {
    state.keyboardCameraStarting = false;
    syncKeyboardCameraControls();
  }
}

function stopKeyboardCamera() {
  state.keyboardCameraController?.stop();
  state.keyboardCameraEnabled = false;
  state.keyboardCameraStarting = false;
  state.keyboardCameraError = "";
  setKeyboardCameraStatus("Camera is off.", "idle");
  syncKeyboardCameraControls();
}

async function setKeyboardCameraEnabled(enabled) {
  if (enabled) await startKeyboardCamera();
  else stopKeyboardCamera();
}

async function selectKeyboardCamera() {
  state.keyboardCameraSelectedId = el.keyboardCameraSelect.value;
  try {
    localStorage.setItem(KEYBOARD_CAMERA_DEVICE_STORAGE_KEY, state.keyboardCameraSelectedId);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
  if (!state.keyboardCameraEnabled) return;
  state.keyboardCameraEnabled = false;
  await startKeyboardCamera();
}

function setKeyboardCameraMirrored(mirrored) {
  state.keyboardCameraMirrored = Boolean(mirrored);
  state.keyboardCameraController?.setMirrored(state.keyboardCameraMirrored);
  el.keyboardCameraMirrorToggle.setAttribute("aria-checked", String(state.keyboardCameraMirrored));
  try {
    localStorage.setItem(KEYBOARD_CAMERA_MIRROR_STORAGE_KEY, state.keyboardCameraMirrored ? "on" : "off");
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function setKeyboardCameraOverlayEnabled(enabled) {
  state.keyboardCameraOverlayEnabled = Boolean(enabled);
  el.keyboardCameraOverlayToggle.setAttribute("aria-checked", String(state.keyboardCameraOverlayEnabled));
  el.chordKeyboard.dataset.cameraKeyOverlay = String(state.keyboardCameraOverlayEnabled);
  try {
    localStorage.setItem(
      KEYBOARD_CAMERA_OVERLAY_STORAGE_KEY,
      state.keyboardCameraOverlayEnabled ? "on" : "off",
    );
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function setKeyboardCameraHighlightTransparency(value, persist = true) {
  const transparency = Math.max(0, Math.min(100, Number(value) || 0));
  state.keyboardCameraHighlightTransparency = transparency;
  el.keyboardCameraHighlightTransparency.value = String(transparency);
  el.chordKeyboard.style.setProperty("--camera-highlight-strength", `${cameraHighlightStrength(transparency)}%`);
  updateRangeProgress(el.keyboardCameraHighlightTransparency);
  if (!persist) return;
  try {
    localStorage.setItem(KEYBOARD_CAMERA_HIGHLIGHT_STORAGE_KEY, String(transparency));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function beginKeyboardCameraFit() {
  if (!state.keyboardCameraController?.beginCalibration()) return;
  el.keyboardCameraFitHint.textContent = "Align all four corners with the visible keyboard outline.";
}

function applyKeyboardCameraFit() {
  const points = state.keyboardCameraController?.commitCalibration();
  if (!points) {
    el.keyboardCameraFitHint.textContent = "Move the points until the outline forms one uncrossed keyboard shape.";
    return;
  }
  state.keyboardCameraPoints = normalizeCameraQuad(points);
  state.keyboardCameraFitted = true;
  persistKeyboardCameraFit();
  setKeyboardCameraStatus("Camera is mapped to the screen keyboard.", "ready");
  syncKeyboardCameraControls();
  window.setTimeout(() => el.keyboardCameraFitBtn.focus({ preventScroll: true }), 190);
}

function initializeKeyboardCamera() {
  try {
    state.keyboardCameraSelectedId = localStorage.getItem(KEYBOARD_CAMERA_DEVICE_STORAGE_KEY) || "";
    state.keyboardCameraMirrored = localStorage.getItem(KEYBOARD_CAMERA_MIRROR_STORAGE_KEY) !== "off";
    state.keyboardCameraOverlayEnabled = localStorage.getItem(KEYBOARD_CAMERA_OVERLAY_STORAGE_KEY) !== "off";
    const savedHighlightValue = localStorage.getItem(KEYBOARD_CAMERA_HIGHLIGHT_STORAGE_KEY);
    const savedHighlightTransparency = savedHighlightValue === null ? Number.NaN : Number(savedHighlightValue);
    state.keyboardCameraHighlightTransparency = Number.isFinite(savedHighlightTransparency)
      ? Math.max(0, Math.min(100, savedHighlightTransparency))
      : 60;
    const savedFit = JSON.parse(localStorage.getItem(KEYBOARD_CAMERA_FIT_STORAGE_KEY) || "null");
    if (savedFit?.version === 1 && savedFit.fitted && isValidCameraQuad(savedFit.points)) {
      state.keyboardCameraPoints = normalizeCameraQuad(savedFit.points);
      state.keyboardCameraFitted = true;
    }
  } catch {
    state.keyboardCameraPoints = DEFAULT_CAMERA_QUAD.map((point) => ({ ...point }));
    state.keyboardCameraFitted = false;
  }

  try {
    state.keyboardCameraController = new KeyboardCameraController({
      video: el.keyboardCameraVideo,
      canvas: el.keyboardCameraCanvas,
      keyboard: el.chordKeyboard,
      overlay: el.keyboardCameraCalibration,
      viewport: el.keyboardCameraFitViewport,
      polygon: el.keyboardCameraFitPolygon,
      handles: el.keyboardCameraCornerHandles,
      points: state.keyboardCameraPoints,
      fitted: state.keyboardCameraFitted,
      mirrored: state.keyboardCameraMirrored,
      onDraftChange: (_points, valid) => {
        el.keyboardCameraFitApplyBtn.disabled = !valid;
        el.keyboardCameraFitHint.textContent = valid
          ? "Align all four corners with the visible keyboard outline."
          : "The four edges cannot cross. Adjust the corner points.";
      },
    });
    setKeyboardCameraStatus("Camera is off.", "idle");
    refreshKeyboardCameraDevices().catch(() => {});
  } catch (error) {
    state.keyboardCameraError = error?.message || "Perspective camera fitting is unavailable.";
    setKeyboardCameraStatus(state.keyboardCameraError, "error");
  }
  setKeyboardCameraHighlightTransparency(state.keyboardCameraHighlightTransparency, false);
  syncKeyboardCameraControls();
}

function updateKeyboard(result) {
  const active = state.keyboardHighlightedNotes;
  const root = result.primary?.root;
  const bass = result.bass;
  el.chordKeyboard.querySelectorAll(".piano-key").forEach((key) => {
    const note = Number(key.dataset.note);
    if (active.has(note)) applyKeyboardThemeColor(note, key);
    key.classList.toggle("is-active", active.has(note));
    key.classList.toggle("is-root", active.has(note) && pitchClass(note) === root);
    key.classList.toggle("is-bass", active.has(note) && note === bass);
  });

  const description = result.noteNames?.length ? `Active notes: ${result.noteNames.join(", ")}` : "No active notes";
  el.chordKeyboard.setAttribute("aria-label", `Interactive 88-key piano keyboard. ${description}.`);
}

function activateKeyboardHighlight(note) {
  clearTimeout(state.keyboardHighlightTimers.get(note));
  state.keyboardHighlightTimers.delete(note);
  state.keyboardHighlightStartedAt.set(note, performance.now());
  state.keyboardHighlightedNotes.add(note);
  const key = state.keyboardKeys.get(note);
  applyKeyboardThemeColor(note, key);
  key?.classList.add("is-active");
}

function mixRgb(color, target, amount) {
  return color.map((channel, index) => Math.round(channel + (target[index] - channel) * amount));
}

function noteThemeColor(note) {
  return state.noteTrailVisualizer?.themeColorForNote(note) || [255, 213, 46];
}

function applyKeyboardThemeColor(note, key = state.keyboardKeys.get(note)) {
  if (!key || state.visualizationColorMode !== "note") return;
  const color = noteThemeColor(note);
  key.style.setProperty("--key-note-color", `rgb(${color.join(" ")})`);
  key.style.setProperty("--key-note-color-dark", `rgb(${mixRgb(color, [0, 0, 0], 0.22).join(" ")})`);
  key.style.setProperty("--key-note-color-outline", `rgb(${mixRgb(color, [255, 255, 255], 0.42).join(" ")})`);
}

function stageThemeAnchor(result) {
  const notes = result?.notes || [];
  const root = result?.primary?.root;
  return notes.find((note) => pitchClass(note) === root) ?? result?.bass ?? notes.at(-1) ?? 60;
}

function applyGlobalAccentTheme(color = null) {
  const style = document.body.style;
  const properties = ["--yellow", "--notes-yellow", "--accent-rgb", "--accent-dark", "--accent-contrast"];
  if (!color) {
    properties.forEach((property) => style.removeProperty(property));
    delete document.body.dataset.uiTheme;
    return;
  }

  const dark = mixRgb(color, [0, 0, 0], 0.24);
  const perceivedBrightness = color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114;
  style.setProperty("--yellow", `rgb(${color.join(" ")})`);
  style.setProperty("--notes-yellow", `rgb(${color.join(" ")})`);
  style.setProperty("--accent-rgb", color.join(", "));
  style.setProperty("--accent-dark", `rgb(${dark.join(" ")})`);
  style.setProperty("--accent-contrast", perceivedBrightness > 154 ? "#111113" : "#f5f5f7");
  document.body.dataset.uiTheme = "note";
}

function syncVisualizationColorTheme(result = state.currentResult) {
  const themed = state.visualizationColorMode === "note";
  el.chordDisplay.dataset.visualizationColorMode = themed ? "note" : "accent";
  if (!themed) {
    el.chordDisplay.style.removeProperty("--stage-note-color");
    el.chordDisplay.style.removeProperty("--stage-note-color-rgb");
    applyGlobalAccentTheme();
    return;
  }
  const color = noteThemeColor(stageThemeAnchor(result));
  el.chordDisplay.style.setProperty("--stage-note-color", `rgb(${color.join(" ")})`);
  el.chordDisplay.style.setProperty("--stage-note-color-rgb", color.join(", "));
  applyGlobalAccentTheme(color);
  for (const note of state.keyboardHighlightedNotes) applyKeyboardThemeColor(note);
}

function applyVisualizationColorMode() {
  const forcedAccent = state.trailPalette === "classic" || state.brightSolidOverride;
  state.visualizationColorMode = forcedAccent ? "accent" : state.preferredVisualizationColorMode;
  syncChoiceButtons(el.visualizationColorModeButtons, "visualizationColorMode", state.visualizationColorMode);
  el.visualizationColorModeSetting.classList.toggle("is-forced", forcedAccent);
  el.visualizationColorModeSetting.setAttribute("aria-disabled", String(forcedAccent));
  el.visualizationColorModeButtons.forEach((button) => {
    button.disabled = forcedAccent;
  });
  syncVisualizationColorTheme();
}

function setVisualizationColorMode(mode, persist = true) {
  state.preferredVisualizationColorMode = mode === "note" ? "note" : "accent";
  applyVisualizationColorMode();
  if (!persist) return;
  try {
    localStorage.setItem("chord-theory-visualization-color-mode", state.preferredVisualizationColorMode);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function toggleExperimentalPanel(event) {
  event.preventDefault();
  const panel = el.experimentalPanel;
  if (!panel || panel.dataset.animating === "true") return;

  const content = panel.querySelector(".diagnostics-content");
  if (!content) return;

  const expanded = panel.dataset.expanded === "true";
  panel.dataset.animating = "true";
  panel.style.setProperty("--diagnostics-height", `${content.scrollHeight}px`);

  if (expanded) {
    requestAnimationFrame(() => {
      panel.dataset.expanded = "false";
    });
    window.setTimeout(() => {
      panel.open = false;
      panel.dataset.animating = "false";
      updateControlScrollHints();
    }, 230);
    return;
  }

  panel.open = true;
  requestAnimationFrame(() => {
    panel.dataset.expanded = "true";
    window.setTimeout(() => {
      panel.dataset.animating = "false";
      updateControlScrollHints();
      syncAllChordSegmentThumbs();
    }, 230);
  });
}

function deactivateKeyboardHighlight(note, immediate = false) {
  clearTimeout(state.keyboardHighlightTimers.get(note));
  state.keyboardHighlightTimers.delete(note);
  const startedAt = state.keyboardHighlightStartedAt.get(note) ?? performance.now();
  const delay = immediate
    ? 0
    : remainingHighlightMs(startedAt, performance.now(), MINIMUM_KEY_HIGHLIGHT_MS);

  const remove = () => {
    state.keyboardHighlightTimers.delete(note);
    state.keyboardHighlightStartedAt.delete(note);
    state.keyboardHighlightedNotes.delete(note);
    const key = state.keyboardKeys.get(note);
    key?.classList.remove("is-active", "is-root", "is-bass");
  };

  if (delay > 0) {
    state.keyboardHighlightTimers.set(note, setTimeout(remove, delay));
  } else {
    remove();
  }
}

function clearKeyboardHighlights() {
  for (const timer of state.keyboardHighlightTimers.values()) clearTimeout(timer);
  state.keyboardHighlightTimers.clear();
  state.keyboardHighlightStartedAt.clear();
  state.keyboardHighlightedNotes.clear();
  for (const key of state.keyboardKeys.values()) {
    key.classList.remove("is-active", "is-root", "is-bass");
  }
}

function renderNoteList(result) {
  el.activeNoteList.innerHTML = "";
  for (const note of result.notes || []) {
    const chip = document.createElement("span");
    chip.textContent = noteName(note, state.spelling);
    if (result.primary && pitchClass(note) === result.primary.root) chip.classList.add("root-note");
    if (note === result.bass) chip.classList.add("bass-note");
    el.activeNoteList.append(chip);
  }
}

function harmonyAnalysis(candidate) {
  return analyzeHarmony(candidate, {
    tonic: state.harmonyTonic,
    mode: state.harmonyMode,
    spelling: state.spelling,
  });
}

function syncHarmonyControls() {
  const degreeMode = state.displayMode === "degree";
  el.harmonyOptions.classList.toggle("is-collapsed", !degreeMode);
  el.harmonyOptions.setAttribute("aria-hidden", String(!degreeMode));
  el.harmonyOptions.inert = !degreeMode;
  if (!degreeMode) cancelHarmonyLearn();
  requestAnimationFrame(syncAllChordSegmentThumbs);
}

function tonicName() {
  return TONIC_NAMES[state.spelling]?.[state.harmonyTonic] || TONIC_NAMES.sharp[state.harmonyTonic];
}

function setHarmonyTonic(value) {
  state.harmonyTonic = ((Number(value) % 12) + 12) % 12;
  el.harmonyTonicValue.textContent = tonicName();
  if (state.currentResult) renderResult(state.currentResult);
}

function clearHarmonyLearnTimers() {
  clearInterval(state.harmonyLearnIntervalId);
  clearTimeout(state.harmonyLearnTimeoutId);
  state.harmonyLearnIntervalId = null;
  state.harmonyLearnTimeoutId = null;
}

function syncHarmonyLearnButton() {
  const learning = state.harmonyLearnDeadline > 0;
  const seconds = learning ? Math.max(1, Math.ceil((state.harmonyLearnDeadline - Date.now()) / 1000)) : 0;
  const label = el.harmonyTonicLearnBtn.querySelector("span");
  el.harmonyTonicLearnBtn.classList.toggle("is-learning", learning);
  el.harmonyTonicLearnBtn.setAttribute("aria-pressed", String(learning));
  el.harmonyTonicLearnBtn.setAttribute("aria-label", learning
    ? `Cancel learning key, ${seconds} seconds remaining`
    : "Learn key from MIDI");
  if (label) label.textContent = learning ? "Listening" : "Learn";
}

function cancelHarmonyLearn() {
  clearHarmonyLearnTimers();
  state.harmonyLearnDeadline = 0;
  syncHarmonyLearnButton();
}

function beginHarmonyLearn() {
  if (state.harmonyLearnDeadline > 0) {
    cancelHarmonyLearn();
    return;
  }
  state.harmonyLearnDeadline = Date.now() + HARMONY_LEARN_TIMEOUT_MS;
  syncHarmonyLearnButton();
  state.harmonyLearnIntervalId = setInterval(syncHarmonyLearnButton, 250);
  state.harmonyLearnTimeoutId = setTimeout(cancelHarmonyLearn, HARMONY_LEARN_TIMEOUT_MS);
}

function syncChordSegmentThumb(group) {
  const active = group.querySelector("button.active");
  group.classList.toggle("has-active", Boolean(active));
  if (!active) return;
  group.style.setProperty("--segment-left", `${active.offsetLeft}px`);
  group.style.setProperty("--segment-width", `${active.offsetWidth}px`);
}

function syncAllChordSegmentThumbs() {
  document.querySelectorAll(".chord-segmented-control").forEach(syncChordSegmentThumb);
}

function syncChoiceButtons(buttons, dataKey, value) {
  buttons.forEach((button) => {
    const active = button.dataset[dataKey] === value;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  syncAllChordSegmentThumbs();
}

function renderResult(liveResult) {
  state.currentResult = liveResult;
  const latch = updateChordDisplayLatch(liveResult, state.retainedChordResult, state.holdLastChord);
  state.retainedChordResult = latch.retainedResult;
  el.chordDisplay.classList.toggle("is-retaining-chord", latch.isRetained);
  const result = latch.displayResult;
  state.displayedChordResult = result;
  el.alternativeChords.hidden = true;

  if (result.status === "recognized") {
    const interpretation = result.primary.uncertain ? "Root-based estimate" : result.primary.inversion;
    const degreeMode = state.displayMode === "degree";
    const harmony = degreeMode ? harmonyAnalysis(result.primary) : null;
    el.chordName.textContent = harmony?.numeral || result.primary.name;
    el.chordQuality.textContent = harmony ? `${harmony.functionName} · ${harmony.keyName}` : result.primary.quality;
    el.chordMeta.textContent = degreeMode
      ? `${result.primary.name} · ${interpretation} · Bass ${result.bassName}`
      : `${interpretation} · Bass ${result.bassName}`;
    const alternatives = result.candidates.slice(1).map((candidate) => {
      if (!degreeMode) return candidate.name;
      const alternativeHarmony = harmonyAnalysis(candidate);
      return `${alternativeHarmony.numeral} (${candidate.name})`;
    });
    if (alternatives.length) {
      el.alternativeChords.textContent = `Also possible: ${alternatives.join(" · ")}`;
      el.alternativeChords.hidden = false;
    }
  } else if (result.status === "partial") {
    el.chordName.textContent = "Add a note";
    el.chordQuality.textContent = "Waiting for more notes";
    el.chordMeta.textContent = result.noteNames.join(" · ");
  } else if (result.status === "unknown") {
    el.chordName.textContent = "Unknown";
    el.chordQuality.textContent = "No exact chord match";
    el.chordMeta.textContent = result.pitchClassNames.join(" · ");
  } else {
    el.chordName.textContent = "No chord";
    el.chordQuality.textContent = "Ready to listen";
    el.chordMeta.textContent = "Play three or more notes using MIDI or the screen keyboard.";
  }

  stageDisplayTextElements().forEach((element) => {
    element.dataset.readableText = element.textContent;
  });
  syncStageDisplayText();
  state.noteTrailVisualizer?.setHarmony(liveResult.primary?.root, liveResult.bass);
  syncVisualizationColorTheme(liveResult);
  renderNoteList(liveResult);
  updateKeyboard(liveResult);
  scheduleChordStaffRender();
}

function stageDisplayTextElements() {
  return [el.chordQuality, el.chordName, el.chordMeta, el.alternativeChords];
}

let chordNameFitFrame = 0;

function fitChordNameToStage() {
  chordNameFitFrame = 0;
  el.chordName.style.removeProperty("font-size");
  const availableWidth = el.chordName.clientWidth;
  const naturalWidth = el.chordName.scrollWidth;
  const baseFontSize = Number.parseFloat(getComputedStyle(el.chordName).fontSize);
  const fontSize = fittedFontSize(baseFontSize, naturalWidth, availableWidth);
  if (fontSize !== null) el.chordName.style.fontSize = `${fontSize}px`;
}

function scheduleChordNameFit() {
  if (chordNameFitFrame) cancelAnimationFrame(chordNameFitFrame);
  chordNameFitFrame = requestAnimationFrame(fitChordNameToStage);
}

function syncStageDisplayText() {
  stageDisplayTextElements().forEach((element) => {
    const readableText = element.dataset.readableText ?? element.textContent;
    element.dataset.readableText = readableText;
    element.textContent = formatStageDisplayText(state.stageFont, readableText);
    element.setAttribute("aria-label", readableText);
  });

  const readableChordName = el.chordName.dataset.readableText || el.chordName.textContent;
  el.compactChordBadge.textContent = formatStageDisplayText(state.stageFont, readableChordName);
  el.compactChordBadge.setAttribute("aria-label", readableChordName);
  scheduleChordNameFit();
}

function chordStaffIsVisible() {
  return state.chordPresentation === "full"
    && ["staff", "name-staff"].includes(state.centeredContentMode);
}

function renderChordStaff() {
  state.chordStaffFrameId = null;
  if (!chordStaffIsVisible() || !state.chordStaffRenderer) return;
  state.chordStaffRenderer.render({
    notes: state.displayedChordResult?.notes || [],
    spelling: state.spelling,
    bright: state.brightMode,
    alwaysGrand: state.alwaysGrandStaff,
    chord: state.displayedChordResult?.primary || null,
  });
}

function scheduleChordStaffRender() {
  if (!chordStaffIsVisible() || state.chordStaffFrameId !== null) return;
  state.chordStaffFrameId = requestAnimationFrame(renderChordStaff);
}

function syncCompactChordBadgeVisibility() {
  const staffPill = state.chordPresentation === "full" && state.centeredContentMode === "staff";
  el.compactChordBadge.hidden = state.chordPresentation !== "compact" && !staffPill;
}

function syncCenteredContentControls() {
  const centered = state.chordPresentation === "full";
  const showStaff = centered && ["staff", "name-staff"].includes(state.centeredContentMode);
  el.centeredContentSetting.classList.toggle("is-collapsed", !centered);
  el.centeredContentSetting.setAttribute("aria-hidden", String(!centered));
  el.centeredContentSetting.inert = !centered;
  el.chordStaff.hidden = !showStaff;
  el.chordDisplay.dataset.centeredContent = state.centeredContentMode;
  scheduleChordNameFit();
  syncCompactChordBadgeVisibility();
  if (showStaff) scheduleChordStaffRender();
  else {
    cancelAnimationFrame(state.chordStaffFrameId);
    state.chordStaffFrameId = null;
    state.chordStaffRenderer?.cancel();
  }
  requestAnimationFrame(syncAllChordSegmentThumbs);
}

function setCenteredContentMode(mode, persist = true) {
  state.centeredContentMode = ["name", "staff", "name-staff"].includes(mode) ? mode : "name";
  syncChoiceButtons(el.centeredContentButtons, "centeredContent", state.centeredContentMode);
  syncCenteredContentControls();
  if (!persist) return;
  try {
    localStorage.setItem("chord-theory-centered-content", state.centeredContentMode);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function initializeCenteredContentMode() {
  state.chordStaffRenderer = new ChordStaffRenderer(el.chordStaffCanvas, el.chordStaffMessage);
  try {
    const savedMode = localStorage.getItem("chord-theory-centered-content");
    state.centeredContentMode = ["name", "staff", "name-staff"].includes(savedMode)
      ? savedMode
      : "name";
  } catch {
    state.centeredContentMode = "name";
  }
  setCenteredContentMode(state.centeredContentMode, false);
}

function setAlwaysGrandStaff(enabled, persist = true) {
  state.alwaysGrandStaff = Boolean(enabled);
  el.alwaysGrandStaffToggle.setAttribute("aria-checked", String(state.alwaysGrandStaff));
  scheduleChordStaffRender();
  if (!persist) return;
  try {
    localStorage.setItem("chord-theory-always-grand-staff", state.alwaysGrandStaff ? "on" : "off");
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function initializeStaffLayoutPreference() {
  try {
    state.alwaysGrandStaff = localStorage.getItem("chord-theory-always-grand-staff") === "on";
  } catch {
    state.alwaysGrandStaff = false;
  }
  setAlwaysGrandStaff(state.alwaysGrandStaff, false);
}

function setChordPresentation(mode) {
  if (!["full", "visual", "compact"].includes(mode)) return;
  state.chordPresentation = mode;
  el.chordDisplay.dataset.chordPresentation = mode;
  syncChoiceButtons(el.chordPresentationButtons, "chordPresentation", mode);
  syncCenteredContentControls();
}

function setHoldLastChordEnabled(enabled, persist = true) {
  state.holdLastChord = Boolean(enabled);
  el.holdLastChordToggle.setAttribute("aria-checked", String(state.holdLastChord));
  if (persist) {
    try {
      localStorage.setItem("chord-theory-hold-last-chord", state.holdLastChord ? "on" : "off");
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }
  if (state.currentResult) renderResult(state.currentResult);
}

function initializeChordDisplayLatch() {
  let enabled = false;
  try {
    enabled = localStorage.getItem("chord-theory-hold-last-chord") === "on";
  } catch {
    enabled = false;
  }
  setHoldLastChordEnabled(enabled, false);
}

function renderHistory() {
  el.chordHistory.innerHTML = "";
  if (!state.history.length) {
    const item = document.createElement("li");
    item.className = "history-empty";
    item.textContent = "Recognized chords will appear here.";
    el.chordHistory.append(item);
    return;
  }

  let renderedCount = 0;
  for (const entry of state.history) {
    const result = analyzeChord(entry.notes, { spelling: state.spelling });
    if (!result.primary) continue;
    const item = document.createElement("li");
    item.innerHTML = `<strong>${result.primary.name}</strong><span>${result.noteNames.join(" · ")}</span><time>${entry.time}</time>`;
    el.chordHistory.append(item);
    renderedCount += 1;
  }

  if (!renderedCount) {
    const item = document.createElement("li");
    item.className = "history-empty";
    item.textContent = "No history matches the current recognition settings.";
    el.chordHistory.append(item);
  }
}

function commitHistory(result, signature) {
  clearTimeout(state.historyTimer);
  if (!result.primary) return;
  state.historyTimer = setTimeout(() => {
    if (state.currentSignature !== signature) return;
    const previous = state.history[0];
    if (previous?.signature === signature) return;
    state.history.unshift({
      signature,
      notes: [...result.notes],
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
    state.history = state.history.slice(0, 8);
    renderHistory();
  }, 420);
}

function updateRecognition() {
  const notes = [...state.soundingNotes].sort((a, b) => a - b);
  const signature = notes.join(",");
  state.currentSignature = signature;
  const result = analyzeChord(notes, { spelling: state.spelling });
  renderResult(result);
  handleEarTrainingInput(notes);
  commitHistory(result, signature);
}

function scheduleRecognition() {
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(() => {
    state.renderTimer = null;
    updateRecognition();
  }, 55);
}

function flushRecognition() {
  clearTimeout(state.renderTimer);
  state.renderTimer = null;
  updateRecognition();
}

function usesSequencedAutoplayVisualization(source) {
  return state.autoplayEnabled
    && isSequencedPlaybackVisualization(state.autoplayVisualization)
    && String(source || "").startsWith("autoplay:");
}

function pressNote(note, source, velocity = 100, externalOnly = false) {
  let sources = state.noteSources.get(note);
  if (!sources) {
    sources = new Set();
    state.noteSources.set(note, sources);
  }
  const firstSource = sources.size === 0;
  const retrigger = !firstSource;
  sources.add(source);
  let soundFontRetrigger = false;
  let firstSoundFontSource = false;
  if (!externalOnly) {
    let soundFontSources = state.soundFontNoteSources.get(note);
    if (!soundFontSources) {
      soundFontSources = new Set();
      state.soundFontNoteSources.set(note, soundFontSources);
    }
    firstSoundFontSource = soundFontSources.size === 0;
    soundFontRetrigger = !firstSoundFontSource;
    if (soundFontRetrigger) releaseSoundFontNote(note);
    soundFontSources.add(source);
  }
  state.pressedNotes.add(note);
  state.soundingNotes.add(note);
  activateKeyboardHighlight(note);
  if (firstSoundFontSource || soundFontRetrigger) playSoundFontNote(note, velocity);
  const sequencedAutoplaySource = usesSequencedAutoplayVisualization(source);
  const piecePracticeInput = isPiecePracticeVisible();
  if (sequencedAutoplaySource && state.autoplayVisualization === "roll") {
    state.noteTrailVisualizer?.rollNoteOn(source);
  }
  if (firstSource || retrigger) {
    if (sequencedAutoplaySource) {
      if (state.autoplayVisualization === "fall") state.noteTrailVisualizer?.noteImpact(note, velocity);
    } else if (!piecePracticeInput) {
      state.noteTrailVisualizer?.noteOn(note, velocity);
    }
  }
  scheduleRecognition();
}

function releaseNote(note, source) {
  const sources = state.noteSources.get(note);
  if (!sources) return;
  const sequencedAutoplaySource = usesSequencedAutoplayVisualization(source);
  if (sequencedAutoplaySource && state.autoplayVisualization === "roll") {
    state.noteTrailVisualizer?.rollNoteOff(source);
  }
  const releasingFinalSource = sources.has(source) && sources.size === 1;
  const soundFontSources = state.soundFontNoteSources.get(note);
  soundFontSources?.delete(source);
  if (soundFontSources && !soundFontSources.size) {
    state.soundFontNoteSources.delete(note);
    releaseSoundFontNote(note);
  }
  const soundingCountAfterRelease = !state.sustain && releasingFinalSource && state.soundingNotes.has(note)
    ? state.soundingNotes.size - 1
    : state.soundingNotes.size;
  if (shouldCaptureBeforeNoteReduction(
    state.holdLastChord,
    state.soundingNotes.size,
    soundingCountAfterRelease,
  )) {
    flushRecognition();
  }
  sources.delete(source);
  if (sources.size) return;
  state.noteSources.delete(note);
  state.pressedNotes.delete(note);
  if (!state.sustain) {
    state.soundingNotes.delete(note);
    deactivateKeyboardHighlight(note);
    if (!sequencedAutoplaySource && !isPiecePracticeVisible()) {
      state.noteTrailVisualizer?.noteOff(note);
    }
  }
  scheduleRecognition();
}

function setSustain(enabled) {
  if (state.sustain === enabled) return;
  state.sustain = enabled;
  if (!enabled) {
    if (shouldCaptureBeforeNoteReduction(
      state.holdLastChord,
      state.soundingNotes.size,
      state.pressedNotes.size,
    )) {
      flushRecognition();
    }
    for (const note of state.soundingNotes) {
      if (!state.pressedNotes.has(note)) {
        deactivateKeyboardHighlight(note);
        state.noteTrailVisualizer?.noteOff(note);
      }
    }
    state.soundingNotes = new Set(state.pressedNotes);
  }
  state.soundFontPlayer?.controllerChange(AUDIO_CHANNEL, 64, enabled ? 127 : 0);
  if (piecePracticeUsesExternalOutput()) {
    try {
      state.piecePracticeOutputRoute.output.send([0xb0 | AUDIO_CHANNEL, 64, enabled ? 127 : 0]);
    } catch (error) {
      console.warn("Could not send sustain to the piece-practice output.", error);
    }
  }
  el.sustainBadge.classList.toggle("active", enabled);
  el.sustainBadge.innerHTML = `<i data-lucide="footprints" aria-hidden="true"></i>Sustain ${enabled ? "on" : "off"}`;
  window.lucide?.createIcons?.();
  scheduleRecognition();
}

function setSustainSource(source, enabled) {
  if (enabled) state.sustainSources.add(source);
  else state.sustainSources.delete(source);
  setSustain(state.sustainSources.size > 0);
}

function clearNotes() {
  if (state.soundFontPlayer && state.soundFontLoaded) {
    for (const note of state.soundingNotes) releaseSoundFontNote(note);
    state.soundFontPlayer.controllerChange(AUDIO_CHANNEL, 123, 0);
    state.soundFontPlayer.controllerChange(AUDIO_CHANNEL, 64, 0);
  }
  state.noteSources.clear();
  state.soundFontNoteSources.clear();
  state.pointerNotes.clear();
  state.pressedNotes.clear();
  state.soundingNotes.clear();
  state.sustainSources.clear();
  clearKeyboardHighlights();
  state.noteTrailVisualizer?.allNotesOff();
  setSustain(false);
}

function setNoteTrailsEnabled(enabled, persist = true) {
  state.noteTrailsEnabled = Boolean(enabled);
  state.noteTrailVisualizer?.setEnabled(state.noteTrailsEnabled);
  el.noteTrailsToggle.setAttribute("aria-checked", String(state.noteTrailsEnabled));
  el.trailPaletteButtons.forEach((button) => {
    button.disabled = !state.noteTrailsEnabled
      || (button.dataset.trailPalette === "smart" && !state.smartTrailPalette);
  });
  el.trailParticleInput.disabled = !state.noteTrailsEnabled;
  el.upwardSnowInput.disabled = !state.noteTrailsEnabled;
  el.trailGlowInput.disabled = !state.noteTrailsEnabled;
  el.trailSpeedInput.disabled = !state.noteTrailsEnabled;
  el.trailSquareCornersToggle.disabled = !state.noteTrailsEnabled;
  el.customTrailColorInput.disabled = !state.noteTrailsEnabled || state.trailPalette !== "custom";
  el.trailOptions.classList.toggle("is-collapsed", !state.noteTrailsEnabled);
  el.trailOptions.setAttribute("aria-hidden", String(!state.noteTrailsEnabled));
  el.trailOptions.inert = !state.noteTrailsEnabled;
  if (persist) {
    try {
      localStorage.setItem("chord-theory-note-trails", state.noteTrailsEnabled ? "on" : "off");
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }
}

function syncBackgroundControls() {
  syncChoiceButtons(el.backgroundPresetButtons, "visualBackground", state.backgroundMode);
  const custom = state.backgroundMode === "custom";
  const imageBackground = custom
    || (state.backgroundMode === "stage" && Boolean(state.networkBackgroundUrl))
    || (state.backgroundMode === "api" && Boolean(state.apiBackgroundUrl));
  el.backgroundUploadBtn.classList.toggle("active", custom);
  el.backgroundUploadBtn.setAttribute("aria-pressed", String(custom));
  const solid = state.backgroundMode === "solid";
  el.solidBackgroundColorRow.classList.toggle("is-collapsed", !solid);
  el.solidBackgroundColorRow.setAttribute("aria-hidden", String(!solid));
  el.solidBackgroundColorRow.inert = !solid;
  el.solidBackgroundColorInput.disabled = !solid;
  el.backgroundBlurInput.disabled = !imageBackground;
  el.backgroundDarknessInput.disabled = !imageBackground;
  el.backgroundAdjustments.classList.toggle("is-collapsed", !imageBackground);
  el.backgroundAdjustments.setAttribute("aria-hidden", String(!imageBackground));
  el.backgroundAdjustments.inert = !imageBackground;
  el.smartTrailButton.disabled = !state.noteTrailsEnabled || !state.smartTrailPalette;
}

function applyBackgroundAdjustments(persist = true) {
  state.backgroundBlur = Number(el.backgroundBlurInput.value) || 0;
  state.backgroundDarkness = Number(el.backgroundDarknessInput.value) || 0;
  updateRangeProgress(el.backgroundBlurInput);
  updateRangeProgress(el.backgroundDarknessInput);
  const display = el.visualizationBackground.parentElement;
  const imageBackground = state.backgroundMode === "custom"
    || (state.backgroundMode === "stage" && Boolean(state.networkBackgroundUrl))
    || (state.backgroundMode === "api" && Boolean(state.apiBackgroundUrl));
  display.style.setProperty("--visual-background-blur", `${imageBackground ? state.backgroundBlur : 0}px`);
  display.style.setProperty("--visual-background-darkness", String(imageBackground ? state.backgroundDarkness / 100 : 0));
  if (!persist) return;
  try {
    localStorage.setItem("chord-theory-background-blur", String(state.backgroundBlur));
    localStorage.setItem("chord-theory-background-darkness", String(state.backgroundDarkness));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function commitVisualizationBackground(nextMode, persist) {
  state.backgroundMode = nextMode;
  syncBrightSolidBackgroundOverride();
  applyVisualizationBackgroundToLayer(el.visualizationBackground, nextMode);
  syncBackgroundControls();
  applyBackgroundAdjustments(false);
  updateSmartPaletteForMode(nextMode);
  if (persist) {
    try {
      localStorage.setItem("chord-theory-background-mode", nextMode);
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }
}

function setBrightMode(enabled, persist = true) {
  state.brightMode = Boolean(enabled);
  el.brightModeToggle.setAttribute("aria-checked", String(state.brightMode));
  el.chordDisplay.dataset.brightMode = String(state.brightMode);
  scheduleChordStaffRender();
  if (!persist) return;
  try {
    localStorage.setItem("chord-theory-bright-mode", state.brightMode ? "on" : "off");
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function isBrightSolidBackground(mode = state.backgroundMode, color = state.solidBackgroundColor) {
  return mode === "solid" && hexToRgbColor(color).every((channel) => channel > 165);
}

function syncBrightSolidBackgroundOverride() {
  const forced = isBrightSolidBackground();
  const wasForced = state.brightSolidOverride;
  state.brightSolidOverride = forced;
  el.brightModeToggle.disabled = forced;
  el.brightModeToggle.setAttribute("aria-disabled", String(forced));
  if (forced) setBrightMode(true, false);
  else if (wasForced) setBrightMode(false);
  applyVisualizationColorMode();
}

function applyVisualizationBackgroundToLayer(layer, mode) {
  layer.dataset.background = mode;
  if (mode === "custom") {
    layer.style.backgroundImage = `url("${state.customBackgroundUrl}")`;
  } else if (mode === "stage" && state.networkBackgroundUrl) {
    layer.style.backgroundImage = `url("${state.networkBackgroundUrl}")`;
  } else if (mode === "api" && state.apiBackgroundUrl) {
    layer.style.backgroundImage = `url("${state.apiBackgroundUrl}")`;
  } else {
    layer.style.backgroundImage = "";
  }
}

function resetBackgroundTransition() {
  const incoming = el.visualizationBackgroundIncoming;
  el.visualizationBackground.classList.add("is-settling");
  incoming.classList.add("is-settling");
  el.visualizationBackground.classList.remove("is-fading-out");
  incoming.classList.remove("is-visible");
  incoming.style.backgroundImage = "";
  incoming.dataset.background = "none";
  void incoming.offsetWidth;
  el.visualizationBackground.classList.remove("is-settling");
  incoming.classList.remove("is-settling");
}

function setVisualizationBackground(mode, persist = true) {
  const nextMode = normalizeBackgroundMode(mode, Boolean(state.customBackgroundUrl));
  const shouldAnimate = persist
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    && (nextMode !== state.backgroundMode || nextMode === "custom" || nextMode === "stage" || nextMode === "api");

  window.clearTimeout(state.backgroundTransitionTimer);
  if (!shouldAnimate) {
    resetBackgroundTransition();
    commitVisualizationBackground(nextMode, persist);
    return;
  }

  resetBackgroundTransition();
  applyVisualizationBackgroundToLayer(el.visualizationBackgroundIncoming, nextMode);
  requestAnimationFrame(() => {
    el.visualizationBackground.classList.add("is-fading-out");
    el.visualizationBackgroundIncoming.classList.add("is-visible");
  });
  state.backgroundTransitionTimer = window.setTimeout(() => {
    el.visualizationBackground.classList.add("is-settling");
    el.visualizationBackgroundIncoming.classList.add("is-settling");
    commitVisualizationBackground(nextMode, persist);
    requestAnimationFrame(() => {
      el.visualizationBackground.classList.remove("is-fading-out");
      el.visualizationBackgroundIncoming.classList.remove("is-visible");
      el.visualizationBackgroundIncoming.style.backgroundImage = "";
      el.visualizationBackgroundIncoming.dataset.background = "none";
      void el.visualizationBackgroundIncoming.offsetWidth;
      el.visualizationBackground.classList.remove("is-settling");
      el.visualizationBackgroundIncoming.classList.remove("is-settling");
    });
  }, 240);
}

function rememberRecentBackgroundId(ids, id) {
  const value = String(id ?? "");
  if (!value) return;
  const previousIndex = ids.indexOf(value);
  if (previousIndex >= 0) ids.splice(previousIndex, 1);
  ids.push(value);
  if (ids.length > RECENT_BACKGROUND_ID_LIMIT) ids.splice(0, ids.length - RECENT_BACKGROUND_ID_LIMIT);
}

async function findVistaBackground(requestId) {
  let lastError = null;
  for (let attempt = 0; attempt < VISTA_BACKGROUND_LOAD_ATTEMPTS; attempt += 1) {
    const queryIndex = (
      state.networkBackgroundQueryOffset + requestId + attempt - 1
    ) % NETWORK_BACKGROUND_QUERIES.length;
    const query = NETWORK_BACKGROUND_QUERIES[queryIndex];
    const page = 1 + Math.floor(Math.random() * VISTA_SEARCH_PAGE_LIMIT);
    try {
      const response = await fetch(buildVistaBackgroundRequestUrl(query, page), {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Vista background request failed with HTTP ${response.status}.`);
      const background = parseVistaBackgroundResponse(
        await response.json(),
        state.networkBackgroundSeenIds,
      );
      await loadImageFromUrl(background.url);
      if (requestId !== state.networkBackgroundRequestId) return null;
      return { ...background, query };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No Vista background was available.");
}

async function loadNetworkBackground(persist = true) {
  const requestId = ++state.networkBackgroundRequestId;
  const button = document.querySelector('[data-visual-background="stage"]');
  button.classList.add("is-loading");
  button.disabled = true;
  try {
    const background = await findVistaBackground(requestId);
    if (!background || requestId !== state.networkBackgroundRequestId) return;
    state.networkBackgroundUrl = background.url;
    state.networkBackgroundBlob = null;
    state.networkBackgroundQuery = background.query;
    rememberRecentBackgroundId(state.networkBackgroundSeenIds, background.id);
    document.documentElement.style.setProperty("--network-background-preview", `url("${background.url}")`);
    button.classList.add("has-preview");
    setVisualizationBackground("stage", persist);
    updateSmartPaletteFromNetwork(background.url, background.query);
  } catch (error) {
    if (requestId !== state.networkBackgroundRequestId) return;
    console.warn("Vista search unavailable; trying the cached image endpoint.", error);
    const queryIndex = (state.networkBackgroundQueryOffset + requestId - 1) % NETWORK_BACKGROUND_QUERIES.length;
    const query = NETWORK_BACKGROUND_QUERIES[queryIndex];
    const fallbackUrl = `${NETWORK_BACKGROUND_FALLBACK_URL}?q=${encodeURIComponent(query)}&w=1600`;
    try {
      await loadImageFromUrl(fallbackUrl);
      if (requestId !== state.networkBackgroundRequestId) return;
      state.networkBackgroundUrl = fallbackUrl;
      state.networkBackgroundBlob = null;
      state.networkBackgroundQuery = query;
      document.documentElement.style.setProperty("--network-background-preview", `url("${fallbackUrl}")`);
      button.classList.add("has-preview");
      setVisualizationBackground("stage", persist);
      updateSmartPaletteFromNetwork(fallbackUrl, query);
    } catch (fallbackError) {
      if (requestId !== state.networkBackgroundRequestId) return;
      console.warn("Network background unavailable; keeping the previous Vista image.", fallbackError);
      if (!state.networkBackgroundUrl) {
        document.documentElement.style.removeProperty("--network-background-preview");
        button.classList.remove("has-preview");
      }
      setVisualizationBackground("stage", persist);
    }
  } finally {
    if (requestId === state.networkBackgroundRequestId) {
      button.classList.remove("is-loading");
      button.disabled = false;
    }
  }
}

function hexToRgbColor(value) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value || "");
  return match ? match.slice(1).map((channel) => Number.parseInt(channel, 16)) : [16, 16, 20];
}

function setBackgroundApiPanelVisible(visible) {
  setConditionalRegionVisible(el.backgroundApiPanel, visible);
  el.backgroundApiEntryBtn.setAttribute("aria-expanded", String(visible));
}

async function requestBackgroundFromApi(endpoint) {
  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: { Accept: "image/*, application/json" },
    });
    if (!response.ok) throw new Error(`Background API returned HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type") || "";
    if (contentType.startsWith("image/")) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      try {
        await loadImageFromUrl(url);
        return { url, blob };
      } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
      }
    }

    const imageUrl = parseBackgroundApiResponse(await response.json());
    await loadImageFromUrl(imageUrl);
    return { url: imageUrl, blob: null };
  } catch (requestError) {
    try {
      await loadImageFromUrl(endpoint);
      return { url: endpoint, blob: null };
    } catch {
      throw requestError;
    }
  }
}

async function loadBackgroundApiUrl() {
  const endpoint = normalizeBackgroundApiUrl(el.backgroundApiUrlInput.value);
  if (!endpoint) {
    el.backgroundApiStatus.textContent = "Enter a valid HTTP or HTTPS URL.";
    return;
  }

  const requestId = ++state.apiBackgroundRequestId;
  el.backgroundApiEntryBtn.classList.add("is-loading");
  el.backgroundApiEntryBtn.disabled = true;
  el.backgroundApiLoadBtn.disabled = true;
  el.backgroundApiUrlInput.disabled = true;
  el.backgroundApiStatus.textContent = "Loading background...";
  try {
    const background = await requestBackgroundFromApi(endpoint);
    if (requestId !== state.apiBackgroundRequestId) {
      if (background.blob) URL.revokeObjectURL(background.url);
      return;
    }

    const previousUrl = state.apiBackgroundUrl;
    const previousWasObjectUrl = Boolean(state.apiBackgroundBlob);
    state.apiBackgroundUrl = background.url;
    state.apiBackgroundBlob = background.blob;
    document.documentElement.style.setProperty("--api-background-preview", `url("${background.url}")`);
    el.backgroundApiEntryBtn.classList.add("has-preview");
    el.backgroundApiStatus.textContent = "Background loaded from your API URL.";
    setVisualizationBackground("api");
    if (background.blob) updateSmartPaletteFromBackground(background.blob);
    else updateSmartPaletteFromApi(background.url);
    if (previousWasObjectUrl && previousUrl) {
      window.setTimeout(() => URL.revokeObjectURL(previousUrl), 500);
    }
  } catch (error) {
    if (requestId !== state.apiBackgroundRequestId) return;
    console.warn("Could not load the user-provided background API URL.", error);
    el.backgroundApiStatus.textContent = error.message || "Could not load this API URL.";
  } finally {
    if (requestId === state.apiBackgroundRequestId) {
      el.backgroundApiEntryBtn.classList.remove("is-loading");
      el.backgroundApiEntryBtn.disabled = false;
      el.backgroundApiLoadBtn.disabled = false;
      el.backgroundApiUrlInput.disabled = false;
      syncBackgroundControls();
    }
  }
}

function applySmartTrailPalette(palette) {
  state.smartTrailPalette = palette;
  document.documentElement.style.setProperty("--smart-trail-gradient", paletteCssGradient(palette));
  el.smartTrailButton.disabled = !state.noteTrailsEnabled;
  if (state.trailPalette === "smart") {
    applyTrailEffects(false);
    syncVisualizationColorTheme();
  }
}

function updateSmartPaletteForMode(mode = state.backgroundMode) {
  if (mode === "custom" && state.customBackgroundBlob) {
    updateSmartPaletteFromBackground(state.customBackgroundBlob);
    return;
  }
  if (mode === "stage") {
    if (state.networkBackgroundBlob) updateSmartPaletteFromBackground(state.networkBackgroundBlob);
    else {
      state.smartPaletteRequestId += 1;
      applySmartTrailPalette(createSmartPaletteFromColors(
        NETWORK_QUERY_COLORS[state.networkBackgroundQuery] || NETWORK_QUERY_COLORS["mountain landscape"],
        state.backgroundDarkness / 100,
      ));
    }
    return;
  }
  if (mode === "api") {
    if (state.apiBackgroundBlob) updateSmartPaletteFromBackground(state.apiBackgroundBlob);
    else {
      state.smartPaletteRequestId += 1;
      applySmartTrailPalette(createSmartPaletteFromColors(
        PRESET_BACKGROUND_COLORS.api,
        state.backgroundDarkness / 100,
      ));
    }
    return;
  }
  const narrativePalette = createNarrativeBackgroundPalette(mode);
  if (narrativePalette) {
    state.smartPaletteRequestId += 1;
    applySmartTrailPalette(narrativePalette);
    return;
  }
  state.smartPaletteRequestId += 1;
  const colors = mode === "solid"
    ? [hexToRgbColor(state.solidBackgroundColor)]
    : (PRESET_BACKGROUND_COLORS[mode] || PRESET_BACKGROUND_COLORS.none);
  applySmartTrailPalette(createSmartPaletteFromColors(colors, 0));
}

async function updateSmartPaletteFromNetwork(url, query) {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (url !== state.networkBackgroundUrl) return;
    state.networkBackgroundBlob = blob;
    if (state.backgroundMode === "stage") updateSmartPaletteFromBackground(blob);
  } catch {
    if (url !== state.networkBackgroundUrl) return;
    state.networkBackgroundBlob = null;
    if (state.backgroundMode === "stage") {
      applySmartTrailPalette(createSmartPaletteFromColors(
        NETWORK_QUERY_COLORS[query] || NETWORK_QUERY_COLORS["mountain landscape"],
        state.backgroundDarkness / 100,
      ));
    }
  }
}

async function updateSmartPaletteFromApi(url) {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (url !== state.apiBackgroundUrl) return;
    state.apiBackgroundBlob = blob;
    if (state.backgroundMode === "api") updateSmartPaletteFromBackground(blob);
  } catch {
    if (url !== state.apiBackgroundUrl) return;
    state.apiBackgroundBlob = null;
    if (state.backgroundMode === "api") {
      applySmartTrailPalette(createSmartPaletteFromColors(
        PRESET_BACKGROUND_COLORS.api,
        state.backgroundDarkness / 100,
      ));
    }
  }
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = () => reject(new Error("The selected file is not a readable image."));
    image.src = url;
  });
}

function installCustomBackground(blob, name) {
  const previousUrl = state.customBackgroundUrl;
  state.customBackgroundUrl = URL.createObjectURL(blob);
  state.customBackgroundBlob = blob;
  state.customBackgroundName = name || "Custom background";
  el.backgroundUploadStatus.textContent = state.customBackgroundName;
  setVisualizationBackground("custom");
  updateSmartPaletteFromBackground(blob);
  if (previousUrl) window.setTimeout(() => URL.revokeObjectURL(previousUrl), 500);
}

async function updateSmartPaletteFromBackground(blob) {
  const requestId = ++state.smartPaletteRequestId;
  try {
    const palette = await createSmartPaletteFromBlob(blob, state.backgroundDarkness / 100);
    if (requestId !== state.smartPaletteRequestId) return;
    applySmartTrailPalette(palette);
  } catch (error) {
    if (requestId !== state.smartPaletteRequestId) return;
    console.error("Could not analyze the background palette.", error);
    const fallbackColors = state.backgroundMode === "stage"
      ? (NETWORK_QUERY_COLORS[state.networkBackgroundQuery] || NETWORK_QUERY_COLORS["mountain landscape"])
      : state.backgroundMode === "api"
        ? PRESET_BACKGROUND_COLORS.api
      : state.backgroundMode === "solid"
        ? [hexToRgbColor(state.solidBackgroundColor)]
        : (PRESET_BACKGROUND_COLORS[state.backgroundMode] || PRESET_BACKGROUND_COLORS.none);
    applySmartTrailPalette(createSmartPaletteFromColors(
      fallbackColors,
      ["stage", "api"].includes(state.backgroundMode) ? state.backgroundDarkness / 100 : 0,
    ));
  }
}

async function handleBackgroundUpload(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    el.backgroundUploadStatus.textContent = "Choose an image file";
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    el.backgroundUploadStatus.textContent = "Image must be under 20 MB";
    return;
  }
  const previewUrl = URL.createObjectURL(file);
  try {
    await loadImageFromUrl(previewUrl);
    installCustomBackground(file, file.name);
    await saveCustomBackground(file);
  } catch (error) {
    console.error(error);
    el.backgroundUploadStatus.textContent = "Could not load this image";
  } finally {
    URL.revokeObjectURL(previewUrl);
    el.backgroundImageInput.value = "";
  }
}

async function initializeVisualizationBackground() {
  try {
    state.backgroundMode = localStorage.getItem("chord-theory-background-mode") || "none";
    state.backgroundBlur = Number(localStorage.getItem("chord-theory-background-blur") ?? 8);
    state.backgroundDarkness = Number(localStorage.getItem("chord-theory-background-darkness") ?? 58);
    state.solidBackgroundColor = localStorage.getItem("chord-theory-solid-background-color") || "#101014";
    state.brightMode = localStorage.getItem("chord-theory-bright-mode") === "on";
  } catch {
    state.backgroundMode = "none";
    state.brightMode = false;
  }
  el.backgroundBlurInput.value = String(Math.max(0, Math.min(30, state.backgroundBlur || 0)));
  el.backgroundDarknessInput.value = String(Math.max(0, Math.min(90, state.backgroundDarkness || 0)));
  el.solidBackgroundColorInput.value = state.solidBackgroundColor;
  document.documentElement.style.setProperty("--visual-solid-background", state.solidBackgroundColor);
  setBrightMode(state.brightMode, false);
  applyBackgroundAdjustments(false);

  if (state.backgroundMode === "custom") {
    try {
      const stored = await loadCustomBackground();
      if (stored?.blob) installCustomBackground(stored.blob, stored.name);
      else setVisualizationBackground("none", false);
    } catch (error) {
      console.error(error);
      setVisualizationBackground("none", false);
    }
  } else if (state.backgroundMode === "stage") {
    loadNetworkBackground(false);
  } else if (state.backgroundMode === "api") {
    setVisualizationBackground("none", false);
  } else {
    setVisualizationBackground(state.backgroundMode, false);
  }
}

function applyTrailEffects(persist = true) {
  state.trailParticleIntensity = Number(el.trailParticleInput.value) || 0;
  state.upwardSnowIntensity = Number(el.upwardSnowInput.value) || 0;
  state.trailGlowIntensity = Number(el.trailGlowInput.value) || 0;
  state.trailSpeed = Number(el.trailSpeedInput.value) || 100;
  state.trailSquareCorners = el.trailSquareCornersToggle.getAttribute("aria-checked") === "true";
  updateRangeProgress(el.trailParticleInput);
  updateRangeProgress(el.upwardSnowInput);
  updateRangeProgress(el.trailGlowInput);
  updateRangeProgress(el.trailSpeedInput);
  state.noteTrailVisualizer?.setEffects({
    palette: state.trailPalette,
    customColor: state.customTrailColor,
    smartPalette: state.smartTrailPalette,
    particleIntensity: state.trailParticleIntensity / 100,
    upwardSnowIntensity: state.upwardSnowIntensity / 100,
    glowIntensity: state.trailGlowIntensity / 100,
    speedMultiplier: state.trailSpeed / 100,
    squareCorners: state.trailSquareCorners,
  });
  syncPiecePracticeKeyGuides();
  if (!persist) return;
  try {
    localStorage.setItem("chord-theory-trail-palette", state.trailPalette);
    localStorage.setItem("chord-theory-custom-trail-color", state.customTrailColor);
    localStorage.setItem("chord-theory-trail-particles", String(state.trailParticleIntensity));
    localStorage.setItem("chord-theory-upward-snow-intensity", String(state.upwardSnowIntensity));
    localStorage.setItem("chord-theory-trail-glow", String(state.trailGlowIntensity));
    localStorage.setItem("chord-theory-trail-speed", String(state.trailSpeed));
    localStorage.setItem("chord-theory-trail-square-corners", state.trailSquareCorners ? "on" : "off");
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function setTrailPalette(palette, persist = true) {
  state.trailPalette = ["classic", "aurora", "spectrum", "solar", "smart", "custom"].includes(palette) ? palette : "classic";
  const custom = state.trailPalette === "custom";
  el.customTrailColorRow.classList.toggle("is-collapsed", !custom);
  el.customTrailColorRow.setAttribute("aria-hidden", String(!custom));
  el.customTrailColorRow.inert = !custom;
  el.customTrailColorInput.disabled = !state.noteTrailsEnabled || !custom;
  syncChoiceButtons(el.trailPaletteButtons, "trailPalette", state.trailPalette);
  applyTrailEffects(persist);
  applyVisualizationColorMode();
}

function setCustomTrailColor(color) {
  state.customTrailColor = color;
  document.documentElement.style.setProperty("--custom-trail-color", color);
  setTrailPalette("custom");
}

function setSolidBackgroundColor(color) {
  state.solidBackgroundColor = color;
  document.documentElement.style.setProperty("--visual-solid-background", color);
  try {
    localStorage.setItem("chord-theory-solid-background-color", color);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
  setVisualizationBackground("solid");
}

function initializeNoteTrails() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let savedPreference = null;
  try {
    savedPreference = localStorage.getItem("chord-theory-note-trails");
    state.trailPalette = localStorage.getItem("chord-theory-trail-palette") || "classic";
    state.customTrailColor = localStorage.getItem("chord-theory-custom-trail-color") || "#ffd52e";
    state.trailParticleIntensity = Number(localStorage.getItem("chord-theory-trail-particles") ?? 45);
    const savedSnowIntensity = localStorage.getItem("chord-theory-upward-snow-intensity");
    state.upwardSnowIntensity = savedSnowIntensity === null
      ? (localStorage.getItem("chord-theory-upward-snow") === "on" ? 45 : 0)
      : Number(savedSnowIntensity);
    state.trailGlowIntensity = Number(localStorage.getItem("chord-theory-trail-glow") ?? 35);
    state.trailSpeed = Number(localStorage.getItem("chord-theory-trail-speed") ?? 100);
    state.trailSquareCorners = localStorage.getItem("chord-theory-trail-square-corners") === "on";
    state.preferredVisualizationColorMode = localStorage.getItem("chord-theory-visualization-color-mode") === "accent" ? "accent" : "note";
  } catch {
    savedPreference = null;
  }
  state.noteTrailsEnabled = savedPreference ? savedPreference === "on" : !reducedMotion;
  el.trailParticleInput.value = String(Math.max(0, Math.min(100, state.trailParticleIntensity)));
  el.upwardSnowInput.value = String(Math.max(0, Math.min(100, state.upwardSnowIntensity)));
  el.trailGlowInput.value = String(Math.max(0, Math.min(100, state.trailGlowIntensity)));
  el.trailSpeedInput.value = String(Math.max(50, Math.min(200, state.trailSpeed)));
  el.trailSquareCornersToggle.setAttribute("aria-checked", String(state.trailSquareCorners));
  el.customTrailColorInput.value = state.customTrailColor;
  document.documentElement.style.setProperty("--custom-trail-color", state.customTrailColor);
  state.noteTrailVisualizer = new NoteTrailVisualizer(el.noteTrailCanvas, el.chordKeyboard, {
    enabled: state.noteTrailsEnabled,
    reducedMotion,
    palette: state.trailPalette,
    customColor: state.customTrailColor,
    smartPalette: state.smartTrailPalette,
    particleIntensity: state.trailParticleIntensity / 100,
    upwardSnowIntensity: state.upwardSnowIntensity / 100,
    glowIntensity: state.trailGlowIntensity / 100,
    speedMultiplier: state.trailSpeed / 100,
    squareCorners: state.trailSquareCorners,
  });
  setTrailPalette(state.trailPalette, false);
  setVisualizationColorMode(state.preferredVisualizationColorMode, false);
  applyTrailEffects(false);
  setNoteTrailsEnabled(state.noteTrailsEnabled, false);
}

function handleKeyboardPointerDown(event) {
  if (event.button !== 0) return;
  const key = event.target.closest(".piano-key");
  if (!key || !el.chordKeyboard.contains(key)) return;
  event.preventDefault();

  const note = Number(key.dataset.note);
  const source = `pointer:${event.pointerId}`;
  const previousNote = state.pointerNotes.get(event.pointerId);
  if (previousNote !== undefined) {
    forwardPiecePracticeNoteOff(previousNote, source);
    releaseNote(previousNote, source);
  }

  state.pointerNotes.set(event.pointerId, note);
  const wasAlreadyPressed = state.pressedNotes.has(note);
  const externalOnly = piecePracticeSuppressesLocalInput();
  pressNote(note, source, 100, externalOnly);
  forwardPiecePracticeNoteOn(note, 100, source);
  if (!wasAlreadyPressed) maybeJumpPiecePracticeToNote(note);
  state.piecePracticeController?.acceptHeldNotes(state.pressedNotes);
  key.classList.add("is-pointer-down");
  key.setPointerCapture?.(event.pointerId);
  el.lastMidiMessage.textContent = `${noteName(note, state.spelling)} on · screen keyboard`;
  syncListeningStatus();
  window.lucide?.createIcons?.();
}

function handleKeyboardPointerEnd(event) {
  const note = state.pointerNotes.get(event.pointerId);
  if (note === undefined) return;
  state.pointerNotes.delete(event.pointerId);
  const source = `pointer:${event.pointerId}`;
  forwardPiecePracticeNoteOff(note, source);
  releaseNote(note, source);
  if (![...state.pointerNotes.values()].includes(note)) {
    el.chordKeyboard.querySelector(`.piano-key[data-note="${note}"]`)?.classList.remove("is-pointer-down");
  }
  el.lastMidiMessage.textContent = `${noteName(note, state.spelling)} off · screen keyboard`;
}

function isTextOrControlTarget(target) {
  return target instanceof Element && Boolean(target.closest("input, select, textarea, button, [contenteditable='true']"));
}

function handleSustainKeyDown(event) {
  if (event.code !== "KeyQ" || event.repeat || isTextOrControlTarget(event.target)) return;
  event.preventDefault();
  setSustainSource("keyboard", true);
}

function handleSustainKeyUp(event) {
  if (event.code !== "KeyQ" || !state.sustainSources.has("keyboard")) return;
  event.preventDefault();
  setSustainSource("keyboard", false);
}

function toggleAutoplayPlayback() {
  const player = state.autoplayController;
  if (player?.playing) {
    player.pause();
    return true;
  }
  if (player?.play()) return true;
  el.autoplayStatus.textContent = "Load a MIDI file and choose an output first.";
  return false;
}

function handleAppShortcutKeyDown(event) {
  const action = resolveChordShortcut({
    code: event.code,
    key: event.key,
    repeat: event.repeat,
    controlTarget: isTextOrControlTarget(event.target),
    autoplayEnabled: state.autoplayEnabled,
    hasAutoplaySong: Boolean(state.autoplayController?.song),
  });
  if (!action) return;
  event.preventDefault();
  if (action === "fullscreen") toggleChordFullscreen();
  else toggleAutoplayPlayback();
}

function releaseTransientInput() {
  for (const [pointerId, note] of state.pointerNotes) {
    const source = `pointer:${pointerId}`;
    forwardPiecePracticeNoteOff(note, source);
    releaseNote(note, source);
  }
  state.pointerNotes.clear();
  el.chordKeyboard.querySelectorAll(".is-pointer-down").forEach((key) => key.classList.remove("is-pointer-down"));
  setSustainSource("keyboard", false);
}

function handleMidiMessage(event) {
  const [status, data1, data2] = event.data;
  const command = status & 0xf0;

  if (command === 0x90 && data2 > 0) {
    if (state.harmonyLearnDeadline > 0) {
      setHarmonyTonic(data1);
      cancelHarmonyLearn();
    }
    const wasAlreadyPressed = state.pressedNotes.has(data1);
    const externalOnly = piecePracticeSuppressesLocalInput();
    pressNote(data1, "midi", data2, externalOnly);
    forwardPiecePracticeNoteOn(data1, data2, "midi");
    if (!wasAlreadyPressed) maybeJumpPiecePracticeToNote(data1);
    state.piecePracticeController?.acceptHeldNotes(state.pressedNotes);
    el.lastMidiMessage.textContent = `${noteName(data1, state.spelling)} on · velocity ${data2}`;
    syncListeningStatus();
  } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
    forwardPiecePracticeNoteOff(data1, "midi");
    releaseNote(data1, "midi");
    el.lastMidiMessage.textContent = `${noteName(data1, state.spelling)} off`;
  } else if (command === 0xb0 && data1 === 64) {
    setSustainSource("midi", data2 >= 64);
    el.lastMidiMessage.textContent = data2 >= 64 ? "Sustain pedal down" : "Sustain pedal up";
  } else if (command === 0xb0 && [120, 121, 123].includes(data1)) {
    clearNotes();
    el.lastMidiMessage.textContent = "All notes off";
  }

  window.lucide?.createIcons?.();
}

function formatPlaybackTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function isPiecePracticeVisible() {
  return state.educationalModeEnabled
    && state.educationView === "learn"
    && state.learningView === "piece";
}

function clearPiecePracticeKeyGuides() {
  for (const note of state.piecePracticeGuidedNotes) {
    const key = state.keyboardKeys.get(note);
    key?.classList.remove("is-key-guided");
    key?.style.removeProperty("--key-guide-original-weight");
  }
  state.piecePracticeGuidedNotes.clear();
  el.keyGuideLegend.hidden = true;
}

function syncPiecePracticeKeyGuides(position = state.piecePracticeController?.currentPosition() || 0) {
  const player = state.piecePracticeController;
  if (!state.piecePracticeKeyGuidesEnabled || !isPiecePracticeVisible() || !player?.song) {
    clearPiecePracticeKeyGuides();
    return;
  }

  el.keyGuideLegend.hidden = false;
  const horizon = position + fallLookaheadSeconds(state.trailSpeed / 100, player.speed);
  const guideLevels = upcomingGuideLevels(state.piecePracticeNoteSpans, position, horizon);
  const guidedNotes = new Set(guideLevels.keys());
  for (const note of state.piecePracticeGuidedNotes) {
    if (guidedNotes.has(note)) continue;
    const key = state.keyboardKeys.get(note);
    key?.classList.remove("is-key-guided");
    key?.style.removeProperty("--key-guide-original-weight");
  }
  for (const note of guidedNotes) {
    const key = state.keyboardKeys.get(note);
    if (!key) continue;
    const proximity = guideLevels.get(note) || 0;
    const originalWeight = 14 + proximity ** 1.35 * 86;
    key.style.setProperty("--key-guide-original-weight", `${originalWeight.toFixed(1)}%`);
    key.classList.add("is-key-guided");
  }
  state.piecePracticeGuidedNotes = new Set(
    [...guidedNotes].filter((note) => state.keyboardKeys.has(note)),
  );
}

function setPiecePracticeKeyGuidesEnabled(enabled, persist = true) {
  state.piecePracticeKeyGuidesEnabled = Boolean(enabled);
  el.piecePracticeKeyGuidesToggle.setAttribute(
    "aria-checked",
    String(state.piecePracticeKeyGuidesEnabled),
  );
  syncPiecePracticeKeyGuides();
  if (!persist) return;
  try {
    localStorage.setItem(
      "chord-theory-keyfall-key-guides",
      state.piecePracticeKeyGuidesEnabled ? "on" : "off",
    );
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function setPiecePracticeEarlyJumpEnabled(enabled, persist = true) {
  state.piecePracticeEarlyJumpEnabled = Boolean(enabled);
  el.piecePracticeEarlyJumpToggle.setAttribute(
    "aria-checked",
    String(state.piecePracticeEarlyJumpEnabled),
  );
  if (!persist) return;
  try {
    localStorage.setItem(
      "chord-theory-keyfall-early-note-jump",
      state.piecePracticeEarlyJumpEnabled ? "on" : "off",
    );
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function maybeJumpPiecePracticeToNote(note) {
  const player = state.piecePracticeController;
  if (!state.piecePracticeEarlyJumpEnabled
    || !isPiecePracticeVisible()
    || !player?.playing
    || player.waiting
    || state.piecePracticeSeeking) {
    return false;
  }

  const position = player.currentPosition();
  const horizon = position + fallLookaheadSeconds(state.trailSpeed / 100, player.speed);
  const landingTime = findUpcomingNoteTime(
    state.piecePracticeNoteSpans,
    note,
    position,
    horizon,
  );
  if (landingTime === null) return false;
  player.seek(landingTime);
  return true;
}

function setPiecePracticePrompt(title, text, status = "idle") {
  el.piecePracticePromptTitle.textContent = title;
  el.piecePracticePromptText.textContent = text;
  el.piecePracticePrompt.dataset.status = status;
}

function clearPiecePracticeOutput() {
  const route = state.piecePracticeOutputRoute;
  if (route?.kind === "midi") {
    for (const { note } of state.piecePracticeForwardedNotes.values()) {
      try {
        route.output.send([0x80 | AUDIO_CHANNEL, note, 0]);
      } catch (error) {
        console.warn("Could not release piece-practice note.", error);
      }
    }
    try {
      route.output.send([0xb0 | AUDIO_CHANNEL, 64, 0]);
      route.output.send([0xb0 | AUDIO_CHANNEL, 123, 0]);
    } catch (error) {
      console.warn("Could not reset the piece-practice MIDI output.", error);
    }
  }
  state.piecePracticeForwardedNotes.clear();
  state.piecePracticeOutputRoute = null;
}

function piecePracticeUsesExternalOutput() {
  return isPiecePracticeVisible() && state.piecePracticeOutputRoute?.kind === "midi";
}

function piecePracticeSuppressesLocalInput() {
  return isPiecePracticeVisible()
    && ["midi", "none"].includes(state.piecePracticeOutputRoute?.kind);
}

function forwardPiecePracticeNoteOn(note, velocity, source) {
  if (!piecePracticeUsesExternalOutput()) return;
  const route = state.piecePracticeOutputRoute;
  const key = `${source}:${note}`;
  try {
    if (state.piecePracticeForwardedNotes.has(key)) {
      route.output.send([0x80 | AUDIO_CHANNEL, note, 0]);
    }
    route.output.send([0x90 | AUDIO_CHANNEL, note, velocity]);
    state.piecePracticeForwardedNotes.set(key, { note });
  } catch (error) {
    console.warn("Could not send piece-practice note.", error);
  }
}

function forwardPiecePracticeNoteOff(note, source) {
  const route = state.piecePracticeOutputRoute;
  const key = `${source}:${note}`;
  if (route?.kind !== "midi" || !state.piecePracticeForwardedNotes.has(key)) return;
  try {
    route.output.send([0x80 | AUDIO_CHANNEL, note, 0]);
  } catch (error) {
    console.warn("Could not release piece-practice note.", error);
  }
  state.piecePracticeForwardedNotes.delete(key);
}

function renderPiecePracticeProgress(position, duration, force = false) {
  const now = performance.now();
  if (!force && now - state.piecePracticeProgressRenderedAt < AUTOPLAY_PROGRESS_UI_INTERVAL_MS) return;
  state.piecePracticeProgressRenderedAt = now;
  if (!state.piecePracticeSeeking) {
    el.piecePracticeProgress.value = duration ? String((position / duration) * 1000) : "0";
    updateRangeProgress(el.piecePracticeProgress);
  }
  el.piecePracticeTime.textContent = `${formatPlaybackTime(position)} / ${formatPlaybackTime(duration)}`;
  syncPiecePracticeKeyGuides(position);
}

function syncPiecePracticeVisualization() {
  if (!isPiecePracticeVisible()) return;
  const player = state.piecePracticeController;
  const active = Boolean(player?.song);
  state.noteTrailVisualizer?.setPlaybackVisualization("fall");
  state.noteTrailVisualizer?.setFallingNotes(state.piecePracticeNoteSpans);
  state.noteTrailVisualizer?.setPlaybackState({
    active,
    playing: Boolean(player?.playing),
    position: player?.currentPosition() || 0,
    speed: player?.speed || 1,
    transpose: 0,
  });
  el.chordDisplay.dataset.autoplayVisualization = active ? "fall" : "rise";
}

function syncPiecePracticeTransport(status) {
  const player = state.piecePracticeController;
  const hasSong = Boolean(player?.song);
  setConditionalRegionVisible(el.piecePracticeControls, hasSong);
  el.piecePracticePlayBtn.disabled = !hasSong || state.piecePracticeLoading || Boolean(player?.waiting);
  el.piecePracticeStopBtn.disabled = !hasSong;
  el.piecePracticeProgress.disabled = !hasSong || state.piecePracticeLoading;
  el.piecePracticeSpeed.disabled = !hasSong || state.piecePracticeLoading;

  const playing = Boolean(player?.playing);
  const label = playing ? "Pause" : "Play";
  el.piecePracticePlayBtn.setAttribute("aria-label", `${label} Keyfall`);
  el.piecePracticePlayBtn.innerHTML = `<i data-lucide="${playing ? "pause" : "play"}" aria-hidden="true"></i><span>${label}</span>`;

  if (status === "ready" && hasSong) {
    setPiecePracticePrompt("Ready to practice", "Press Play, then hold every note as it reaches the keyboard.", "idle");
  } else if (status === "playing") {
    setPiecePracticePrompt("Follow the notes", "The timeline will wait whenever a required key is missing.", "playing");
  } else if (status === "paused") {
    setPiecePracticePrompt("Practice paused", "Press Play to continue from this position.", "idle");
  } else if (status === "ended") {
    setPiecePracticePrompt("Keyfall complete", "Stop to return to the beginning, or Play to practice again.", "correct");
  }
  window.lucide?.createIcons?.();
  requestAnimationFrame(updateControlScrollHints);
}

async function togglePiecePracticePlayback() {
  const player = state.piecePracticeController;
  if (!player?.song || state.piecePracticeLoading || player.waiting) return false;
  if (player.playing) {
    player.pause();
    return true;
  }

  if (state.piecePracticeOutputRoute) return player.play();

  state.piecePracticeLoading = true;
  setPiecePracticePrompt("Preparing output", "Your selected exercise output is getting ready.", "playing");
  syncPiecePracticeTransport();
  try {
    const route = await prepareEarTrainingOutput();
    if (!isPiecePracticeVisible()) return false;
    state.piecePracticeOutputRoute = route;
    return player.play();
  } catch (error) {
    console.error(error);
    setPiecePracticePrompt("Output unavailable", error.message, "error");
    return false;
  } finally {
    state.piecePracticeLoading = false;
    syncPiecePracticeTransport();
  }
}

async function loadPiecePracticeFile(file) {
  if (!file || !/\.(mid|midi)$/i.test(file.name)) {
    setPiecePracticePrompt("Unsupported file", "Choose a .mid or .midi file.", "error");
    return;
  }
  state.piecePracticeController?.stop(false);
  clearPiecePracticeOutput();
  state.piecePracticeLoading = true;
  el.piecePracticeFileName.textContent = file.name;
  el.piecePracticeFileMeta.textContent = "Reading MIDI...";
  setPiecePracticePrompt("Loading piece", "Reading tracks and note timing.", "playing");
  syncPiecePracticeTransport();
  try {
    const song = await parseMidiFile(file);
    if (!song.events.some((event) => event.type === "noteOn")) throw new Error("MIDI file has no notes");
    state.piecePracticeNoteSpans = buildMidiNoteSpans(song.events);
    state.piecePracticeController.load(song);
    el.piecePracticeFileName.textContent = song.name || file.name;
    el.piecePracticeFileMeta.textContent = `${song.trackCount} track${song.trackCount === 1 ? "" : "s"} · ${formatPlaybackTime(song.duration)}`;
    syncPiecePracticeVisualization();
  } catch (error) {
    console.error(error);
    el.piecePracticeFileMeta.textContent = "Could not read this file";
    setPiecePracticePrompt("MIDI loading failed", "Check the file and network connection, then try again.", "error");
  } finally {
    state.piecePracticeLoading = false;
    el.piecePracticeFileInput.value = "";
    syncPiecePracticeTransport();
  }
}

function initializePiecePractice() {
  try {
    state.piecePracticeKeyGuidesEnabled = localStorage.getItem(
      "chord-theory-keyfall-key-guides",
    ) === "on";
    state.piecePracticeEarlyJumpEnabled = localStorage.getItem(
      "chord-theory-keyfall-early-note-jump",
    ) === "on";
  } catch {
    state.piecePracticeKeyGuidesEnabled = false;
    state.piecePracticeEarlyJumpEnabled = false;
  }
  state.piecePracticeController = new MidiPiecePracticeController({
    getHeldNotes: () => state.pressedNotes,
    onWait: (notes) => {
      const names = notes.map((note) => noteName(note, state.spelling)).join(" + ");
      setPiecePracticePrompt("Your turn", `Hold ${names} to continue.`, "awaiting");
    },
    onGatePassed: (notes) => {
      for (const note of notes) state.noteTrailVisualizer?.noteImpact(note, 100);
    },
    onProgress: (position, duration) => {
      const force = !state.piecePracticeController?.playing || position <= 0;
      renderPiecePracticeProgress(position, duration, force);
      syncPiecePracticeVisualization();
    },
    onStateChange: (status) => {
      syncPiecePracticeTransport(status);
      syncPiecePracticeVisualization();
    },
  });
  setPiecePracticeKeyGuidesEnabled(state.piecePracticeKeyGuidesEnabled, false);
  setPiecePracticeEarlyJumpEnabled(state.piecePracticeEarlyJumpEnabled, false);
  syncPiecePracticeTransport("empty");
}

function renderAutoplayProgress(position, duration, force = false) {
  const now = performance.now();
  if (!force && now - state.autoplayProgressRenderedAt < AUTOPLAY_PROGRESS_UI_INTERVAL_MS) return;
  state.autoplayProgressRenderedAt = now;
  if (!state.autoplaySeeking) {
    el.autoplayProgress.value = duration ? String((position / duration) * 1000) : "0";
    updateRangeProgress(el.autoplayProgress);
  }
  el.autoplayTime.textContent = `${formatPlaybackTime(position)} / ${formatPlaybackTime(duration)}`;
}

function syncListeningStatus() {
  const customLabel = state.autoplayEnabled ? state.autoplayStageLabel.trim() : "";
  const label = customLabel || (state.autoplayEnabled || state.selectedMidiInput ? "Listening" : "Waiting for input");
  const icon = document.createElement("i");
  icon.dataset.lucide = "radio";
  icon.setAttribute("aria-hidden", "true");
  el.listeningStatus.replaceChildren(icon, document.createTextNode(label));
  window.lucide?.createIcons?.();
}

function syncAutoplayVisualization() {
  if (isPiecePracticeVisible()) {
    syncPiecePracticeVisualization();
    return;
  }
  const player = state.autoplayController;
  if (state.autoplayNoteSpans.length) {
    state.noteTrailVisualizer?.setFallingNotes(state.autoplayNoteSpans);
  }
  state.noteTrailVisualizer?.setPlaybackVisualization(state.autoplayVisualization);
  state.noteTrailVisualizer?.setPlaybackState({
    active: state.autoplayEnabled && isSequencedPlaybackVisualization(state.autoplayVisualization),
    playing: Boolean(player?.playing),
    position: player?.currentPosition() || 0,
    speed: player?.speed || 1,
    transpose: player?.transpose || 0,
  });
  el.chordDisplay.dataset.autoplayVisualization = state.autoplayEnabled
    ? state.autoplayVisualization
    : "rise";
}

function setAutoplayVisualization(mode, persist = true) {
  const nextMode = normalizePlaybackVisualization(mode);
  const changed = state.autoplayVisualization !== nextMode;
  state.autoplayVisualization = nextMode;
  syncChoiceButtons(el.autoplayVisualizationButtons, "autoplayVisualization", nextMode);
  if (changed) state.noteTrailVisualizer?.resetMotion();
  if (persist) {
    try {
      localStorage.setItem("chord-theory-autoplay-visualization", nextMode);
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }
  syncRollPressSetting();
  syncAutoplayVisualization();
}

function setConditionalRegionVisible(node, visible) {
  const pendingTimer = collapsibleHideTimers.get(node);
  if (pendingTimer) {
    window.clearTimeout(pendingTimer);
    collapsibleHideTimers.delete(node);
  }

  node.setAttribute("aria-hidden", String(!visible));
  node.inert = !visible;
  if (visible) {
    if (!node.hidden && !node.classList.contains("is-collapsed")) return;
    node.hidden = false;
    requestAnimationFrame(() => {
      node.classList.remove("is-collapsed");
      updateControlScrollHints();
    });
    return;
  }

  node.classList.add("is-collapsed");
  if (node.hidden) return;
  const timer = window.setTimeout(() => {
    if (node.classList.contains("is-collapsed")) node.hidden = true;
    collapsibleHideTimers.delete(node);
    updateControlScrollHints();
  }, 240);
  collapsibleHideTimers.set(node, timer);
}

function syncRollPressSetting() {
  const visible = state.autoplayVisualization === "roll";
  setConditionalRegionVisible(el.rollPressSetting, visible);
}

function setRollPressMotionEnabled(enabled, persist = true) {
  state.rollPressMotionEnabled = Boolean(enabled);
  el.rollPressToggle.setAttribute("aria-checked", String(state.rollPressMotionEnabled));
  state.noteTrailVisualizer?.setRollPressMotionEnabled(state.rollPressMotionEnabled);
  if (persist) {
    try {
      localStorage.setItem("chord-theory-roll-press-motion", state.rollPressMotionEnabled ? "on" : "off");
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }
}

function syncAutoplayTransport(status = null) {
  const player = state.autoplayController;
  const hasSong = Boolean(player?.song);
  const hasOutputSelection = state.autoplayUseLocalSoundFont || Boolean(state.selectedMidiOutput);
  const outputReady = state.autoplayUseLocalSoundFont
    ? state.soundFontEnabled && state.soundFontLoaded
    : Boolean(state.selectedMidiOutput);
  const canPlay = state.autoplayEnabled && hasSong && outputReady;
  const showPlaybackControls = state.autoplayEnabled && hasSong && hasOutputSelection;
  setConditionalRegionVisible(el.autoplayPlaybackControls, showPlaybackControls);
  el.autoplayPlayBtn.disabled = !canPlay;
  el.autoplayStopBtn.disabled = !state.autoplayEnabled || !hasSong;
  el.autoplayProgress.disabled = !state.autoplayEnabled || !hasSong;
  const playing = Boolean(player?.playing);
  el.autoplayPlayBtn.setAttribute("aria-label", playing ? "Pause MIDI" : "Play MIDI");
  el.autoplayPlayBtn.innerHTML = `<i data-lucide="${playing ? "pause" : "play"}" aria-hidden="true"></i>`;
  const outputName = state.autoplayUseLocalSoundFont ? "Local SoundFont" : state.selectedMidiOutput?.name || "MIDI output";
  if (status === "playing") el.autoplayStatus.textContent = `Playing through ${outputName}.`;
  else if (status === "paused") el.autoplayStatus.textContent = "Playback paused.";
  else if (status === "ended") el.autoplayStatus.textContent = "Playback finished.";
  else if (status === "ready" && hasSong) el.autoplayStatus.textContent = canPlay
    ? "Ready to play."
    : (state.autoplayUseLocalSoundFont ? "Local SoundFont is loading." : "Choose a MIDI output before playing.");
  window.lucide?.createIcons?.();
  requestAnimationFrame(updateControlScrollHints);
}

function initializeAutoplay() {
  try {
    state.autoplayStageLabel = localStorage.getItem("chord-theory-autoplay-stage-label") || "";
    const savedVisualization = localStorage.getItem("chord-theory-autoplay-visualization");
    state.autoplayVisualization = normalizePlaybackVisualization(savedVisualization);
    state.rollPressMotionEnabled = localStorage.getItem("chord-theory-roll-press-motion") !== "off";
  } catch {
    state.autoplayStageLabel = "";
    state.autoplayVisualization = "rise";
    state.rollPressMotionEnabled = true;
  }
  el.autoplayStageLabelInput.value = state.autoplayStageLabel;
  setAutoplayVisualization(state.autoplayVisualization, false);
  setRollPressMotionEnabled(state.rollPressMotionEnabled, false);
  state.autoplayController = new MidiAutoplayController({
    getEndPosition: (duration, speed) => state.autoplayVisualization === "roll"
      ? state.noteTrailVisualizer?.rollPlaybackEndPosition(speed, duration) ?? duration
      : duration,
    onNoteOn: (note, velocity, source) => pressNote(note, source, velocity, !state.autoplayUseLocalSoundFont),
    onNoteOff: (note, source) => releaseNote(note, source),
    onSustain: (enabled) => setSustainSource("autoplay", enabled),
    onProgress: (position, duration) => {
      const forceUiUpdate = !state.autoplayController?.playing || position <= 0;
      renderAutoplayProgress(position, duration, forceUiUpdate);
      syncAutoplayVisualization();
    },
    onStateChange: (status) => {
      syncAutoplayTransport(status);
      syncAutoplayVisualization();
    },
  });
  refreshMidiOutputs();
  syncAutoplayVisualization();
}

function setAutoplayEnabled(enabled) {
  state.autoplayEnabled = Boolean(enabled);
  el.autoplayToggle.setAttribute("aria-checked", String(state.autoplayEnabled));
  el.autoplayContent.classList.toggle("is-collapsed", !state.autoplayEnabled);
  el.autoplayContent.setAttribute("aria-hidden", String(!state.autoplayEnabled));
  el.autoplayContent.inert = !state.autoplayEnabled;
  if (!state.autoplayEnabled) {
    state.autoplayController?.stop();
    el.autoplayStatus.textContent = "Enable Autoplay mode to load a MIDI file.";
  } else if (state.autoplayController?.song) {
    syncAutoplayTransport("ready");
  } else {
    el.autoplayStatus.textContent = "Choose a MIDI file to begin.";
  }
  if (state.autoplayEnabled && state.autoplayUseLocalSoundFont) {
    setSoundFontEnabled(true).then(() => syncAutoplayTransport("ready"));
  }
  syncAutoplayTransport();
  syncListeningStatus();
  syncInputSourceStatus();
  syncAutoplayVisualization();
  requestAnimationFrame(updateControlScrollHints);
}

async function loadAutoplayFile(file) {
  if (!file || !/\.(mid|midi)$/i.test(file.name)) {
    el.autoplayStatus.textContent = "Choose a .mid or .midi file.";
    return;
  }
  state.autoplayController.stop(false);
  el.autoplayPlayBtn.disabled = true;
  el.autoplayFileName.textContent = file.name;
  el.autoplayFileMeta.textContent = "Reading MIDI...";
  el.autoplayStatus.textContent = "Loading MIDI parser and file...";
  try {
    const song = await parseMidiFile(file);
    if (!song.events.some((event) => event.type === "noteOn")) throw new Error("MIDI file has no notes");
    state.autoplayNoteSpans = buildMidiNoteSpans(song.events);
    state.noteTrailVisualizer?.setFallingNotes(state.autoplayNoteSpans);
    state.autoplayController.load(song);
    state.autoplayController.setOutput(state.autoplayUseLocalSoundFont ? LOCAL_SOUNDFONT_OUTPUT : state.selectedMidiOutput);
    el.autoplayFileName.textContent = song.name || file.name;
    el.autoplayFileMeta.textContent = `${song.trackCount} track${song.trackCount === 1 ? "" : "s"} · ${formatPlaybackTime(song.duration)}`;
    syncAutoplayTransport("ready");
  } catch (error) {
    el.autoplayFileMeta.textContent = "Could not read this file";
    el.autoplayStatus.textContent = "MIDI loading failed. Check the file and network connection.";
    console.error(error);
  } finally {
    el.autoplayFileInput.value = "";
  }
}

function connectMidiInput(id) {
  if (!state.midiAccess) return;
  if (state.selectedMidiInput) state.selectedMidiInput.onmidimessage = null;
  state.selectedMidiInput = state.midiAccess.inputs.get(id) || null;
  if (!state.selectedMidiInput) return;
  state.selectedMidiInput.onmidimessage = handleMidiMessage;
  el.midiInputSelect.value = id;
  state.midiFallbackMessage = "Use the on-screen piano now, or connect a MIDI keyboard from the MIDI card.";
  syncInputSourceStatus();
  syncListeningStatus();
  window.lucide?.createIcons?.();
}

function connectMidiOutput(id) {
  state.autoplayOutputTarget = id || NO_MIDI_OUTPUT_ID;
  state.autoplayUseLocalSoundFont = id === LOCAL_SOUNDFONT_OUTPUT_ID;
  state.selectedMidiOutput = state.autoplayUseLocalSoundFont || id === NO_MIDI_OUTPUT_ID
    ? null
    : state.midiAccess?.outputs.get(id) || null;
  el.autoplayOutputSelect.value = state.autoplayUseLocalSoundFont
    ? LOCAL_SOUNDFONT_OUTPUT_ID
    : state.selectedMidiOutput?.id || NO_MIDI_OUTPUT_ID;
  state.autoplayController?.setOutput(state.autoplayUseLocalSoundFont ? LOCAL_SOUNDFONT_OUTPUT : state.selectedMidiOutput);
  if (state.autoplayEnabled && state.autoplayUseLocalSoundFont) {
    setSoundFontEnabled(true).then(() => syncAutoplayTransport("ready"));
  }
  syncAutoplayTransport("ready");
}

function refreshMidiOutputs() {
  const outputs = state.midiAccess ? [...state.midiAccess.outputs.values()] : [];
  refreshEarTrainingOutputs(outputs);
  const previousId = state.autoplayOutputTarget;
  el.autoplayOutputSelect.innerHTML = "";

  const noneOption = document.createElement("option");
  noneOption.value = NO_MIDI_OUTPUT_ID;
  noneOption.textContent = "None";
  el.autoplayOutputSelect.append(noneOption);

  const localOption = document.createElement("option");
  localOption.value = LOCAL_SOUNDFONT_OUTPUT_ID;
  localOption.textContent = "Local SoundFont";
  el.autoplayOutputSelect.append(localOption);

  if (!outputs.length) {
    const fallbackId = state.autoplayOutputManuallySelected && previousId === LOCAL_SOUNDFONT_OUTPUT_ID
      ? LOCAL_SOUNDFONT_OUTPUT_ID
      : NO_MIDI_OUTPUT_ID;
    connectMidiOutput(fallbackId);
    return;
  }

  for (const output of outputs) {
    const option = document.createElement("option");
    option.value = output.id;
    option.textContent = output.name || output.id;
    el.autoplayOutputSelect.append(option);
  }

  const preserveVirtual = [NO_MIDI_OUTPUT_ID, LOCAL_SOUNDFONT_OUTPUT_ID].includes(previousId)
    && state.autoplayOutputManuallySelected;
  const nextId = preserveVirtual || outputs.some((output) => output.id === previousId)
    ? previousId
    : outputs[0].id;
  connectMidiOutput(nextId);
}

function refreshMidiInputs() {
  if (!state.midiAccess) return;
  refreshMidiOutputs();
  const inputs = [...state.midiAccess.inputs.values()];
  const previousId = state.selectedMidiInput?.id;
  el.midiInputSelect.innerHTML = "";

  if (!inputs.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No MIDI inputs found";
    el.midiInputSelect.append(option);
    state.selectedMidiInput = null;
    state.midiFallbackMessage = "The screen keyboard is ready. Connect a MIDI keyboard and refresh from the MIDI card when needed.";
    syncInputSourceStatus();
    syncListeningStatus();
    return;
  }

  for (const input of inputs) {
    const option = document.createElement("option");
    option.value = input.id;
    option.textContent = input.name || input.id;
    el.midiInputSelect.append(option);
  }

  const nextId = inputs.some((input) => input.id === previousId) ? previousId : inputs[0].id;
  connectMidiInput(nextId);
}

async function initMidi() {
  if (!navigator.requestMIDIAccess) {
    state.midiFallbackMessage = "The screen keyboard is ready. Live MIDI requires a browser with Web MIDI support, such as Chrome or Edge.";
    syncInputSourceStatus();
    el.lastMidiMessage.textContent = "Use Chrome or Edge to access Web MIDI.";
    return;
  }

  try {
    state.midiAccess = await navigator.requestMIDIAccess();
    state.midiAccess.onstatechange = refreshMidiInputs;
    refreshMidiInputs();
  } catch (error) {
    state.selectedMidiInput = null;
    state.midiFallbackMessage = "The screen keyboard is ready. MIDI access was not granted; use Refresh MIDI to try again.";
    syncInputSourceStatus();
    el.lastMidiMessage.textContent = "MIDI access was not granted.";
    console.error(error);
  }
}

function updateControlScrollHints() {
  const panel = el.controlPanel;
  const hasOverflow = panel.scrollHeight > panel.clientHeight + 1;
  el.controlScrollShell.classList.toggle("can-scroll-up", hasOverflow && panel.scrollTop > 1);
  el.controlScrollShell.classList.toggle(
    "can-scroll-down",
    hasOverflow && panel.scrollTop + panel.clientHeight < panel.scrollHeight - 1,
  );
}

el.keyboardCameraToggle.addEventListener("click", () => {
  setKeyboardCameraEnabled(!state.keyboardCameraEnabled);
});
el.keyboardCameraSelect.addEventListener("change", selectKeyboardCamera);
el.keyboardCameraRefreshBtn.addEventListener("click", () => {
  refreshKeyboardCameraDevices().catch((error) => {
    setKeyboardCameraStatus(error?.message || "Could not refresh cameras.", "error");
  });
});
el.keyboardCameraMirrorToggle.addEventListener("click", () => {
  setKeyboardCameraMirrored(!state.keyboardCameraMirrored);
});
el.keyboardCameraOverlayToggle.addEventListener("click", () => {
  setKeyboardCameraOverlayEnabled(!state.keyboardCameraOverlayEnabled);
});
el.keyboardCameraHighlightTransparency.addEventListener("input", () => {
  setKeyboardCameraHighlightTransparency(el.keyboardCameraHighlightTransparency.value);
});
el.keyboardCameraFitBtn.addEventListener("click", beginKeyboardCameraFit);
el.keyboardCameraFitApplyBtn.addEventListener("click", applyKeyboardCameraFit);
el.keyboardCameraFitResetBtn.addEventListener("click", () => {
  state.keyboardCameraController?.resetCalibration();
});
el.keyboardCameraFitCancelBtn.addEventListener("click", () => {
  state.keyboardCameraController?.cancelCalibration();
  window.setTimeout(() => el.keyboardCameraFitBtn.focus({ preventScroll: true }), 190);
});
el.refreshMidiBtn.addEventListener("click", initMidi);
el.midiInputSelect.addEventListener("change", (event) => connectMidiInput(event.target.value));
el.autoplayOutputSelect.addEventListener("change", (event) => {
  state.autoplayOutputManuallySelected = true;
  connectMidiOutput(event.target.value);
});
el.autoplayStageLabelInput.addEventListener("input", () => {
  state.autoplayStageLabel = el.autoplayStageLabelInput.value;
  try {
    localStorage.setItem("chord-theory-autoplay-stage-label", state.autoplayStageLabel);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
  syncListeningStatus();
});
el.autoplayToggle.addEventListener("click", () => setAutoplayEnabled(!state.autoplayEnabled));
el.autoplayFileInput.addEventListener("change", () => loadAutoplayFile(el.autoplayFileInput.files[0]));
el.autoplayPlayBtn.addEventListener("click", toggleAutoplayPlayback);
el.autoplayStopBtn.addEventListener("click", () => state.autoplayController.stop());
el.autoplayProgress.addEventListener("pointerdown", () => {
  state.autoplaySeeking = true;
});
el.autoplayProgress.addEventListener("input", () => {
  const duration = state.autoplayController.song?.duration || 0;
  const preview = (Number(el.autoplayProgress.value) / 1000) * duration;
  el.autoplayTime.textContent = `${formatPlaybackTime(preview)} / ${formatPlaybackTime(duration)}`;
  updateRangeProgress(el.autoplayProgress);
});
el.autoplayProgress.addEventListener("change", () => {
  const duration = state.autoplayController.song?.duration || 0;
  state.autoplayController.seek((Number(el.autoplayProgress.value) / 1000) * duration);
  state.autoplaySeeking = false;
});
el.autoplayProgress.addEventListener("pointercancel", () => {
  state.autoplaySeeking = false;
});
el.autoplaySpeed.addEventListener("change", () => state.autoplayController.setSpeed(el.autoplaySpeed.value));
el.autoplayTranspose.addEventListener("change", () => state.autoplayController.setTranspose(el.autoplayTranspose.value));
el.autoplayVisualizationButtons.forEach((button) => {
  button.addEventListener("click", () => setAutoplayVisualization(button.dataset.autoplayVisualization));
});
el.rollPressToggle.addEventListener("click", () => {
  setRollPressMotionEnabled(el.rollPressToggle.getAttribute("aria-checked") !== "true");
});
el.autoplayLoopToggle.addEventListener("click", () => {
  const enabled = el.autoplayLoopToggle.getAttribute("aria-checked") !== "true";
  el.autoplayLoopToggle.setAttribute("aria-checked", String(enabled));
  state.autoplayController.setLoop(enabled);
});
for (const eventName of ["dragenter", "dragover"]) {
  el.midiFileDropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    el.midiFileDropZone.classList.add("is-dragging");
    event.dataTransfer.dropEffect = "copy";
  });
}
el.midiFileDropZone.addEventListener("dragleave", () => el.midiFileDropZone.classList.remove("is-dragging"));
el.midiFileDropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  event.stopPropagation();
  el.midiFileDropZone.classList.remove("is-dragging");
  loadAutoplayFile([...event.dataTransfer.files].find((file) => /\.(mid|midi)$/i.test(file.name)));
});
el.soundFontInput.addEventListener("change", (event) => loadSoundFontFile(event.target.files[0]));
el.soundFontToggle.addEventListener("click", () => setSoundFontEnabled(!state.soundFontEnabled));
el.chordPresetSelect.addEventListener("change", applyChordPreset);
el.soundFontVolumeInput.addEventListener("input", () => setSoundFontVolume(el.soundFontVolumeInput.value));
el.educationalModeToggle.addEventListener("click", () => {
  const enabled = !state.educationalModeEnabled;
  if (enabled) state.educationView = "learn";
  setEducationalMode(enabled);
});
el.educationViewButtons.forEach((button) => {
  button.addEventListener("click", () => setEducationView(button.dataset.educationView));
});
el.earTrainingDifficultyButtons.forEach((button) => {
  button.addEventListener("click", () => setEarTrainingDifficulty(button.dataset.earTrainingDifficulty));
});
el.earTrainingQualityInputs.forEach((input) => {
  input.addEventListener("change", () => {
    const selectedQualities = [...el.earTrainingQualityInputs]
      .filter((qualityInput) => qualityInput.checked)
      .map((qualityInput) => qualityInput.value);
    if (!selectedQualities.length) {
      input.checked = true;
      return;
    }
    setEarTrainingCustomQualities(selectedQualities);
  });
});
el.earTrainingInversionsToggle.addEventListener("click", () => {
  setEarTrainingCustomInversions(!state.earTrainingCustomAllowInversions);
});
el.earTrainingOutputSelect.addEventListener("change", () => {
  releaseEarTrainingPlayback();
  state.piecePracticeController?.pause();
  clearPiecePracticeOutput();
  state.earTrainingOutputTarget = el.earTrainingOutputSelect.value;
  if (state.earTrainingQuestion) {
    state.earTrainingPhase = "idle";
    setEarTrainingPrompt("Output changed", "Replay the current chord using the selected output.", "idle");
    syncEarTrainingControls();
  }
  if (state.piecePracticeController?.song) {
    setPiecePracticePrompt("Output changed", "Press Play to continue using the selected output.", "idle");
    syncPiecePracticeTransport();
  }
});
el.earTrainingEntryBtn.addEventListener("click", () => {
  setLearningView("ear-training");
  window.setTimeout(() => el.earTrainingNewBtn.focus({ preventScroll: true }), 240);
});
el.earTrainingBackBtn.addEventListener("click", () => {
  setLearningView("path");
  window.setTimeout(() => el.earTrainingEntryBtn.focus({ preventScroll: true }), 240);
});
el.piecePracticeEntryBtn.addEventListener("click", () => {
  setLearningView("piece");
  window.setTimeout(() => {
    const target = state.piecePracticeController?.song
      ? el.piecePracticePlayBtn
      : el.piecePracticeDropZone;
    target.focus({ preventScroll: true });
  }, 240);
});
el.piecePracticeBackBtn.addEventListener("click", () => {
  setLearningView("path");
  window.setTimeout(() => el.piecePracticeEntryBtn.focus({ preventScroll: true }), 240);
});
el.piecePracticeFileInput.addEventListener("change", () => {
  loadPiecePracticeFile(el.piecePracticeFileInput.files[0]);
});
el.piecePracticePlayBtn.addEventListener("click", togglePiecePracticePlayback);
el.piecePracticeStopBtn.addEventListener("click", () => {
  state.piecePracticeController?.stop();
  clearPiecePracticeOutput();
});
el.piecePracticeProgress.addEventListener("pointerdown", () => {
  state.piecePracticeSeeking = true;
});
el.piecePracticeProgress.addEventListener("input", () => {
  const duration = state.piecePracticeController?.song?.duration || 0;
  const preview = (Number(el.piecePracticeProgress.value) / 1000) * duration;
  el.piecePracticeTime.textContent = `${formatPlaybackTime(preview)} / ${formatPlaybackTime(duration)}`;
  updateRangeProgress(el.piecePracticeProgress);
});
el.piecePracticeProgress.addEventListener("change", () => {
  const duration = state.piecePracticeController?.song?.duration || 0;
  state.piecePracticeController?.seek((Number(el.piecePracticeProgress.value) / 1000) * duration);
  state.piecePracticeSeeking = false;
  syncPiecePracticeVisualization();
});
el.piecePracticeProgress.addEventListener("pointercancel", () => {
  state.piecePracticeSeeking = false;
});
el.piecePracticeSpeed.addEventListener("change", () => {
  state.piecePracticeController?.setSpeed(el.piecePracticeSpeed.value);
  syncPiecePracticeVisualization();
  syncPiecePracticeKeyGuides();
});
el.piecePracticeKeyGuidesToggle.addEventListener("click", () => {
  setPiecePracticeKeyGuidesEnabled(!state.piecePracticeKeyGuidesEnabled);
});
el.piecePracticeEarlyJumpToggle.addEventListener("click", () => {
  setPiecePracticeEarlyJumpEnabled(!state.piecePracticeEarlyJumpEnabled);
});
for (const eventName of ["dragenter", "dragover"]) {
  el.piecePracticeDropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    el.piecePracticeDropZone.classList.add("is-dragging");
    event.dataTransfer.dropEffect = "copy";
  });
}
el.piecePracticeDropZone.addEventListener("dragleave", () => {
  el.piecePracticeDropZone.classList.remove("is-dragging");
});
el.piecePracticeDropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  event.stopPropagation();
  el.piecePracticeDropZone.classList.remove("is-dragging");
  loadPiecePracticeFile([...event.dataTransfer.files].find((file) => /\.(mid|midi)$/i.test(file.name)));
});
el.earTrainingNewBtn.addEventListener("click", startNewEarTrainingQuestion);
el.earTrainingReplayBtn.addEventListener("click", playEarTrainingQuestion);
el.earTrainingRevealBtn.addEventListener("click", revealEarTrainingAnswer);
el.spellingButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.spelling = button.dataset.spelling;
    if (state.retainedChordResult?.notes?.length) {
      state.retainedChordResult = analyzeChord(state.retainedChordResult.notes, { spelling: state.spelling });
    }
    syncChoiceButtons(el.spellingButtons, "spelling", state.spelling);
    el.harmonyTonicValue.textContent = tonicName();
    updateRecognition();
    renderHistory();
  });
});
el.displayModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.displayMode = button.dataset.displayMode;
    syncChoiceButtons(el.displayModeButtons, "displayMode", state.displayMode);
    syncHarmonyControls();
    if (state.currentResult) renderResult(state.currentResult);
  });
});
el.chordPresentationButtons.forEach((button) => {
  button.addEventListener("click", () => setChordPresentation(button.dataset.chordPresentation));
});
el.centeredContentButtons.forEach((button) => {
  button.addEventListener("click", () => setCenteredContentMode(button.dataset.centeredContent));
});
el.holdLastChordToggle.addEventListener("click", () => setHoldLastChordEnabled(!state.holdLastChord));
el.harmonyTonicDownBtn.addEventListener("click", () => setHarmonyTonic(state.harmonyTonic - 1));
el.harmonyTonicUpBtn.addEventListener("click", () => setHarmonyTonic(state.harmonyTonic + 1));
el.harmonyTonicLearnBtn.addEventListener("click", beginHarmonyLearn);
el.harmonyModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.harmonyMode = button.dataset.harmonyMode;
    syncChoiceButtons(el.harmonyModeButtons, "harmonyMode", state.harmonyMode);
    if (state.currentResult) renderResult(state.currentResult);
  });
});
el.clearHistoryBtn.addEventListener("click", () => {
  state.history = [];
  renderHistory();
});
el.noteTrailsToggle.addEventListener("click", () => setNoteTrailsEnabled(!state.noteTrailsEnabled));
el.visualizationColorModeButtons.forEach((button) => {
  button.addEventListener("click", () => setVisualizationColorMode(button.dataset.visualizationColorMode));
});
el.stageFontButtons.forEach((button) => {
  button.addEventListener("click", () => setStageFont(button.dataset.stageFont));
});
el.trailPaletteButtons.forEach((button) => {
  button.addEventListener("click", () => setTrailPalette(button.dataset.trailPalette));
});
el.customTrailColorInput.addEventListener("input", () => setCustomTrailColor(el.customTrailColorInput.value));
el.trailParticleInput.addEventListener("input", () => applyTrailEffects());
el.upwardSnowInput.addEventListener("input", () => applyTrailEffects());
el.trailGlowInput.addEventListener("input", () => applyTrailEffects());
el.trailSpeedInput.addEventListener("input", () => applyTrailEffects());
el.trailSquareCornersToggle.addEventListener("click", () => {
  const enabled = el.trailSquareCornersToggle.getAttribute("aria-checked") !== "true";
  el.trailSquareCornersToggle.setAttribute("aria-checked", String(enabled));
  applyTrailEffects();
});
el.backgroundPresetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.visualBackground;
    if (mode === "api") {
      const open = el.backgroundApiEntryBtn.getAttribute("aria-expanded") !== "true";
      setBackgroundApiPanelVisible(open);
      if (!open) return;
      if (state.apiBackgroundUrl) setVisualizationBackground("api");
      window.setTimeout(() => el.backgroundApiUrlInput.focus({ preventScroll: true }), 180);
      return;
    }

    setBackgroundApiPanelVisible(false);
    if (mode === "stage") {
      if (state.backgroundMode === "stage" || !state.networkBackgroundUrl) loadNetworkBackground();
      else setVisualizationBackground("stage");
      return;
    }
    setVisualizationBackground(mode);
  });
});
el.backgroundApiLoadBtn.addEventListener("click", loadBackgroundApiUrl);
el.backgroundApiUrlInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  loadBackgroundApiUrl();
});
el.solidBackgroundColorInput.addEventListener("input", () => setSolidBackgroundColor(el.solidBackgroundColorInput.value));
el.backgroundUploadBtn.addEventListener("click", () => el.backgroundImageInput.click());
el.backgroundImageInput.addEventListener("change", () => handleBackgroundUpload(el.backgroundImageInput.files[0]));
el.backgroundBlurInput.addEventListener("input", () => applyBackgroundAdjustments());
el.backgroundDarknessInput.addEventListener("input", () => applyBackgroundAdjustments());
el.backgroundDarknessInput.addEventListener("change", () => {
  updateSmartPaletteForMode(state.backgroundMode);
});
el.brightModeToggle.addEventListener("click", () => setBrightMode(!state.brightMode));
el.cleanModeToggle.addEventListener("click", () => setCleanMode(!state.cleanMode));
el.hideHarmonyMarkersToggle.addEventListener("click", () => setHideHarmonyMarkers(!state.hideHarmonyMarkers));
el.alwaysGrandStaffToggle.addEventListener("click", () => setAlwaysGrandStaff(!state.alwaysGrandStaff));
el.wakeLockToggle.addEventListener("click", () => setWakeLockEnabled(!state.wakeLockEnabled));
el.experimentalPanel?.querySelector("summary")?.addEventListener("click", toggleExperimentalPanel);
el.controlPanel.addEventListener("scroll", updateControlScrollHints);
el.helpCloseBtn.addEventListener("click", () => setHelpCollapsed(true));
el.helpToggleBtn.addEventListener("click", () => setHelpCollapsed(false));
el.chordFullscreenBtn.addEventListener("click", toggleChordFullscreen);
document.addEventListener("fullscreenchange", syncFullscreenButton);
el.chordKeyboard.addEventListener("pointerdown", handleKeyboardPointerDown);
el.chordKeyboard.addEventListener("pointerup", handleKeyboardPointerEnd);
el.chordKeyboard.addEventListener("pointercancel", handleKeyboardPointerEnd);
window.addEventListener("keydown", handleSustainKeyDown);
window.addEventListener("keydown", handleAppShortcutKeyDown);
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !state.keyboardCameraController?.calibrating) return;
  event.preventDefault();
  state.keyboardCameraController.cancelCalibration();
  window.setTimeout(() => el.keyboardCameraFitBtn.focus({ preventScroll: true }), 190);
});
window.addEventListener("keyup", handleSustainKeyUp);
window.addEventListener("blur", releaseTransientInput);
window.addEventListener("beforeunload", () => {
  state.autoplayController?.stop(false);
  state.piecePracticeController?.stop(false);
  clearPiecePracticeOutput();
  releaseEarTrainingPlayback();
  if (state.apiBackgroundBlob && state.apiBackgroundUrl) URL.revokeObjectURL(state.apiBackgroundUrl);
  state.keyboardCameraController?.destroy();
  state.wakeLockController?.destroy();
});
window.addEventListener(
  "pointerdown",
  () => state.soundFontPlayer?.resume().catch(() => {}),
  { capture: true },
);
window.addEventListener("dragenter", (event) => {
  if (!state.soundFontEnabled || !hasDraggedFile(event.dataTransfer)) return;
  event.preventDefault();
  el.soundFontDropOverlay.hidden = false;
});
window.addEventListener("dragover", (event) => {
  if (!state.soundFontEnabled || !hasDraggedFile(event.dataTransfer)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  el.soundFontDropOverlay.hidden = false;
});
window.addEventListener("dragleave", (event) => {
  if (event.relatedTarget) return;
  el.soundFontDropOverlay.hidden = true;
});
window.addEventListener("drop", (event) => {
  if (!hasDraggedFile(event.dataTransfer)) return;
  if (!state.soundFontEnabled) {
    event.preventDefault();
    setSoundFontStatus("Turn on SoundFont audio before dropping a file.", "idle");
    return;
  }
  const file = firstSoundFontFile(event.dataTransfer?.files);
  event.preventDefault();
  el.soundFontDropOverlay.hidden = true;
  if (file) loadSoundFontFile(file);
  else setSoundFontStatus("Drop a SoundFont file: SF2, SF3, DLS, SFOGG, or SFONT.", "error");
});

document.querySelectorAll("[data-help]").forEach((node) => {
  const title = node.dataset.helpTitle || node.textContent.trim().replace(/\s+/g, " ");
  const show = () => setHelp(title, node.dataset.help);
  const reset = () => setHelp(DEFAULT_HELP.title, DEFAULT_HELP.text);
  node.addEventListener("mouseenter", show);
  node.addEventListener("focus", show);
  node.addEventListener("mouseleave", reset);
  node.addEventListener("blur", reset);
});

window.addEventListener("resize", () => {
  updateControlScrollHints();
  syncAllChordSegmentThumbs();
  scheduleChordNameFit();
  clearTimeout(state.chordStaffResizeTimer);
  state.chordStaffResizeTimer = setTimeout(scheduleChordStaffRender, 120);
});
buildKeyboard();
initializeKeyboardCamera();
initializeNoteTrails();
initializeVisualizationBackground();
initializeWakeLock();
initializeAutoplay();
initializePiecePractice();
initializeEducationalMode();
initializeStageFont();
initializeCleanMode();
initializeHideHarmonyMarkers();
initializeChordDisplayLatch();
initializeStaffLayoutPreference();
initializeCenteredContentMode();
syncChoiceButtons(el.spellingButtons, "spelling", state.spelling);
syncChoiceButtons(el.displayModeButtons, "displayMode", state.displayMode);
setChordPresentation(state.chordPresentation);
syncChoiceButtons(el.harmonyModeButtons, "harmonyMode", state.harmonyMode);
syncHarmonyControls();
renderResult(analyzeChord([]));
document.fonts?.ready.then(scheduleChordNameFit);
window.lucide?.createIcons?.();
if (el.experimentalPanel) {
  el.experimentalPanel.dataset.expanded = el.experimentalPanel.open ? "true" : "false";
}
el.helpToggleBtn.classList.toggle("is-hidden", el.helpToggleBtn.hidden);
el.helpWindow.classList.toggle("is-hidden", el.helpWindow.hidden);
setSoundFontVolume(el.soundFontVolumeInput.value);
syncSoundFontControls();
initMidi();
requestAnimationFrame(() => {
  updateControlScrollHints();
  syncAllChordSegmentThumbs();
});
