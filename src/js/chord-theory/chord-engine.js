import { noteName, pitchClass, pitchClassName } from "../music.js";

const CHORD_TEMPLATES = [
  { intervals: [0, 4, 7, 10, 2, 6, 9], symbol: "13#11", quality: "Dominant thirteenth sharp eleventh", rank: 136 },
  { intervals: [0, 4, 7, 11, 2, 6, 9], symbol: "maj13#11", quality: "Major thirteenth sharp eleventh", rank: 135 },
  { intervals: [0, 4, 7, 10, 1, 9], symbol: "13b9", quality: "Dominant thirteenth flat ninth", rank: 134 },
  { intervals: [0, 4, 7, 10, 3, 9], symbol: "13#9", quality: "Dominant thirteenth sharp ninth", rank: 133 },
  { intervals: [0, 4, 7, 10, 2, 9], symbol: "13", quality: "Dominant thirteenth", rank: 132 },
  { intervals: [0, 4, 7, 11, 2, 9], symbol: "maj13", quality: "Major thirteenth", rank: 131 },
  { intervals: [0, 3, 7, 10, 2, 9], symbol: "m13", quality: "Minor thirteenth", rank: 130 },
  { intervals: [0, 5, 7, 10, 2, 9], symbol: "13sus4", quality: "Dominant thirteenth suspended fourth", rank: 130 },
  { intervals: [0, 4, 7, 10, 2, 5], symbol: "11", quality: "Dominant eleventh", rank: 129 },
  { intervals: [0, 4, 7, 11, 2, 5], symbol: "maj11", quality: "Major eleventh", rank: 128 },
  { intervals: [0, 3, 7, 10, 2, 5], symbol: "m11", quality: "Minor eleventh", rank: 127 },
  { intervals: [0, 4, 7, 11, 2], symbol: "maj9", quality: "Major ninth", rank: 120 },
  { intervals: [0, 4, 7, 11, 2, 6], symbol: "maj9#11", quality: "Major ninth sharp eleventh", rank: 120 },
  { intervals: [0, 4, 7, 10, 2], symbol: "9", quality: "Dominant ninth", rank: 119 },
  { intervals: [0, 3, 7, 10, 2], symbol: "m9", quality: "Minor ninth", rank: 118 },
  { intervals: [0, 3, 7, 11, 2], symbol: "m(maj9)", quality: "Minor-major ninth", rank: 118 },
  { intervals: [0, 5, 7, 10, 2], symbol: "9sus4", quality: "Dominant ninth suspended fourth", rank: 118 },
  { intervals: [0, 4, 7, 10, 1], symbol: "7b9", quality: "Dominant seventh flat ninth", rank: 117 },
  { intervals: [0, 4, 7, 10, 3], symbol: "7#9", quality: "Dominant seventh sharp ninth", rank: 116 },
  { intervals: [0, 4, 6, 10], symbol: "7b5", quality: "Dominant seventh flat fifth", rank: 115 },
  { intervals: [0, 4, 8, 10], symbol: "7#5", quality: "Dominant seventh sharp fifth", rank: 114 },
  { intervals: [0, 4, 7, 10, 6], symbol: "7#11", quality: "Dominant seventh sharp eleventh", rank: 113 },
  { intervals: [0, 4, 7, 10, 8], symbol: "7b13", quality: "Dominant seventh flat thirteenth", rank: 112 },
  { intervals: [0, 4, 7, 11, 6], symbol: "maj7#11", quality: "Major seventh sharp eleventh", rank: 111 },
  { intervals: [0, 4, 7, 11], symbol: "maj7", quality: "Major seventh", rank: 110 },
  { intervals: [0, 4, 7, 10], symbol: "7", quality: "Dominant seventh", rank: 109 },
  { intervals: [0, 3, 7, 10], symbol: "m7", quality: "Minor seventh", rank: 108 },
  { intervals: [0, 3, 7, 11], symbol: "m(maj7)", quality: "Minor-major seventh", rank: 107 },
  { intervals: [0, 3, 6, 10], symbol: "m7b5", quality: "Half-diminished seventh", rank: 106 },
  { intervals: [0, 3, 6, 9], symbol: "dim7", quality: "Diminished seventh", rank: 105 },
  { intervals: [0, 4, 7, 9], symbol: "6", quality: "Major sixth", rank: 103 },
  { intervals: [0, 3, 7, 9], symbol: "m6", quality: "Minor sixth", rank: 102 },
  { intervals: [0, 2, 4, 7, 9], symbol: "6/9", quality: "Major six-nine", rank: 102 },
  { intervals: [0, 2, 3, 7, 9], symbol: "m6/9", quality: "Minor six-nine", rank: 102 },
  { intervals: [0, 2, 4, 7], symbol: "add9", quality: "Add ninth", rank: 101 },
  { intervals: [0, 2, 3, 7], symbol: "m(add9)", quality: "Minor add ninth", rank: 100 },
  { intervals: [0, 4, 5, 7], symbol: "add11", quality: "Add eleventh", rank: 99 },
  { intervals: [0, 3, 5, 7], symbol: "m(add11)", quality: "Minor add eleventh", rank: 98 },
  { intervals: [0, 5, 7, 10], symbol: "7sus4", quality: "Dominant seventh suspended fourth", rank: 97 },
  { intervals: [0, 2, 7, 10], symbol: "7sus2", quality: "Dominant seventh suspended second", rank: 96 },
  { intervals: [0, 5, 7, 11], symbol: "maj7sus4", quality: "Major seventh suspended fourth", rank: 96 },
  { intervals: [0, 2, 7, 11], symbol: "maj7sus2", quality: "Major seventh suspended second", rank: 95 },
  { intervals: [0, 4, 7], symbol: "", quality: "Major", rank: 90 },
  { intervals: [0, 3, 7], symbol: "m", quality: "Minor", rank: 89 },
  { intervals: [0, 3, 6], symbol: "dim", quality: "Diminished", rank: 88 },
  { intervals: [0, 4, 8], symbol: "aug", quality: "Augmented", rank: 87 },
  { intervals: [0, 2, 7], symbol: "sus2", quality: "Suspended second", rank: 86 },
  { intervals: [0, 5, 7], symbol: "sus4", quality: "Suspended fourth", rank: 85 },
  { intervals: [0, 7], symbol: "5", quality: "Power chord", rank: 40, power: true },
];

function allowedOmissions(template, assumePerfectFifth) {
  const symbol = template.symbol || "";
  const allowed = new Set();

  if (/^(?:maj|m)?13(?:$|[#b])/.test(symbol)) {
    [7, 2, 5].forEach((interval) => allowed.add(interval));
  }
  if (/^(?:maj|m)?11$/.test(symbol)) {
    const third = template.intervals.includes(3) ? 3 : 4;
    allowed.add(third);
    allowed.add(7);
  }
  if (/^(?:maj|m)?9$/.test(symbol)) allowed.add(7);

  const intervals = new Set(template.intervals);
  const hasThird = intervals.has(3) || intervals.has(4);
  if (assumePerfectFifth && hasThird && intervals.has(7)) allowed.add(7);

  // A missing third is highly ambiguous, so only infer it for compact seventh
  // structures. Eleventh chords are handled above because omitting their third
  // is a common voicing practice.
  const hasChordalSeventh = intervals.has(10) || intervals.has(11);
  if (template.intervals.length === 4 && hasThird && hasChordalSeventh) {
    allowed.add(intervals.has(3) ? 3 : 4);
  }
  return allowed;
}

function matchTemplate(intervals, template, assumePerfectFifth) {
  const actual = new Set(intervals);
  const expected = new Set(template.intervals);
  if ([...actual].some((interval) => !expected.has(interval))) return null;
  const omitted = [...expected].filter((interval) => !actual.has(interval));
  if (!omitted.length) return { omitted: [] };
  const allowed = allowedOmissions(template, assumePerfectFifth);
  if (!omitted.every((interval) => allowed.has(interval))) return null;

  const omitsThird = omitted.some((interval) => interval === 3 || interval === 4);
  if (omitsThird && actual.size < 3) return null;
  return { omitted };
}

function omittedStepName(interval) {
  if ([3, 4].includes(interval)) return "third";
  if (interval === 7) return "fifth";
  if (interval === 2) return "ninth";
  if (interval === 5) return "eleventh";
  return "tone";
}

function qualityWithOmissions(quality, omitted) {
  if (!omitted.length) return quality;
  const names = omitted.map(omittedStepName);
  const description = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${quality}, ${description} omitted`;
}

function omittedDegree(interval) {
  if (interval === 3 || interval === 4) return 3;
  if (interval === 7) return 5;
  if (interval === 2) return 9;
  if (interval === 5) return 11;
  return null;
}

function symbolWithOmissions(symbol, omitted) {
  const degrees = omitted
    .map(omittedDegree)
    .filter((degree) => degree !== null)
    .sort((a, b) => a - b);
  if (!degrees.length) return symbol;

  const noDegrees = degrees.map((degree) => `no${degree}`).join(",");
  if (symbol.endsWith(")")) return `${symbol.slice(0, -1)},${noDegrees})`;
  return `${symbol}(${noDegrees})`;
}

function omissionPenalty(omitted) {
  return omitted.reduce((total, interval) => total + ([3, 4].includes(interval) ? 14 : 6), 0);
}

function omissionBaseScore(template, omitted) {
  const symbol = template.symbol || "";
  const intervals = new Set(template.intervals);
  const commonExtensionOmission = /^(?:maj|m)?(?:9|11|13)(?:$|[#b])/.test(symbol);
  const commonSeventhFifthOmission = omitted.length === 1
    && omitted[0] === 7
    && (intervals.has(3) || intervals.has(4))
    && (intervals.has(10) || intervals.has(11));
  return commonExtensionOmission || commonSeventhFifthOmission ? 176 : 150;
}

function inversionLabel(intervals, bassInterval) {
  const ordered = [...intervals].sort((a, b) => a - b);
  const index = ordered.indexOf(bassInterval);
  if (index === 0) return "Root position";
  if (index === 1) return "First inversion";
  if (index === 2) return "Second inversion";
  if (index === 3) return "Third inversion";
  return "Inversion";
}

function rootStructureScore(intervals) {
  const set = new Set(intervals);
  const hasThird = set.has(3) || set.has(4);
  const hasFifth = set.has(6) || set.has(7) || set.has(8);
  const hasSeventh = set.has(9) || set.has(10) || set.has(11);
  let score = hasThird ? 18 : 0;
  if (hasFifth) score += 12;
  if (hasSeventh) score += 8;
  if (hasThird && hasFifth && hasSeventh) score += 7;
  if (set.has(2) && hasSeventh) score += 3;
  if (set.has(5) && hasSeventh) score += 2;
  return score;
}

function voicingTexture(span, uniqueNoteCount) {
  if (uniqueNoteCount <= 1 || span === 0) return "unison";
  if (span <= 12) return "compact";
  if (span <= 24) return "open";
  return "wide";
}

function voicingRegister(center) {
  if (center < 48) return "low";
  if (center < 72) return "middle";
  return "high";
}

function createVoicingProfile(notes, spelling) {
  if (!notes.length) {
    return {
      noteCount: 0,
      uniqueNoteCount: 0,
      pitchClassCount: 0,
      spanSemitones: 0,
      spanOctaves: 0,
      averageSpacing: 0,
      center: null,
      register: null,
      texture: "empty",
      bassGap: 0,
      sopranoGap: 0,
      adjacentIntervals: [],
      uniqueAdjacentIntervals: [],
      pitchClassCounts: Array(12).fill(0),
      pitchClasses: [],
      doublings: [],
      octaves: [],
    };
  }

  const uniqueNotes = [...new Set(notes)];
  const bass = notes[0];
  const soprano = notes.at(-1);
  const spanSemitones = soprano - bass;
  const pitchClassCounts = Array(12).fill(0);
  const pitchClassNotes = Array.from({ length: 12 }, () => []);
  const octaveCounts = new Map();

  for (const note of notes) {
    const pc = pitchClass(note);
    const octave = Math.floor(note / 12) - 1;
    pitchClassCounts[pc] += 1;
    pitchClassNotes[pc].push(note);
    octaveCounts.set(octave, (octaveCounts.get(octave) || 0) + 1);
  }

  const pitchClasses = pitchClassCounts.flatMap((count, pc) => count ? [{
    pitchClass: pc,
    name: pitchClassName(pc, spelling),
    count,
    notes: [...pitchClassNotes[pc]],
    noteNames: pitchClassNotes[pc].map((note) => noteName(note, spelling)),
  }] : []);
  const adjacentIntervals = notes.slice(1).map((note, index) => note - notes[index]);
  const uniqueAdjacentIntervals = uniqueNotes.slice(1).map((note, index) => note - uniqueNotes[index]);
  const center = notes.reduce((total, note) => total + note, 0) / notes.length;

  return {
    noteCount: notes.length,
    uniqueNoteCount: uniqueNotes.length,
    pitchClassCount: pitchClasses.length,
    bass,
    bassName: noteName(bass, spelling),
    soprano,
    sopranoName: noteName(soprano, spelling),
    spanSemitones,
    spanOctaves: spanSemitones / 12,
    averageSpacing: uniqueNotes.length > 1 ? spanSemitones / (uniqueNotes.length - 1) : 0,
    center,
    register: voicingRegister(center),
    texture: voicingTexture(spanSemitones, uniqueNotes.length),
    bassGap: uniqueNotes.length > 1 ? uniqueNotes[1] - uniqueNotes[0] : 0,
    sopranoGap: uniqueNotes.length > 1 ? uniqueNotes.at(-1) - uniqueNotes.at(-2) : 0,
    adjacentIntervals,
    uniqueAdjacentIntervals,
    pitchClassCounts,
    pitchClasses,
    doublings: pitchClasses.filter((entry) => entry.count > 1),
    octaves: [...octaveCounts.entries()].map(([octave, count]) => ({ octave, count })),
  };
}

function applyVoicingEvidence(candidate, voicing) {
  const rootCount = voicing.pitchClassCounts[candidate.root] || 0;
  const rootDoublings = Math.max(0, rootCount - 1);
  const highestCount = Math.max(0, ...voicing.pitchClassCounts);
  const equallyFrequentPitchClasses = voicing.pitchClassCounts.filter((count) => count === highestCount).length;
  const rootEmphasized = rootCount > 1 && rootCount === highestCount && equallyFrequentPitchClasses === 1;
  const rootInBass = candidate.bassPitchClass === candidate.root;
  const isolatedRootBass = rootInBass && voicing.bassGap >= 7;
  const sopranoPitchClass = pitchClass(voicing.soprano);
  const rootInSoprano = sopranoPitchClass === candidate.root;
  const score = Math.min(rootDoublings, 2) * 2
    + (rootEmphasized ? 2 : 0)
    + (isolatedRootBass ? 2 : 0)
    + (rootInSoprano ? 1 : 0);

  return {
    ...candidate,
    score: candidate.score + score,
    voicingScore: score,
    voicingEvidence: {
      rootCount,
      rootDoublings,
      rootEmphasized,
      rootInBass,
      isolatedRootBass,
      bassInterval: (candidate.bassPitchClass - candidate.root + 12) % 12,
      sopranoInterval: (sopranoPitchClass - candidate.root + 12) % 12,
      rootInSoprano,
    },
  };
}

function createCandidate(root, bass, template, spelling, match = { omitted: [] }) {
  const bassPc = pitchClass(bass);
  const bassInterval = (bassPc - root + 12) % 12;
  const rootName = pitchClassName(root, spelling);
  const bassName = pitchClassName(bassPc, spelling);
  const slash = bassPc === root ? "" : `/${bassName}`;
  const displaySymbol = symbolWithOmissions(template.symbol, match.omitted);
  return {
    root,
    bass,
    bassPitchClass: bassPc,
    name: `${rootName}${displaySymbol}${slash}`,
    rootName,
    symbol: template.symbol,
    quality: qualityWithOmissions(template.quality, match.omitted),
    inversion: inversionLabel(template.intervals, bassInterval),
    intervals: [...template.intervals],
    score: (match.omitted.length ? omissionBaseScore(template, match.omitted) : 200)
      + template.rank
      + rootStructureScore(template.intervals.filter((interval) => !match.omitted.includes(interval)))
      + (bassPc === root ? 36 : 0)
      - omissionPenalty(match.omitted),
    inferred: match.omitted.length > 0,
    omittedIntervals: [...match.omitted],
    omittedDegrees: match.omitted.map(omittedDegree).filter((degree) => degree !== null),
    structuralStrength: match.omitted.length ? 90 : undefined,
  };
}

const INFERRED_BASES = [
  { id: "diminished", required: [0, 3, 6], consumed: [0, 3, 6], symbol: "dim", quality: "Diminished", score: 82 },
  { id: "augmented", required: [0, 4, 8], consumed: [0, 4, 8], symbol: "aug", quality: "Augmented", score: 81 },
  { id: "sus4", required: [0, 5, 7], consumed: [0, 5, 7], symbol: "sus4", quality: "Suspended fourth", score: 78 },
  { id: "sus2", required: [0, 2, 7], consumed: [0, 2, 7], symbol: "sus2", quality: "Suspended second", score: 77 },
  { id: "major", required: [0, 4], consumed: [0, 4, 7], symbol: "", quality: "Major", score: 72 },
  { id: "minor", required: [0, 3], consumed: [0, 3, 7], symbol: "m", quality: "Minor", score: 71 },
  { id: "power", required: [0, 7], consumed: [0, 7], symbol: "5", quality: "Power chord", score: 48, power: true },
  { id: "cluster", required: [0], consumed: [0], symbol: "", quality: "Root-based cluster", score: 18 },
];

function hasEvery(intervalSet, intervals) {
  return intervals.every((interval) => intervalSet.has(interval));
}

function formatModifiers(modifiers) {
  if (!modifiers.length) return "";
  if (modifiers.length === 1) return modifiers[0];
  return `(${modifiers.join(",")})`;
}

function extensionSymbol(base, seventh, intervalSet, consumed) {
  const has9 = intervalSet.has(2);
  const has11 = intervalSet.has(5);
  const has13 = intervalSet.has(9);
  const prefix = base.id === "minor" ? "m" : "";
  const extendedQuality = (degree) => {
    if (seventh === "major") return base.id === "minor" ? `m(maj${degree})` : `maj${degree}`;
    return `${prefix}${degree}`;
  };

  if (seventh && base.id === "augmented") {
    if (has13) {
      consumed.add(9);
      if (has9) consumed.add(2);
      if (has11) consumed.add(5);
      return seventh === "major" ? "maj13#5" : "13#5";
    }
    if (has9 && has11) {
      consumed.add(2);
      consumed.add(5);
      return seventh === "major" ? "maj11#5" : "11#5";
    }
    if (has9) {
      consumed.add(2);
      return seventh === "major" ? "maj9#5" : "9#5";
    }
  }

  if (seventh && ["sus2", "sus4"].includes(base.id)) {
    const suspension = base.id === "sus2" ? "sus2" : "sus4";
    if (has13) {
      consumed.add(9);
      if (has9) consumed.add(2);
      return seventh === "major" ? `maj13${suspension}` : `13${suspension}`;
    }
    if (has9) {
      consumed.add(2);
      return seventh === "major" ? `maj9${suspension}` : `9${suspension}`;
    }
  }

  if (base.id === "diminished" && seventh) {
    const diminishedExtension = (degree) => {
      if (seventh === "diminished") return `dim${degree}`;
      if (seventh === "major") return `dim(maj${degree})`;
      return `m${degree}b5`;
    };
    if (has13) {
      consumed.add(9);
      if (has9) consumed.add(2);
      if (has11) consumed.add(5);
      return diminishedExtension(13);
    }
    if (has9 && has11) {
      consumed.add(2);
      consumed.add(5);
      return diminishedExtension(11);
    }
    if (has9) {
      consumed.add(2);
      return diminishedExtension(9);
    }
  }

  if (!seventh && ["major", "minor"].includes(base.id) && has13) {
    consumed.add(9);
    if (has9) {
      consumed.add(2);
      return `${prefix}6/9`;
    }
    return `${prefix}6`;
  }

  if (!seventh) return base.symbol;

  if (has13 && ["major", "minor"].includes(base.id)) {
    consumed.add(9);
    if (has9) consumed.add(2);
    if (has11) consumed.add(5);
    return extendedQuality(13);
  }
  if (has9 && has11 && ["major", "minor"].includes(base.id)) {
    consumed.add(2);
    consumed.add(5);
    return extendedQuality(11);
  }
  if (has9 && ["major", "minor"].includes(base.id)) {
    consumed.add(2);
    return extendedQuality(9);
  }

  if (base.id === "diminished" && seventh === "diminished") return "dim7";
  if (base.id === "diminished" && seventh === "minor") return "m7b5";
  if (base.id === "diminished" && seventh === "major") return "dim(maj7)";
  if (base.id === "major") return seventh === "major" ? "maj7" : "7";
  if (base.id === "minor") return seventh === "major" ? "m(maj7)" : "m7";
  if (base.id === "augmented") return seventh === "major" ? "maj7#5" : "7#5";
  if (base.id === "sus2") return seventh === "major" ? "maj7sus2" : "7sus2";
  if (base.id === "sus4") return seventh === "major" ? "maj7sus4" : "7sus4";
  return `${base.symbol}${seventh === "major" ? "maj7" : "7"}`;
}

function modifierForInterval(interval, base, hasSeventh, intervalSet) {
  if (interval === 1) return hasSeventh ? "b9" : "addb9";
  if (interval === 2) return hasSeventh ? "9" : "add9";
  if (interval === 3) return base.id === "major" && intervalSet.has(4) ? (hasSeventh ? "#9" : "add#9") : "addb3";
  if (interval === 4) return "add3";
  if (interval === 5) return hasSeventh && intervalSet.has(2) ? "11" : "add11";
  if (interval === 6) return intervalSet.has(7) ? (hasSeventh ? "#11" : "add#11") : "b5";
  if (interval === 7) return base.id === "cluster" ? "5" : "add5";
  if (interval === 8) return intervalSet.has(7) ? (hasSeventh ? "b13" : "addb13") : "#5";
  if (interval === 9) return hasSeventh ? "13" : "add13";
  if (interval === 10) return "addb7";
  if (interval === 11) return "addmaj7";
  return `add${interval}`;
}

function createInferredCandidate(root, bass, intervals, base, spelling) {
  const intervalSet = new Set(intervals);
  const consumed = new Set(base.consumed.filter((interval) => intervalSet.has(interval)));
  let seventh = null;

  if (base.id === "diminished" && intervalSet.has(9)) {
    seventh = "diminished";
    consumed.add(9);
  } else if (intervalSet.has(10)) {
    seventh = "minor";
    consumed.add(10);
  } else if (intervalSet.has(11)) {
    seventh = "major";
    consumed.add(11);
  }

  let symbol = extensionSymbol(base, seventh, intervalSet, consumed);
  const modifiers = intervals
    .filter((interval) => !consumed.has(interval))
    .map((interval) => modifierForInterval(interval, base, Boolean(seventh), intervalSet));
  symbol += formatModifiers(modifiers);

  const bassPc = pitchClass(bass);
  const rootName = pitchClassName(root, spelling);
  const bassName = pitchClassName(bassPc, spelling);
  const slash = bassPc === root ? "" : `/${bassName}`;
  const bassInterval = (bassPc - root + 12) % 12;
  // When no strict template explains the set, the played bass is the safest
  // root prior. This also prevents sparse upper structures from inventing a
  // high extension in an unrelated inversion.
  let score = base.score + rootStructureScore(intervals) + (bassPc === root ? 100 : 0) + (seventh ? 7 : 0);
  if (bassPc !== root && consumed.has(bassInterval)) score += 5;
  score -= modifiers.length * 1.5;

  return {
    root,
    bass,
    bassPitchClass: bassPc,
    name: `${rootName}${symbol}${slash}`,
    rootName,
    symbol,
    quality: modifiers.length ? `${base.quality} with additions or alterations` : base.quality,
    inversion: inversionLabel(intervals, bassInterval),
    intervals: [...intervals],
    score,
    inferred: true,
    structuralStrength: base.score,
    modifierCount: modifiers.length,
  };
}

function inferCandidates(pitchClasses, bass, spelling, includePowerChords) {
  const candidates = [];
  for (const root of pitchClasses) {
    const intervals = pitchClasses.map((pc) => (pc - root + 12) % 12).sort((a, b) => a - b);
    const intervalSet = new Set(intervals);
    for (const base of INFERRED_BASES) {
      if (base.power && (!includePowerChords || pitchClasses.length !== 2)) continue;
      if (base.id === "cluster" && pitchClasses.length > 2) continue;
      if (["sus2", "sus4"].includes(base.id) && (intervalSet.has(3) || intervalSet.has(4))) continue;
      if (base.id === "diminished" && (intervalSet.has(4) || intervalSet.has(7))) continue;
      if (base.id === "augmented" && (intervalSet.has(3) || intervalSet.has(7))) continue;
      if (!hasEvery(intervalSet, base.required)) continue;
      const candidate = createInferredCandidate(root, bass, intervals, base, spelling);
      if (candidate.modifierCount <= 4) candidates.push(candidate);
    }
  }
  return candidates;
}

function dedupeCandidates(candidates) {
  const byName = new Map();
  for (const candidate of candidates) {
    const existing = byName.get(candidate.name);
    if (!existing || candidate.score > existing.score) byName.set(candidate.name, candidate);
  }
  return [...byName.values()];
}

export function analyzeChord(notes, options = {}) {
  const spelling = options.spelling === "flat" ? "flat" : "sharp";
  const includePowerChords = Boolean(options.includePowerChords);
  const assumePerfectFifth = options.assumePerfectFifth !== false;
  const normalizedNotes = notes
    .map((note) => Math.round(note))
    .filter((note) => note >= 0 && note <= 127)
    .sort((a, b) => a - b);
  const uniqueNotes = [...new Set(normalizedNotes)];
  const voicing = createVoicingProfile(normalizedNotes, spelling);

  if (!uniqueNotes.length) {
    return { status: "empty", notes: [], uniqueNotes: [], pitchClasses: [], voicing, candidates: [] };
  }

  const pitchClasses = [...new Set(uniqueNotes.map(pitchClass))].sort((a, b) => a - b);
  const bass = uniqueNotes[0];
  const candidates = [];

  for (let root = 0; root < 12; root += 1) {
    const intervals = pitchClasses.map((pc) => (pc - root + 12) % 12);
    for (const template of CHORD_TEMPLATES) {
      if (template.power && !includePowerChords) continue;
      const match = matchTemplate(intervals, template, assumePerfectFifth);
      if (match) candidates.push(createCandidate(root, bass, template, spelling, match));
    }
  }

  if (pitchClasses.length >= 2 && pitchClasses.length <= 7) {
    const hasCompleteTemplate = candidates.some((candidate) => !candidate.inferred);
    const inferred = inferCandidates(pitchClasses, bass, spelling, includePowerChords);
    if (!hasCompleteTemplate) {
      inferred.forEach((candidate) => {
        const explicitOmission = candidates.some(
          (match) => match.inferred && match.root === candidate.root && match.symbol === candidate.symbol,
        );
        // Prefer an explicit no-tone figure over a same-root constructive
        // analysis that silently assumes the omitted tone. Other roots still
        // compete normally, preserving simpler bass-root interpretations.
        if (!explicitOmission) candidate.score += 150;
      });
    }
    candidates.push(...inferred);
  }

  const rankedCandidates = dedupeCandidates(candidates.map((candidate) => applyVoicingEvidence(candidate, voicing)));
  rankedCandidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let primary = rankedCandidates[0] || null;
  if (primary) {
    const runnerUp = rankedCandidates[1];
    const closeAlternative = runnerUp && primary.score - runnerUp.score <= 7;
    const weakStructure = primary.inferred && (primary.structuralStrength < 48 || pitchClasses.length < 3);
    const symmetricChord = ["aug", "dim7"].includes(primary.symbol) && rankedCandidates.length > 1;
    const uncertain = Boolean(closeAlternative || weakStructure || symmetricChord);
    primary = { ...primary, uncertain, name: `${primary.name}${uncertain ? "?" : ""}` };
    rankedCandidates[0] = primary;
  }
  return {
    status: primary ? "recognized" : pitchClasses.length < 3 ? "partial" : "unknown",
    notes: normalizedNotes,
    uniqueNotes,
    noteNames: normalizedNotes.map((note) => noteName(note, spelling)),
    pitchClasses,
    pitchClassNames: pitchClasses.map((pc) => pitchClassName(pc, spelling)),
    bass,
    bassName: noteName(bass, spelling),
    soprano: voicing.soprano,
    sopranoName: voicing.sopranoName,
    voicing,
    primary,
    candidates: rankedCandidates.slice(0, 3),
  };
}
