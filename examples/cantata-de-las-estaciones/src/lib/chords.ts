import { note, type NoteIR } from "@resona/engine";

import { p } from "./pitch.js";
import { at, beats } from "./time.js";

/**
 * Every chord used across the cantata. D-D#/E-family movements (I, II, V, VI) and
 * G-major-family movements (III, IV) share a key signature, so most triads are reused
 * across movements; only Am and C are added for the G-major/E-minor material.
 */
export type ChordName = "D" | "Em" | "F#m" | "G" | "A" | "Bm" | "Am" | "C";

type SatbVoicing = Readonly<{ bass: string; tenor: string; alto: string; soprano: string }>;

const CHORD_TONES: Readonly<Record<ChordName, SatbVoicing>> = {
  D: { bass: "D3", tenor: "A3", alto: "D4", soprano: "F#4" },
  Em: { bass: "E3", tenor: "B3", alto: "E4", soprano: "G4" },
  "F#m": { bass: "F#3", tenor: "C#4", alto: "F#4", soprano: "A4" },
  G: { bass: "G3", tenor: "D4", alto: "G4", soprano: "B4" },
  A: { bass: "A3", tenor: "E4", alto: "A4", soprano: "C#5" },
  Bm: { bass: "B3", tenor: "D4", alto: "F#4", soprano: "B4" },
  Am: { bass: "A3", tenor: "E4", alto: "A4", soprano: "C5" },
  C: { bass: "C3", tenor: "G3", alto: "C4", soprano: "E4" },
};

const CONTINUO_BASS: Readonly<Record<ChordName, string>> = {
  D: "D2",
  Em: "E2",
  "F#m": "F#2",
  G: "G2",
  A: "A2",
  Bm: "B2",
  Am: "A2",
  C: "C2",
};

/** A harmonic rhythm: a chord held for a number of beats (quarter notes), in sequence. */
export type HarmonySteps = readonly (readonly [chord: ChordName, lengthBeats: number])[];

export const totalBeatsOf = (steps: HarmonySteps): number =>
  steps.reduce((sum, [, length]) => sum + length, 0);

export type ChoirVoices = Readonly<{
  soprano: readonly NoteIR[];
  alto: readonly NoteIR[];
  tenor: readonly NoteIR[];
  bajo: readonly NoteIR[];
}>;

/** Expands a harmony progression into four independent SATB lines of block chords. */
export const choirFromHarmony = (steps: HarmonySteps, velocity = 0.75): ChoirVoices => {
  const soprano: NoteIR[] = [];
  const alto: NoteIR[] = [];
  const tenor: NoteIR[] = [];
  const bajo: NoteIR[] = [];
  let cursor = 0;
  for (const [chord, length] of steps) {
    const voicing = CHORD_TONES[chord];
    soprano.push(
      note({ at: at(cursor), duration: beats(length), pitch: p(voicing.soprano), velocity }),
    );
    alto.push(note({ at: at(cursor), duration: beats(length), pitch: p(voicing.alto), velocity }));
    tenor.push(
      note({ at: at(cursor), duration: beats(length), pitch: p(voicing.tenor), velocity }),
    );
    bajo.push(note({ at: at(cursor), duration: beats(length), pitch: p(voicing.bass), velocity }));
    cursor += length;
  }
  return { soprano, alto, tenor, bajo };
};

/** A sustained orchestral triad (tenor/alto/soprano tones) played polyphonically by one PolySynth. */
export const padFromHarmony = (steps: HarmonySteps, velocity = 0.3): readonly NoteIR[] => {
  const notes: NoteIR[] = [];
  let cursor = 0;
  for (const [chord, length] of steps) {
    const voicing = CHORD_TONES[chord];
    for (const voiceName of [voicing.tenor, voicing.alto, voicing.soprano]) {
      notes.push(note({ at: at(cursor), duration: beats(length), pitch: p(voiceName), velocity }));
    }
    cursor += length;
  }
  return notes;
};

/** A single-line bass/continuo part, one octave below the choir's bajo. */
export const continuoFromHarmony = (steps: HarmonySteps, velocity = 0.6): readonly NoteIR[] => {
  const notes: NoteIR[] = [];
  let cursor = 0;
  for (const [chord, length] of steps) {
    notes.push(
      note({ at: at(cursor), duration: beats(length), pitch: p(CONTINUO_BASS[chord]), velocity }),
    );
    cursor += length;
  }
  return notes;
};

const ARPEGGIO_PATTERN = ["tenor", "alto", "soprano", "alto"] as const;

/** A flowing broken-chord figuration, cycling tenor-alto-soprano-alto within each chord. */
export const arpeggioFromHarmony = (
  steps: HarmonySteps,
  noteLength = 0.5,
  velocity = 0.3,
): readonly NoteIR[] => {
  const notes: NoteIR[] = [];
  let cursor = 0;
  for (const [chord, length] of steps) {
    const voicing = CHORD_TONES[chord];
    let offset = 0;
    let patternIndex = 0;
    while (offset < length) {
      const step = Math.min(noteLength, length - offset);
      const voiceName = voicing[ARPEGGIO_PATTERN[patternIndex % ARPEGGIO_PATTERN.length]!];
      notes.push(
        note({ at: at(cursor + offset), duration: beats(step), pitch: p(voiceName), velocity }),
      );
      offset += noteLength;
      patternIndex += 1;
    }
    cursor += length;
  }
  return notes;
};
