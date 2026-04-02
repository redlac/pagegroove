export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const SCALE_LIBRARY = [
  {
    name: "Minor Pentatonic",
    intervals: [0, 3, 5, 7, 10],
    mood: "Smoky"
  },
  {
    name: "Dorian",
    intervals: [0, 2, 3, 5, 7, 9, 10],
    mood: "Fluid"
  },
  {
    name: "Aeolian",
    intervals: [0, 2, 3, 5, 7, 8, 10],
    mood: "Moody"
  },
  {
    name: "Mixolydian",
    intervals: [0, 2, 4, 5, 7, 9, 10],
    mood: "Bright"
  }
];

export const TEMPO_PRESET_VALUES = [72, 84, 96, 108, 120, 132, 144];

export const DENSITY_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "sparse", label: "Sparse" },
  { value: "steady", label: "Steady" },
  { value: "busy", label: "Busy" },
  { value: "dense", label: "Dense" }
];

export const DEFAULT_TRACK_SETTINGS = Object.freeze({
  tempo: null,
  density: "auto",
  key: "auto",
  mood: "auto"
});

const DENSITY_PROFILES = {
  sparse: {
    score: 1.05,
    label: "Sparse"
  },
  steady: {
    score: 1.7,
    label: "Steady"
  },
  busy: {
    score: 2.45,
    label: "Busy"
  },
  dense: {
    score: 3.2,
    label: "Dense"
  }
};

const FRIENDLY_SCALE_LABELS = {
  "Minor Pentatonic": "blues",
  Dorian: "minor groove",
  Aeolian: "minor",
  Mixolydian: "major groove"
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapIntoRange(value, min, max) {
  let nextValue = value;

  while (nextValue < min) {
    nextValue += 12;
  }

  while (nextValue > max) {
    nextValue -= 12;
  }

  return clamp(nextValue, min, max);
}

function wrapDegree(intervals, degree) {
  const length = intervals.length;
  const normalizedDegree = ((degree % length) + length) % length;
  const octaveOffset = Math.floor(degree / length) * 12;

  return intervals[normalizedDegree] + octaveOffset;
}

export function mulberry32(seed) {
  let nextSeed = seed >>> 0;

  return () => {
    nextSeed += 0x6d2b79f5;
    let value = Math.imul(nextSeed ^ (nextSeed >>> 15), 1 | nextSeed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function midiToFrequency(midiNote) {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

export function getTempoFeelLabel(tempo) {
  if (!Number.isFinite(tempo)) {
    return "-";
  }

  if (tempo < 90) {
    return "Slow";
  }

  if (tempo < 120) {
    return "Medium";
  }

  return "Fast";
}

export function getFriendlyKeyLabel(rootNote, scaleName) {
  return `${rootNote} ${FRIENDLY_SCALE_LABELS[scaleName] || scaleName}`;
}

export function normalizeTrackSettings(settings = {}) {
  const tempoValue = Number(settings.tempo);
  const moodNames = new Set(SCALE_LIBRARY.map((scale) => scale.mood));

  return {
    tempo:
      Number.isFinite(tempoValue) && tempoValue >= 60 && tempoValue <= 180
        ? Math.round(tempoValue)
        : DEFAULT_TRACK_SETTINGS.tempo,
    density: DENSITY_OPTIONS.some((option) => option.value === settings.density)
      ? settings.density
      : DEFAULT_TRACK_SETTINGS.density,
    key: NOTE_NAMES.includes(settings.key) ? settings.key : DEFAULT_TRACK_SETTINGS.key,
    mood: moodNames.has(settings.mood) ? settings.mood : DEFAULT_TRACK_SETTINGS.mood
  };
}

export function deriveTrack(metrics, settingsInput = {}) {
  const settings = normalizeTrackSettings(settingsInput);
  const seed = (metrics.hash >>> 0) || 1;
  const random = mulberry32(seed);
  const autoScale =
    SCALE_LIBRARY[
      (metrics.headings + metrics.images + metrics.forms + seed) % SCALE_LIBRARY.length
    ];
  const scale =
    settings.mood === "auto"
      ? autoScale
      : SCALE_LIBRARY.find((candidate) => candidate.mood === settings.mood) || autoScale;
  const rootIndex =
    settings.key === "auto" ? seed % NOTE_NAMES.length : NOTE_NAMES.indexOf(settings.key);
  const rootMidi = 36 + rootIndex;
  const loopSteps = 32;
  const stepDurationBeats = 0.25;
  const interactionScore =
    metrics.links + metrics.images + metrics.buttons + metrics.forms + metrics.listItems;
  const layoutScore = metrics.maxDepth + Math.floor(metrics.domNodes / 80);
  const autoDensityScore = clamp(0.7 + interactionScore / 28 + layoutScore / 18, 0.8, 3.6);
  const densityProfile = settings.density === "auto" ? null : DENSITY_PROFILES[settings.density];
  const densityScore = densityProfile ? densityProfile.score : autoDensityScore;
  const autoTempo = clamp(
    74 +
      (metrics.textLength % 34) +
      Math.floor(densityScore * 9) +
      (metrics.headings % 6),
    74,
    138
  );
  const tempo = settings.tempo ?? autoTempo;

  const bassPattern = [];
  const kickPattern = [];
  const hatPattern = [];
  const padPattern = [];
  const anchorDegrees = [0, 2, 4, 1];
  const chordRotation = (metrics.forms + metrics.images + seed) % anchorDegrees.length;

  for (let step = 0; step < loopSteps; step += 1) {
    const onQuarter = step % 8 === 0;
    const onEighth = step % 4 === 0;
    const syncPoint = step % 8 === 6;
    const bassProbability = clamp(0.2 + densityScore * 0.12 + (syncPoint ? 0.14 : 0), 0.24, 0.7);
    const shouldPlayBass = onEighth || random() < bassProbability;

    if (shouldPlayBass) {
      const degreeBase =
        metrics.headings * 2 +
        (metrics.links % 16) +
        (metrics.images % 12) +
        (metrics.maxDepth % 12) +
        step +
        Math.floor(random() * scale.intervals.length);
      const octaveLift = syncPoint && random() < 0.35 ? 12 : 0;
      const octaveDrop = step % 16 === 12 && metrics.maxDepth > 10 ? -12 : 0;
      const note = wrapIntoRange(
        rootMidi + wrapDegree(scale.intervals, degreeBase) + octaveLift + octaveDrop,
        28,
        60
      );
      const durationSteps = onQuarter ? 3 : 2;
      const velocity = onQuarter ? 0.92 : 0.65 + random() * 0.2;

      bassPattern.push({
        step,
        note,
        durationSteps,
        velocity: Number(velocity.toFixed(3))
      });
    }

    if (
      onQuarter ||
      step % 16 === 14 ||
      (step % 8 === 6 && random() < 0.42) ||
      (step % 8 === 2 && densityScore > 2.2 && random() < 0.32)
    ) {
      kickPattern.push(step);
    }

    if (step % 4 === 2 || random() < clamp(0.07 + densityScore * 0.04, 0.08, 0.24)) {
      hatPattern.push({
        step,
        open: step % 8 === 7 && random() < 0.25,
        velocity: Number((0.28 + random() * 0.24).toFixed(3))
      });
    }
  }

  for (let chordIndex = 0; chordIndex < 4; chordIndex += 1) {
    const degreeSeed = anchorDegrees[(chordIndex + chordRotation) % anchorDegrees.length];
    const chordNotes = [0, 2, 4].map((offset) => {
      return wrapIntoRange(
        rootMidi + 12 + wrapDegree(scale.intervals, degreeSeed + offset),
        40,
        76
      );
    });

    padPattern.push({
      step: chordIndex * 8,
      durationSteps: 8,
      notes: chordNotes,
      velocity: Number((0.12 + random() * 0.08).toFixed(3))
    });
  }

  const activity = bassPattern.length + hatPattern.length + kickPattern.length;
  const densityLabel = densityProfile
    ? densityProfile.label
    : activity < 38
      ? "Sparse"
      : activity < 52
        ? "Steady"
        : activity < 64
          ? "Busy"
          : "Dense";
  const rootNote = NOTE_NAMES[rootIndex];
  const theoryKeyLabel = `${rootNote} ${scale.name}`;
  const keyLabel = getFriendlyKeyLabel(rootNote, scale.name);

  return {
    seed,
    tempo,
    steps: loopSteps,
    stepDurationBeats,
    bassPattern,
    kickPattern,
    hatPattern,
    padPattern,
    appliedSettings: settings,
    summary: {
      title: metrics.title || metrics.hostname || "Untitled page",
      hostname: metrics.hostname || "local",
      tempo,
      tempoFeel: getTempoFeelLabel(tempo),
      key: keyLabel,
      rootNote,
      theoryKey: theoryKeyLabel,
      mode: scale.name,
      density: densityLabel,
      mood: scale.mood,
      seed: seed.toString(16).padStart(8, "0")
    }
  };
}
