import { el, state } from "./core.js";
import { clamp } from "./keyboard.js";
import { hideCalibrationPrompt, setCalibrationPrompt, showCalibrationComplete, updateSetupGuide } from "./ui.js";
import { drawOverlay, syncCanvasSize } from "./vision.js";

export function setCalibrationMode(mode) {
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

export function startAutoCalibration() {
  state.calibrationMode = "auto";
  state.calibrationPoints = [];
  state.calibrationPreviewX = null;
  el.calibrateLeftBtn.classList.remove("active");
  el.calibrateRightBtn.classList.remove("active");
  setCalibrationPrompt("Calibrate keyboard", "Click the two keyboard ends in the camera view. Either order works.");
}

export function handleOverlayClick(event) {
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

export function autoDetectKeyboardEdges() {
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
