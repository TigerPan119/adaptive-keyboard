import { DEFAULT_HELP, el, state } from "./core.js";
import { applySelectedPresets, loadDefaultSoundFont, loadSoundFontFile, setChannelVolume, setVirtualSustain, startAudio } from "./audio.js";
import { autoDetectKeyboardEdges, handleOverlayClick, setCalibrationMode, startAutoCalibration } from "./calibration.js";
import { beginMidiLearn, configureMidi, connectMidiInput, initMidi } from "./midi.js";
import { noteName } from "./keyboard.js";
import {
  applyRangePreset,
  firstSoundFontFile,
  handleGlobalWheel,
  hasDraggedFile,
  setDropOverlayVisible,
  setHelp,
  setHelpCollapsed,
  setSoundFontVolume,
  setStatus,
  shiftNoteInput,
  syncAllSegmentThumbs,
  syncDiagnosticsHeight,
  syncRangePresetButtons,
  toggleDiagnosticsPanel,
  updateControlScrollHints,
  updateHelpAlignment,
  updateRangeProgress,
  updateSetupGuide,
} from "./ui.js";
import {
  configureVision,
  drawOverlay,
  handleCameraSelectionChange,
  refreshCameraDevices,
  resetMediaPipe,
  setPerformanceMode,
  setSplitPointMode,
  startCamera,
  syncSplitModeButtons,
} from "./vision.js";

function resumeAudio() {
  startAudio().catch((error) => {
    console.warn("Audio could not be started automatically.", error);
    setStatus(el.audioStatus, "Audio blocked", "bad");
  });
}

function bindSustainPedal(button) {
  let pointerId = null;
  const heldKeys = new Set();
  const syncPedal = () => {
    const down = pointerId !== null || heldKeys.size > 0;
    if (down && !state.virtualPedalDown) resumeAudio();
    setVirtualSustain(down);
  };
  const releasePointer = (event) => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    syncPedal();
  };
  const releaseAll = () => {
    const captured = pointerId;
    pointerId = null;
    heldKeys.clear();
    if (captured !== null && button.hasPointerCapture(captured)) button.releasePointerCapture(captured);
    syncPedal();
  };

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || pointerId !== null) return;
    button.setPointerCapture(event.pointerId);
    pointerId = event.pointerId;
    syncPedal();
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(type, releasePointer);
  }
  for (const type of ["keydown", "keyup"]) {
    button.addEventListener(type, (event) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      const key = event.code || event.key;
      if (type === "keydown" && !event.repeat) heldKeys.add(key);
      if (type === "keyup") heldKeys.delete(key);
      syncPedal();
    });
  }
  button.addEventListener("blur", releaseAll);
  window.addEventListener("blur", releaseAll);
  window.addEventListener("pagehide", releaseAll);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseAll();
  });
}

configureVision({ onCalibrationNeeded: startAutoCalibration });
configureMidi({
  onLearnedNote(target, note) {
    const input = target === "low" ? el.lowNoteInput : el.highNoteInput;
    input.value = noteName(note);
    state.smoothedSplit = null;
    syncRangePresetButtons();
    drawOverlay();
  },
});

el.emptyStartCameraBtn.addEventListener("click", () => {
  resumeAudio();
  startCamera();
});
bindSustainPedal(el.sustainPedalBtn);
el.resetMediaPipeBtn.addEventListener("click", resetMediaPipe);
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
    drawOverlay();
  });
});
el.noteShiftButtons.forEach((button) => {
  button.addEventListener("click", () => {
    shiftNoteInput(button.dataset.noteTarget, Number(button.dataset.noteShift));
    drawOverlay();
  });
});
el.midiLearnButtons.forEach((button) => {
  button.addEventListener("click", () => beginMidiLearn(button.dataset.midiLearnTarget));
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
[el.leftVolumeInput, el.rightVolumeInput].forEach((input, channel) => {
  const syncVolume = () => {
    setChannelVolume(channel, input.value);
    updateRangeProgress(input);
  };
  input.addEventListener("input", syncVolume);
  syncVolume();
});
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
