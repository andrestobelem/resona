import {
  Composition,
  EventClip,
  PolySynth,
  Sequence,
  Track,
  duration,
  note,
  pitch,
  position,
  rational,
  registerRoot,
  type InputSchema,
} from "../../index.js";

const beyondSafeInteger = 9_007_199_254_740_993n;

const evaluationCountKey = Symbol.for("resona.test.exact-note-evaluation-count");
const evaluationCountHost = globalThis as typeof globalThis & Record<symbol, number | undefined>;

const ExactNote = () => {
  const evaluationCount = (evaluationCountHost[evaluationCountKey] ?? 0) + 1;
  evaluationCountHost[evaluationCountKey] = evaluationCount;

  return (
    <Sequence id="root" from={position.seconds(0n)}>
      <Sequence
        id="section"
        from={position.quarterNotes(beyondSafeInteger - 1n, beyondSafeInteger)}
      >
        <Sequence id="phrase" from={position.quarterNotes(1n, beyondSafeInteger)}>
          <Track
            id="lead"
            source={
              <EventClip
                id="note-clip"
                from={position.seconds(1n, 96_000n)}
                events={[
                  note({
                    at: position.seconds(0n),
                    duration: duration.seconds(1n, 48_000n),
                    pitch: pitch.semitonesFromA4(evaluationCount - 1),
                  }),
                ]}
              />
            }
            instrument={<PolySynth id="synth" oscillator="sine" />}
          />
        </Sequence>
      </Sequence>
    </Sequence>
  );
};

const InvalidOffscreenNote = () => (
  <Sequence id="root" from={position.seconds(0n)}>
    <Track
      id="lead"
      source={
        <EventClip
          id="invalid-clip"
          from={position.seconds(2n)}
          events={[
            note({
              at: position.seconds(0n),
              duration: duration.seconds(0n),
              pitch: pitch.semitonesFromA4(0),
            }),
          ]}
        />
      }
      instrument={<PolySynth id="synth" oscillator="sine" />}
    />
  </Sequence>
);

const InvalidOffscreenValues = () => (
  <Sequence id="root" from={position.seconds(0n)}>
    <Track
      id="lead"
      source={
        <EventClip
          id="invalid-values"
          from={position.seconds(2n)}
          events={[
            note({
              at: position.seconds(0n),
              duration: duration.seconds(1n, 48_000n),
              pitch: pitch.semitonesFromA4(70),
            }),
            note({
              at: position.seconds(0n),
              duration: duration.seconds(1n, 48_000n),
              pitch: pitch.semitonesFromA4(0),
              velocity: 2,
            }),
            note({
              at: position.seconds(9_007_199_254_740_992n),
              duration: duration.seconds(1n, 48_000n),
              pitch: pitch.semitonesFromA4(0),
            }),
          ]}
        />
      }
      instrument={<PolySynth id="synth" oscillator="sine" />}
    />
  </Sequence>
);

const InvalidSynth = () => (
  <Sequence id="root" from={position.seconds(0n)}>
    <Track
      id="lead"
      source={<EventClip id="notes" from={position.seconds(0n)} events={[]} />}
      instrument={<PolySynth id="synth" oscillator="sine" maxVoices={0} sustain={Number.NaN} />}
    />
  </Sequence>
);

const RoundedAwayNote = () => (
  <Sequence id="root" from={position.seconds(0n)}>
    <Track
      id="lead"
      source={
        <EventClip
          id="short-note"
          from={position.seconds(0n)}
          events={[
            note({
              at: position.seconds(0n),
              duration: duration.seconds(1n, 96_000n),
              pitch: pitch.semitonesFromA4(0),
            }),
          ]}
        />
      }
      instrument={<PolySynth id="synth" oscillator="sine" />}
    />
  </Sequence>
);

type VariantInputs = {
  intensity: number;
  voice: { semitonesFromA4: number };
};

const inputVariantSchema: InputSchema<VariantInputs> = {
  ir: {
    format: "resona/input-schema",
    schemaVersion: 1,
    jsonSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        intensity: { type: "number", minimum: 0, maximum: 1 },
        voice: {
          type: "object",
          properties: { semitonesFromA4: { type: "integer" } },
          required: ["semitonesFromA4"],
          additionalProperties: false,
        },
      },
      required: ["intensity", "voice"],
      additionalProperties: false,
    },
  },
  validate: (value) => {
    if (
      value !== null &&
      typeof value === "object" &&
      "intensity" in value &&
      typeof value.intensity === "number" &&
      value.intensity >= 0 &&
      value.intensity <= 1 &&
      "voice" in value &&
      value.voice !== null &&
      typeof value.voice === "object" &&
      "semitonesFromA4" in value.voice &&
      Number.isSafeInteger(value.voice.semitonesFromA4)
    ) {
      return { success: true };
    }
    return {
      success: false,
      issues: [{ code: "invalid-input", path: [], message: "Invalid variant inputs." }],
    };
  },
};

const InputVariant = ({ intensity, voice }: VariantInputs) => {
  if (!Object.isFrozen(voice)) {
    throw new Error("Composition inputs must be deeply frozen before authoring evaluation.");
  }
  return (
    <Sequence id="root" from={position.seconds(0n)}>
      <Track
        id="lead"
        source={
          <EventClip
            id="notes"
            from={position.seconds(0n)}
            events={[
              note({
                at: position.seconds(0n),
                duration: duration.seconds(1n),
                pitch: pitch.semitonesFromA4(voice.semitonesFromA4),
                velocity: intensity,
              }),
            ]}
          />
        }
        instrument={
          <PolySynth
            id="synth"
            oscillator="sine"
            attack={duration.seconds(0n)}
            decay={duration.seconds(0n)}
            sustain={1}
            release={duration.seconds(0n)}
          />
        }
      />
    </Sequence>
  );
};

export const ExactProjectRoot = () => (
  <>
    <Composition
      id="ExactNote"
      component={ExactNote}
      duration={duration.seconds(1n)}
      bpm={rational(120n)}
      timeSignature={{ beatsPerBar: 4, beatUnit: 4 }}
      metadata={{ title: "Exact note" }}
    />
    <Composition
      id="InvalidOffscreenNote"
      component={InvalidOffscreenNote}
      duration={duration.seconds(1n)}
      bpm={rational(120n)}
      timeSignature={{ beatsPerBar: 4, beatUnit: 4 }}
    />
    <Composition
      id="InvalidOffscreenValues"
      component={InvalidOffscreenValues}
      duration={duration.seconds(1n)}
      bpm={rational(120n)}
      timeSignature={{ beatsPerBar: 4, beatUnit: 4 }}
    />
    <Composition
      id="InvalidSynth"
      component={InvalidSynth}
      duration={duration.seconds(1n)}
      bpm={rational(120n)}
      timeSignature={{ beatsPerBar: 4, beatUnit: 4 }}
    />
    <Composition
      id="RoundedAwayNote"
      component={RoundedAwayNote}
      duration={duration.seconds(1n)}
      bpm={rational(120n)}
      timeSignature={{ beatsPerBar: 4, beatUnit: 4 }}
    />
    <Composition
      id="InputVariant"
      component={InputVariant}
      schema={inputVariantSchema}
      defaultInputs={{ intensity: 0.25, voice: { semitonesFromA4: 0 } }}
      duration={duration.seconds(1n)}
      bpm={rational(120n)}
      timeSignature={{ beatsPerBar: 4, beatUnit: 4 }}
    />
  </>
);

registerRoot(ExactProjectRoot);
