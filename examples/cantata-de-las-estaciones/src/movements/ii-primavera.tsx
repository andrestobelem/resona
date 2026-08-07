import { Sequence, type PositionIR } from "@resona/engine";

import {
  choirFromHarmony,
  continuoFromHarmony,
  padFromHarmony,
  type HarmonySteps,
} from "../lib/chords.js";
import { ChoirVoiceTrack, ContinuoTrack, StringsTrack } from "../lib/instruments.js";
import { atBar, bars } from "../lib/time.js";
import { MASTER_GAIN } from "../lib/mix.js";

export const PRIMAVERA_BARS = 12;

/**
 * II. Coro - "Despertar de primavera"
 *
 * Despierta, tierra dormida, la savia sube a cantar;
 * el sol enciende la vida y el aire aprende a volar.
 * Los brotes rompen la tierra, el río suelta su voz,
 * ya no hay invierno que aterra, todo florece veloz.
 *   ¡Primavera, primavera, que el mundo vuelve a nacer!
 *   Toda semilla que espera hoy se convierte en placer.
 */
const HARMONY: HarmonySteps = [
  // Verse: I - V - vi - iii - IV - I - V - I
  ["D", 4],
  ["A", 4],
  ["Bm", 4],
  ["F#m", 4],
  ["G", 4],
  ["D", 4],
  ["A", 4],
  ["D", 4],
  // Estribillo: IV - I - V - I
  ["G", 4],
  ["D", 4],
  ["A", 4],
  ["D", 4],
];

export const Primavera = ({ from = atBar(0) }: { from?: PositionIR } = {}) => {
  const choir = choirFromHarmony(HARMONY, 0.8);
  return (
    <Sequence id="ii-primavera" from={from} duration={bars(PRIMAVERA_BARS)}>
      <ChoirVoiceTrack id="soprano" notes={choir.soprano} gain={MASTER_GAIN} />
      <ChoirVoiceTrack id="alto" notes={choir.alto} gain={MASTER_GAIN} />
      <ChoirVoiceTrack id="tenor" notes={choir.tenor} gain={MASTER_GAIN} />
      <ChoirVoiceTrack id="bajo" notes={choir.bajo} gain={MASTER_GAIN} />
      <StringsTrack notes={padFromHarmony(HARMONY, 0.2)} gain={MASTER_GAIN} />
      <ContinuoTrack notes={continuoFromHarmony(HARMONY, 0.5)} gain={MASTER_GAIN} />
    </Sequence>
  );
};
