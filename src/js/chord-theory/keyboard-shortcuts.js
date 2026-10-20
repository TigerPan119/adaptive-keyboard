export function resolveChordShortcut({
  code = "",
  key = "",
  repeat = false,
  controlTarget = false,
  autoplayEnabled = false,
  hasAutoplaySong = false,
} = {}) {
  if (repeat) return null;
  if ((code === "KeyF" || key === "f" || key === "F") && !controlTarget) return "fullscreen";
  if (code === "Space" && autoplayEnabled && hasAutoplaySong && !controlTarget) {
    return "autoplay-toggle";
  }
  return null;
}
