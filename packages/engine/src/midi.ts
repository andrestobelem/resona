import type { NoteIR, PositionIR } from "./model.js";
import { deepFreeze } from "./deep-freeze.js";
import { duration, fractionFromIR } from "./time/rational.js";
import { compareFractions, fraction } from "./time/rational.js";

type MidiMessageBase = Readonly<{
  at: PositionIR;
  channel?: number;
  note: number;
}>;

export type MidiMessage =
  | (MidiMessageBase & Readonly<{ type: "note-on"; velocity: number }>)
  | (MidiMessageBase & Readonly<{ type: "note-off"; velocity?: number }>);

type ActiveNote = Readonly<{
  at: PositionIR;
  note: number;
  velocity: number;
  outputIndex: number;
}>;

const validateInteger = (value: number, name: string, minimum: number, maximum: number): void => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`MIDI ${name} must be an integer between ${minimum} and ${maximum}.`);
  }
};

const subtractPositions = (start: PositionIR, end: PositionIR) => {
  if (start.type !== end.type) {
    throw new Error("MIDI note-on and note-off positions must use the same coordinate family.");
  }
  const startValue = fractionFromIR(
    start.type === "absolute-position" ? start.seconds : start.quarterNotes,
  );
  const endValue = fractionFromIR(
    end.type === "absolute-position" ? end.seconds : end.quarterNotes,
  );
  if (compareFractions(endValue, startValue) <= 0) {
    throw new Error("MIDI note-off must occur after note-on.");
  }
  const numerator =
    endValue.numerator * startValue.denominator - startValue.numerator * endValue.denominator;
  const denominator = endValue.denominator * startValue.denominator;
  const reduced = fraction(numerator, denominator);
  return start.type === "absolute-position"
    ? duration.seconds(reduced.numerator, reduced.denominator)
    : duration.quarterNotes(reduced.numerator, reduced.denominator);
};

const keyFor = (message: MidiMessage): string => `${message.channel ?? 0}:${message.note}`;

export const normalizeMidiMessages = (messages: readonly MidiMessage[]): readonly NoteIR[] => {
  const active = new Map<string, ActiveNote[]>();
  const notes: (NoteIR | undefined)[] = [];

  for (const message of messages) {
    validateInteger(message.note, "note", 0, 127);
    const channel = message.channel ?? 0;
    validateInteger(channel, "channel", 0, 15);
    if (message.velocity !== undefined) validateInteger(message.velocity, "velocity", 0, 127);

    const isNoteOn = message.type === "note-on" && message.velocity !== 0;
    const key = keyFor({ ...message, channel });
    const queued = active.get(key) ?? [];
    if (isNoteOn) {
      queued.push({
        at: message.at,
        note: message.note,
        velocity: message.velocity ?? 0,
        outputIndex: notes.length,
      });
      notes.push(undefined);
      active.set(key, queued);
      continue;
    }

    const started = queued.shift();
    if (started === undefined) throw new Error(`MIDI note-off has no matching note-on for ${key}.`);
    const normalized = {
      type: "note" as const,
      at: started.at,
      duration: subtractPositions(started.at, message.at),
      pitch: {
        type: "twelve-tet" as const,
        semitonesFromA4: started.note - 69,
      },
      velocity: started.velocity / 127,
    } satisfies NoteIR;
    notes[started.outputIndex] = deepFreeze(normalized);
    if (queued.length === 0) active.delete(key);
  }

  if (active.size > 0) {
    throw new Error("MIDI input contains an unclosed note-on message.");
  }
  return Object.freeze(notes.filter((note): note is NoteIR => note !== undefined));
};
