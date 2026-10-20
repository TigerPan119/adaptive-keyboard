import { pitchClass, pitchClassName } from "../music.js";

const ROMAN_DEGREES = ["I", "II", "III", "IV", "V", "VI", "VII"];

const MODE_DEFINITIONS = {
  major: {
    intervals: [0, 2, 4, 5, 7, 9, 11],
    denominators: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
    qualities: ["major", "minor", "minor", "major", "major", "minor", "diminished"],
  },
  minor: {
    intervals: [0, 2, 3, 5, 7, 8, 10],
    denominators: ["i", "ii°", "III", "iv", "V", "VI", "VII"],
    qualities: ["minor", "diminished", "major", "minor", "major", "major", "major"],
  },
};

const DIATONIC_MAJOR_ROOTS = {
  major: new Set([0, 5, 7]),
  minor: new Set([3, 7, 8, 10]),
};

const CHROMATIC_DEGREES = {
  major: [["", 1], ["b", 2], ["", 2], ["b", 3], ["", 3], ["", 4], ["#", 4], ["", 5], ["b", 6], ["", 6], ["b", 7], ["", 7]],
  minor: [["", 1], ["b", 2], ["", 2], ["", 3], ["#", 3], ["", 4], ["#", 4], ["", 5], ["", 6], ["#", 6], ["", 7], ["#", 7]],
};

function chordKind(candidate) {
  const symbol = candidate.symbol || "";
  if (symbol === "m7b5") return "half-diminished";
  if (symbol.startsWith("dim")) return "diminished";
  if (symbol.startsWith("aug")) return "augmented";
  if (symbol.startsWith("m") && !symbol.startsWith("maj")) return "minor";
  const intervals = new Set(candidate.intervals || []);
  if (intervals.has(3) && intervals.has(6)) return "diminished";
  if (intervals.has(3) && !intervals.has(4)) return "minor";
  if (intervals.has(4) && intervals.has(8)) return "augmented";
  return "major";
}

function numeralSuffix(candidate, kind) {
  const symbol = candidate.symbol || "";
  if (symbol === "dim") return "°";
  if (symbol === "dim7") return "°7";
  if (symbol === "m7b5") return "ø7";
  if (symbol === "aug") return "+";
  if (kind === "minor" && symbol.startsWith("m")) return symbol.slice(1);
  if (kind === "augmented" && symbol.startsWith("aug")) return `+${symbol.slice(3)}`;
  return symbol;
}

function degreeForRoot(root, tonic, mode, kind) {
  const interval = (pitchClass(root) - pitchClass(tonic) + 12) % 12;
  const definition = MODE_DEFINITIONS[mode];
  let degreeIndex = definition.intervals.indexOf(interval);
  let accidental = "";
  if (degreeIndex < 0) {
    if (mode === "minor" && interval === 11 && ["diminished", "half-diminished"].includes(kind)) {
      degreeIndex = 6;
    } else {
      const [mappedAccidental, mappedDegree] = CHROMATIC_DEGREES[mode][interval];
      accidental = mappedAccidental;
      degreeIndex = mappedDegree - 1;
    }
  }
  const lowercase = ["minor", "diminished", "half-diminished"].includes(kind);
  const numeral = lowercase ? ROMAN_DEGREES[degreeIndex].toLowerCase() : ROMAN_DEGREES[degreeIndex];
  return `${accidental}${numeral}`;
}

function inversionFigure(candidate) {
  const bassInterval = (pitchClass(candidate.bassPitchClass ?? candidate.bass) - pitchClass(candidate.root) + 12) % 12;
  if (bassInterval === 0) return "";
  const intervals = new Set(candidate.intervals || []);
  const third = intervals.has(3) ? 3 : intervals.has(4) ? 4 : null;
  const fifth = intervals.has(6) ? 6 : intervals.has(7) ? 7 : intervals.has(8) ? 8 : null;
  const hasSeventh = intervals.has(9) || intervals.has(10) || intervals.has(11);
  if (hasSeventh) {
    if (bassInterval === third) return "65";
    if (bassInterval === fifth) return "43";
    if ([9, 10, 11].includes(bassInterval)) return "42";
    return "";
  }
  if (bassInterval === third) return "6";
  if (bassInterval === fifth) return "64";
  return "";
}

function suffixWithInversion(candidate, kind) {
  const figure = inversionFigure(candidate);
  if (!figure) return numeralSuffix(candidate, kind);
  const symbol = candidate.symbol || "";
  if (["dim", "dim7"].includes(symbol)) return `°${figure}`;
  if (symbol === "m7b5") return `ø${figure}`;
  if (symbol === "aug") return `+${figure}`;
  if (["", "m", "7", "m7", "maj7", "m(maj7)"].includes(symbol)) return figure;
  return numeralSuffix(candidate, kind);
}

function isExtendedDominant(candidate) {
  const intervals = new Set(candidate.intervals || []);
  return /^(7|9|11|13)/.test(candidate.symbol || "") && intervals.has(10);
}

function isSimpleMajorTriad(candidate) {
  const intervals = new Set(candidate.intervals || []);
  return (candidate.symbol || "") === "" && intervals.size === 3 && intervals.has(0) && intervals.has(4) && intervals.has(7);
}

function appliedDominant(candidate, tonic, mode) {
  const extendedDominant = isExtendedDominant(candidate);
  const majorTriad = isSimpleMajorTriad(candidate);
  if (!extendedDominant && !majorTriad) return null;
  const definition = MODE_DEFINITIONS[mode];
  const root = pitchClass(candidate.root);
  const rootInterval = (root - pitchClass(tonic) + 12) % 12;
  if (majorTriad && (rootInterval === 0 || DIATONIC_MAJOR_ROOTS[mode].has(rootInterval))) return null;

  for (let index = 1; index < definition.intervals.length; index += 1) {
    const target = (pitchClass(tonic) + definition.intervals[index]) % 12;
    if (root === (target + 7) % 12) {
      return {
        numeral: `V${candidate.symbol}/${definition.denominators[index]}`,
        functionName: majorTriad ? "Likely secondary dominant" : "Secondary dominant",
      };
    }
  }
  if (majorTriad) return null;
  for (let index = 0; index < definition.intervals.length; index += 1) {
    const target = (pitchClass(tonic) + definition.intervals[index]) % 12;
    if (root === (target + 1) % 12) {
      return { numeral: `subV${candidate.symbol}/${definition.denominators[index]}`, functionName: "Tritone substitute" };
    }
  }
  return null;
}

function appliedLeadingTone(candidate, tonic, mode, kind) {
  if (!["diminished", "half-diminished"].includes(kind)) return null;
  const definition = MODE_DEFINITIONS[mode];
  const root = pitchClass(candidate.root);
  for (let index = 1; index < definition.intervals.length; index += 1) {
    const target = (pitchClass(tonic) + definition.intervals[index]) % 12;
    if (root !== (target + 11) % 12) continue;
    const suffix = candidate.symbol === "dim7" ? "°7" : candidate.symbol === "m7b5" ? "ø7" : "°";
    return { numeral: `vii${suffix}/${definition.denominators[index]}`, functionName: "Secondary leading-tone chord" };
  }
  return null;
}

function applyInversionToApplied(numeral, candidate) {
  const figure = inversionFigure(candidate);
  if (!figure) return numeral;
  const slashIndex = numeral.indexOf("/");
  const head = slashIndex < 0 ? numeral : numeral.slice(0, slashIndex);
  const target = slashIndex < 0 ? "" : numeral.slice(slashIndex);
  const adjustedHead = head
    .replace(/^V(?:maj7|m7|7)?/, `V${figure}`)
    .replace(/^vii(?:°7|ø7|°)/, (match) => `${match.replace(/7$/, "")}${figure}`);
  return `${adjustedHead}${target}`;
}

function isBorrowedChord(candidate, tonic, mode, kind) {
  const definition = MODE_DEFINITIONS[mode];
  const interval = (pitchClass(candidate.root) - pitchClass(tonic) + 12) % 12;
  const degreeIndex = definition.intervals.indexOf(interval);
  if (degreeIndex >= 0) return definition.qualities[degreeIndex] !== kind;
  return interval === 1 || (mode === "major" && [3, 8, 10].includes(interval));
}

export function analyzeHarmony(candidate, options = {}) {
  if (!candidate) return null;
  const tonic = pitchClass(Number(options.tonic) || 0);
  const mode = options.mode === "minor" ? "minor" : "major";
  const kind = chordKind(candidate);
  const applied = appliedDominant(candidate, tonic, mode) || appliedLeadingTone(candidate, tonic, mode, kind);
  const uncertainty = candidate.uncertain ? "?" : "";
  if (applied) {
    return {
      ...applied,
      numeral: `${applyInversionToApplied(applied.numeral, candidate)}${uncertainty}`,
      keyName: `${pitchClassName(tonic, options.spelling)} ${mode}`,
    };
  }
  const borrowed = isBorrowedChord(candidate, tonic, mode, kind);
  return {
    numeral: `${degreeForRoot(candidate.root, tonic, mode, kind)}${suffixWithInversion(candidate, kind)}${uncertainty}`,
    functionName: candidate.uncertain
      ? "Scale-degree estimate"
      : borrowed
        ? "Borrowed chord / modal mixture"
        : "Scale degree",
    keyName: `${pitchClassName(tonic, options.spelling)} ${mode}`,
  };
}
