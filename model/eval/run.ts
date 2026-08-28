import '../src/env.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import type { Verdict } from '../src/contract.js';
import { createJudge } from '../src/judge.js';
import { imageHash, renderToPng } from '../src/render.js';
import { KINDS, type CaseKind, type EvalCase, type Split } from './cases.js';

const config = loadConfig();
const split = (process.env.EVAL_SPLIT ?? 'dev') as Split;
const limit = Number(process.env.EVAL_LIMIT ?? 0);
const concurrency = Number(process.env.EVAL_CONCURRENCY ?? 8);
const label = process.env.EVAL_LABEL ?? config.promptVersion;

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const CACHE = dir('../results/cache/');
mkdirSync(CACHE, { recursive: true });
mkdirSync(dir('../results/'), { recursive: true });

const all = readFileSync(dir('../data/cases.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as EvalCase)
  .filter((c) => c.split === split);

const cases = limit > 0 ? all.slice(0, limit) : all;
const judge = createJudge(config);

/** Keyed by pixels plus config, so a rerun after a crash costs nothing. */
function cacheKey(c: EvalCase): string {
  return `${imageHash(renderToPng(c.strokes))}-${c.promptId}-${config.model}-${label}`;
}

type Outcome = { verdict: Verdict; ms: number };

async function judgeCase(c: EvalCase): Promise<Outcome> {
  const path = `${CACHE}${cacheKey(c)}.json`;
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as Outcome;

  const started = Date.now();
  const verdict = await judge.judge({ promptId: c.promptId, strokes: c.strokes });
  const outcome: Outcome = { verdict, ms: Date.now() - started };
  if (verdict.kind !== 'unjudged') writeFileSync(path, JSON.stringify(outcome));
  return outcome;
}

const results: Array<{ c: EvalCase; o: Outcome }> = [];
let done = 0;

await Promise.all(
  Array.from({ length: concurrency }, async () => {
    for (;;) {
      const next = cases.shift();
      if (!next) return;
      results.push({ c: next, o: await judgeCase(next) });
      process.stdout.write(`\r judged ${(done += 1)}`);
    }
  }),
);

const byKind = new Map<CaseKind, { n: number; accepted: number; unjudged: number }>();
for (const { c, o } of results) {
  const bucket = byKind.get(c.kind) ?? { n: 0, accepted: 0, unjudged: 0 };
  bucket.n += 1;
  if (o.verdict.kind === 'accepted') bucket.accepted += 1;
  if (o.verdict.kind === 'unjudged') bucket.unjudged += 1;
  byKind.set(c.kind, bucket);
}

const sum = (kinds: CaseKind[], pick: (b: { n: number; accepted: number }) => number) =>
  kinds.reduce((t, k) => t + pick(byKind.get(k) ?? { n: 0, accepted: 0 }), 0);

const farKinds = (Object.keys(KINDS) as CaseKind[]).filter((k) => KINDS[k].metric === 'far');
const farN = sum(farKinds, (b) => b.n);
const farAccepts = sum(farKinds, (b) => b.accepted);
const positives = byKind.get('positive') ?? { n: 0, accepted: 0, unjudged: 0 };

const latencies = results.map((r) => r.o.ms).sort((a, b) => a - b);
const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;

const report = {
  label,
  split,
  model: config.model,
  promptVersion: config.promptVersion,
  cases: results.length,
  falseAcceptRate: farN ? farAccepts / farN : 0,
  falseRejectRate: positives.n ? 1 - positives.accepted / positives.n : 0,
  partial30Recall: rate('partial-30'),
  partial60Recall: rate('partial-60'),
  unjudged: results.filter((r) => r.o.verdict.kind === 'unjudged').length,
  latencyP95Ms: p95,
  byKind: Object.fromEntries(
    [...byKind].map(([k, b]) => [k, { ...b, acceptRate: b.n ? b.accepted / b.n : 0 }]),
  ),
};

function rate(kind: CaseKind): number {
  const b = byKind.get(kind);
  return b && b.n ? b.accepted / b.n : 0;
}

writeFileSync(dir(`../results/${label}.${split}.json`), `${JSON.stringify(report, null, 2)}\n`);

console.log(`\n\n${label} on ${split}, ${report.cases} cases`);
console.log(`  false accept rate  ${(report.falseAcceptRate * 100).toFixed(1)}%  (gate 2%)`);
console.log(`  false reject rate  ${(report.falseRejectRate * 100).toFixed(1)}%  (target 10%)`);
console.log(`  partial 30 recall  ${(report.partial30Recall * 100).toFixed(1)}%`);
console.log(`  partial 60 recall  ${(report.partial60Recall * 100).toFixed(1)}%`);
console.log(`  unjudged           ${report.unjudged}`);
console.log(`  latency p95        ${report.latencyP95Ms}ms`);
for (const [kind, b] of Object.entries(report.byKind)) {
  console.log(`    ${kind.padEnd(22)} n=${String(b.n).padStart(4)}  accepted ${(b.acceptRate * 100).toFixed(1)}%`);
}
