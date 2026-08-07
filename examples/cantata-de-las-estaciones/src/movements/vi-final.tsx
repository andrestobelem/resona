import { note, Sequence, type NoteIR, type PositionIR } from "@resona/engine";

import {
  choirFromHarmony,
  continuoFromHarmony,
  padFromHarmony,
  type HarmonySteps,
} from "../lib/chords.js";
import { ChoirVoiceTrack, ContinuoTrack, MotifTrack, StringsTrack } from "../lib/instruments.js";
import { at, atBar, bars, beats } from "../lib/time.js";
import { MASTER_GAIN } from "../lib/mix.js";
import { p } from "../lib/pitch.js";
import { motifNotes } from "./i-obertura.js";

export const FINAL_BARS = 12;

/**
 * VI. Coro final - "El círculo eterno" (reprises the estribillo of Primavera)
 *
 * ¡Primavera, primavera, que el mundo vuelve a nacer!
 * Todo muere, todo empieza, nada se pierde de veras;
 * la vida es una promesa que gira como en primavera.
 * ¡Gloria al tiempo que renueva, gloria al ciclo que no cesa!
 * Cada estación es la prueba de que la vida no cesa.
 */
const HARMONY: HarmonySteps = [
  // Bars 1-4: the Primavera estribillo returns (IV - I - V - I).
  ["G", 4],
  ["D", 4],
  ["A", 4],
  ["D", 4],
  // Bars 5-8: coda build-up.
  ["D", 4],
  ["Bm", 4],
  ["G", 4],
  ["A", 4],
  // Bars 9-12: final cadence.
  ["D", 4],
  ["G", 4],
  ["A", 4],
  ["D", 4],
];

type MelodyStep = readonly [beat: number, lengthBeats: number, pitchName: string];

// A closing ascending flourish over the final four bars, capped by a sustained high tonic.
const CODA: readonly MelodyStep[] = [
  [32, 1, "D5"],
  [33, 1, "E5"],
  [34, 1, "F#5"],
  [35, 1, "G5"],
  [36, 1, "A5"],
  [37, 1, "B5"],
  [38, 1, "C#6"],
  [39, 1, "D6"],
  [40, 4, "D6"],
  [44, 4, "D6"],
];

const closingMotifNotes = (velocity = 0.85): readonly NoteIR[] => [
  // The Obertura's "Primavera" motif returns note-for-note over the new harmony.
  ...motifNotes(velocity),
  ...CODA.map(([beat, length, pitchName]) =>
    note({ at: at(beat), duration: beats(length), pitch: p(pitchName), velocity }),
  ),
];

export const Final = ({ from = atBar(0) }: { from?: PositionIR } = {}) => {
  const choir = choirFromHarmony(HARMONY, 0.88);
  return (
    <Sequence id="vi-final" from={from} duration={bars(FINAL_BARS)}>
      <ChoirVoiceTrack id="soprano" notes={choir.soprano} gain={MASTER_GAIN} />
      <ChoirVoiceTrack id="alto" notes={choir.alto} gain={MASTER_GAIN} />
      <ChoirVoiceTrack id="tenor" notes={choir.tenor} gain={MASTER_GAIN} />
      <ChoirVoiceTrack id="bajo" notes={choir.bajo} gain={MASTER_GAIN} />
      <StringsTrack notes={padFromHarmony(HARMONY, 0.3)} gain={MASTER_GAIN} />
      <ContinuoTrack notes={continuoFromHarmony(HARMONY, 0.6)} gain={MASTER_GAIN} />
      <MotifTrack notes={closingMotifNotes(0.8)} gain={MASTER_GAIN} />
    </Sequence>
  );
};
