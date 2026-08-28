import { SYNTHETIC } from '../src/synthetic.js';

const base = process.env.JUDGE_URL ?? 'http://localhost:8787';
const secret = process.env.JUDGE_SHARED_SECRET ?? 'local-dev-secret';

let failures = 0;

function check(name: string, ok: boolean, detail: unknown): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) {
    failures += 1;
    console.log(`      ${JSON.stringify(detail)}`);
  }
}

async function post(body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}/api/judge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const auth = { 'x-judge-secret': secret };

const health = await fetch(`${base}/api/health`).then((r) => r.json());
check('health responds', health?.ok === true, health);

const noAuth = await post({ items: [{ promptId: 'house', strokes: SYNTHETIC.house }] });
check('rejects a missing secret', noAuth.status === 401, noAuth);

const badPrompt = await post({ items: [{ promptId: 'nope', strokes: SYNTHETIC.house }] }, auth);
check('rejects an unknown promptId', badPrompt.status === 400, badPrompt);

const outOfRange = await post(
  { items: [{ promptId: 'house', strokes: [[{ x: 5000, y: 0 }]] }] },
  auth,
);
check('rejects a point outside the canvas', outOfRange.status === 400, outOfRange);

const drawn = await post({ items: [{ promptId: 'house', strokes: SYNTHETIC.house }] }, auth);
const drawnVerdict = (drawn.body.verdicts as Array<{ kind: string }>)?.[0];
check('judges a real drawing', drawn.status === 200 && drawnVerdict?.kind === 'accepted', drawn);

const empty = await post({ items: [{ promptId: 'house', strokes: SYNTHETIC.dot }] }, auth);
const emptyVerdict = (empty.body.verdicts as Array<{ kind: string }>)?.[0];
check('rejects an empty canvas', emptyVerdict?.kind === 'rejected', empty);

const batch = await post(
  {
    roomCode: 'SMOKE',
    items: [
      { promptId: 'house', strokes: SYNTHETIC.house },
      { promptId: 'star', strokes: SYNTHETIC.scribble },
      { promptId: 'cat', strokes: SYNTHETIC.dot },
    ],
  },
  auth,
);
check(
  'judges a batch of three',
  batch.status === 200 && (batch.body.verdicts as unknown[])?.length === 3,
  batch,
);

console.log(failures === 0 ? '\nall smoke checks passed' : `\n${failures} smoke check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
