import { pitch as enginePitch } from "@resona/engine";

type PitchIR = ReturnType<typeof enginePitch.semitonesFromA4>;

const PITCH_CLASS: Readonly<Record<string, number>> = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11,
};

const NOTE_NAME_PATTERN = /^([A-G]#?)(-?\d+)$/;

/** Converts a scientific pitch name (e.g. "F#4") into semitones from A4 (MIDI 69). */
export const p = (name: string): PitchIR => {
  const match = NOTE_NAME_PATTERN.exec(name);
  if (match === null) {
    throw new Error(`Invalid pitch name: ${name}`);
  }
  const [, pitchClass, octave] = match as unknown as [string, string, string];
  const midi = (Number(octave) + 1) * 12 + PITCH_CLASS[pitchClass]!;
  return enginePitch.semitonesFromA4(midi - 69);
};
