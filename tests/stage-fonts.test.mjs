import assert from "node:assert/strict";
import {
  formatStageDisplayText,
  normalizeStageFont,
  STAGE_FONT_MODES,
} from "../src/js/chord-theory/stage-fonts.js";

for (const mode of STAGE_FONT_MODES) {
  assert.equal(normalizeStageFont(mode), mode);
}

assert.equal(normalizeStageFont("score"), "baskerville");
assert.equal(normalizeStageFont("lora"), "oracle");
assert.equal(normalizeStageFont("unknown"), "system");
assert.equal(normalizeStageFont(null), "system");
assert.equal(formatStageDisplayText("system", "Cmaj7"), "Cmaj7");
assert.notEqual(formatStageDisplayText("oracle", "Cmaj7"), "Cmaj7");
assert.equal(
  formatStageDisplayText("oracle", "Cmaj7"),
  formatStageDisplayText("oracle", "Cmaj7"),
  "Sigil conversion must be deterministic for video continuity.",
);
assert.equal(Array.from(formatStageDisplayText("oracle", "Cmaj7")).length, 5);
assert.notEqual(formatStageDisplayText("bodoni", "Cmaj7"), "Cmaj7");
assert.equal(
  formatStageDisplayText("bodoni", "Cmaj7"),
  formatStageDisplayText("bodoni", "Cmaj7"),
  "Futhark conversion must be deterministic for video continuity.",
);
assert.equal(Array.from(formatStageDisplayText("bodoni", "Cmaj7")).length, 5);
assert.notEqual(
  formatStageDisplayText("bodoni", "Cmaj7"),
  formatStageDisplayText("oracle", "Cmaj7"),
  "Futhark and Sigil should remain visually distinct encodings.",
);
for (const mysticMode of ["oracle", "bodoni"]) {
  const convertedAnalysis = formatStageDisplayText(
    mysticMode,
    "Major seventh - Root position - Bass C",
  );
  assert.doesNotMatch(
    convertedAnalysis,
    /[A-Za-z0-9]/,
    `${mysticMode} must transform the supporting analysis as well as the chord name.`,
  );
}

console.log("Stage font tests passed.");
