import assert from "node:assert/strict";
import { setImmediate as flush } from "node:timers/promises";
import { test } from "node:test";

test("Hand Split recovers failed inference and stalled capture, and discards stale results", async (t) => {
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

  const models = [];
  let failNextFrame;
  let finishLateSend;
  let closedImages = 0;
  class Hands {
    constructor() { models.push(this); }
    onResults(handler) { this.handle = handler; }
    setOptions() {}
    async send() {
      const failure = failNextFrame;
      failNextFrame = null;
      if (failure === "reject") throw new Error("Synthetic inference failure");
      if (failure === "hang") {
        await new Promise((resolve) => {
          finishLateSend = () => {
            this.handle({ image: { close() { closedImages++; } }, multiHandLandmarks: [[]] });
            resolve();
          };
        });
        return;
      }
      this.handle({ multiHandLandmarks: [] });
    }
    async close() { this.closed = true; }
  }

  const window = new EventTarget();
  window.Hands = Hands;
  Object.assign(globalThis, {
    document,
    window,
    HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
  });
  navigator.mediaDevices = mediaDevices;
  t.after(() => {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.HTMLMediaElement;
    delete navigator.mediaDevices;
  });

  const { startCamera } = await import("../src/js/vision.js");
  const handStatus = document.getElementById("handStatus");
  let mediaTime = 0;
  async function frame() {
    const callback = frameCallback;
    assert.ok(callback, "camera is waiting for a video frame");
    frameCallback = undefined;
    mediaTime += 1;
    callback(performance.now() + 10_000, { mediaTime });
    await flush();
  }

  startCamera();
  await flush();
  await frame();
  assert.equal(handStatus.textContent, "0 hands");

  failNextFrame = "reject";
  await frame();
  assert.equal(handStatus.textContent, "Restarting hand tracking");
  assert.equal(models[0].closed, true);
  await frame();
  assert.equal(handStatus.textContent, "0 hands");
  assert.equal(streams.length, 1);

  failNextFrame = "hang";
  await frame();
  assert.equal(frameCallback, undefined);
  t.mock.timers.tick(3_000);
  await flush();
  assert.equal(handStatus.textContent, "Restarting hand tracking");
  await frame();
  const recoveredModelCount = models.length;
  finishLateSend();
  await flush();
  assert.equal(models[1].closed, true);
  assert.equal(models.length, recoveredModelCount);
  assert.equal(handStatus.textContent, "0 hands");
  assert.equal(closedImages, 1);

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
  assert.equal(handStatus.textContent, "Hand tracking stopped");
  assert.equal(document.getElementById("emptyStartCameraBtn").disabled, false);
  assert.equal(streams[1].track.readyState, "ended");

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
});
