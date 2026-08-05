import { Composition, Sequence, duration, position, rational, registerRoot } from "../../index.js";

const ConfiguredComposition = () => <Sequence id="root" from={position.seconds(0n)} />;

const ConfiguredRoot = () => (
  <Composition
    id="Configured"
    component={ConfiguredComposition}
    duration={duration.seconds(1n)}
    bpm={rational(120n)}
    timeSignature={{ beatsPerBar: 4, beatUnit: 4 }}
  />
);

registerRoot(ConfiguredRoot);
