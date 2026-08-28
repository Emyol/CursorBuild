import type { Point } from "@doodle-fight/contract";

/**
 * A hash, not a generator: the same point index always yields the same offset,
 * so a stroke's jitter is frozen the moment it is drawn and never shimmers
 * across the redraws that happen every frame.
 */
function jitter(seed: number, index: number, salt: number): number {
  let h = (seed ^ (index * 0x9e3779b1) ^ (salt * 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff - 0.5;
}

export type DoodleStyle = {
  color: string;
  width: number;
  /** Pixels of wobble applied perpendicular to the stroke. */
  roughness: number;
};

export const DEFAULT_STYLE: DoodleStyle = { color: "#1a1a1a", width: 3.5, roughness: 1.6 };

/**
 * Draws a stroke as a hand-wobbled polyline. Points are in canvas pixels, not
 * quantized grid units — the caller scales.
 */
export function strokeDoodle(
  ctx: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
  seed: number,
  style: DoodleStyle = DEFAULT_STYLE,
): void {
  if (points.length === 0) return;

  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (points.length === 1) {
    const only = points[0]!;
    ctx.beginPath();
    ctx.arc(only.x, only.y, style.width / 2, 0, Math.PI * 2);
    ctx.fillStyle = style.color;
    ctx.fill();
    return;
  }

  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    const x = point.x + jitter(seed, i, 1) * style.roughness;
    const y = point.y + jitter(seed, i, 2) * style.roughness;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** Stable per-stroke seed so redrawing the same stroke looks identical. */
export function seedOf(strokeIndex: number, first: Point | undefined): number {
  return ((strokeIndex + 1) * 2654435761 + (first ? first.x * 31 + first.y : 0)) >>> 0;
}
