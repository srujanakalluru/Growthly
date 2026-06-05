/** Array helpers. */

/**
 * Trailing rolling average over `windowSize` items ending at `index`.
 * Returns null until a full window of data is available.
 */
export function calculateRollingAverage<T>(
  data: readonly T[],
  index: number,
  windowSize: number,
  valueExtractor: (item: T) => number | null | undefined,
): number | null {
  if (index < windowSize - 1) {
    return null;
  }

  let sum = 0;
  let count = 0;

  for (let i = index - windowSize + 1; i <= index; i++) {
    const value = valueExtractor(data[i]);
    if (value != null && typeof value === 'number') {
      sum += value;
      count++;
    }
  }

  return count > 0 ? Math.round(sum / count) : null;
}
