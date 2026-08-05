import {
  Composition,
  Sequence,
  duration,
  position,
  rational,
  registerRoot,
  type PrepareComposition,
} from "../../index.js";

const ConfiguredComposition = () => <Sequence id="root" from={position.seconds(0n)} />;

const MustNotEvaluate = () => {
  throw new Error("Authoring ran after invalid preparation.");
};

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
  </>
);

registerRoot(ConfiguredRoot);
