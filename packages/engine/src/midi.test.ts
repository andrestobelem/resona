import { describe, expect, it } from "vitest";

import { normalizeMidiMessages, type MidiMessage } from "./midi.js";
import { position } from "./time/rational.js";

describe("normalizeMidiMessages", () => {
  it("pairs edge MIDI messages into normalized interval notes", () => {
    const messages: readonly MidiMessage[] = [
      {
        type: "note-on",
        channel: 2,
        note: 60,
        velocity: 100,
        at: position.quarterNotes(0n),
      },
      {
        type: "note-on",
        channel: 2,
        note: 64,
        velocity: 80,
        at: position.quarterNotes(1n),
      },
      {
        type: "note-off",
        channel: 2,
        note: 60,
        velocity: 64,
        at: position.quarterNotes(1n),
      },
      {
        type: "note-on",
        channel: 2,
        note: 64,
        velocity: 0,
        at: position.quarterNotes(2n),
      },
    ];

    expect(normalizeMidiMessages(messages)).toEqual([
      {
        type: "note",
        at: position.quarterNotes(0n),
        duration: { type: "musical-duration", quarterNotes: { numerator: "1", denominator: "1" } },
        pitch: { type: "twelve-tet", semitonesFromA4: -9 },
        velocity: 100 / 127,
      },
      {
        type: "note",
        at: position.quarterNotes(1n),
        duration: { type: "musical-duration", quarterNotes: { numerator: "1", denominator: "1" } },
        pitch: { type: "twelve-tet", semitonesFromA4: -5 },
        velocity: 80 / 127,
      },
    ]);
    expect(Object.isFrozen(normalizeMidiMessages(messages))).toBe(true);
  });

  it.each([
    [
      "rejects an unmatched note-off",
      [{ type: "note-off", note: 60, at: position.quarterNotes(0n) }],
    ],
    [
      "rejects an unclosed note-on",
      [{ type: "note-on", note: 60, velocity: 100, at: position.quarterNotes(0n) }],
    ],
    [
      "rejects a MIDI note outside the wire range",
      [{ type: "note-on", note: 128, velocity: 100, at: position.quarterNotes(0n) }],
    ],
  ])("%s", (_name, messages) => {
    expect(() => normalizeMidiMessages(messages as MidiMessage[])).toThrow();
  });
});
