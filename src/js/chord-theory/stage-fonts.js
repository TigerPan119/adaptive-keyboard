export const STAGE_FONT_MODES = Object.freeze([
  "system",
  "garamond",
  "baskerville",
  "oracle",
  "bodoni",
]);

const stageFontModes = new Set(STAGE_FONT_MODES);
const oldPersianCodePoints = [
  ...Array.from({ length: 0x103c3 - 0x103a0 + 1 }, (_, index) => 0x103a0 + index),
  ...Array.from({ length: 0x103cf - 0x103c8 + 1 }, (_, index) => 0x103c8 + index),
  ...Array.from({ length: 0x103d5 - 0x103d1 + 1 }, (_, index) => 0x103d1 + index),
];
const OLD_PERSIAN_WORD_DIVIDER = 0x103d0;
const elderFutharkCodePoints = [
  0x16a0, 0x16a2, 0x16a6, 0x16a8, 0x16b1, 0x16b2,
  0x16b7, 0x16b9, 0x16ba, 0x16be, 0x16c1, 0x16c3,
  0x16c7, 0x16c8, 0x16c9, 0x16ca, 0x16cf, 0x16d2,
  0x16d6, 0x16d7, 0x16da, 0x16dc, 0x16de, 0x16df,
];
const RUNIC_WORD_DIVIDER = 0x16eb;

function encodeWithGlyphSet(value, glyphs, wordDivider, salt = 0) {
  return Array.from(value, (character, index) => {
    if (/\s/.test(character)) return String.fromCodePoint(wordDivider);
    const mixedCode = character.codePointAt(0) * 17 + index * 13 + salt;
    return String.fromCodePoint(glyphs[mixedCode % glyphs.length]);
  }).join("");
}

export function normalizeStageFont(mode) {
  // Migrate the original two-option serif preference without resetting it.
  if (mode === "score") return "baskerville";
  if (mode === "lora") return "oracle";
  return stageFontModes.has(mode) ? mode : "system";
}

export function formatStageDisplayText(mode, text) {
  const value = String(text ?? "");
  if (mode === "oracle") {
    return encodeWithGlyphSet(value, oldPersianCodePoints, OLD_PERSIAN_WORD_DIVIDER);
  }
  if (mode === "bodoni") {
    return encodeWithGlyphSet(value, elderFutharkCodePoints, RUNIC_WORD_DIVIDER, 7);
  }
  return value;
}
