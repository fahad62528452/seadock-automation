/** Quantity helpers using milli-units (3 decimal places) to avoid float drift. */

const SCALE = 1000;

export function toMilli(value: number): number {
  return Math.round(Number(value) * SCALE);
}

export function fromMilli(value: number): number {
  return value / SCALE;
}

export function roundQuantity(value: number): number {
  return fromMilli(toMilli(value));
}

export function quantitiesEqual(a: number, b: number): boolean {
  return toMilli(a) === toMilli(b);
}

export function quantityGreaterThan(a: number, b: number): boolean {
  return toMilli(a) > toMilli(b);
}

export function percentOf(part: number, whole: number): number | null {
  if (toMilli(whole) === 0) return null;
  return roundQuantity((toMilli(part) / toMilli(whole)) * 100);
}
