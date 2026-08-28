import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Stroke } from '../src/contract.js';
import { imageHash, inkCoverage, pixelSignature, renderToPng } from '../src/render.js';
import { SYNTHETIC } from '../src/synthetic.js';

const golden = JSON.parse(
  readFileSync(fileURLToPath(new URL('./golden/signatures.json', import.meta.url)), 'utf8'),
) as Record<string, number[]>;

const shift = (strokes: Stroke[], dx: number, dy: number): Stroke[] =>
  strokes.map((s) => s.map((p) => ({ x: p.x + dx, y: p.y + dy })));

const scale = (strokes: Stroke[], factor: number): Stroke[] =>
  strokes.map((s) => s.map((p) => ({ x: Math.round(p.x * factor), y: Math.round(p.y * factor) })));

describe('renderer', () => {
  it('is deterministic', () => {
    expect(imageHash(renderToPng(SYNTHETIC.house))).toBe(
      imageHash(renderToPng(SYNTHETIC.house)),
    );
  });

  it('matches the committed goldens', () => {
    for (const [name, strokes] of Object.entries(SYNTHETIC)) {
      expect(pixelSignature(strokes), name).toEqual(golden[name]);
    }
  });

  it('leaves a blank drawing blank', () => {
    expect(pixelSignature([])).toEqual(new Array(256).fill(0));
  });

  it('puts ink on the canvas for a real drawing', () => {
    expect(pixelSignature(SYNTHETIC.house).some((cell) => cell > 0)).toBe(true);
  });

  it('renders a lone point as a visible dot', () => {
    expect(inkCoverage([[{ x: 500, y: 500 }]])).toBeGreaterThan(0);
  });

  it('reports no ink for an empty drawing', () => {
    expect(inkCoverage([])).toBe(0);
  });

  it('is translation invariant, so where a player drew does not change the judgment', () => {
    expect(pixelSignature(shift(SYNTHETIC.house, 120, -90))).toEqual(
      pixelSignature(SYNTHETIC.house),
    );
  });

  it('is scale invariant, so a small doodle judges like a big one', () => {
    const small = pixelSignature(scale(SYNTHETIC.house, 0.5));
    const big = pixelSignature(SYNTHETIC.house);
    const drift = small.reduce((n, cell, i) => n + Math.abs(cell - (big[i] ?? 0)), 0);
    expect(drift).toBeLessThan(24);
  });

  it('produces a real PNG', () => {
    const png = renderToPng(SYNTHETIC.house);
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(png.byteLength).toBeGreaterThan(500);
  });
});
