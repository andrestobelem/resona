export const roundRationalToNearestEven = (numerator: bigint, denominator: bigint): bigint => {
  if (numerator < 0n) {
    throw new RangeError("The numerator must be non-negative.");
  }

  if (denominator <= 0n) {
    throw new RangeError("The denominator must be positive.");
  }

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const doubledRemainder = remainder * 2n;

  if (doubledRemainder < denominator) {
    return quotient;
  }

  if (doubledRemainder > denominator) {
    return quotient + 1n;
  }

  return quotient % 2n === 0n ? quotient : quotient + 1n;
};
