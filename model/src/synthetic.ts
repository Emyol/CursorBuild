import type { Stroke } from './contract.js';

function line(x1: number, y1: number, x2: number, y2: number, steps = 24): Stroke {
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    return { x: Math.round(x1 + (x2 - x1) * t), y: Math.round(y1 + (y2 - y1) * t) };
  });
}

function circle(cx: number, cy: number, r: number, steps = 48): Stroke {
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return { x: Math.round(cx + Math.cos(a) * r), y: Math.round(cy + Math.sin(a) * r) };
  });
}

/** Deterministic drawings for smoke checks and golden images. */
export const SYNTHETIC: Record<'house' | 'dot' | 'scribble', Stroke[]> = {
  house: [
    line(250, 700, 250, 400),
    line(250, 400, 512, 240),
    line(512, 240, 774, 400),
    line(774, 400, 774, 700),
    line(774, 700, 250, 700),
    line(430, 700, 430, 540),
    line(430, 540, 590, 540),
    line(590, 540, 590, 700),
  ],
  dot: [line(500, 500, 512, 512, 4)],
  scribble: [
    Array.from({ length: 80 }, (_, i) => ({
      x: Math.round(300 + i * 5 + Math.sin(i / 2) * 40),
      y: Math.round(512 + Math.cos(i / 1.5) * 120),
    })),
    circle(512, 512, 30),
  ],
};
