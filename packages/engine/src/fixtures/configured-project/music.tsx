import {
  Composition,
  AudioClip,
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
  staticAudio,
  useRandom,
  type PrepareComposition,
} from "../../index.js";

const ConfiguredComposition = () => <Sequence id="root" from={position.seconds(0n)} />;

const AudioClipComposition = () => (
  <Sequence id="root" from={position.seconds(0n)}>
    <Track
      id="audio"
      source={
        <AudioClip
          id="clip"
          src={staticAudio("tone.wav")}
          from={position.seconds(0n)}
          duration={duration.seconds(1n, 48_000n)}
        />
      }
    />
  </Sequence>
);

const MustNotEvaluate = () => {
  throw new Error("Authoring ran after invalid preparation.");
};

const SeededComposition = () => {
  const velocity = 0.25 + useRandom("velocity") * 0.5;
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
                pitch: pitch.semitonesFromA4(0),
                velocity,
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

const prepareResource: PrepareComposition<Record<string, never>> = async ({ resources }) => {
  await resources.audio({ type: "resona/static-audio", version: 1, path: "tone.wav" });
  await resources.audio({ type: "resona/static-audio", version: 1, path: "tone.wav" });
  return {};
};

const prepareUntilCancelled: PrepareComposition<Record<string, never>> = ({ signal }) =>
  new Promise((_, reject) => {
    signal.addEventListener(
      "abort",
      () => reject(new Error("Preparation observed cancellation.")),
      {
        once: true,
      },
    );
  });

const prepareConfigured: PrepareComposition<Record<string, never>> = async ({
  compositionId,
  inputs,
  signal,
  resources,
}) => {
  if (compositionId !== "Configured") throw new Error("Unexpected composition ID.");
  if (!Object.isFrozen(inputs)) throw new Error("Preparation inputs must be frozen.");
  if (!(signal instanceof AbortSignal)) throw new Error("Preparation requires cancellation.");
  if (typeof resources.audio !== "function") throw new Error("Preparation requires resources.");
  await Promise.resolve();
  return {
    duration: duration.seconds(2n),
    tempo: { bpm: rational(90n), timeSignature: { beatsPerBar: 3, beatUnit: 4 } },
    metadata: { title: "Prepared", nested: { source: "dynamic" } },
  };
};

const ConfiguredRoot = () => (
  <>
    <Composition
      id="Configured"
      component={ConfiguredComposition}
      prepare={prepareConfigured}
      duration={duration.seconds(1n)}
      bpm={rational(120n)}
      timeSignature={{ beatsPerBar: 4, beatUnit: 4 }}
      metadata={{ title: "Static", nested: { source: "static" }, retained: true }}
    />
    <Composition
      id="InvalidPreparation"
      component={MustNotEvaluate}
      prepare={() => ({ metadata: undefined }) as never}
      duration={duration.seconds(1n)}
      bpm={rational(120n)}
      timeSignature={{ beatsPerBar: 4, beatUnit: 4 }}
    />
    <Composition
      id="Seeded"
      component={SeededComposition}
      duration={duration.seconds(1n)}
      bpm={rational(120n)}
      timeSignature={{ beatsPerBar: 4, beatUnit: 4 }}
    />
    <Composition
      id="PreparedResource"
      component={ConfiguredComposition}
      prepare={prepareResource}
      duration={duration.seconds(1n)}
      bpm={rational(120n)}
      timeSignature={{ beatsPerBar: 4, beatUnit: 4 }}
    />
    <Composition
      id="AudioClip"
      component={AudioClipComposition}
      prepare={prepareResource}
      duration={duration.seconds(1n, 48_000n)}
      bpm={rational(120n)}
      timeSignature={{ beatsPerBar: 4, beatUnit: 4 }}
    />
    <Composition
      id="CancellablePreparation"
      component={MustNotEvaluate}
      prepare={prepareUntilCancelled}
      duration={duration.seconds(1n)}
      bpm={rational(120n)}
      timeSignature={{ beatsPerBar: 4, beatUnit: 4 }}
    />
  </>
);

registerRoot(ConfiguredRoot);
