import { createCanvas } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import type { Stroke } from './contract.js';

export type RenderOptions = {
  /** Output edge length in pixels. The judging space is square. */
  size: number;
  /** Blank border as a fraction of the edge. */
  margin: number;
  /** Stroke width as a fraction of the edge. */
  strokeWidth: number;
};

export const DEFAULT_RENDER: RenderOptions = {
  size: 512,
  margin: 0.06,
  strokeWidth: 0.014,
};

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

function bounds(strokes: Stroke[]): Bounds | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    for (const p of stroke) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : undefined;
}

/**
 * Fits the drawing to the canvas preserving aspect. QuickDraw's simplified
 * strokes arrive already fitted to their bounding box, so eval images would
 * not match production images unless live drawings get the same treatment.
 */
function renderCanvas(strokes: Stroke[], options: Partial<RenderOptions>) {
  const { size, margin, strokeWidth } = { ...DEFAULT_RENDER, ...options };
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  const box = bounds(strokes);
  if (box) {
    const inset = size * margin;
    const usable = size - inset * 2;
    const width = box.maxX - box.minX;
    const height = box.maxY - box.minY;
    const scale = usable / Math.max(width, height, 1);
    const offsetX = inset + (usable - width * scale) / 2;
    const offsetY = inset + (usable - height * scale) / 2;
    const project = (p: { x: number; y: number }) => ({
      x: offsetX + (p.x - box.minX) * scale,
      y: offsetY + (p.y - box.minY) * scale,
    });

    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#000000';
    ctx.lineWidth = size * strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of strokes) {
      if (stroke.length === 0) continue;
      const first = project(stroke[0]!);
      if (stroke.length === 1) {
        ctx.beginPath();
        ctx.arc(first.x, first.y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < stroke.length; i += 1) {
        const p = project(stroke[i]!);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }

  return canvas;
}

export function renderToPng(strokes: Stroke[], options: Partial<RenderOptions> = {}): Buffer {
  return renderCanvas(strokes, options).toBuffer('image/png');
}

/** Cache key for a rendered drawing. Identical pixels reuse an earlier verdict. */
export function imageHash(png: Buffer): string {
  return createHash('sha256').update(png).digest('hex').slice(0, 32);
}

/** Fraction of dark pixels. Near zero means the player left the canvas empty. */
export function inkCoverage(strokes: Stroke[], options: Partial<RenderOptions> = {}): number {
  const canvas = renderCanvas(strokes, options);
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i] ?? 255) < 128) dark += 1;
  }
  return dark / (canvas.width * canvas.height);
}

/**
 * Coarse ink-coverage grid for the golden tests. PNG bytes shift between
 * encoder versions and platforms, the shape of the drawing does not.
 */
export function pixelSignature(
  strokes: Stroke[],
  options: Partial<RenderOptions> = {},
  cells = 16,
): number[] {
  const canvas = renderCanvas(strokes, options);
  const size = canvas.width;
  const { data } = canvas.getContext('2d').getImageData(0, 0, size, size);
  const step = size / cells;

  const grid: number[] = [];
  for (let cy = 0; cy < cells; cy += 1) {
    for (let cx = 0; cx < cells; cx += 1) {
      let ink = 0;
      let counted = 0;
      for (let y = Math.floor(cy * step); y < Math.floor((cy + 1) * step); y += 1) {
        for (let x = Math.floor(cx * step); x < Math.floor((cx + 1) * step); x += 1) {
          const i = (y * size + x) * 4;
          ink += 255 - (data[i] ?? 255);
          counted += 1;
        }
      }
      grid.push(Math.round(ink / Math.max(counted, 1) / 8));
    }
  }
  return grid;
}
