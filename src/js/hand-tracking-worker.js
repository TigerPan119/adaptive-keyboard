import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/vision_bundle.mjs";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
let landmarker;

self.addEventListener("message", async ({ data }) => {
  const { type, mode, frame, timestamp } = data;
  try {
    if (type === "configure") {
      const options = {
        minHandDetectionConfidence: mode.minDetectionConfidence,
        minHandPresenceConfidence: mode.minDetectionConfidence,
        minTrackingConfidence: mode.minTrackingConfidence,
      };
      if (landmarker) {
        await landmarker.setOptions(options);
      } else {
        const files = await FilesetResolver.forVisionTasks(WASM_URL, true);
        landmarker = await HandLandmarker.createFromOptions(files, {
          ...options,
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
          canvas: new OffscreenCanvas(1, 1),
          runningMode: "VIDEO",
          numHands: 2,
        });
      }
      self.postMessage({});
    } else {
      const { landmarks, handedness } = landmarker.detectForVideo(frame, timestamp);
      const hands = landmarks.map((points, index) => ({
        landmarks: points,
        label: handedness[index]?.[0]?.categoryName,
      }));
      self.postMessage({ result: hands });
    }
  } catch (error) {
    self.postMessage({ error: error?.message || String(error) });
  } finally {
    frame?.close();
  }
});
