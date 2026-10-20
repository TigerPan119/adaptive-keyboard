import { DEFAULT_HELP, el, KEYBOARD_RANGE_PRESETS, state } from "./core.js";
import { clamp, keyboardReady, noteName, parseNoteValue } from "./keyboard.js";
export { firstSoundFontFile, hasDraggedFile, isSoundFontFile } from "./soundfont-player.js";

export function setStatus(node, text, kind = "muted") {
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

export function setHelp(title, text) {
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

export function toggleDiagnosticsPanel(event) {
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

export function syncDiagnosticsHeight() {
  const panel = el.diagnosticsPanel;
  const content = panel?.querySelector(".diagnostics-content");
  if (!panel || !content || panel.dataset.expanded !== "true") return;
  panel.style.setProperty("--diagnostics-height", `${content.scrollHeight}px`);
}

export function setDropOverlayVisible(visible) {
  el.soundFontDropOverlay.hidden = !visible;
}

export function setHelpCollapsed(collapsed) {
  setAnimatedHidden(el.helpWindow, collapsed);
  setAnimatedHidden(el.helpToggleBtn, !collapsed);
}

export function updateControlScrollHints() {
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

export function updateSetupGuide() {
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

export function handleGlobalWheel(event) {
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

export function updateHelpAlignment() {
  const left = el.stagePanel?.getBoundingClientRect().left;
  if (!Number.isFinite(left)) return;
  document.documentElement.style.setProperty("--help-left", `${Math.max(18, Math.round(left))}px`);
}

export function updateRangeProgress(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const value = Number(input.value) || 0;
  const progress = ((value - min) / Math.max(1, max - min)) * 100;
  input.style.setProperty("--range-progress", `${clamp(progress, 0, 100)}%`);
}

export function syncMidiLearnUI(target = null, secondsRemaining = 0) {
  el.midiLearnButtons.forEach((button) => {
    const active = button.dataset.midiLearnTarget === target;
    const label = button.querySelector("span");
    const fieldName = button.dataset.midiLearnTarget === "low" ? "lowest" : "highest";
    button.classList.toggle("is-learning", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute(
      "aria-label",
      active
        ? `Cancel learning ${fieldName} note, ${secondsRemaining} seconds remaining`
        : `Learn ${fieldName} note from MIDI`,
    );
    if (label) label.textContent = active ? "Listening" : "Learn";
  });

  if (!target) return;
  const fieldName = target === "low" ? "Lowest note" : "Highest note";
  el.midiLearnStatus.hidden = false;
  el.midiLearnStatus.dataset.status = "listening";
  el.midiLearnStatus.textContent = `Play a MIDI note for ${fieldName}. ${secondsRemaining}s remaining.`;
}

export function setMidiLearnMessage(message = "", kind = "muted") {
  el.midiLearnStatus.hidden = !message;
  el.midiLearnStatus.dataset.status = kind;
  el.midiLearnStatus.textContent = message;
}

export function setSoundFontVolume(value) {
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

export function syncAllSegmentThumbs() {
  document.querySelectorAll(".split-mode-row, .range-preset-row").forEach(syncSegmentThumb);
}


export function setDiagnosticsPaused(paused) {
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


export function setCalibrationPrompt(title, text, kind = "warn") {
  if (state.calibrationCompleteTimer) {
    clearTimeout(state.calibrationCompleteTimer);
    state.calibrationCompleteTimer = null;
  }
  el.calibrationPromptTitle.textContent = title;
  el.calibrationPromptText.textContent = text;
  el.calibrationPrompt.classList.toggle("success", kind === "success");
  el.calibrationPrompt.hidden = false;
}

export function hideCalibrationPrompt() {
  el.calibrationPrompt.hidden = true;
}

export function showCalibrationComplete() {
  if (state.calibrationCompleteTimer) {
    clearTimeout(state.calibrationCompleteTimer);
  }
  setCalibrationPrompt("Keyboard calibrated", "The keyboard edges are set.", "success");
  state.calibrationCompleteTimer = setTimeout(() => {
    hideCalibrationPrompt();
    state.calibrationCompleteTimer = null;
  }, 1400);
}


export function syncRangePresetButtons() {
  const value = `${el.lowNoteInput.value.trim().toUpperCase()}:${el.highNoteInput.value.trim().toUpperCase()}`;
  el.rangePresetButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.rangePreset === value);
  });
  syncAllSegmentThumbs();
}

export function applyRangePreset(value) {
  if (value === "custom") return;
  const preset = KEYBOARD_RANGE_PRESETS[value];
  if (!preset) return;
  [el.lowNoteInput.value, el.highNoteInput.value] = preset;
  state.smoothedSplit = null;
}

export function shiftNoteInput(inputId, delta) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const fallback = input === el.lowNoteInput ? 21 : 108;
  const nextNote = clamp(parseNoteValue(input.value, fallback) + delta, 0, 127);
  input.value = noteName(nextNote);
  state.smoothedSplit = null;
  syncRangePresetButtons();
}


function setReadoutText(node, text) {
  if (state.readoutText.get(node) === text) return;
  state.readoutText.set(node, text);
  node.textContent = text;
}

export function updateReadouts() {
  if (state.diagnosticsPaused) return;
  setReadoutText(el.leftHandReadout, state.leftHand?.note === null || !state.leftHand ? "--" : `${noteName(state.leftHand.note)} (${state.leftHand.note.toFixed(1)})`);
  setReadoutText(el.rightHandReadout, state.rightHand?.note === null || !state.rightHand ? "--" : `${noteName(state.rightHand.note)} (${state.rightHand.note.toFixed(1)})`);
  setReadoutText(el.splitReadout, state.smoothedSplit === null ? "--" : `${noteName(state.smoothedSplit)} (${state.smoothedSplit.toFixed(1)})`);
}
