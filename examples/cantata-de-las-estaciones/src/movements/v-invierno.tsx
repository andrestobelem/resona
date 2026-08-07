import { Sequence, type PositionIR } from "@resona/engine";

import { choirFromHarmony, type HarmonySteps } from "../lib/chords.js";
import { ChoirVoiceTrack } from "../lib/instruments.js";
import { atBar, bars } from "../lib/time.js";
import { MASTER_GAIN } from "../lib/mix.js";

export const INVIERNO_BARS = 8;

/**
 * V. Coro a media voz - "Invierno"
 *
 * Todo calla, todo duerme bajo un manto blanco y frío;
 * pero dentro, el alma enferme, guarda un fuego que es del río.
 * No hay silencio que sea eterno, no hay frío que no se rinda;
 * en lo hondo de este invierno ya germina lo que brinda.
 *
 * Unaccompanied and hushed: no orchestra, and every voice sings at a fraction
 * of its usual gain ("a media voz").
 */
const HARMONY: HarmonySteps = [
  ["Bm", 4],
  ["G", 4],
  ["A", 4],
  ["Bm", 4],
  ["Em", 4],
  ["F#m", 4],
  ["A", 4],
  ["Bm", 4],
];

const HUSHED_GAIN = 0.4 * MASTER_GAIN;

export const Invierno = ({ from = atBar(0) }: { from?: PositionIR } = {}) => {
  const choir = choirFromHarmony(HARMONY, 0.6);
  return (
    <Sequence id="v-invierno" from={from} duration={bars(INVIERNO_BARS)}>
      <ChoirVoiceTrack id="soprano" notes={choir.soprano} gain={HUSHED_GAIN} />
      <ChoirVoiceTrack id="alto" notes={choir.alto} gain={HUSHED_GAIN} />
      <ChoirVoiceTrack id="tenor" notes={choir.tenor} gain={HUSHED_GAIN} />
      <ChoirVoiceTrack id="bajo" notes={choir.bajo} gain={HUSHED_GAIN} />
    </Sequence>
  );
};
