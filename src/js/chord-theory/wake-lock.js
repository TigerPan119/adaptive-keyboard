export class ScreenWakeLockController {
  constructor(onStateChange) {
    this.onStateChange = onStateChange;
    this.sentinel = null;
    this.desired = false;
    this.supported = "wakeLock" in navigator;
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  report(state, message) {
    this.onStateChange?.({ state, message, supported: this.supported });
  }

  async acquire() {
    if (!this.supported) {
      this.report("unsupported", "Not supported by this browser.");
      return false;
    }
    if (!this.desired || document.visibilityState !== "visible") {
      this.report("paused", "Paused while this tab is hidden.");
      return false;
    }
    if (this.sentinel && !this.sentinel.released) return true;

    try {
      const sentinel = await navigator.wakeLock.request("screen");
      this.sentinel = sentinel;
      sentinel.addEventListener("release", () => {
        if (this.sentinel === sentinel) this.sentinel = null;
        if (!this.desired) this.report("off", "Screen wake lock is off.");
        else if (document.visibilityState !== "visible") this.report("paused", "Paused while this tab is hidden.");
        else this.report("released", "Released by the system. Try again if needed.");
      }, { once: true });
      this.report("active", "Screen will stay awake while this tab is visible.");
      return true;
    } catch (error) {
      console.warn("Screen wake lock request failed.", error);
      this.report("unavailable", "Unavailable due to browser or power settings.");
      return false;
    }
  }

  async setEnabled(enabled) {
    this.desired = Boolean(enabled);
    if (this.desired) return this.acquire();
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (sentinel && !sentinel.released) await sentinel.release().catch(() => {});
    this.report("off", "Screen wake lock is off.");
    return true;
  }

  async handleVisibilityChange() {
    if (this.desired && document.visibilityState === "visible") await this.acquire();
  }

  destroy() {
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.setEnabled(false);
  }
}
