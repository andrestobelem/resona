export const deepFreeze = <Value>(value: Value): Readonly<Value> => {
  if (value === null || typeof value !== "object") {
    return value;
  }

  for (const entry of Object.values(value)) {
    deepFreeze(entry);
  }

  return Object.isFrozen(value) ? value : Object.freeze(value);
};
