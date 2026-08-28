/**
 * Coordinates travel as integers on a fixed grid rather than floats, so a point
 * costs a few bytes on the wire and every client rasterizes identically.
 */
export const COORD_MAX = 1023;

export type Point = {
  /** 0..COORD_MAX, fraction of canvas width. */
  x: number;
  /** 0..COORD_MAX, fraction of canvas height. */
  y: number;
  /** Milliseconds since the round started. */
  t: number;
};

export type Stroke = Point[];

export type Submission = {
  roundIndex: number;
  strokes: Stroke[];
};

// Bounds on anything inbound. A round is short and a human hand is slow, so a
// submission past these is a malformed or hostile client, not a prolific artist.
// kept at or under the judge's own limits, so a submission we accept can never
// be one the judge rejects as malformed
export const MAX_STROKES_PER_SUBMISSION = 400;
export const MAX_POINTS_PER_STROKE = 2048;
export const MAX_POINTS_PER_SUBMISSION = 12_000;

export function quantizeCoord(normalized: number): number {
  if (!Number.isFinite(normalized)) return 0;
  const clamped = normalized < 0 ? 0 : normalized > 1 ? 1 : normalized;
  return Math.round(clamped * COORD_MAX);
}

export function toNormalized(quantized: number): number {
  return quantized / COORD_MAX;
}

export function countPoints(strokes: Stroke[]): number {
  let total = 0;
  for (const stroke of strokes) total += stroke.length;
  return total;
}
