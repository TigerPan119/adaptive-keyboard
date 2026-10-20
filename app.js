const el = {
  video: document.getElementById("video"),
  overlay: document.getElementById("overlay"),
  stagePanel: document.querySelector(".stage-panel"),
  controlScrollShell: document.getElementById("controlScrollShell"),
  controlPanel: document.getElementById("controlPanel"),
  calibrationPrompt: document.getElementById("calibrationPrompt"),
  calibrationPromptTitle: document.getElementById("calibrationPromptTitle"),
  calibrationPromptText: document.getElementById("calibrationPromptText"),
  emptyState: document.getElementById("emptyState"),
  cameraStatus: document.getElementById("cameraStatus"),
  handStatus: document.getElementById("handStatus"),
  midiStatus: document.getElementById("midiStatus"),
  lastMidiStatus: document.getElementById("lastMidiStatus"),
  audioStatus: document.getElementById("audioStatus"),
  soundFontTopStatus: document.getElementById("soundFontTopStatus"),
  emptyStartCameraBtn: document.getElementById("emptyStartCameraBtn"),
  cameraSelect: document.getElementById("cameraSelect"),
  performanceModeBtn: document.getElementById("performanceModeBtn"),
  splitModeButtons: document.querySelectorAll("[data-split-point-mode]"),
  autoDetectEdgesBtn: document.getElementById("autoDetectEdgesBtn"),
  calibrateLeftBtn: document.getElementById("calibrateLeftBtn"),
  calibrateRightBtn: document.getElementById("calibrateRightBtn"),
  setupProgressSummary: document.getElementById("setupProgressSummary"),
  cameraStep: document.getElementById("cameraStep"),
  keyboardStep: document.getElementById("keyboardStep"),
  midiStep: document.getElementById("midiStep"),
  soundStep: document.getElementById("soundStep"),
  rangePresetButtons: document.querySelectorAll("[data-range-preset]"),
  noteShiftButtons: document.querySelectorAll("[data-note-shift]"),
  lowNoteInput: document.getElementById("lowNoteInput"),
  highNoteInput: document.getElementById("highNoteInput"),
  smoothingInput: document.getElementById("smoothingInput"),
  midiInputSelect: document.getElementById("midiInputSelect"),
  refreshMidiBtn: document.getElementById("refreshMidiBtn"),
  soundFontInput: document.getElementById("soundFontInput"),
  leftPresetSelect: document.getElementById("leftPresetSelect"),
  rightPresetSelect: document.getElementById("rightPresetSelect"),
  soundFontStatus: document.getElementById("soundFontStatus"),
  soundFontVolumeInput: document.getElementById("soundFontVolumeInput"),
  leftHandReadout: document.getElementById("leftHandReadout"),
  rightHandReadout: document.getElementById("rightHandReadout"),
  splitReadout: document.getElementById("splitReadout"),
  lastNoteReadout: document.getElementById("lastNoteReadout"),
  routeReadout: document.getElementById("routeReadout"),
  helpWindow: document.getElementById("helpWindow"),
  helpCloseBtn: document.getElementById("helpCloseBtn"),
  helpToggleBtn: document.getElementById("helpToggleBtn"),
  helpTitle: document.getElementById("helpTitle"),
  helpText: document.getElementById("helpText"),
  soundFontDropOverlay: document.getElementById("soundFontDropOverlay"),
  diagnosticsPanel: document.querySelector(".diagnostics-panel"),
};

const ctx = el.overlay.getContext("2d");

const state = {
  handsModel: null,
  cameraRunning: false,
  cameraStream: null,
  selectedCameraId: "",
  mirrorCamera: true,
  swapHands: true,
  performanceMode: false,
  detectLoopId: 0,
  lastDetectionAt: 0,
  lastOverlayAt: 0,
  splitPointMode: "thumb",
  calibrationMode: null,
  calibrationPoints: [],
  calibrationPreviewX: null,
  calibrationCompleteTimer: null,
  keyboardLeftX: null,
  keyboardRightX: null,
  leftHand: null,
  rightHand: null,
  rawSplit: null,
  smoothedSplit: null,
  midiAccess: null,
  selectedMidiInput: null,
  audio: null,
  sfSynth: null,
  sfSynthReady: null,
  sfModule: null,
  sfOutput: null,
  sfGain: null,
  soundFontVolume: 3,
  soundBankId: null,
  soundFontLoaded: false,
  sustainValue: 0,
  activeNotes: new Map(),
  readoutText: new Map(),
  diagnosticsPaused: false,
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const DEFAULT_SOUNDFONT_URL = "./assets/undertale.sf2";
const DEFAULT_SOUNDFONT_NAME = "undertale.sf2";
const SPESSA_MODULE_URL = "https://cdn.jsdelivr.net/npm/spessasynth_lib@4.3.8/+esm";
const SPESSA_WORKLET_URL = "https://cdn.jsdelivr.net/npm/spessasynth_lib@4.3.8/dist/spessasynth_processor.min.js";
const UI_YELLOW = "#ffd52e";
const SOUNDFONT_EXTENSIONS = [".sf2", ".sf3", ".dls", ".sfogg", ".sfont"];
const TRACKING_MODES = {
  normal: {
    width: 1280,
    height: 720,
    minFrameMs: 0,
    modelComplexity: 1,
    minDetectionConfidence: 0.66,
    minTrackingConfidence: 0.62,
  },
  performance: {
    width: 1280,
    height: 720,
    minFrameMs: 33,
    modelComplexity: 0,
    minDetectionConfidence: 0.58,
    minTrackingConfidence: 0.56,
  },
};
const DEFAULT_HELP = {
  title: "Help Window",
  text: "Move the pointer over an element to see what it does.",
};

const KEYBOARD_RANGE_PRESETS = {
  "A0:C8": ["A0", "C8"],
  "C2:C7": ["C2", "C7"],
  "C2:C6": ["C2", "C6"],
};

function setStatus(node, text, kind = "muted") {
  if (node.textContent === text && node.dataset.status === kind && !node.classList.contains("pill")) return;
  if (node.textContent === text && node.classList.contains("pill") && node.className === `pill ${kind}`) return;
  node.textContent = text;
  if (node.classList.contains("pill")) {
    node.className = `pill ${kind}`;
  } else {
    node.dataset.status = kind;
  }
  updateSetupGuide();
}

function setHelp(title, text) {
  el.helpTitle.textContent = title;
  el.helpText.textContent = text;
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

function toggleDiagnosticsPanel(event) {
  event.preventDefault();
  const panel = el.diagnosticsPanel;
  if (!panel || panel.dataset.animating === "true") return;

  const content = panel.querySelector(".diagnostics-content");
  if (!content) return;

  const expanded = panel.dataset.expanded === "true";
  panel.dataset.animating = "true";

  if (expanded) {
    panel.style.setProperty("--diagnostics-height", `${content.scrollHeight}px`);
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
  panel.style.setProperty("--diagnostics-height", `${content.scrollHeight}px`);
  requestAnimationFrame(() => {
    panel.dataset.expanded = "true";
    window.setTimeout(() => {
      panel.dataset.animating = "false";
      updateControlScrollHints();
    }, 230);
  });
}

function syncDiagnosticsHeight() {
  const panel = el.diagnosticsPanel;
  const content = panel?.querySelector(".diagnostics-content");
  if (!panel || !content || panel.dataset.expanded !== "true") return;
  panel.style.setProperty("--diagnostics-height", `${content.scrollHeight}px`);
}

function isSoundFontFile(file) {
  const name = file?.name?.toLowerCase() || "";
  return SOUNDFONT_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function setDropOverlayVisible(visible) {
  el.soundFontDropOverlay.hidden = !visible;
}

function firstSoundFontFile(fileList) {
  return [...(fileList || [])].find(isSoundFontFile) || null;
}

function hasDraggedFile(dataTransfer) {
  return [...(dataTransfer?.items || [])].some((item) => item.kind === "file") || (dataTransfer?.files?.length || 0) > 0;
}

function setHelpCollapsed(collapsed) {
  setAnimatedHidden(el.helpWindow, collapsed);
  setAnimatedHidden(el.helpToggleBtn, !collapsed);
}

function updateControlScrollHints() {
  const panel = el.controlPanel;
  const hasOverflow = panel.scrollHeight > panel.clientHeight + 1;
  const canScrollUp = hasOverflow && panel.scrollTop > 1;
  const canScrollDown = hasOverflow && panel.scrollTop + panel.clientHeight < panel.scrollHeight - 1;
  el.controlScrollShell.classList.toggle("can-scroll-up", canScrollUp);
  el.controlScrollShell.classList.toggle("can-scroll-down", canScrollDown);
}

function setSetupStep(node, complete, current, stateText) {
  const index = node.querySelector(".step-index");
  const stateLabel = node.querySelector(".step-state");
  node.classList.toggle("complete", complete);
  node.classList.toggle("current", current && !complete);
  if (current && !complete) {
    node.setAttribute("aria-current", "step");
  } else {
    node.removeAttribute("aria-current");
  }
  if (index) index.textContent = complete ? "✓" : node.dataset.stepNumber || index.dataset.stepNumber || index.textContent;
  if (stateLabel) stateLabel.textContent = stateText;
}

function updateSetupGuide() {
  if (!el.cameraStep) return;
  const cameraComplete = state.cameraRunning;
  const keyboardComplete = keyboardReady();
  const midiComplete = Boolean(state.selectedMidiInput);
  const soundComplete = state.soundFontLoaded;

  const steps = [
    {
      node: el.cameraStep,
      complete: cameraComplete,
      current: !cameraComplete,
      doneText: "Ready",
      currentText: "Now",
      pendingText: "Required",
      summary: "Start camera",
    },
    {
      node: el.keyboardStep,
      complete: keyboardComplete,
      current: cameraComplete && !keyboardComplete,
      doneText: "Calibrated",
      currentText: "Now",
      pendingText: "Next",
      summary: "Calibrate keyboard",
    },
    {
      node: el.midiStep,
      complete: midiComplete,
      current: keyboardComplete && !midiComplete,
      doneText: "Connected",
      currentText: "Now",
      pendingText: "Pending",
      summary: "Connect MIDI",
    },
    {
      node: el.soundStep,
      complete: soundComplete,
      current: midiComplete && !soundComplete,
      doneText: "Loaded",
      currentText: "Now",
      pendingText: "Pending",
      summary: "Load sound",
    },
  ];

  steps.forEach((step, index) => {
    step.node.dataset.stepNumber = String(index + 1);
    setSetupStep(
      step.node,
      step.complete,
      step.current,
      step.complete ? step.doneText : step.current ? step.currentText : step.pendingText,
    );
  });

  const activeStep = steps.find((step) => step.current) || steps.find((step) => !step.complete);
  el.setupProgressSummary.textContent = activeStep ? activeStep.summary : "Ready to play";
}

function handleGlobalWheel(event) {
  const panel = el.controlPanel;
  const hasOverflow = panel.scrollHeight > panel.clientHeight + 1;
  if (!hasOverflow) return;
  if (event.target instanceof Node && panel.contains(event.target)) return;

  const previousTop = panel.scrollTop;
  panel.scrollTop += event.deltaY;
  if (panel.scrollTop !== previousTop) {
    event.preventDefault();
    updateControlScrollHints();
  }
}

function updateHelpAlignment() {
  const left = el.stagePanel?.getBoundingClientRect().left;
  if (!Number.isFinite(left)) return;
  document.documentElement.style.setProperty("--help-left", `${Math.max(18, Math.round(left))}px`);
}

function updateRangeProgress(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const value = Number(input.value) || 0;
  const progress = ((value - min) / Math.max(1, max - min)) * 100;
  input.style.setProperty("--range-progress", `${clamp(progress, 0, 100)}%`);
}

function setSoundFontVolume(value) {
  state.soundFontVolume = clamp(Number(value) || 0, 0, 8);
  if (state.sfGain) {
    state.sfGain.gain.setTargetAtTime(state.soundFontVolume, state.audio.context.currentTime, 0.01);
  }
  updateRangeProgress(el.soundFontVolumeInput);
}

function syncSegmentThumb(group) {
  const active = group.querySelector("button.active");
  group.classList.toggle("has-active", Boolean(active));
  if (!active) return;
  group.style.setProperty("--segment-left", `${active.offsetLeft}px`);
  group.style.setProperty("--segment-width", `${active.offsetWidth}px`);
}

function syncAllSegmentThumbs() {
  document.querySelectorAll(".split-mode-row, .range-preset-row").forEach(syncSegmentThumb);
}

function currentTrackingMode() {
  return state.performanceMode ? TRACKING_MODES.performance : TRACKING_MODES.normal;
}

function applyHandTrackingOptions() {
  if (!state.handsModel) return;
  const mode = currentTrackingMode();
  state.handsModel.setOptions({
    maxNumHands: 2,
    modelComplexity: mode.modelComplexity,
    minDetectionConfidence: mode.minDetectionConfidence,
    minTrackingConfidence: mode.minTrackingConfidence,
  });
}

async function setPerformanceMode(enabled) {
  state.performanceMode = enabled;
  el.performanceModeBtn.setAttribute("aria-checked", String(enabled));
  setDiagnosticsPaused(enabled);
  applyHandTrackingOptions();

  if (enabled && Number(el.smoothingInput.value) > 0.55) {
    el.smoothingInput.value = "0.55";
    updateRangeProgress(el.smoothingInput);
    state.smoothedSplit = null;
  }

  if (state.cameraRunning) {
    state.cameraRunning = false;
    cancelAnimationFrame(state.detectLoopId);
    await startCamera();
  }
}

function setDiagnosticsPaused(paused) {
  state.diagnosticsPaused = paused;
  if (!paused) return;

  setReadoutText(el.leftHandReadout, "Paused");
  setReadoutText(el.rightHandReadout, "Paused");
  setReadoutText(el.splitReadout, "Paused");
  setReadoutText(el.lastNoteReadout, "Paused");
  setReadoutText(el.routeReadout, "Paused for performance");
  setStatus(el.handStatus, "Paused", "muted");
  setStatus(el.lastMidiStatus, "Paused", "muted");
}

function syncSplitModeButtons() {
  el.splitModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.splitPointMode === state.splitPointMode);
  });
  syncAllSegmentThumbs();
}

function setSplitPointMode(mode) {
  if (!["palm", "thumb"].includes(mode) || state.splitPointMode === mode) return;
  state.splitPointMode = mode;
  updateHandAnchor(state.leftHand);
  updateHandAnchor(state.rightHand);
  state.smoothedSplit = null;
  updateSplit();
  syncSplitModeButtons();
  drawOverlay();
}

function setCalibrationPrompt(title, text, kind = "warn") {
  if (state.calibrationCompleteTimer) {
    clearTimeout(state.calibrationCompleteTimer);
    state.calibrationCompleteTimer = null;
  }
  el.calibrationPromptTitle.textContent = title;
  el.calibrationPromptText.textContent = text;
  el.calibrationPrompt.classList.toggle("success", kind === "success");
  el.calibrationPrompt.hidden = false;
}

function hideCalibrationPrompt() {
  el.calibrationPrompt.hidden = true;
}

function showCalibrationComplete() {
  if (state.calibrationCompleteTimer) {
    clearTimeout(state.calibrationCompleteTimer);
  }
  setCalibrationPrompt("Keyboard calibrated", "The keyboard edges are set.", "success");
  state.calibrationCompleteTimer = setTimeout(() => {
    hideCalibrationPrompt();
    state.calibrationCompleteTimer = null;
  }, 1400);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function noteName(note) {
  const rounded = Math.round(note);
  const octave = Math.floor(rounded / 12) - 1;
  return `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${octave}`;
}

function parseNoteValue(value, fallback) {
  const input = String(value).trim().toUpperCase();
  if (!input) return fallback;

  if (/^\d+$/.test(input)) {
    return clamp(Number(input), 0, 127);
  }

  const match = input.match(/^([A-G])([#B]?)(-?\d+)$/);
  if (!match) return fallback;

  const [, letter, accidental, octaveText] = match;
  const semitones = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  let note = semitones[letter] + (Number(octaveText) + 1) * 12;
  if (accidental === "#") note += 1;
  if (accidental === "B") note -= 1;
  return clamp(note, 0, 127);
}

function getKeyboardRange() {
  const low = parseNoteValue(el.lowNoteInput.value, 21);
  const high = parseNoteValue(el.highNoteInput.value, 108);
  return low < high ? { low, high } : { low: high, high: low };
}

function syncRangePresetButtons() {
  const value = `${el.lowNoteInput.value.trim().toUpperCase()}:${el.highNoteInput.value.trim().toUpperCase()}`;
  el.rangePresetButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.rangePreset === value);
  });
  syncAllSegmentThumbs();
}

function applyRangePreset(value) {
  if (value === "custom") return;
  const preset = KEYBOARD_RANGE_PRESETS[value];
  if (!preset) return;
  [el.lowNoteInput.value, el.highNoteInput.value] = preset;
  state.smoothedSplit = null;
  drawOverlay();
}

function shiftNoteInput(inputId, delta) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const fallback = input === el.lowNoteInput ? 21 : 108;
  const nextNote = clamp(parseNoteValue(input.value, fallback) + delta, 0, 127);
  input.value = noteName(nextNote);
  state.smoothedSplit = null;
  syncRangePresetButtons();
  drawOverlay();
}

function keyboardReady() {
  return Number.isFinite(state.keyboardLeftX) && Number.isFinite(state.keyboardRightX);
}

function toViewX(sourceX) {
  return state.mirrorCamera ? el.overlay.width - sourceX : sourceX;
}

function xToNote(x) {
  if (!keyboardReady()) return null;
  const { low, high } = getKeyboardRange();
  const left = Math.min(state.keyboardLeftX, state.keyboardRightX);
  const right = Math.max(state.keyboardLeftX, state.keyboardRightX);
  const ratio = clamp((x - left) / Math.max(1, right - left), 0, 1);
  return low + ratio * (high - low);
}

function noteToX(note) {
  if (!keyboardReady()) return null;
  const { low, high } = getKeyboardRange();
  const left = Math.min(state.keyboardLeftX, state.keyboardRightX);
  const right = Math.max(state.keyboardLeftX, state.keyboardRightX);
  const ratio = clamp((note - low) / Math.max(1, high - low), 0, 1);
  return left + ratio * (right - left);
}

function updateSplit() {
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

function syncCanvasSize() {
  const width = el.video.videoWidth || 1280;
  const height = el.video.videoHeight || 720;
  if (el.overlay.width !== width || el.overlay.height !== height) {
    el.overlay.width = width;
    el.overlay.height = height;
  }
}

function drawHand(hand, color) {
  if (!hand) return;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  if (!state.performanceMode) {
    for (const point of hand.landmarks) {
      ctx.beginPath();
      ctx.arc(toViewX(point.x * el.overlay.width), point.y * el.overlay.height, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.beginPath();
  ctx.arc(hand.x, hand.y, 10, 0, Math.PI * 2);
  ctx.stroke();

  if (state.performanceMode) return;

  ctx.fillStyle = "rgba(0, 0, 0, 0.68)";
  ctx.fillRect(hand.x + 12, hand.y - 18, 74, 24);
  ctx.fillStyle = "#ffffff";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(`${hand.label} ${Number.isFinite(hand.note) ? noteName(hand.note) : ""}`, hand.x + 18, hand.y - 2);
}

function drawEdgeMarker(x) {
  if (!Number.isFinite(x)) return;

  ctx.save();
  ctx.strokeStyle = UI_YELLOW;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 7]);
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, el.overlay.height);
  ctx.stroke();
  ctx.restore();
}

function drawOverlay() {
  syncCanvasSize();
  ctx.clearRect(0, 0, el.overlay.width, el.overlay.height);

  if (keyboardReady()) {
    const leftX = Math.min(state.keyboardLeftX, state.keyboardRightX);
    const rightX = Math.max(state.keyboardLeftX, state.keyboardRightX);
    const splitX = state.smoothedSplit === null ? (leftX + rightX) / 2 : noteToX(state.smoothedSplit);

    ctx.fillStyle = "rgba(58, 134, 255, 0.24)";
    ctx.fillRect(leftX, 0, Math.max(0, splitX - leftX), el.overlay.height);
    ctx.fillStyle = "rgba(255, 90, 112, 0.24)";
    ctx.fillRect(splitX, 0, Math.max(0, rightX - splitX), el.overlay.height);

    ctx.strokeStyle = UI_YELLOW;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(splitX, 0);
    ctx.lineTo(splitX, el.overlay.height);
    ctx.stroke();
  }

  drawEdgeMarker(state.keyboardLeftX);
  drawEdgeMarker(state.keyboardRightX);
  drawEdgeMarker(state.calibrationPreviewX);
  drawHand(state.leftHand, "#3a86ff");
  drawHand(state.rightHand, "#ff5a70");
  updateReadouts();
}

function pointFromLandmark(landmarks, index) {
  const point = landmarks[index];
  if (!point) return null;
  return {
    x: toViewX(point.x * el.overlay.width),
    y: point.y * el.overlay.height,
  };
}

function palmPoint(landmarks) {
  const palmIndexes = [0, 5, 9, 13, 17];
  const total = palmIndexes.reduce(
    (acc, index) => {
      acc.x += landmarks[index].x;
      acc.y += landmarks[index].y;
      return acc;
    },
    { x: 0, y: 0 },
  );

  return {
    x: toViewX((total.x / palmIndexes.length) * el.overlay.width),
    y: (total.y / palmIndexes.length) * el.overlay.height,
  };
}

function handAnchorPoint(landmarks) {
  if (state.splitPointMode === "thumb") {
    return pointFromLandmark(landmarks, 4) || palmPoint(landmarks);
  }
  return palmPoint(landmarks);
}

function updateHandAnchor(hand) {
  if (!hand?.landmarks) return;
  const anchor = handAnchorPoint(hand.landmarks);
  hand.x = anchor.x;
  hand.y = anchor.y;
  hand.note = xToNote(anchor.x);
}

function handleHandsResults(results) {
  syncCanvasSize();
  state.leftHand = null;
  state.rightHand = null;

  const landmarksList = results.multiHandLandmarks || [];
  const handednessList = results.multiHandedness || [];

  landmarksList.forEach((landmarks, index) => {
    const anchor = handAnchorPoint(landmarks);
    let label = handednessList[index]?.label || (anchor.x < el.overlay.width / 2 ? "Left" : "Right");
    if (state.swapHands) label = label === "Left" ? "Right" : "Left";

    const hand = {
      label,
      landmarks,
      x: anchor.x,
      y: anchor.y,
      note: xToNote(anchor.x),
    };

    if (label === "Left") state.leftHand = hand;
    if (label === "Right") state.rightHand = hand;
  });

  updateSplit();
  if (!state.diagnosticsPaused) {
    setStatus(el.handStatus, `${landmarksList.length} hand${landmarksList.length === 1 ? "" : "s"}`, landmarksList.length ? "ok" : "warn");
  }
  drawOverlay();
}

async function detectLoop() {
  if (!state.cameraRunning || !state.handsModel) return;
  const now = performance.now();
  const mode = currentTrackingMode();
  if (mode.minFrameMs && now - state.lastDetectionAt < mode.minFrameMs) {
    state.detectLoopId = requestAnimationFrame(detectLoop);
    return;
  }

  if (el.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    state.lastDetectionAt = now;
    await state.handsModel.send({ image: el.video });
  }
  state.detectLoopId = requestAnimationFrame(detectLoop);
}

async function startCamera() {
  if (!window.Hands) {
    setStatus(el.handStatus, "MediaPipe failed", "bad");
    return;
  }

  if (!state.handsModel) {
    state.handsModel = new window.Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    applyHandTrackingOptions();
    state.handsModel.onResults(handleHandsResults);
  }

  try {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach((track) => track.stop());
    }
    cancelAnimationFrame(state.detectLoopId);
    const mode = currentTrackingMode();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: mode.width },
        height: { ideal: mode.height },
        frameRate: { ideal: state.performanceMode ? 30 : 60 },
        ...(state.selectedCameraId ? { deviceId: { exact: state.selectedCameraId } } : {}),
      },
      audio: false,
    });
    state.cameraStream = stream;
    el.video.srcObject = stream;
    await el.video.play();
    state.cameraRunning = true;
    el.emptyState.style.display = "none";
    setStatus(el.cameraStatus, "Camera live", "ok");
    await refreshCameraDevices();
    if (!keyboardReady()) {
      startAutoCalibration();
    }
    state.lastDetectionAt = 0;
    state.detectLoopId = requestAnimationFrame(detectLoop);
  } catch (error) {
    setStatus(el.cameraStatus, "Camera blocked", "bad");
    console.error(error);
  }
}

async function refreshCameraDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === "videoinput");
  const previousValue = state.selectedCameraId || el.cameraSelect.value;
  el.cameraSelect.innerHTML = "";

  if (!cameras.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Default camera";
    el.cameraSelect.append(option);
    return;
  }

  cameras.forEach((camera, index) => {
    const option = document.createElement("option");
    option.value = camera.deviceId;
    option.textContent = camera.label || `Camera ${index + 1}`;
    el.cameraSelect.append(option);
  });

  if (previousValue && cameras.some((camera) => camera.deviceId === previousValue)) {
    el.cameraSelect.value = previousValue;
  } else {
    el.cameraSelect.value = cameras[0].deviceId;
    state.selectedCameraId = cameras[0].deviceId;
  }
}

async function handleCameraSelectionChange(event) {
  state.selectedCameraId = event.target.value;
  if (state.cameraRunning) {
    state.cameraRunning = false;
    cancelAnimationFrame(state.detectLoopId);
    await startCamera();
  }
}

function getAudioContext() {
  if (state.audio?.context) return state.audio.context;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const context = new AudioCtx({ latencyHint: "interactive" });
  state.audio = { type: "context", context };
  return context;
}

async function ensureSoundFontSynth() {
  if (state.sfSynth) return state.sfSynth;

  if (!window.AudioWorkletNode) {
    throw new Error("AudioWorklet is not supported in this browser.");
  }

  const context = getAudioContext();
  await context.resume();
  setStatus(el.audioStatus, "Audio ready", "ok");

  if (!state.sfModule) {
    state.sfModule = await import(SPESSA_MODULE_URL);
  }

  await context.audioWorklet.addModule(SPESSA_WORKLET_URL);
  state.sfSynth = new state.sfModule.WorkletSynthesizer(context);
  state.sfGain = context.createGain();
  state.sfGain.gain.value = state.soundFontVolume;
  state.sfGain.connect(context.destination);
  state.sfOutput = state.sfSynth.connect(state.sfGain);
  state.sfSynthReady = state.sfSynth.isReady;
  await state.sfSynthReady;
  state.audio.type = "soundfont";
  setStatus(el.soundFontTopStatus, "SF engine ready", "ok");
  return state.sfSynth;
}

function presetLabel(preset) {
  const name = preset.name || preset.presetName || preset.patchName || "Preset";
  const bank = preset.bank ?? preset.bankNumber ?? preset.midiBank ?? 0;
  const program = preset.program ?? preset.programNumber ?? preset.preset ?? 0;
  return `${bank}:${program} ${name}`;
}

function presetBank(preset) {
  return preset.bank ?? preset.bankNumber ?? preset.midiBank ?? 0;
}

function presetProgram(preset) {
  return preset.program ?? preset.programNumber ?? preset.preset ?? 0;
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

function applySelectedPresets() {
  if (!state.sfSynth || !state.soundFontLoaded) return;
  applyPresetToChannel(0, el.leftPresetSelect);
  applyPresetToChannel(1, el.rightPresetSelect);
}

async function loadSoundFontFile(file) {
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
  const synth = await ensureSoundFontSynth();
  if (state.soundBankId) {
    await synth.soundBankManager.deleteSoundBank(state.soundBankId).catch(() => {});
  }
  state.soundBankId = bankId;
  await synth.soundBankManager.addSoundBank(buffer, state.soundBankId);
  await synth.isReady;
  state.soundFontLoaded = true;
  populatePresetSelects(synth.presetList || []);
  el.soundFontStatus.textContent = `${displayName} loaded. ${synth.presetList?.length || 0} presets available.`;
  setStatus(el.soundFontTopStatus, "SF loaded", "ok");
}

async function loadDefaultSoundFont() {
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

async function startAudio() {
  if (state.audio) {
    await state.audio.context?.resume?.();
    setStatus(el.audioStatus, "Audio ready", "ok");
    return;
  }

  getAudioContext();
  await state.audio.context.resume();
  setStatus(el.audioStatus, "Audio ready", "ok");
}

async function startCameraAndAudio() {
  if (el.emptyStartCameraBtn.disabled) return;

  const previousText = el.emptyStartCameraBtn.textContent;
  el.emptyStartCameraBtn.disabled = true;
  el.emptyStartCameraBtn.textContent = "Start camera";

  try {
    const audioPromise = startAudio().catch((error) => {
      console.warn("Audio could not be started automatically.", error);
      setStatus(el.audioStatus, "Audio blocked", "bad");
    });
    await startCamera();
    await audioPromise;
  } finally {
    el.emptyStartCameraBtn.disabled = false;
    el.emptyStartCameraBtn.textContent = previousText;
  }
}

function playNote(note, velocity, side) {
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

function releaseNote(note) {
  const active = state.activeNotes.get(note);
  if (!active || !state.audio) return;

  if (state.audio.type === "soundfont" && state.sfSynth && Number.isFinite(active.channel)) {
    state.sfSynth.noteOff(active.channel, note);
  }
  state.activeNotes.delete(note);
}

function handleSustainPedal(value) {
  state.sustainValue = clamp(value, 0, 127);

  if (state.sfSynth && state.soundFontLoaded) {
    state.sfSynth.controllerChange(0, 64, state.sustainValue);
    state.sfSynth.controllerChange(1, 64, state.sustainValue);
  }

  if (!state.diagnosticsPaused) {
    el.routeReadout.textContent = state.sustainValue >= 64 ? "Sustain pedal down" : "Sustain pedal up";
  }
}

function handleAllNotesOff(controller, value) {
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

function routeNoteOn(note, velocity) {
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

function refreshMidiInputs() {
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

function connectMidiInput(id) {
  if (!state.midiAccess) return;
  if (state.selectedMidiInput) state.selectedMidiInput.onmidimessage = null;
  state.selectedMidiInput = state.midiAccess.inputs.get(id);
  if (state.selectedMidiInput) {
    state.selectedMidiInput.onmidimessage = handleMidiMessage;
    el.midiInputSelect.value = id;
  }
}

async function initMidi() {
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

function setReadoutText(node, text) {
  if (state.readoutText.get(node) === text) return;
  state.readoutText.set(node, text);
  node.textContent = text;
}

function updateReadouts() {
  if (state.diagnosticsPaused) return;
  setReadoutText(el.leftHandReadout, state.leftHand?.note === null || !state.leftHand ? "--" : `${noteName(state.leftHand.note)} (${state.leftHand.note.toFixed(1)})`);
  setReadoutText(el.rightHandReadout, state.rightHand?.note === null || !state.rightHand ? "--" : `${noteName(state.rightHand.note)} (${state.rightHand.note.toFixed(1)})`);
  setReadoutText(el.splitReadout, state.smoothedSplit === null ? "--" : `${noteName(state.smoothedSplit)} (${state.smoothedSplit.toFixed(1)})`);
}

function setCalibrationMode(mode) {
  state.calibrationMode = mode;
  if (mode !== "auto") {
    state.calibrationPoints = [];
    state.calibrationPreviewX = null;
  }
  el.calibrateLeftBtn.classList.toggle("active", mode === "left");
  el.calibrateRightBtn.classList.toggle("active", mode === "right");

  if (mode === "left") {
    setCalibrationPrompt("Set left edge", "Click the visible left end of the keyboard in the camera view.");
  } else if (mode === "right") {
    setCalibrationPrompt("Set right edge", "Click the visible right end of the keyboard in the camera view.");
  }
}

function startAutoCalibration() {
  state.calibrationMode = "auto";
  state.calibrationPoints = [];
  state.calibrationPreviewX = null;
  el.calibrateLeftBtn.classList.remove("active");
  el.calibrateRightBtn.classList.remove("active");
  setCalibrationPrompt("Calibrate keyboard", "Click the two keyboard ends in the camera view. Either order works.");
}

function handleOverlayClick(event) {
  if (!state.calibrationMode) return;
  const rect = el.overlay.getBoundingClientRect();
  const scaleX = el.overlay.width / rect.width;
  const x = (event.clientX - rect.left) * scaleX;

  if (state.calibrationMode === "auto") {
    state.calibrationPoints.push(x);
    if (state.calibrationPoints.length === 1) {
      state.calibrationPreviewX = x;
      setCalibrationPrompt("First edge set", "Now click the other end of the keyboard.");
      drawOverlay();
      return;
    }

    const [firstX, secondX] = state.calibrationPoints;
    state.keyboardLeftX = Math.min(firstX, secondX);
    state.keyboardRightX = Math.max(firstX, secondX);
    state.calibrationPoints = [];
    state.calibrationPreviewX = null;
    state.calibrationMode = null;
    state.smoothedSplit = null;
    showCalibrationComplete();
    drawOverlay();
    updateSetupGuide();
    return;
  }

  let completed = false;
  if (state.calibrationMode === "left") {
    state.keyboardLeftX = x;
    if (Number.isFinite(state.keyboardRightX)) {
      completed = true;
    } else {
      setCalibrationPrompt("Left edge set", "Now click Set right edge, then click the keyboard's right end.");
    }
  }
  if (state.calibrationMode === "right") {
    state.keyboardRightX = x;
    if (Number.isFinite(state.keyboardLeftX)) {
      completed = true;
    } else {
      setCalibrationPrompt("Right edge set", "Now click Set left edge, then click the keyboard's left end.");
    }
  }
  state.smoothedSplit = null;
  setCalibrationMode(null);
  if (completed) showCalibrationComplete();
  drawOverlay();
  updateSetupGuide();
}

function getVideoFrameRect() {
  const videoWidth = el.video.videoWidth || el.overlay.width;
  const videoHeight = el.video.videoHeight || el.overlay.height;
  const canvasRatio = el.overlay.width / el.overlay.height;
  const videoRatio = videoWidth / videoHeight;

  if (canvasRatio > videoRatio) {
    const renderedWidth = el.overlay.height * videoRatio;
    return {
      x: (el.overlay.width - renderedWidth) / 2,
      y: 0,
      width: renderedWidth,
      height: el.overlay.height,
    };
  }

  const renderedHeight = el.overlay.width / videoRatio;
  return {
    x: 0,
    y: (el.overlay.height - renderedHeight) / 2,
    width: el.overlay.width,
    height: renderedHeight,
  };
}

function rgbToHslSaturation(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  if (max === min) return 0;
  const delta = max - min;
  return delta / (1 - Math.abs(2 * lightness - 1));
}

function classifyKeyPixel(data, index) {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  const brightness = (r + g + b) / 3;
  const saturation = rgbToHslSaturation(r, g, b);
  const channelSpread = Math.max(r, g, b) - Math.min(r, g, b);

  return {
    white: brightness > 138 && saturation < 0.3 && channelSpread < 72,
    black: brightness < 96 && channelSpread < 76,
  };
}

function averageInWindow(values, index, radius, minIndex, maxIndex) {
  let total = 0;
  let count = 0;
  for (let offset = -radius; offset <= radius; offset++) {
    const i = index + offset;
    if (i >= minIndex && i < maxIndex) {
      total += values[i];
      count += 1;
    }
  }
  return count ? total / count : 0;
}

function autoDetectKeyboardEdges() {
  if (!state.cameraRunning || el.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    setCalibrationPrompt("Camera required", "Start the camera first, then try Auto detect edges again.");
    return;
  }

  syncCanvasSize();
  const frameCanvas = document.createElement("canvas");
  frameCanvas.width = el.overlay.width;
  frameCanvas.height = el.overlay.height;
  const frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true });

  if (state.mirrorCamera) {
    frameCtx.translate(frameCanvas.width, 0);
    frameCtx.scale(-1, 1);
  }
  frameCtx.drawImage(el.video, 0, 0, frameCanvas.width, frameCanvas.height);

  const frame = getVideoFrameRect();
  const scanTop = Math.floor(frame.y);
  const scanBottom = Math.ceil(frame.y + frame.height);
  const scanLeft = Math.floor(frame.x);
  const scanRight = Math.ceil(frame.x + frame.width);
  const image = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
  const rowScores = new Array(frameCanvas.height).fill(0);

  for (let y = scanTop; y < scanBottom; y += 3) {
    let whiteCount = 0;
    let blackCount = 0;
    let transitions = 0;
    let lastClass = 0;

    for (let x = scanLeft; x < scanRight; x += 3) {
      const index = (y * frameCanvas.width + x) * 4;
      const pixel = classifyKeyPixel(image.data, index);
      const currentClass = pixel.white ? 1 : pixel.black ? -1 : 0;
      if (pixel.white) whiteCount += 1;
      if (pixel.black) blackCount += 1;
      if (currentClass && lastClass && currentClass !== lastClass) transitions += 1;
      if (currentClass) lastClass = currentClass;
    }

    const sampledWidth = Math.max(1, Math.floor((scanRight - scanLeft) / 3));
    const whiteRatio = whiteCount / sampledWidth;
    const blackRatio = blackCount / sampledWidth;
    const transitionScore = Math.min(1, transitions / 34);

    // White-key rows have a long bright band plus repeated dark black-key stripes.
    rowScores[y] = whiteRatio * 0.55 + transitionScore * 0.35 + Math.min(blackRatio, 0.28) * 0.1;
  }

  const smoothedRows = rowScores.map((_, y) => averageInWindow(rowScores, y, 12, scanTop, scanBottom));
  let bestY = scanTop;
  let bestRowScore = 0;
  for (let y = scanTop; y < scanBottom; y++) {
    if (smoothedRows[y] > bestRowScore) {
      bestRowScore = smoothedRows[y];
      bestY = y;
    }
  }

  if (bestRowScore < 0.12) {
    setCalibrationPrompt("Detection failed", "Could not find a row with white keys and black-key stripes. Try a clearer angle or set edges manually.");
    return;
  }

  const bandHalfHeight = Math.max(20, Math.floor(frame.height * 0.055));
  const bandTop = clamp(bestY - bandHalfHeight, scanTop, scanBottom - 1);
  const bandBottom = clamp(bestY + bandHalfHeight, scanTop + 1, scanBottom);
  const columnScores = new Array(frameCanvas.width).fill(0);

  for (let x = scanLeft; x < scanRight; x += 2) {
    let whiteCount = 0;
    let blackCount = 0;
    for (let y = bandTop; y < bandBottom; y += 2) {
      const index = (y * frameCanvas.width + x) * 4;
      const pixel = classifyKeyPixel(image.data, index);
      if (pixel.white) whiteCount += 1;
      if (pixel.black) blackCount += 1;
    }
    columnScores[x] = whiteCount + Math.min(blackCount, whiteCount * 0.65);
  }

  const smoothedColumns = columnScores.map((_, x) => averageInWindow(columnScores, x, 7, scanLeft, scanRight));
  const maxColumnScore = Math.max(...smoothedColumns.slice(scanLeft, scanRight));
  const columnThreshold = Math.max(3, maxColumnScore * 0.22);
  const activeColumns = [];

  for (let x = scanLeft; x < scanRight; x++) {
    if (smoothedColumns[x] >= columnThreshold) activeColumns.push(x);
  }

  if (!activeColumns.length) {
    setCalibrationPrompt("Detection failed", "Found the keyboard row but not its left and right ends. Use manual edge setting.");
    return;
  }

  const gapLimit = Math.max(32, frame.width * 0.055);
  const groups = [];
  let group = { start: activeColumns[0], end: activeColumns[0] };
  for (const x of activeColumns.slice(1)) {
    if (x - group.end <= gapLimit) {
      group.end = x;
    } else {
      groups.push(group);
      group = { start: x, end: x };
    }
  }
  groups.push(group);

  const wideGroups = groups.filter((candidate) => candidate.end - candidate.start >= frame.width * 0.12);
  const usableGroups = wideGroups.length ? wideGroups : groups;
  const mergedStart = Math.min(...usableGroups.map((candidate) => candidate.start));
  const mergedEnd = Math.max(...usableGroups.map((candidate) => candidate.end));

  if (!Number.isFinite(mergedStart) || !Number.isFinite(mergedEnd) || mergedEnd - mergedStart < frame.width * 0.34) {
    setCalibrationPrompt("Detection failed", "The detected white-key span was too small. Try manual edge setting.");
    return;
  }

  const padding = Math.max(4, Math.floor(frame.width * 0.006));
  state.keyboardLeftX = clamp(mergedStart - padding, scanLeft, scanRight);
  state.keyboardRightX = clamp(mergedEnd + padding, scanLeft, scanRight);
  state.calibrationPreviewX = null;
  state.calibrationPoints = [];
  state.calibrationMode = null;
  state.smoothedSplit = null;
  hideCalibrationPrompt();
  drawOverlay();
  updateSetupGuide();
  el.routeReadout.textContent = `Edges detected near row ${Math.round(bestY)}`;
}

el.emptyStartCameraBtn.addEventListener("click", startCameraAndAudio);
el.performanceModeBtn.addEventListener("click", () => {
  setPerformanceMode(!state.performanceMode);
});
el.splitModeButtons.forEach((button) => {
  button.addEventListener("click", () => setSplitPointMode(button.dataset.splitPointMode));
});
el.cameraSelect.addEventListener("change", handleCameraSelectionChange);
el.autoDetectEdgesBtn.addEventListener("click", autoDetectKeyboardEdges);
el.refreshMidiBtn.addEventListener("click", initMidi);
el.soundFontInput.addEventListener("change", (event) => loadSoundFontFile(event.target.files[0]));
window.addEventListener("dragenter", (event) => {
  if (!hasDraggedFile(event.dataTransfer)) return;
  event.preventDefault();
  setDropOverlayVisible(true);
});
window.addEventListener("dragover", (event) => {
  if (!hasDraggedFile(event.dataTransfer)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  setDropOverlayVisible(true);
});
window.addEventListener("dragleave", (event) => {
  if (event.relatedTarget) return;
  setDropOverlayVisible(false);
});
window.addEventListener("drop", (event) => {
  if (!hasDraggedFile(event.dataTransfer)) return;
  const file = firstSoundFontFile(event.dataTransfer?.files);
  event.preventDefault();
  setDropOverlayVisible(false);
  if (file) {
    loadSoundFontFile(file);
  } else {
    el.soundFontStatus.textContent = "Drop a SoundFont file: SF2, SF3, DLS, SFOGG, or SFONT.";
    setStatus(el.soundFontTopStatus, "Unsupported file", "warn");
  }
});
el.leftPresetSelect.addEventListener("change", applySelectedPresets);
el.rightPresetSelect.addEventListener("change", applySelectedPresets);
el.midiInputSelect.addEventListener("change", (event) => connectMidiInput(event.target.value));
el.calibrateLeftBtn.addEventListener("click", () => setCalibrationMode("left"));
el.calibrateRightBtn.addEventListener("click", () => setCalibrationMode("right"));
el.overlay.addEventListener("click", handleOverlayClick);
el.rangePresetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyRangePreset(button.dataset.rangePreset);
    syncRangePresetButtons();
  });
});
el.noteShiftButtons.forEach((button) => {
  button.addEventListener("click", () => {
    shiftNoteInput(button.dataset.noteTarget, Number(button.dataset.noteShift));
  });
});
el.lowNoteInput.addEventListener("change", () => {
  state.smoothedSplit = null;
  syncRangePresetButtons();
  drawOverlay();
});
el.highNoteInput.addEventListener("change", () => {
  state.smoothedSplit = null;
  syncRangePresetButtons();
  drawOverlay();
});
el.smoothingInput.addEventListener("input", () => updateRangeProgress(el.smoothingInput));
el.soundFontVolumeInput.addEventListener("input", () => setSoundFontVolume(el.soundFontVolumeInput.value));
el.controlPanel.addEventListener("scroll", updateControlScrollHints);
window.addEventListener("wheel", handleGlobalWheel, { passive: false });
window.addEventListener("resize", () => {
  updateControlScrollHints();
  updateHelpAlignment();
  syncAllSegmentThumbs();
  syncDiagnosticsHeight();
});
el.helpCloseBtn.addEventListener("click", () => setHelpCollapsed(true));
el.helpToggleBtn.addEventListener("click", () => setHelpCollapsed(false));
el.diagnosticsPanel?.querySelector("summary")?.addEventListener("click", toggleDiagnosticsPanel);

document.querySelectorAll("[data-help]").forEach((node) => {
  const title = node.dataset.helpTitle || node.closest("label")?.textContent.trim().replace(/\s+/g, " ") || node.textContent.trim();
  const show = () => setHelp(title, node.dataset.help);
  const reset = () => setHelp(DEFAULT_HELP.title, DEFAULT_HELP.text);
  node.addEventListener("mouseenter", show);
  node.addEventListener("focus", show);
  node.addEventListener("mouseleave", reset);
  node.addEventListener("blur", reset);
});

setStatus(el.handStatus, window.Hands ? "MediaPipe loaded" : "MediaPipe loading", window.Hands ? "ok" : "warn");
window.lucide?.createIcons?.();
if (el.diagnosticsPanel) {
  el.diagnosticsPanel.dataset.expanded = el.diagnosticsPanel.open ? "true" : "false";
  syncDiagnosticsHeight();
}
el.helpToggleBtn.classList.toggle("is-hidden", el.helpToggleBtn.hidden);
el.helpWindow.classList.toggle("is-hidden", el.helpWindow.hidden);
updateRangeProgress(el.smoothingInput);
setSoundFontVolume(el.soundFontVolumeInput.value);
syncSplitModeButtons();
syncRangePresetButtons();
syncAllSegmentThumbs();
updateSetupGuide();
updateHelpAlignment();
initMidi();
refreshCameraDevices().catch(() => {});
loadDefaultSoundFont();
drawOverlay();
requestAnimationFrame(updateControlScrollHints);
