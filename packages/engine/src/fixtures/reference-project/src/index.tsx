import {
  Composition,
  AudioClip,
  EventClip,
  PolySynth,
  Sequence,
  Track,
  chain,
  duration,
  normalizeMidiMessages,
  position,
  rational,
  registerRoot,
  staticAudio,
  type InputSchema,
  type PrepareComposition,
} from "../../../index.js";

type ReferenceInputs = Readonly<{ mix: number }>;

const inputSchema: InputSchema<ReferenceInputs> = Object.freeze({
  ir: Object.freeze({
    format: "resona/input-schema" as const,
    schemaVersion: 1 as const,
    jsonSchema: Object.freeze({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      properties: {
        mix: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["mix"],
    }),
  }),
  validate(value: unknown) {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !Object.keys(value).every((key) => key === "mix")
    ) {
      return { success: false as const, issues: [] };
    }
    const candidate = value as Record<string, unknown>;
    return typeof candidate.mix === "number" &&
      Number.isFinite(candidate.mix) &&
      candidate.mix >= 0 &&
      candidate.mix <= 1
      ? { success: true as const }
      : {
          success: false as const,
          issues: [{ code: "mix.range", path: ["mix"], message: "mix must be between 0 and 1." }],
        };
  },
});

const midiEvents = normalizeMidiMessages([
  { type: "note-on", note: 60, velocity: 100, at: position.quarterNotes(0n) },
  { type: "note-on", note: 64, velocity: 80, at: position.quarterNotes(1n, 2n) },
  { type: "note-off", note: 60, at: position.quarterNotes(1n) },
  { type: "note-on", note: 64, velocity: 0, at: position.quarterNotes(3n, 2n) },
]);

const leadPath = ["Reference", "root", "lead"] as const;
const gainPath = [...leadPath, "gain"] as const;
const delayPath = [...leadPath, "delay"] as const;

const prepareReference: PrepareComposition<ReferenceInputs> = async ({ resources }) => {
  await resources.audio(staticAudio("reference.wav"));
  return {};
};

const ReferenceComposition = ({ mix }: ReferenceInputs) => (
  <Sequence id="root" from={position.seconds(0n)}>
    <Track
      id="audio"
      source={
        <AudioClip
          id="reference-clip"
          src={staticAudio("reference.wav")}
          from={position.seconds(0n)}
          duration={duration.seconds(4n, 48_000n)}
        />
      }
    />
    <Track
      id="lead"
      source={<EventClip id="midi" from={position.seconds(0n)} events={midiEvents} />}
      instrument={
        <PolySynth
          id="synth"
          oscillator="sine"
          attack={duration.seconds(0n)}
          decay={duration.seconds(0n)}
          sustain={1}
          release={duration.seconds(1n, 10n)}
        />
      }
      effects={chain(
        { type: "gain", id: "gain", path: gainPath, gain: mix },
        {
          type: "delay",
          id: "delay",
          path: delayPath,
          time: duration.seconds(1n, 48_000n),
          feedback: 0.25,
          mix: 0.25,
        },
      )}
      automation={[
        {
          type: "automation-lane",
          id: "gain-automation",
          path: [...leadPath, "gain-automation"],
          target: { nodePath: gainPath, parameterId: "gain" },
          points: [
            { at: position.seconds(0n), value: mix, interpolation: "hold" },
            {
              at: position.quarterNotes(1n),
              value: Math.fround(mix * 0.75),
              interpolation: "linear",
            },
          ],
        },
      ]}
    />
  </Sequence>
);

const ReferenceRoot = () => (
  <Composition
    id="Reference"
    component={ReferenceComposition}
    schema={inputSchema}
    defaultInputs={{ mix: 0.5 }}
    prepare={prepareReference}
    duration={duration.seconds(2n)}
    bpm={rational(120n)}
    timeSignature={{ beatsPerBar: 4, beatUnit: 4 }}
    metadata={{ title: "Resona reference", source: "MIDI boundary adapter" }}
  />
);

registerRoot(ReferenceRoot);
