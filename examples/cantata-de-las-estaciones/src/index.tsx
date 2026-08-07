import { Composition, position, rational, registerRoot, Sequence } from "@resona/engine";

import { atBar, bars } from "./lib/time.js";
import { Obertura } from "./movements/i-obertura.js";
import { Primavera } from "./movements/ii-primavera.js";
import { Verano } from "./movements/iii-verano.js";
import { Otono } from "./movements/iv-otono.js";
import { Invierno } from "./movements/v-invierno.js";
import { Final } from "./movements/vi-final.js";

const TOTAL_BARS = 60;

const CantataComponent = () => (
  <Sequence id="root" from={position.seconds(0n)}>
    <Obertura from={atBar(0)} />
    <Primavera from={atBar(8)} />
    <Verano from={atBar(20)} />
    <Otono from={atBar(30)} />
    <Invierno from={atBar(40)} />
    <Final from={atBar(48)} />
  </Sequence>
);

const CantataRoot = () => (
  <Composition
    id="CantataDeLasEstaciones"
    component={CantataComponent}
    duration={bars(TOTAL_BARS)}
    bpm={rational(92n)}
    timeSignature={{ beatsPerBar: 4, beatUnit: 4 }}
    metadata={{
      title: "Cantata de las Estaciones",
      language: "es",
      movements: [
        "I. Obertura",
        "II. Coro - Despertar de primavera",
        "III. Aria (soprano) - Bajo el sol del estío",
        "IV. Coro - Otoño dorado",
        "V. Coro a media voz - Invierno",
        "VI. Coro final - El círculo eterno",
      ],
    }}
  />
);

registerRoot(CantataRoot);
