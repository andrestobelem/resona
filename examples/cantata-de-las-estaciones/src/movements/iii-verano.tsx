import { note, Sequence, type NoteIR, type PositionIR } from "@resona/engine";

import {
  arpeggioFromHarmony,
  continuoFromHarmony,
  padFromHarmony,
  type HarmonySteps,
} from "../lib/chords.js";
import { ChoirVoiceTrack, ContinuoTrack, MotifTrack, StringsTrack } from "../lib/instruments.js";
import { at, atBar, bars, beats } from "../lib/time.js";
import { MASTER_GAIN } from "../lib/mix.js";
import { p } from "../lib/pitch.js";

export const VERANO_BARS = 10;

/**
 * III. Aria (soprano solo) - "Bajo el sol del estío"
 *
 * Bajo el sol del estío el trigo se vuelve oro,
 * y en el silencio del río descansa todo el tesoro.
 * La tarde se hace más lenta, el aire se llena de miel,
 * el tiempo mismo se ausenta para vivir este vergel.
 */
const HARMONY: HarmonySteps = [
  ["G", 4],
  ["D", 4],
  ["Em", 4],
  ["C", 4],
  ["G", 4],
  ["Am", 4],
  ["D", 4],
  ["G", 4],
  ["C", 4],
  ["G", 4],
];

type MelodyStep = readonly [beat: number, lengthBeats: number, pitchName: string];

const SOPRANO_MELODY: readonly MelodyStep[] = [
  [0, 1, "D5"],
  [1, 1, "G5"],
  [2, 2, "B5"],
  [4, 1, "A5"],
  [5, 1, "F#5"],
  [6, 2, "D5"],
  [8, 1, "G5"],
  [9, 1, "E5"],
  [10, 2, "B4"],
  [12, 1, "C5"],
  [13, 1, "E5"],
  [14, 2, "G5"],
  [16, 1, "B5"],
  [17, 1, "G5"],
  [18, 2, "D5"],
  [20, 1, "C5"],
  [21, 1, "E5"],
  [22, 2, "A5"],
  [24, 1, "F#5"],
  [25, 1, "A5"],
  [26, 2, "D6"],
  [28, 1, "B5"],
  [29, 1, "G5"],
  [30, 2, "D5"],
  [32, 1, "C5"],
  [33, 1, "E5"],
  [34, 2, "G5"],
  [36, 1, "B4"],
  [37, 1, "D5"],
  [38, 2, "G4"],
];

const sopranoNotes = (velocity = 0.85): readonly NoteIR[] =>
  SOPRANO_MELODY.map(([beat, length, pitchName]) =>
    note({ at: at(beat), duration: beats(length), pitch: p(pitchName), velocity }),
  );

export const Verano = ({ from = atBar(0) }: { from?: PositionIR } = {}) => (
  <Sequence id="iii-verano" from={from} duration={bars(VERANO_BARS)}>
    <ChoirVoiceTrack id="soprano" notes={sopranoNotes(0.85)} gain={MASTER_GAIN} />
    <StringsTrack notes={padFromHarmony(HARMONY, 0.12)} gain={MASTER_GAIN} />
    <ContinuoTrack notes={continuoFromHarmony(HARMONY, 0.4)} gain={MASTER_GAIN} />
    <MotifTrack notes={arpeggioFromHarmony(HARMONY, 0.5, 0.22)} gain={MASTER_GAIN} />
  </Sequence>
);
