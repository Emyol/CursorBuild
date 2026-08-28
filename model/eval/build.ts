import '../src/env.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PromptId, Stroke } from '../src/contract.js';
import { ALL_PROMPTS, lookupPrompt } from '../src/prompts.js';
import { inkCoverage } from '../src/render.js';
import type { EvalCase, Split } from './cases.js';
import { fetchDrawings, truncate } from './quickdraw.js';

const PER_CATEGORY = Number(process.env.EVAL_PER_CATEGORY ?? 4);
const OUT = fileURLToPath(new URL('../data/cases.jsonl', import.meta.url));

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = rng(20260828);

/** Grouped by source drawing so a positive and its partials never straddle the split. */
function splitFor(keyId: string): Split {
  let h = 0;
  for (const ch of keyId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 100) < 60 ? 'dev' : 'holdout';
}

function scribble(seed: number): Stroke[] {
  const r = rng(seed);
  return Array.from({ length: 2 + Math.floor(r() * 3) }, () => {
    const x0 = 200 + r() * 500;
    const y0 = 200 + r() * 500;
    return Array.from({ length: 20 + Math.floor(r() * 30) }, (_, i) => ({
      x: Math.round(Math.min(1023, Math.max(0, x0 + Math.sin(i / 3 + r()) * 160 + i * 4))),
      y: Math.round(Math.min(1023, Math.max(0, y0 + Math.cos(i / 2 + r()) * 160))),
    }));
  });
}

const cases: EvalCase[] = [];
const push = (c: EvalCase) => {
  if (inkCoverage(c.strokes) <= 0) throw new Error(`${c.id} renders blank`);
  cases.push(c);
};

let index = 0;
for (const prompt of ALL_PROMPTS) {
  const drawings = await fetchDrawings(prompt.category, PER_CATEGORY);
  process.stdout.write(`\r${prompt.category.padEnd(18)} ${++index}/${ALL_PROMPTS.length}`);

  drawings.forEach((drawing, i) => {
    const split = splitFor(drawing.keyId);
    const base = { split, drawn: drawing.category };

    push({ ...base, id: `${drawing.keyId}-pos`, kind: 'positive', promptId: prompt.id, strokes: drawing.strokes });

    if (i % 2 === 0) {
      push({ ...base, id: `${drawing.keyId}-p30`, kind: 'partial-30', promptId: prompt.id, strokes: truncate(drawing.strokes, 0.3) });

      const others = ALL_PROMPTS.filter(
        (p) => p.id !== prompt.id && !prompt.confusableWith.includes(p.id),
      );
      const other = others[Math.floor(random() * others.length)]!;
      push({ ...base, id: `${drawing.keyId}-neg`, kind: 'negative', promptId: other.id, strokes: drawing.strokes });
    } else {
      push({ ...base, id: `${drawing.keyId}-p60`, kind: 'partial-60', promptId: prompt.id, strokes: truncate(drawing.strokes, 0.6) });

      const confusable = prompt.confusableWith[Math.floor(random() * prompt.confusableWith.length)];
      const partner = confusable ? lookupPrompt(confusable) : undefined;
      if (partner) {
        push({ ...base, id: `${drawing.keyId}-hard`, kind: 'hard-negative', promptId: partner.id, strokes: drawing.strokes });
      }
    }
  });
}

for (let i = 0; i < 40; i += 1) {
  const prompt = ALL_PROMPTS[Math.floor(random() * ALL_PROMPTS.length)]!;
  push({
    id: `scribble-${i}`,
    kind: 'adversarial-scribble',
    split: i % 10 < 6 ? 'dev' : 'holdout',
    promptId: prompt.id as PromptId,
    drawn: 'none',
    strokes: scribble(1000 + i),
  });
}

mkdirSync(fileURLToPath(new URL('../data/', import.meta.url)), { recursive: true });
writeFileSync(OUT, `${cases.map((c) => JSON.stringify(c)).join('\n')}\n`);

const tally = new Map<string, number>();
for (const c of cases) {
  tally.set(`${c.kind} ${c.split}`, (tally.get(`${c.kind} ${c.split}`) ?? 0) + 1);
}
console.log(`\n\n${cases.length} cases written to data/cases.jsonl`);
for (const [key, n] of [...tally].sort()) console.log(`  ${key.padEnd(28)} ${n}`);
