import { chain, duration, EventClip, PolySynth, Track, type NoteIR } from "@resona/engine";

import { at } from "./time.js";

type EffectChain = ReturnType<typeof chain>;
type VoiceTrackProps = Readonly<{
  id: string;
  notes: readonly NoteIR[];
  gain?: number;
  effects?: EffectChain;
}>;
type OrchestralTrackProps = Readonly<{
  id?: string;
  notes: readonly NoteIR[];
  gain?: number;
  effects?: EffectChain;
}>;

const trackProps = (gain: number | undefined, effects: EffectChain | undefined) => {
  if (effects !== undefined) return { effects };
  return gain === undefined ? {} : { gain };
};

/** A choral voice: a pure, breathy tone close to a hummed/sung line. */
export const ChoirVoiceTrack = ({ id, notes, gain, effects }: VoiceTrackProps) => (
  <Track
    id={id}
    source={<EventClip id={`${id}-notes`} from={at(0)} events={notes} />}
    instrument={
      <PolySynth
        id={`${id}-synth`}
        oscillator="sine"
        attack={duration.seconds(3n, 25n)}
        decay={duration.seconds(3n, 20n)}
        sustain={0.85}
        release={duration.seconds(7n, 20n)}
      />
    }
    {...trackProps(gain, effects)}
  />
);

/** A sustained orchestral pad: slow-bowed strings holding the harmony. */
export const StringsTrack = ({ id = "cuerdas", notes, gain, effects }: OrchestralTrackProps) => (
  <Track
    id={id}
    source={<EventClip id={`${id}-notes`} from={at(0)} events={notes} />}
    instrument={
      <PolySynth
        id={`${id}-synth`}
        oscillator="saw"
        attack={duration.seconds(2n, 5n)}
        decay={duration.seconds(1n, 5n)}
        sustain={0.9}
        release={duration.seconds(3n, 5n)}
      />
    }
    {...trackProps(gain, effects)}
  />
);

/** The harmonic foundation: a plucked/organ-pedal bass line. */
export const ContinuoTrack = ({ id = "continuo", notes, gain, effects }: OrchestralTrackProps) => (
  <Track
    id={id}
    source={<EventClip id={`${id}-notes`} from={at(0)} events={notes} />}
    instrument={
      <PolySynth
        id={`${id}-synth`}
        oscillator="square"
        attack={duration.seconds(1n, 50n)}
        decay={duration.seconds(1n, 10n)}
        sustain={0.9}
        release={duration.seconds(1n, 4n)}
      />
    }
    {...trackProps(gain, effects)}
  />
);

/** The recurring "Primavera" motif and other agile melodic figuration. */
export const MotifTrack = ({ id = "motivo", notes, gain, effects }: OrchestralTrackProps) => (
  <Track
    id={id}
    source={<EventClip id={`${id}-notes`} from={at(0)} events={notes} />}
    instrument={
      <PolySynth
        id={`${id}-synth`}
        oscillator="sine"
        attack={duration.seconds(1n, 50n)}
        decay={duration.seconds(2n, 25n)}
        sustain={0.7}
        release={duration.seconds(3n, 20n)}
      />
    }
    {...trackProps(gain, effects)}
  />
);
