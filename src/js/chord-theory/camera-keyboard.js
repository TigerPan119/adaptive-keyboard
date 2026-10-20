export const DEFAULT_CAMERA_QUAD = Object.freeze([
  Object.freeze({ x: 0.08, y: 0.46 }),
  Object.freeze({ x: 0.92, y: 0.46 }),
  Object.freeze({ x: 0.92, y: 0.88 }),
  Object.freeze({ x: 0.08, y: 0.88 }),
]);

const CORNER_NAMES = ["top left", "top right", "bottom right", "bottom left"];

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

export function cameraHighlightStrength(transparency) {
  return 100 - clamp(transparency, 0, 100);
}

export function normalizeCameraQuad(points) {
  if (!Array.isArray(points) || points.length !== 4) {
    return DEFAULT_CAMERA_QUAD.map((point) => ({ ...point }));
  }
  return points.map((point, index) => ({
    x: clamp(point?.x ?? DEFAULT_CAMERA_QUAD[index].x),
    y: clamp(point?.y ?? DEFAULT_CAMERA_QUAD[index].y),
  }));
}

export function cameraQuadArea(points) {
  const quad = normalizeCameraQuad(points);
  return Math.abs(quad.reduce((sum, point, index) => {
    const next = quad[(index + 1) % quad.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

export function isValidCameraQuad(points) {
  if (!Array.isArray(points) || points.length !== 4) return false;
  if (points.some((point) => !Number.isFinite(Number(point?.x)) || !Number.isFinite(Number(point?.y)))) return false;
  const quad = normalizeCameraQuad(points);
  if (cameraQuadArea(quad) < 0.015) return false;
  const crosses = quad.map((point, index) => {
    const next = quad[(index + 1) % 4];
    const after = quad[(index + 2) % 4];
    return (next.x - point.x) * (after.y - next.y) - (next.y - point.y) * (after.x - next.x);
  });
  const hasPositive = crosses.some((value) => value > 0.0001);
  const hasNegative = crosses.some((value) => value < -0.0001);
  return !(hasPositive && hasNegative) && !crosses.some((value) => Math.abs(value) <= 0.0001);
}

export function cameraQuadHomography(points) {
  const [topLeft, topRight, bottomRight, bottomLeft] = normalizeCameraQuad(points);
  const dx1 = topRight.x - bottomRight.x;
  const dx2 = bottomLeft.x - bottomRight.x;
  const dx3 = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x;
  const dy1 = topRight.y - bottomRight.y;
  const dy2 = bottomLeft.y - bottomRight.y;
  const dy3 = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y;
  const denominator = dx1 * dy2 - dx2 * dy1;

  let perspectiveX = 0;
  let perspectiveY = 0;
  if (Math.abs(denominator) > 1e-8) {
    perspectiveX = (dx3 * dy2 - dx2 * dy3) / denominator;
    perspectiveY = (dx1 * dy3 - dx3 * dy1) / denominator;
  }

  const a = topRight.x - topLeft.x + perspectiveX * topRight.x;
  const b = bottomLeft.x - topLeft.x + perspectiveY * bottomLeft.x;
  const c = topLeft.x;
  const d = topRight.y - topLeft.y + perspectiveX * topRight.y;
  const e = bottomLeft.y - topLeft.y + perspectiveY * bottomLeft.y;
  const f = topLeft.y;

  return [a, b, c, d, e, f, perspectiveX, perspectiveY, 1];
}

export function projectCameraQuadPoint(points, u, v) {
  const matrix = cameraQuadHomography(points);
  const denominator = matrix[6] * u + matrix[7] * v + 1;
  return {
    x: (matrix[0] * u + matrix[1] * v + matrix[2]) / denominator,
    y: (matrix[3] * u + matrix[4] * v + matrix[5]) / denominator,
  };
}

export function containedMediaRect(containerWidth, containerHeight, mediaWidth, mediaHeight) {
  const width = Math.max(0, Number(containerWidth) || 0);
  const height = Math.max(0, Number(containerHeight) || 0);
  const sourceWidth = Math.max(1, Number(mediaWidth) || 1);
  const sourceHeight = Math.max(1, Number(mediaHeight) || 1);
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  return {
    left: (width - renderedWidth) / 2,
    top: (height - renderedHeight) / 2,
    width: renderedWidth,
    height: renderedHeight,
  };
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  const message = gl.getShaderInfoLog(shader) || "Camera shader compilation failed.";
  gl.deleteShader(shader);
  throw new Error(message);
}

function createProgram(gl) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, `
    attribute vec2 a_position;
    varying vec2 v_destination;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_destination = vec2((a_position.x + 1.0) * 0.5, (1.0 - a_position.y) * 0.5);
    }
  `);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform sampler2D u_camera;
    uniform mat3 u_homography;
    uniform float u_mirrored;
    varying vec2 v_destination;
    void main() {
      vec3 projected = u_homography * vec3(v_destination, 1.0);
      vec2 source = projected.xy / projected.z;
      if (u_mirrored > 0.5) source.x = 1.0 - source.x;
      if (source.x < 0.0 || source.x > 1.0 || source.y < 0.0 || source.y > 1.0) discard;
      gl_FragColor = texture2D(u_camera, source);
    }
  `);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  const message = gl.getProgramInfoLog(program) || "Camera shader linking failed.";
  gl.deleteProgram(program);
  throw new Error(message);
}

class PerspectiveCameraRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: true,
      depth: false,
      preserveDrawingBuffer: false,
    });
    if (!this.gl) throw new Error("WebGL is required for perspective camera fitting.");
    this.program = createProgram(this.gl);
    this.positionLocation = this.gl.getAttribLocation(this.program, "a_position");
    this.homographyLocation = this.gl.getUniformLocation(this.program, "u_homography");
    this.mirrorLocation = this.gl.getUniformLocation(this.program, "u_mirrored");
    this.textureLocation = this.gl.getUniformLocation(this.program, "u_camera");
    this.buffer = this.gl.createBuffer();
    this.texture = this.gl.createTexture();

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]), this.gl.STATIC_DRAW);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
  }

  render(video, points, mirrored) {
    if (!video.videoWidth || !video.videoHeight || !isValidCameraQuad(points)) return;
    this.resize();
    const matrix = cameraQuadHomography(points);
    const columnMajorMatrix = new Float32Array([
      matrix[0], matrix[3], matrix[6],
      matrix[1], matrix[4], matrix[7],
      matrix[2], matrix[5], matrix[8],
    ]);
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.uniform1i(this.textureLocation, 0);
    gl.uniformMatrix3fv(this.homographyLocation, false, columnMajorMatrix);
    gl.uniform1f(this.mirrorLocation, mirrored ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  clear() {
    this.resize();
    this.gl.clearColor(0.03, 0.03, 0.035, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  destroy() {
    this.gl.deleteTexture(this.texture);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
  }
}

export class KeyboardCameraController {
  constructor(options) {
    this.video = options.video;
    this.canvas = options.canvas;
    this.keyboard = options.keyboard;
    this.overlay = options.overlay;
    this.viewport = options.viewport;
    this.polygon = options.polygon;
    this.handles = [...options.handles];
    this.onDraftChange = options.onDraftChange || (() => {});
    this.renderer = new PerspectiveCameraRenderer(this.canvas);
    this.points = normalizeCameraQuad(options.points);
    this.draftPoints = normalizeCameraQuad(this.points);
    this.mirrored = options.mirrored !== false;
    this.fitted = Boolean(options.fitted) && isValidCameraQuad(this.points);
    this.running = false;
    this.calibrating = false;
    this.stream = null;
    this.frameHandle = 0;
    this.frameUsesVideoCallback = false;
    this.activeCorner = -1;
    this.resizeObserver = new ResizeObserver(() => this.updateCalibrationGeometry());
    this.resizeObserver.observe(this.viewport);
    this.bindHandles();
    this.setMirrored(this.mirrored);
    this.syncOutputVisibility();
  }

  bindHandles() {
    this.handles.forEach((handle, index) => {
      handle.dataset.cornerIndex = String(index);
      handle.setAttribute("aria-label", `Move ${CORNER_NAMES[index]} keyboard corner`);
      handle.addEventListener("pointerdown", (event) => this.startCornerDrag(event, index));
      handle.addEventListener("pointermove", (event) => this.moveCornerDrag(event, index));
      handle.addEventListener("pointerup", (event) => this.endCornerDrag(event, index));
      handle.addEventListener("pointercancel", (event) => this.endCornerDrag(event, index));
      handle.addEventListener("keydown", (event) => this.nudgeCorner(event, index));
    });
  }

  async start(deviceId = "") {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not supported in this browser.");
    this.stopStream();
    const video = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 60 },
      facingMode: { ideal: "user" },
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    };
    this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    this.syncOutputVisibility();
    this.updateCalibrationGeometry();
    this.queueFrame();
    return this.stream;
  }

  stop() {
    this.closeCalibration();
    this.stopStream();
    this.running = false;
    this.video.pause();
    this.video.srcObject = null;
    this.renderer.clear();
    this.syncOutputVisibility();
  }

  stopStream() {
    this.cancelFrame();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  setMirrored(mirrored) {
    this.mirrored = Boolean(mirrored);
    this.video.classList.toggle("is-mirrored", this.mirrored);
  }

  setFit(points, fitted = true) {
    this.points = normalizeCameraQuad(points);
    this.draftPoints = normalizeCameraQuad(this.points);
    this.fitted = Boolean(fitted) && isValidCameraQuad(this.points);
    this.syncOutputVisibility();
  }

  beginCalibration() {
    if (!this.running) return false;
    this.draftPoints = normalizeCameraQuad(this.points);
    this.calibrating = true;
    this.overlay.hidden = false;
    this.overlay.inert = false;
    this.overlay.setAttribute("aria-hidden", "false");
    this.updateCalibrationGeometry();
    requestAnimationFrame(() => this.overlay.classList.add("is-visible"));
    window.setTimeout(() => this.handles[0]?.focus({ preventScroll: true }), 180);
    return true;
  }

  commitCalibration() {
    if (!isValidCameraQuad(this.draftPoints)) return null;
    this.points = normalizeCameraQuad(this.draftPoints);
    this.fitted = true;
    this.closeCalibration();
    this.syncOutputVisibility();
    return normalizeCameraQuad(this.points);
  }

  cancelCalibration() {
    this.draftPoints = normalizeCameraQuad(this.points);
    this.closeCalibration();
  }

  resetCalibration() {
    this.draftPoints = normalizeCameraQuad(DEFAULT_CAMERA_QUAD);
    this.updateCalibrationGeometry();
  }

  closeCalibration() {
    if (!this.calibrating && this.overlay.hidden) return;
    this.calibrating = false;
    this.activeCorner = -1;
    this.overlay.classList.remove("is-visible");
    this.overlay.inert = true;
    this.overlay.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
      if (!this.calibrating) this.overlay.hidden = true;
    }, 180);
  }

  syncOutputVisibility() {
    const visible = this.running && this.fitted;
    this.canvas.hidden = !visible;
    this.keyboard.dataset.cameraActive = String(visible);
  }

  queueFrame() {
    if (!this.running || this.frameHandle) return;
    const render = () => {
      this.frameHandle = 0;
      if (!this.running) return;
      if (this.fitted && this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        this.renderer.render(this.video, this.points, this.mirrored);
      }
      this.queueFrame();
    };
    if (typeof this.video.requestVideoFrameCallback === "function") {
      this.frameUsesVideoCallback = true;
      this.frameHandle = this.video.requestVideoFrameCallback(render);
    } else {
      this.frameUsesVideoCallback = false;
      this.frameHandle = requestAnimationFrame(render);
    }
  }

  cancelFrame() {
    if (!this.frameHandle) return;
    if (this.frameUsesVideoCallback) this.video.cancelVideoFrameCallback?.(this.frameHandle);
    else cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
  }

  mediaRect() {
    return containedMediaRect(
      this.viewport.clientWidth,
      this.viewport.clientHeight,
      this.video.videoWidth || 1280,
      this.video.videoHeight || 720,
    );
  }

  updateCalibrationGeometry() {
    if (!this.calibrating) return;
    const media = this.mediaRect();
    const coordinates = this.draftPoints.map((point) => ({
      x: media.left + point.x * media.width,
      y: media.top + point.y * media.height,
    }));
    this.polygon.setAttribute("points", coordinates.map((point) => `${point.x},${point.y}`).join(" "));
    this.polygon.ownerSVGElement?.setAttribute("viewBox", `0 0 ${this.viewport.clientWidth} ${this.viewport.clientHeight}`);
    this.handles.forEach((handle, index) => {
      handle.style.left = `${coordinates[index].x}px`;
      handle.style.top = `${coordinates[index].y}px`;
    });
    this.overlay.dataset.fitValid = String(isValidCameraQuad(this.draftPoints));
    this.onDraftChange(normalizeCameraQuad(this.draftPoints), isValidCameraQuad(this.draftPoints));
  }

  pointFromPointer(event) {
    const viewportRect = this.viewport.getBoundingClientRect();
    const media = this.mediaRect();
    return {
      x: clamp((event.clientX - viewportRect.left - media.left) / Math.max(1, media.width)),
      y: clamp((event.clientY - viewportRect.top - media.top) / Math.max(1, media.height)),
    };
  }

  startCornerDrag(event, index) {
    if (!this.calibrating || event.button !== 0) return;
    event.preventDefault();
    this.activeCorner = index;
    this.handles[index].setPointerCapture?.(event.pointerId);
    this.draftPoints[index] = this.pointFromPointer(event);
    this.updateCalibrationGeometry();
  }

  moveCornerDrag(event, index) {
    if (!this.calibrating || this.activeCorner !== index) return;
    event.preventDefault();
    this.draftPoints[index] = this.pointFromPointer(event);
    this.updateCalibrationGeometry();
  }

  endCornerDrag(event, index) {
    if (this.activeCorner !== index) return;
    this.handles[index].releasePointerCapture?.(event.pointerId);
    this.activeCorner = -1;
  }

  nudgeCorner(event, index) {
    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (!directions[event.key]) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.02 : 0.005;
    const [deltaX, deltaY] = directions[event.key];
    this.draftPoints[index] = {
      x: clamp(this.draftPoints[index].x + deltaX * step),
      y: clamp(this.draftPoints[index].y + deltaY * step),
    };
    this.updateCalibrationGeometry();
  }

  destroy() {
    this.stop();
    this.resizeObserver.disconnect();
    this.renderer.destroy();
  }
}
