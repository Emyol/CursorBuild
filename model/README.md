# doodle fight, the judge

The `model/` workload. A standalone HTTPS service that decides whether a drawing matches its prompt, plus the eval harness that keeps it honest.

The room server never imports this. It calls it. Cloudflare's workerd has no Canvas2D, and judging needs the strokes rendered to a PNG because Gemini takes `image/png` and will not take an SVG. Keeping the Gemini key in one service instead of in every room Durable Object is the second reason.

## The port

```ts
export interface Judge {
  judge(req: JudgeRequest): Promise<Verdict>;
  judgeBatch(reqs: JudgeRequest[]): Promise<Verdict[]>;
}

export type Verdict =
  | { kind: 'accepted'; sees: string; confidence: number }
  | { kind: 'rejected'; sees: string; confidence: number }
  | { kind: 'unjudged'; reason: 'timeout' | 'quota' | 'malformed' };
```

`unjudged` is not an error case to swallow. It means the judge could not reach a decision, so the round should award no points rather than guess. Handle it explicitly in the reducer.

`src/contract.ts` and `src/prompts.ts` are the reference implementation of the types that belong in `contract/`. Once that package lands they become re-exports. See [CONTRACT-DELTAS.md](./CONTRACT-DELTAS.md).

## HTTP surface

`POST /api/judge` always takes a batch, so a single judgment is a batch of one.

```jsonc
// request, with header  x-judge-secret: <JUDGE_SHARED_SECRET>
{
  "roomCode": "ABCD",
  "items": [{ "promptId": "flying-saucer", "strokes": [[{ "x": 120, "y": 300 }]] }]
}

// response
{
  "verdicts": [{ "kind": "accepted", "sees": "a flying saucer", "confidence": 0.82 }],
  "elapsedMs": 640
}
```

Status codes are 200 for a decision including `unjudged`, 400 for a malformed body or an unknown `promptId`, 401 for a bad secret, 405 for a non-POST, 429 for rate limiting, and 500 only when the service itself is misconfigured. A judge failure is a 200 carrying `unjudged`, never a 5xx, because the room server needs a verdict shape for every submission.

`GET /api/health` reports mode, model, prompt count, and whether auth is configured.

## Coordinates

Points are integers in a square 1024 by 1024 space, matching `CANVAS` in `src/contract.ts`. Square is deliberate. QuickDraw source drawings are square and they are the eval's ground truth, so a non-square judging space would stretch every eval image relative to production. The front-end letterboxes its drawing area into the square.

## Running it

```bash
npm install
cp .env.example .env     # fill in GEMINI_API_KEY to leave stub mode
npm run dev              # http://localhost:8787
npm run smoke            # end-to-end checks against a running server
npm test                 # unit tests
npm run typecheck
```

`JUDGE_MODE=stub` returns a deterministic rule-based verdict and never calls Gemini, so the room server has a playable loop without a key. Mode defaults to `gemini` as soon as `GEMINI_API_KEY` is set.

## Deploying

Vercel, with the project root set to `model`. `JUDGE_SHARED_SECRET` and `GEMINI_API_KEY` go in the project's environment variables. The service fails closed when the shared secret is missing, so a misconfigured deploy returns 500 rather than serving free judgments.

## Eval

`eval/` holds the harness that measures the judge against real human doodles from QuickDraw. The gate is a false accept rate at or under 2 percent, because a cheater winning a round is worse than an unfair rejection. The number being driven down is the false reject rate, target 10 percent.

Only the case manifest and the builder are committed, never the rendered images. Regenerate the exact dataset with `npm run eval:build`.

## Package manager

npm, because corepack could not enable pnpm on this machine. This package is a standalone deployable and does not need to be a workspace member. If it later joins the pnpm workspace, delete `package-lock.json` and let the root lockfile own it.
