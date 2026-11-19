import assert from "node:assert/strict";
import { setImmediate as flush } from "node:timers/promises";
import { test } from "node:test";

test("Hand Split replaces stalled workers, resets tracking on demand, and recovers stalled capture", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(console, "warn", () => {});

  const elements = new Map();
  const document = new EventTarget();
  document.hidden = false;
  document.querySelector = () => null;
  document.querySelectorAll = () => [];
  document.getElementById = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        classList: { contains: () => false },
        dataset: {},
        style: {},
        setAttribute() {},
        getContext: () => ({ clearRect() {} }),
      });
    }
    return elements.get(id);
  };
  elements.set("cameraStep", null); // The setup guide is outside this fixture.

  let frameCallback;
  const video = Object.assign(document.getElementById("video"), {
    videoWidth: 1280,
    videoHeight: 720,
    readyState: 2,
    play: async () => {},
    requestVideoFrameCallback(callback) {
      assert.equal(frameCallback, undefined, "only one frame callback is scheduled");
      frameCallback = callback;
      return 1;
    },
    cancelVideoFrameCallback() { frameCallback = undefined; },
  });

  const streams = [];
  let deferNextCamera = false;
  let resolveOldCamera;
  const mediaDevices = {
    async getUserMedia() {
      const track = new EventTarget();
      track.readyState = "live";
      track.stop = () => { track.readyState = "ended"; };
      const stream = { getTracks: () => [track], getVideoTracks: () => [track], track };
      streams.push(stream);
      if (deferNextCamera) {
        deferNextCamera = false;
        await new Promise((resolve) => { resolveOldCamera = resolve; });
      }
      return stream;
    },
  };

  const workers = [];
  const frames = [];
  const inferenceTimes = [];
  let rejectVideoFrameTransfer = true;
  let failNextFrame;
  let sendLateResult;
  class VideoFrame {
    constructor() { frames.push(this); }
    close() { this.closed = true; }
  }
  class Worker extends EventTarget {
    constructor() {
      super();
      workers.push(this);
    }
    postMessage({ type, delegate, frame, timestamp }, transfer) {
      assert.equal(this.terminated, undefined);
      const reply = (data) => this.dispatchEvent(new MessageEvent("message", { data }));
      if (type === "configure") {
        this.delegate = delegate;
        queueMicrotask(() => reply({}));
        return;
      }
      assert.deepEqual(transfer, [frame]);
      if (frame instanceof VideoFrame && rejectVideoFrameTransfer) {
        throw new DOMException("VideoFrame cannot be transferred", "DataCloneError");
      }
      inferenceTimes.push(timestamp);
      const failure = failNextFrame;
      failNextFrame = null;
      if (failure === "hang" || failure === "pause") {
        sendLateResult = () => reply({ result: failure === "pause" ? [] : [{ landmarks: [] }] });
        return;
      }
      queueMicrotask(() => reply(failure === "reject" ? { error: "Synthetic inference failure" } : { result: [] }));
    }
    terminate() {
      assert.equal(this.terminated, undefined);
      this.terminated = true;
    }
  }

  const window = new EventTarget();
  Object.assign(globalThis, {
    document,
    window,
    Worker,
    VideoFrame,
    async createImageBitmap(_, { resizeWidth, resizeHeight }) {
      const bitmap = { resizeWidth, resizeHeight, close() { this.closed = true; } };
      frames.push(bitmap);
      return bitmap;
    },
    HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
  });
  navigator.mediaDevices = mediaDevices;
  t.after(() => {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.Worker;
    delete globalThis.VideoFrame;
    delete globalThis.createImageBitmap;
    delete globalThis.HTMLMediaElement;
    delete navigator.mediaDevices;
  });

  const { resetMediaPipe, setPerformanceMode, startCamera } = await import("../src/js/vision.js");
  const handStatus = document.getElementById("handStatus");
  const resetButton = document.getElementById("resetMediaPipeBtn");
  let mediaTime = 0;
  async function frame(step = 1) {
    const callback = frameCallback;
    assert.ok(callback, "camera is waiting for a video frame");
    frameCallback = undefined;
    mediaTime += step;
    const now = performance.now() + 10_000;
    callback(now, { mediaTime });
    await flush();
    return now;
  }

  startCamera();
  await flush();
  await frame();
  assert.equal(handStatus.textContent, "0 hands");
  assert.equal(workers[0].delegate, "GPU");
  assert.ok(frames[0] instanceof VideoFrame);
  assert.equal(frames[1].resizeWidth, 1280);
  rejectVideoFrameTransfer = false;

  const beforePause = inferenceTimes.length;
  failNextFrame = "pause";
  const pausedFrame = await frame();
  await frame();
  const latestFrame = await frame();
  assert.equal(inferenceTimes.length, beforePause + 1);
  sendLateResult();
  await flush();
  assert.deepEqual(inferenceTimes.slice(beforePause), [pausedFrame, latestFrame]);

  setPerformanceMode(true);
  const beforePacedFrames = inferenceTimes.length;
  await frame(0.032);
  await frame(0.016);
  await frame(0.016);
  assert.equal(inferenceTimes.length, beforePacedFrames + 2);
  setPerformanceMode(false);

  failNextFrame = "reject";
  await frame();
  assert.equal(handStatus.textContent, "Restarting hand tracking");
  assert.equal(workers[0].terminated, true);
  await frame();
  assert.equal(handStatus.textContent, "0 hands");
  assert.equal(streams.length, 1);

  failNextFrame = "hang";
  await frame();
  assert.ok(frameCallback, "camera frames are observed during inference");
  t.mock.timers.tick(3_000);
  await flush();
  assert.equal(handStatus.textContent, "Restarting hand tracking");
  assert.equal(workers[1].terminated, true);
  await frame();
  assert.deepEqual(workers.slice(0, 3).map((worker) => worker.delegate), ["GPU", "GPU", "CPU"]);
  assert.equal(frames.at(-1).resizeWidth, 960);
  sendLateResult();
  await flush();
  assert.equal(handStatus.textContent, "0 hands");
  assert.ok(frames.every((bitmap) => bitmap.closed));

  failNextFrame = "hang";
  await frame();
  assert.equal(resetButton.disabled, false);
  resetMediaPipe();
  await flush();
  assert.equal(workers[2].terminated, true);
  await frame();
  assert.equal(handStatus.textContent, "0 hands");
  assert.equal(video.srcObject, streams[0]);
  assert.equal(workers[3].delegate, "GPU");

  document.hidden = true;
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(frameCallback, undefined);
  t.mock.timers.tick(6_000);
  await flush();
  assert.equal(streams.length, 1);
  document.hidden = false;
  document.dispatchEvent(new Event("visibilitychange"));
  await frame();
  t.mock.timers.tick(5_000);
  await flush();
  assert.equal(video.srcObject, null);
  assert.equal(streams[0].track.readyState, "ended");
  t.mock.timers.tick(300);
  await flush();
  await frame();
  assert.equal(streams.length, 2);
  assert.equal(handStatus.textContent, "0 hands");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    failNextFrame = "reject";
    await frame();
  }
  assert.equal(handStatus.textContent, "Tracking stopped. Use Reset MediaPipe.");
  assert.equal(video.srcObject, streams[1]);
  assert.equal(resetButton.disabled, false);
  resetMediaPipe();
  await flush();
  await frame();
  assert.equal(handStatus.textContent, "0 hands");
  assert.equal(video.srcObject, streams[1]);

  deferNextCamera = true;
  startCamera();
  await flush();
  startCamera();
  await flush();
  assert.equal(video.srcObject, streams[3]);
  resolveOldCamera();
  await flush();
  assert.equal(streams[2].track.readyState, "ended");
  assert.equal(video.srcObject, streams[3]);
  await frame();
  assert.equal(handStatus.textContent, "0 hands");

  window.dispatchEvent(new Event("pagehide"));
  await flush();
  assert.equal(streams[3].track.readyState, "ended");
  assert.equal(frameCallback, undefined);
  assert.equal(resetButton.disabled, true);
});
