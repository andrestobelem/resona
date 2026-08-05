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
  </>
);

registerRoot(ExactProjectRoot);
