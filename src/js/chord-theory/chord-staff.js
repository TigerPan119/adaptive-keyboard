const VEXFLOW_URL = "https://cdn.jsdelivr.net/npm/vexflow@5.0.0/build/cjs/vexflow.js";
const SHARP_KEYS = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
const FLAT_KEYS = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"];
const NOTE_LETTERS = ["c", "d", "e", "f", "g", "a", "b"];
const NATURAL_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11];

let vexFlowPromise = null;

function loadVexFlow() {
  if (window.VexFlow) return prepareVexFlow(window.VexFlow);
  if (vexFlowPromise) return vexFlowPromise;
  vexFlowPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = VEXFLOW_URL;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", () => resolve(window.VexFlow));
    script.addEventListener("error", () => reject(new Error("Could not load VexFlow.")));
    document.head.append(script);
  }).then(prepareVexFlow).catch((error) => {
    vexFlowPromise = null;
    throw error;
  });
  return vexFlowPromise;
}

async function prepareVexFlow(VexFlow) {
  if (!VexFlow) throw new Error("VexFlow did not initialize.");
  if (!VexFlow.__chordTheoryFontsReady) {
    await VexFlow.loadFonts("Bravura", "Academico");
    VexFlow.setFonts("Bravura", "Academico");
    VexFlow.__chordTheoryFontsReady = true;
  }
  return VexFlow;
}

export function midiNoteToStaffKey(note, spelling = "sharp") {
  const midi = Math.max(0, Math.min(127, Math.round(Number(note) || 0)));
  const names = spelling === "flat" ? FLAT_KEYS : SHARP_KEYS;
  return `${names[midi % 12]}/${Math.floor(midi / 12) - 1}`;
}

function chordToneLetterOffset(interval, symbol = "") {
  if (interval === 0) return 0;
  if ([1, 2].includes(interval)) return 1;
  if (interval === 3) return symbol.includes("#9") ? 1 : 2;
  if (interval === 4) return 2;
  if (interval === 5) return 3;
  if (interval === 6) return symbol.includes("#11") ? 3 : 4;
  if (interval === 7) return 4;
  if (interval === 8) return symbol.includes("b13") ? 5 : 4;
  if (interval === 9) return symbol.includes("dim7") ? 6 : 5;
  return 6;
}

function accidentalName(offset) {
  if (offset === -2) return "bb";
  if (offset === -1) return "b";
  if (offset === 1) return "#";
  if (offset === 2) return "##";
  return offset === 0 ? "" : null;
}

export function midiNoteToChordStaffKey(note, chord, fallbackSpelling = "sharp") {
  const midi = Math.max(0, Math.min(127, Math.round(Number(note) || 0)));
  const rootName = chord?.rootName?.toLowerCase?.() || "";
  const rootLetterIndex = NOTE_LETTERS.indexOf(rootName[0]);
  const root = Number(chord?.root);
  if (rootLetterIndex < 0 || !Number.isFinite(root)) return midiNoteToStaffKey(midi, fallbackSpelling);

  const interval = ((midi % 12) - root + 12) % 12;
  const letterIndex = (rootLetterIndex + chordToneLetterOffset(interval, chord?.symbol)) % NOTE_LETTERS.length;
  const naturalPitchClass = NATURAL_PITCH_CLASSES[letterIndex];
  let accidentalOffset = ((midi % 12) - naturalPitchClass + 12) % 12;
  if (accidentalOffset > 6) accidentalOffset -= 12;
  const accidental = accidentalName(accidentalOffset);
  if (accidental === null) return midiNoteToStaffKey(midi, fallbackSpelling);

  const octave = (midi - naturalPitchClass - accidentalOffset) / 12 - 1;
  return `${NOTE_LETTERS[letterIndex]}${accidental}/${octave}`;
}

export function splitStaffVoicing(notes, spelling = "sharp", alwaysGrand = false, chord = null) {
  const normalized = [...new Set((notes || [])
    .map((note) => Math.round(Number(note)))
    .filter((note) => Number.isFinite(note) && note >= 0 && note <= 127))]
    .sort((first, second) => first - second);
  const bass = normalized.filter((note) => note < 60);
  const treble = normalized.filter((note) => note >= 60);
  const toKeys = (staffNotes) => staffNotes.map((note) => (
    chord
      ? midiNoteToChordStaffKey(note, chord, spelling)
      : midiNoteToStaffKey(note, spelling)
  ));
  return {
    notes: normalized,
    bass: toKeys(bass),
    treble: toKeys(treble),
    layout: alwaysGrand || (bass.length && treble.length) ? "grand" : bass.length ? "bass" : "treble",
  };
}

function addAccidentals(VexFlow, staveNote, keys) {
  keys.forEach((key, index) => {
    const accidental = key.split("/")[0].slice(1);
    if (accidental) staveNote.addModifier(new VexFlow.Accidental(accidental), index);
  });
  return staveNote;
}

function createChordNote(VexFlow, keys, clef) {
  return addAccidentals(
    VexFlow,
    new VexFlow.StaveNote({ clef, keys, duration: "w" }),
    keys,
  );
}

export function centeredTickX(staveX, staveWidth, tickWidth, leftWidth = 0) {
  return staveX + staveWidth / 2 - tickWidth / 2 + leftWidth;
}

export function centeredRelativeTickX(staveX, staveWidth, tickWidth, leftWidth, noteStartOffset) {
  return centeredTickX(staveX, staveWidth, tickWidth, leftWidth) - noteStartOffset;
}

function drawChordOnStave(VexFlow, context, stave, keys, clef) {
  const note = createChordNote(VexFlow, keys, clef)
    .setStave(stave)
    .addToModifierContext(new VexFlow.ModifierContext());
  const tickContext = new VexFlow.TickContext()
    .addTickable(note)
    .preFormat();
  const metrics = tickContext.getMetrics();
  tickContext.setX(0);
  const noteStartOffset = note.getAbsoluteX();
  tickContext.setX(centeredRelativeTickX(
    stave.getX(),
    stave.getWidth(),
    tickContext.getWidth(),
    Number(metrics.totalLeftPx) || 0,
    noteStartOffset,
  ));
  note.setContext(context).draw();
  return note;
}

function drawGrandStaff(VexFlow, context, voicing, width) {
  const staveWidth = width - 24;
  const treble = new VexFlow.Stave(12, 0, staveWidth).addClef("treble");
  const bass = new VexFlow.Stave(12, 84, staveWidth).addClef("bass");
  treble.setContext(context).draw();
  bass.setContext(context).draw();
  const braceType = VexFlow.StaveConnector.type?.BRACE ?? 3;
  const singleType = VexFlow.StaveConnector.type?.SINGLE_LEFT ?? 1;
  new VexFlow.StaveConnector(treble, bass).setType(braceType).setContext(context).draw();
  new VexFlow.StaveConnector(treble, bass).setType(singleType).setContext(context).draw();
  if (voicing.treble.length) drawChordOnStave(VexFlow, context, treble, voicing.treble, "treble");
  if (voicing.bass.length) drawChordOnStave(VexFlow, context, bass, voicing.bass, "bass");
}

function drawSingleStaff(VexFlow, context, voicing, width) {
  const clef = voicing.layout === "bass" ? "bass" : "treble";
  const keys = clef === "bass" ? voicing.bass : voicing.treble;
  const stave = new VexFlow.Stave(12, 4, width - 24).addClef(clef);
  stave.setContext(context).draw();
  if (keys.length) drawChordOnStave(VexFlow, context, stave, keys, clef);
}

export class ChordStaffRenderer {
  constructor(canvas, message) {
    this.canvas = canvas;
    this.message = message;
    this.requestId = 0;
  }

  async render({ notes = [], spelling = "sharp", bright = false, alwaysGrand = false, chord = null } = {}) {
    const requestId = ++this.requestId;
    const voicing = splitStaffVoicing(notes, spelling, alwaysGrand, chord);
    this.canvas.setAttribute(
      "aria-label",
      voicing.notes.length
        ? `Staff notation for MIDI notes ${voicing.notes.join(", ")}`
        : "No notes on the staff",
    );
    this.message.hidden = true;
    this.message.textContent = "";
    this.canvas.replaceChildren();
    this.canvas.dataset.layout = voicing.layout;
    this.canvas.parentElement.dataset.layout = voicing.layout;

    try {
      const VexFlow = await loadVexFlow();
      if (requestId !== this.requestId) return;
      const width = Math.max(260, Math.round(this.canvas.getBoundingClientRect().width || 420));
      const height = voicing.layout === "grand" ? 174 : 112;
      const renderer = new VexFlow.Renderer(this.canvas, VexFlow.Renderer.Backends.SVG);
      renderer.resize(width, height);
      const context = renderer.getContext();
      const foreground = bright ? "#111113" : "#f5f5f7";
      context.setFillStyle(foreground);
      context.setStrokeStyle(foreground);
      if (voicing.layout === "grand") drawGrandStaff(VexFlow, context, voicing, width);
      else drawSingleStaff(VexFlow, context, voicing, width);
      const svg = this.canvas.querySelector("svg");
      svg?.setAttribute("preserveAspectRatio", "xMidYMid meet");
      this.message.hidden = true;
    } catch (error) {
      if (requestId !== this.requestId) return;
      console.error(error);
      this.canvas.replaceChildren();
      this.message.hidden = false;
      this.message.textContent = "Staff notation is unavailable.";
    }
  }

  cancel() {
    this.requestId += 1;
  }
}
