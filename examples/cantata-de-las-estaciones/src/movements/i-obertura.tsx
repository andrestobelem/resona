import { chain, duration, note, Sequence, type NoteIR, type PositionIR } from "@resona/engine";

import { continuoFromHarmony, padFromHarmony, type HarmonySteps } from "../lib/chords.js";
import { ContinuoTrack, MotifTrack, StringsTrack } from "../lib/instruments.js";
import { at, atBar, bars, beats } from "../lib/time.js";
import { MASTER_GAIN } from "../lib/mix.js";
import { p } from "../lib/pitch.js";

export const OBERTURA_BARS = 8;

// I - V - vi - IV - I - ii - V - I, one bar per chord.
const HARMONY: HarmonySteps = [
  ["D", 4],
  ["A", 4],
  ["Bm", 4],
  ["G", 4],
  ["D", 4],
  ["Em", 4],
  ["A", 4],
  ["D", 4],
];

type MotifStep = readonly [beat: number, lengthBeats: number, pitchName: string];

// The recurring "Primavera" motif, restated and varied across the four phrases; it
// returns in the finale (movement VI) to close the cantata's circle.
const MOTIF: readonly MotifStep[] = [
  [0, 1, "D5"],
  [1, 1, "F#5"],
  [2, 1, "A5"],
  [3, 1, "D6"],
  [4, 1, "C#6"],
  [5, 1, "B5"],
  [6, 2, "A5"],
  [8, 1, "B4"],
  [9, 1, "D5"],
  [10, 1, "F#5"],
  [11, 1, "B5"],
  [12, 1, "A5"],
  [13, 1, "G5"],
  [14, 2, "F#5"],
  [16, 1, "D5"],
  [17, 1, "F#5"],
  [18, 1, "A5"],
  [19, 1, "D6"],
  [20, 1, "B5"],
  [21, 1, "G5"],
  [22, 2, "E5"],
  [24, 1, "E5"],
  [25, 1, "F#5"],
  [26, 1, "G5"],
  [27, 1, "A5"],
  [28, 1, "B5"],
  [29, 1, "A5"],
  [30, 2, "D5"],
];

const motifPath = ["CantataDeLasEstaciones", "root", "i-obertura", "motivo"] as const;
const motifEffects = chain(
  {
    type: "gain",
    id: "motivo-gain",
    path: [...motifPath, "motivo-gain"],
    gain: MASTER_GAIN,
  },
  {
    type: "delay",
    id: "motivo-delay",
    path: [...motifPath, "motivo-delay"],
    time: duration.seconds(1n, 4n),
    feedback: 0.2,
    mix: 0.18,
  },
);

export const motifNotes = (velocity = 0.8): readonly NoteIR[] =>
  MOTIF.map(([beat, length, pitchName]) =>
    note({ at: at(beat), duration: beats(length), pitch: p(pitchName), velocity }),
  );

export const Obertura = ({ from = atBar(0) }: { from?: PositionIR } = {}) => (
  <Sequence id="i-obertura" from={from} duration={bars(OBERTURA_BARS)}>
    <StringsTrack notes={padFromHarmony(HARMONY, 0.22)} gain={MASTER_GAIN} />
    <ContinuoTrack notes={continuoFromHarmony(HARMONY, 0.55)} gain={MASTER_GAIN} />
    <MotifTrack notes={motifNotes(0.75)} effects={motifEffects} />
  </Sequence>
);
