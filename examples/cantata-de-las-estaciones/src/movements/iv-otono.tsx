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

export const OTONO_BARS = 10;

/**
 * IV. Coro - "Otoño dorado"
 *
 * Las hojas caen despacio, pintando de oro el camino;
 * el viento, lento y reacio, se lleva lo que fue trigo.
 * Gracias por todo lo dado, por el fruto y la cosecha;
 * el año ya está cansado y el frío se abre brecha.
 */
const HARMONY: HarmonySteps = [
  // i - VI - VII - i, then iv - v - VI - III - VII - i
  ["Em", 4],
  ["C", 4],
  ["D", 4],
  ["Em", 4],
  ["Am", 4],
  ["Bm", 4],
  ["C", 4],
  ["G", 4],
  ["D", 4],
  ["Em", 4],
];

export const Otono = ({ from = atBar(0) }: { from?: PositionIR } = {}) => {
  const choir = choirFromHarmony(HARMONY, 0.72);
  return (
    <Sequence id="iv-otono" from={from} duration={bars(OTONO_BARS)}>
      <ChoirVoiceTrack id="soprano" notes={choir.soprano} gain={MASTER_GAIN} />
      <ChoirVoiceTrack id="alto" notes={choir.alto} gain={MASTER_GAIN} />
      <ChoirVoiceTrack id="tenor" notes={choir.tenor} gain={MASTER_GAIN} />
      <ChoirVoiceTrack id="bajo" notes={choir.bajo} gain={MASTER_GAIN} />
      <StringsTrack notes={padFromHarmony(HARMONY, 0.18)} gain={MASTER_GAIN} />
      <ContinuoTrack notes={continuoFromHarmony(HARMONY, 0.48)} gain={MASTER_GAIN} />
    </Sequence>
  );
};
