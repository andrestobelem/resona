import { duration, position, type DurationIR, type PositionIR } from "@resona/engine";

/**
 * Beats are expressed as plain numbers of quarter notes (e.g. 1.5 = a dotted eighth)
 * on a sixteenth-note grid, then converted to exact quarter-note fractions.
 */
const toSixteenths = (beats: number): bigint => {
  const sixteenths = Math.round(beats * 4);
  if (Math.abs(sixteenths - beats * 4) > 1e-6) {
    throw new Error(`Beat value ${beats} does not align to a sixteenth-note grid.`);
  }
  return BigInt(sixteenths);
};

export const at = (beats: number): PositionIR => position.quarterNotes(toSixteenths(beats), 4n);

export const beats = (beats: number): DurationIR => duration.quarterNotes(toSixteenths(beats), 4n);

export const bars = (barCount: number): DurationIR => beats(barCount * 4);

export const atBar = (barCount: number): PositionIR => at(barCount * 4);
