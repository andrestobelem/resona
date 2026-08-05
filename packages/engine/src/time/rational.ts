import type {
  AbsoluteDurationIR,
  AbsolutePositionIR,
  DurationIR,
  MusicalDurationIR,
  MusicalPositionIR,
  PositionIR,
  RationalIR,
} from "../model.js";

export type Fraction = Readonly<{
  numerator: bigint;
  denominator: bigint;
}>;

const greatestCommonDivisor = (left: bigint, right: bigint): bigint => {
  let currentLeft = left;
  let currentRight = right;

  while (currentRight !== 0n) {
    const remainder = currentLeft % currentRight;
    currentLeft = currentRight;
    currentRight = remainder;
  }

  return currentLeft;
};

export const fraction = (numerator: bigint, denominator = 1n): Fraction => {
  if (numerator < 0n) {
    throw new RangeError("The numerator must be non-negative.");
  }

  if (denominator <= 0n) {
    throw new RangeError("The denominator must be positive.");
  }

  if (numerator === 0n) {
    return Object.freeze({ numerator: 0n, denominator: 1n });
  }

  const divisor = greatestCommonDivisor(numerator, denominator);
  return Object.freeze({
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  });
};

export const rational = (numerator: bigint, denominator = 1n): RationalIR => {
  const reduced = fraction(numerator, denominator);
  return Object.freeze({
    numerator: reduced.numerator.toString(),
    denominator: reduced.denominator.toString(),
  });
};

export const position = Object.freeze({
  seconds: (numerator: bigint, denominator = 1n): AbsolutePositionIR =>
    Object.freeze({ type: "absolute-position", seconds: rational(numerator, denominator) }),
  quarterNotes: (numerator: bigint, denominator = 1n): MusicalPositionIR =>
    Object.freeze({
      type: "musical-position",
      quarterNotes: rational(numerator, denominator),
    }),
});

export const duration = Object.freeze({
  seconds: (numerator: bigint, denominator = 1n): AbsoluteDurationIR =>
    Object.freeze({ type: "absolute-duration", seconds: rational(numerator, denominator) }),
  quarterNotes: (numerator: bigint, denominator = 1n): MusicalDurationIR =>
    Object.freeze({
      type: "musical-duration",
      quarterNotes: rational(numerator, denominator),
    }),
});

export const fractionFromIR = (value: RationalIR): Fraction =>
  fraction(BigInt(value.numerator), BigInt(value.denominator));

export const addFractions = (left: Fraction, right: Fraction): Fraction =>
  fraction(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );

export const multiplyFractions = (left: Fraction, right: Fraction): Fraction =>
  fraction(left.numerator * right.numerator, left.denominator * right.denominator);

export const compareFractions = (left: Fraction, right: Fraction): number => {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
};

export const minimumFraction = (left: Fraction, right: Fraction): Fraction =>
  compareFractions(left, right) <= 0 ? left : right;

export const durationToSeconds = (value: DurationIR, bpm: Fraction): Fraction => {
  if (value.type === "absolute-duration") {
    return fractionFromIR(value.seconds);
  }

  return multiplyFractions(
    fractionFromIR(value.quarterNotes),
    fraction(60n * bpm.denominator, bpm.numerator),
  );
};

export const positionToSeconds = (value: PositionIR, bpm: Fraction): Fraction => {
  if (value.type === "absolute-position") {
    return fractionFromIR(value.seconds);
  }

  return multiplyFractions(
    fractionFromIR(value.quarterNotes),
    fraction(60n * bpm.denominator, bpm.numerator),
  );
};
