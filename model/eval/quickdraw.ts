import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CANVAS } from '../src/contract.js';
import type { Stroke } from '../src/contract.js';

const BUCKET = 'https://storage.googleapis.com/quickdraw_dataset/full/simplified';
const CACHE = fileURLToPath(new URL('../data/quickdraw/', import.meta.url));

/** Enough leading bytes for a few hundred drawings without pulling a 50MB file. */
const SLICE_BYTES = 400_000;

/** QuickDraw simplified coordinates span 0..255. */
const SCALE = (CANVAS.width - 1) / 255;

type RawLine = {
  word: string;
  key_id: string;
  recognized: boolean;
  drawing: [number[], number[]][];
};

export type Drawing = {
  keyId: string;
  category: string;
  strokes: Stroke[];
};

async function slice(category: string): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  const path = `${CACHE}${category.replace(/\s+/g, '_')}.ndjson`;
  if (existsSync(path)) return readFileSync(path, 'utf8');

  const url = `${BUCKET}/${encodeURIComponent(category)}.ndjson`;
  const res = await fetch(url, { headers: { Range: `bytes=0-${SLICE_BYTES}` } });
  if (res.status !== 206 && res.status !== 200) {
    throw new Error(`${category}: HTTP ${res.status} from ${url}`);
  }
  const text = await res.text();
  writeFileSync(path, text);
  return text;
}

/** Only whole lines. A ranged read almost always ends mid-record. */
function completeLines(text: string): string[] {
  const lines = text.split('\n');
  if (!text.endsWith('\n')) lines.pop();
  return lines.filter((l) => l.trim().length > 0);
}

export async function fetchDrawings(category: string, count: number): Promise<Drawing[]> {
  const lines = completeLines(await slice(category));
  const drawings: Drawing[] = [];

  for (const line of lines) {
    if (drawings.length >= count) break;
    const raw = JSON.parse(line) as RawLine;
    if (!raw.recognized) continue;
    if (raw.word !== category) throw new Error(`${category}: got a ${raw.word} record`);

    drawings.push({
      keyId: raw.key_id,
      category,
      strokes: raw.drawing.map(([xs, ys]) =>
        xs.map((x, i) => ({
          x: Math.round(x * SCALE),
          y: Math.round((ys[i] ?? 0) * SCALE),
        })),
      ),
    });
  }

  if (drawings.length < count) {
    throw new Error(`${category}: wanted ${count} drawings, the slice held ${drawings.length}`);
  }
  return drawings;
}

/** Keeps the first fraction of the drawing by point count, as a rushed player would leave it. */
export function truncate(strokes: Stroke[], fraction: number): Stroke[] {
  const total = strokes.reduce((n, s) => n + s.length, 0);
  const budget = Math.max(2, Math.floor(total * fraction));

  const kept: Stroke[] = [];
  let used = 0;
  for (const stroke of strokes) {
    if (used >= budget) break;
    const room = budget - used;
    kept.push(room >= stroke.length ? stroke : stroke.slice(0, room));
    used += Math.min(room, stroke.length);
  }
  return kept;
}
