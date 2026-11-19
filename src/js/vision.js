import { ctx, el, state, TRACKING_MODES, UI_YELLOW } from "./core.js";
import { keyboardReady, noteName, noteToX, toViewX, updateSplit, xToNote } from "./keyboard.js";
import { setDiagnosticsPaused, setStatus, syncAllSegmentThumbs, updateRangeProgress, updateReadouts } from "./ui.js";

const visionHooks = { onCalibrationNeeded: null };
const HANDS_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/";
const STARTUP_TIMEOUT_MS = 20_000;
const INFERENCE_TIMEOUT_MS = 3_000;
const CAMERA_STALL_MS = 5_000;
const MAX_RETRIES = 3;
let cameraSession = null;

class HandTrackingError extends Error {}

export function configureVision(hooks) {
  Object.assign(visionHooks, hooks);
}

function currentTrackingMode() {
  return state.performanceMode ? TRACKING_MODES.performance : TRACKING_MODES.normal;
}

export function setPerformanceMode(enabled) {
  state.performanceMode = enabled;
  el.performanceModeBtn.setAttribute("aria-checked", String(enabled));
  setDiagnosticsPaused(enabled);

  if (enabled && Number(el.smoothingInput.value) > 0.55) {
    el.smoothingInput.value = "0.55";
    updateRangeProgress(el.smoothingInput);
    state.smoothedSplit = null;
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
  if (state.diagnosticsPaused) {
    setStatus(el.handStatus, "Tracking active", "ok");
  } else {
    setStatus(el.handStatus, `${landmarksList.length} hand${landmarksList.length === 1 ? "" : "s"}`, landmarksList.length ? "ok" : "warn");
  }
  drawOverlay();
}

async function withDeadline(pending, signal, timeoutMs, message) {
  let timer;
  let abort;
  const interruption = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    if (timeoutMs) timer = setTimeout(() => reject(new DOMException(message, "TimeoutError")), timeoutMs);
  });
  try {
    return await Promise.race([interruption, pending]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

async function loadHands(signal) {
  if (window.Hands) return window.Hands;

  const script = document.createElement("script");
  script.src = HANDS_URL + "hands.js";
  const loaded = new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not download MediaPipe Hands."));
  });
  document.head.append(script);
  try {
    await withDeadline(loaded, signal, STARTUP_TIMEOUT_MS, "MediaPipe download timed out.");
    if (!window.Hands) throw new Error("MediaPipe Hands did not load.");
    return window.Hands;
  } finally {
    script.remove();
  }
}

// Watch for fresh camera frames even when the video element still looks ready.
function nextVideoFrame(signal, lastMediaTime) {
  signal.throwIfAborted();
  const { video } = el;
  const usesVideoCallback = typeof video.requestVideoFrameCallback === "function";

  return new Promise((resolve, reject) => {
    let frame = null;
    let timer;

    function cancelFrame() {
      if (frame === null) return;
      if (usesVideoCallback) video.cancelVideoFrameCallback(frame);
      else cancelAnimationFrame(frame);
      frame = null;
    }

    function cleanup() {
      cancelFrame();
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }

    function onAbort() {
      cleanup();
      reject(signal.reason);
    }

    function onFrame(now, metadata) {
      frame = null;
      if (document.hidden) return;

      const mediaTime = metadata?.mediaTime ?? video.currentTime;
      if (mediaTime !== lastMediaTime && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          video.videoWidth && video.videoHeight) {
        cleanup();
        resolve({ now, mediaTime });
      } else {
        queueFrame();
      }
    }

    function queueFrame() {
      frame = usesVideoCallback ? video.requestVideoFrameCallback(onFrame) : requestAnimationFrame(onFrame);
    }

    function onVisibilityChange() {
      cancelFrame();
      clearTimeout(timer);
      if (document.hidden) return;
      timer = setTimeout(() => {
        cleanup();
        reject(new Error("The camera stopped delivering frames."));
      }, CAMERA_STALL_MS);
      queueFrame();
    }

    signal.addEventListener("abort", onAbort, { once: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    onVisibilityChange();
  });
}

function clearTracking() {
  state.leftHand = null;
  state.rightHand = null;
  state.rawSplit = null;
  state.smoothedSplit = null;
  drawOverlay();
}

function closeTracker(tracker) {
  if (!tracker) return;
  // Hands cannot cancel send(). Let the native graph finish before deleting it.
  const close = () => tracker.model.close();
  Promise.resolve(tracker.pending).then(close, close).catch((error) => {
    console.warn("Could not close the MediaPipe graph.", error);
  });
}

function retryDelay(attempt) {
  return 300 * 2 ** (attempt - 1);
}

async function trackHands(signal) {
  let tracker;
  let lastMediaTime;
  let lastDetectionAt = -Infinity;
  let retryAt = 0;
  let failures = 0;

  try {
    while (!signal.aborted) {
      const { now, mediaTime } = await nextVideoFrame(signal, lastMediaTime);
      signal.throwIfAborted();
      lastMediaTime = mediaTime;
      const mode = currentTrackingMode();
      if (now < retryAt || now - lastDetectionAt < mode.minFrameMs) continue;
      lastDetectionAt = now;

      try {
        if (!tracker) {
          const Hands = await loadHands(signal);
          signal.throwIfAborted();
          const model = new Hands({ locateFile: (file) => HANDS_URL + file });
          const instance = { model, mode: null, pending: null, result: null };
          tracker = instance;
          model.onResults(({ image, multiHandLandmarks, multiHandedness }) => {
            image?.close?.();
            instance.result = { multiHandLandmarks, multiHandedness };
          });
        }

        const modeChanged = tracker.mode !== mode;
        if (modeChanged) {
          tracker.model.setOptions({
            maxNumHands: 2,
            modelComplexity: mode.modelComplexity,
            minDetectionConfidence: mode.minDetectionConfidence,
            minTrackingConfidence: mode.minTrackingConfidence,
          });
          tracker.mode = mode;
        }

        tracker.result = null;
        tracker.pending = tracker.model.send({ image: el.video });
        await withDeadline(tracker.pending, signal, modeChanged ? STARTUP_TIMEOUT_MS : INFERENCE_TIMEOUT_MS,
          "MediaPipe did not finish processing a frame.");
        signal.throwIfAborted();
        tracker.pending = null;
        if (!tracker.result) throw new Error("MediaPipe returned no frame result.");
        handleHandsResults(tracker.result);
        failures = 0;
      } catch (error) {
        signal.throwIfAborted();
        console.warn("Hand tracking interrupted.", error);
        closeTracker(tracker);
        tracker = null;
        failures += 1;
        if (failures > MAX_RETRIES) throw new HandTrackingError("Hand tracking stopped.", { cause: error });
        clearTracking();
        setStatus(el.handStatus, "Restarting hand tracking", "warn");
        retryAt = performance.now() + retryDelay(failures);
      }
    }
  } finally {
    closeTracker(tracker);
  }
}

function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

async function openCamera(deviceId, signal) {
  if (!navigator.mediaDevices?.getUserMedia) throw new TypeError("Camera access is unavailable.");

  const mode = currentTrackingMode();
  let acquired;
  let expired = false;
  const pending = navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: mode.width },
      height: { ideal: mode.height },
      frameRate: { ideal: state.performanceMode ? 30 : 60 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    },
    audio: false,
  }).then((stream) => {
    acquired = stream;
    if (expired) stopStream(stream);
    return stream;
  });

  try {
    return await withDeadline(pending, signal, STARTUP_TIMEOUT_MS, "Camera access timed out.");
  } catch (error) {
    expired = true;
    stopStream(acquired);
    throw error;
  }
}

function showCameraMessage(message, starting = false) {
  el.emptyState.style.display = "";
  el.cameraMessage.textContent = message;
  el.emptyStartCameraBtn.disabled = starting;
}

const CAMERA_ACCESS_MESSAGES = {
  NotAllowedError: "Allow camera access in your browser and system settings, then start the camera again.",
  SecurityError: "Allow camera access in your browser and system settings, then start the camera again.",
  NotFoundError: "The camera is unavailable. Reconnect it or choose another camera, then try again.",
  OverconstrainedError: "The selected camera is unavailable. Choose another camera and try again.",
  TypeError: "Camera access requires HTTPS or localhost and a supported browser.",
};

async function runCamera(deviceId, signal) {
  let retries = 0;

  while (!signal.aborted) {
    const capture = new AbortController();
    const cancelCapture = () => capture.abort(signal.reason);
    signal.addEventListener("abort", cancelCapture, { once: true });
    let stream;
    let liveSince;
    let failure;

    try {
      stream = await openCamera(deviceId, capture.signal);
      capture.signal.throwIfAborted();
      const [track] = stream.getVideoTracks();
      const onEnded = () => capture.abort(new Error("The camera disconnected."));
      if (!track || track.readyState === "ended") onEnded();
      capture.signal.throwIfAborted();
      track.addEventListener("ended", onEnded, { once: true, signal: capture.signal });

      el.video.srcObject = stream;
      await withDeadline(el.video.play(), capture.signal, CAMERA_STALL_MS, "Camera playback timed out.");
      capture.signal.throwIfAborted();
      liveSince = performance.now();
      state.cameraRunning = true;
      el.emptyState.style.display = "none";
      setStatus(el.cameraStatus, "Camera live", "ok");
      setStatus(el.handStatus, "Starting hand tracking", "warn");
      refreshCameraDevices().catch((error) => console.warn("Could not list cameras.", error));
      if (!keyboardReady() && !state.calibrationMode) visionHooks.onCalibrationNeeded?.();
      await trackHands(capture.signal);
    } catch (error) {
      failure = error;
    } finally {
      signal.removeEventListener("abort", cancelCapture);
      capture.abort();
      stopStream(stream);
      el.video.srcObject = null;
      state.cameraRunning = false;
      clearTracking();
    }
    if (signal.aborted) return;

    if (failure instanceof HandTrackingError) {
      setStatus(el.cameraStatus, "Camera stopped", "warn");
      setStatus(el.handStatus, "Hand tracking stopped", "bad");
      showCameraMessage("Hand tracking could not restart. Start the camera to try again.");
      return;
    }

    console.warn("Camera interrupted.", failure);
    if (liveSince !== undefined && performance.now() - liveSince >= 2 * CAMERA_STALL_MS) retries = 0;
    const accessMessage = CAMERA_ACCESS_MESSAGES[failure?.name];
    if (retries >= MAX_RETRIES || (accessMessage && liveSince === undefined && retries === 0) ||
        failure?.name === "NotAllowedError" || failure?.name === "SecurityError" ||
        (failure?.name === "TimeoutError" && !stream)) {
      setStatus(el.cameraStatus, "Camera unavailable", "bad");
      setStatus(el.handStatus, "Hands idle", "muted");
      showCameraMessage(accessMessage || "Check the camera connection, then start the camera again.");
      return;
    }

    retries += 1;
    setStatus(el.cameraStatus, "Reconnecting camera", "warn");
    setStatus(el.handStatus, "Waiting for camera", "warn");
    showCameraMessage("Reconnecting to the camera…", true);
    const delay = new Promise((resolve) => setTimeout(resolve, retryDelay(retries)));
    await withDeadline(delay, signal).catch(() => {});
  }
}

export function startCamera() {
  const previous = cameraSession;
  previous?.controller.abort();
  const session = { controller: new AbortController() };
  const deviceId = state.selectedCameraId;
  cameraSession = session;
  showCameraMessage("Starting camera…", true);
  setStatus(el.cameraStatus, "Starting camera", "warn");

  session.finished = Promise.resolve(previous?.finished).then(() => {
    if (!session.controller.signal.aborted) return runCamera(deviceId, session.controller.signal);
  }).finally(() => {
    if (cameraSession === session) cameraSession = null;
  });
}

export async function refreshCameraDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === "videoinput" && device.deviceId);
  el.cameraSelect.replaceChildren();
  el.cameraSelect.append(new Option("Default camera", ""));
  if (state.selectedCameraId && !cameras.some(({ deviceId }) => deviceId === state.selectedCameraId)) {
    el.cameraSelect.append(new Option("Selected camera unavailable", state.selectedCameraId));
  }

  cameras.forEach((camera, index) => {
    const option = document.createElement("option");
    option.value = camera.deviceId;
    option.textContent = camera.label || `Camera ${index + 1}`;
    el.cameraSelect.append(option);
  });

  el.cameraSelect.value = state.selectedCameraId;
}

export function handleCameraSelectionChange(event) {
  state.selectedCameraId = event.target.value;
  if (cameraSession) startCamera();
}

navigator.mediaDevices?.addEventListener?.("devicechange", () => {
  refreshCameraDevices().catch((error) => console.warn("Could not list cameras.", error));
});

let resumeCamera = false;
window.addEventListener("pagehide", () => {
  resumeCamera = Boolean(cameraSession);
  cameraSession?.controller.abort();
  stopStream(el.video.srcObject);
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted && resumeCamera) startCamera();
});
