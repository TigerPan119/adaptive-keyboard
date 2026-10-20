const DEFAULT_SCREEN_INPUT_HELP = "Use the on-screen piano now, or connect a MIDI keyboard from the MIDI card.";

export function resolveInputSourceStatus({
  autoplayEnabled = false,
  midiInputName = "",
  midiFallbackMessage = DEFAULT_SCREEN_INPUT_HELP,
} = {}) {
  if (autoplayEnabled) {
    return {
      label: "Autoplay",
      icon: "file-music",
      kind: "ok",
      help: "Autoplay is the active input source. Turn it off to return to live MIDI or the screen keyboard.",
    };
  }

  const deviceName = String(midiInputName || "").trim();
  if (deviceName) {
    return {
      label: deviceName,
      icon: "cable",
      kind: "ok",
      help: `Receiving live notes from ${deviceName}. Change the device in the MIDI card.`,
    };
  }

  return {
    label: "Screen keyboard",
    icon: "music-2",
    kind: "neutral",
    help: midiFallbackMessage || DEFAULT_SCREEN_INPUT_HELP,
  };
}
