const CHORD_QUALITIES = Object.freeze({
  major: { id: "major", label: "major", intervals: [0, 4, 7] },
  minor: { id: "minor", label: "minor", intervals: [0, 3, 7] },
  diminished: { id: "diminished", label: "diminished", intervals: [0, 3, 6] },
  augmented: { id: "augmented", label: "augmented", intervals: [0, 4, 8] },
  sus2: { id: "sus2", label: "suspended second", intervals: [0, 2, 7] },
  sus4: { id: "sus4", label: "suspended fourth", intervals: [0, 5, 7] },
  major7: { id: "major7", label: "major seventh", intervals: [0, 4, 7, 11] },
  dominant7: { id: "dominant7", label: "dominant seventh", intervals: [0, 4, 7, 10] },
  minor7: { id: "minor7", label: "minor seventh", intervals: [0, 3, 7, 10] },
  minorMajor7: { id: "minorMajor7", label: "minor-major seventh", intervals: [0, 3, 7, 11] },
  halfDiminished7: { id: "halfDiminished7", label: "half-diminished seventh", intervals: [0, 3, 6, 10] },
  diminished7: { id: "diminished7", label: "diminished seventh", intervals: [0, 3, 6, 9] },
  augmented7: { id: "augmented7", label: "augmented seventh", intervals: [0, 4, 8, 10] },
  augmentedMajor7: { id: "augmentedMajor7", label: "augmented-major seventh", intervals: [0, 4, 8, 11] },
  dominant7Sus4: { id: "dominant7Sus4", label: "dominant seventh suspended fourth", intervals: [0, 5, 7, 10] },
});

export const EAR_TRAINING_CHORD_QUALITIES = Object.freeze(Object.values(CHORD_QUALITIES));
export const DEFAULT_EAR_TRAINING_CUSTOM_QUALITIES = Object.freeze(["major", "minor"]);

const DIFFICULTY_CONFIG = Object.freeze({
  easy: {
    qualities: [CHORD_QUALITIES.major, CHORD_QUALITIES.minor],
    rootPitchClasses: [0, 2, 4, 5, 7, 9, 11],
    allowInversions: false,
  },
  medium: {
    qualities: [
      CHORD_QUALITIES.major,
      CHORD_QUALITIES.minor,
      CHORD_QUALITIES.diminished,
      CHORD_QUALITIES.augmented,
      CHORD_QUALITIES.sus2,
      CHORD_QUALITIES.sus4,
    ],
    rootPitchClasses: Array.from({ length: 12 }, (_, index) => index),
    allowInversions: true,
  },
  advanced: {
    qualities: [
      CHORD_QUALITIES.major,
      CHORD_QUALITIES.minor,
      CHORD_QUALITIES.diminished,
      CHORD_QUALITIES.augmented,
      CHORD_QUALITIES.sus2,
      CHORD_QUALITIES.sus4,
      CHORD_QUALITIES.major7,
      CHORD_QUALITIES.dominant7,
      CHORD_QUALITIES.minor7,
      CHORD_QUALITIES.halfDiminished7,
      CHORD_QUALITIES.diminished7,
    ],
    rootPitchClasses: Array.from({ length: 12 }, (_, index) => index),
    allowInversions: true,
  },
  custom: {
    rootPitchClasses: Array.from({ length: 12 }, (_, index) => index),
    allowInversions: true,
  },
});

export const EAR_TRAINING_DIFFICULTIES = Object.freeze(Object.keys(DIFFICULTY_CONFIG));

export function normalizeEarTrainingDifficulty(value) {
  return EAR_TRAINING_DIFFICULTIES.includes(value) ? value : "easy";
}

export function normalizeEarTrainingQualities(values) {
  const validIds = new Set(EAR_TRAINING_CHORD_QUALITIES.map((quality) => quality.id));
  const normalized = [...new Set(Array.isArray(values) ? values : [])]
    .filter((qualityId) => validIds.has(qualityId));
  return normalized.length ? normalized : [...DEFAULT_EAR_TRAINING_CUSTOM_QUALITIES];
}

function randomIndex(length, random) {
  return Math.min(length - 1, Math.floor(Math.max(0, Math.min(0.999999, random())) * length));
}

function createQuestionCandidate(difficulty, random, qualityIds, customAllowInversions) {
  const config = DIFFICULTY_CONFIG[difficulty];
  const qualities = difficulty === "custom"
    ? normalizeEarTrainingQualities(qualityIds).map((qualityId) => CHORD_QUALITIES[qualityId])
    : config.qualities;
  const quality = qualities[randomIndex(qualities.length, random)];
  const rootPitchClass = config.rootPitchClasses[randomIndex(config.rootPitchClasses.length, random)];
  const allowInversions = difficulty === "custom"
    ? customAllowInversions !== false
    : config.allowInversions;
  const inversion = allowInversions ? randomIndex(quality.intervals.length, random) : 0;
  const rootMidi = 48 + rootPitchClass;
  const notes = quality.intervals.map((interval) => rootMidi + interval);
  for (let index = 0; index < inversion; index += 1) notes[index] += 12;
  notes.sort((first, second) => first - second);
  return {
    difficulty,
    qualityId: quality.id,
    qualityLabel: quality.label,
    rootPitchClass,
    inversion,
    notes,
    pitchClasses: quality.intervals.map((interval) => (rootPitchClass + interval) % 12).sort((a, b) => a - b),
    signature: `${rootPitchClass}:${quality.id}:${inversion}`,
  };
}

export function createEarTrainingQuestion(difficulty, options = {}) {
  const normalizedDifficulty = normalizeEarTrainingDifficulty(difficulty);
  const random = typeof options.random === "function" ? options.random : Math.random;
  let question = createQuestionCandidate(
    normalizedDifficulty,
    random,
    options.qualityIds,
    options.allowInversions,
  );
  for (let attempt = 0; attempt < 8 && question.signature === options.previousSignature; attempt += 1) {
    question = createQuestionCandidate(
      normalizedDifficulty,
      random,
      options.qualityIds,
      options.allowInversions,
    );
  }
  return question;
}

export function pitchClassSignature(notes) {
  return [...new Set((notes || []).map((note) => ((Number(note) % 12) + 12) % 12))]
    .sort((a, b) => a - b)
    .join(",");
}

export function matchesEarTrainingAnswer(notes, question) {
  if (!question?.pitchClasses?.length) return false;
  return pitchClassSignature(notes) === question.pitchClasses.join(",");
}
