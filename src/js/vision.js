import { ctx, el, state, TRACKING_MODES, UI_YELLOW } from "./core.js";
import { keyboardReady, noteName, noteToX, toViewX, updateSplit, xToNote } from "./keyboard.js";
import { setDiagnosticsPaused, setStatus, syncAllSegmentThumbs, updateRangeProgress, updateReadouts } from "./ui.js";

const visionHooks = { onCalibrationNeeded: null };

export function configureVision(hooks) {
  Object.assign(visionHooks, hooks);
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

export async function setPerformanceMode(enabled) {
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


export function syncSplitModeButtons() {
  el.splitModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.splitPointMode === state.splitPointMode);
  });
  syncAllSegmentThumbs();
}

export function setSplitPointMode(mode) {
  if (!["palm", "thumb"].includes(mode) || state.splitPointMode === mode) return;
  state.splitPointMode = mode;
  updateHandAnchor(state.leftHand);
  updateHandAnchor(state.rightHand);
  state.smoothedSplit = null;
  updateSplit();
  syncSplitModeButtons();
  drawOverlay();
}


export function syncCanvasSize() {
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

export function drawOverlay() {
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

export async function startCamera() {
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
      visionHooks.onCalibrationNeeded?.();
    }
    state.lastDetectionAt = 0;
    state.detectLoopId = requestAnimationFrame(detectLoop);
  } catch (error) {
    setStatus(el.cameraStatus, "Camera blocked", "bad");
    console.error(error);
  }
}

export async function refreshCameraDevices() {
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

export async function handleCameraSelectionChange(event) {
  state.selectedCameraId = event.target.value;
  if (state.cameraRunning) {
    state.cameraRunning = false;
    cancelAnimationFrame(state.detectLoopId);
    await startCamera();
  }
}
