# doodle fight, the judge

The `model/` workload. A standalone HTTPS service that decides whether a drawing matches its prompt, plus the eval harness that keeps it honest.

The room server never imports this. It calls it. Cloudflare's workerd has no Canvas2D, and judging needs the strokes rendered to a PNG because Gemini takes `image/png` and will not take an SVG. Keeping the Gemini key in one service instead of in every room Durable Object is the second reason.

## The port

`contract/src/judge.ts` is authoritative. This service implements it:

```ts
export interface Judge {
  judge(request: JudgeRequest): Promise<JudgeResult>;
}

export type JudgeResult =
  | { kind: "recognized"; confidence: number; top3: Guess[] }
  | { kind: "unrecognized"; top3: Guess[] };
```

The judge reports recognition only. The reducer turns that into points, so scoring, speed bonuses and standings stay on the game side.

### When the judge cannot decide

`JudgeResult` has no "I failed" variant, and that is deliberate: a quota error is not an opinion about the drawing. When Gemini times out, 429s, or returns something unparseable, `judge()` **throws**. The room server catches it and treats the submission as `Verdict.timeout`, awarding nothing.

Returning `unrecognized` there would be wrong. It would tell the player they drew badly when the truth is that the service was rate-limited, and it would quietly count against the false reject rate the eval is trying to drive down.

## HTTP surface

`POST /api/judge`, with header `x-judge-secret: <JUDGE_SHARED_SECRET>`. The body takes a batch, so one judgment is a batch of one. An 8-player reveal is one request rather than 8, which matters because the free Gemini tier starts 429ing around 4 concurrent calls.

```jsonc
// request
{
  "roomCode": "ABCD",
  "items": [
    { "promptId": "cactus", "strokes": [[{ "x": 512, "y": 300, "t": 0 }]] }
  ]
}

// response
{
  "results": [
    { "kind": "recognized", "confidence": 0.91, "top3": [{ "promptId": "cactus", "confidence": 0.91 }] }
  ],
  "elapsedMs": 640
}
```

A failed item comes back as `{ "kind": "failed", "reason": "quota" }` in the wire response, which the client adapter turns back into a throw. The wire needs to say it; the TypeScript port does not.

Status codes are 200 for any decision, 400 for a malformed body or unknown `promptId`, 401 for a bad secret, 405 for a non-POST, 429 for rate limiting, and 500 only when the service itself is misconfigured.

`GET /api/health` reports mode, model, prompt count, and whether auth is configured.

## Coordinates

Points are integers on the `0..1023` grid from `contract/src/strokes.ts`. The `t` field rides along and the renderer ignores it, though it is what a future partial-drawing replay would use.

The judging canvas is square. QuickDraw source drawings are square and they are the eval's ground truth, so a non-square judging space would stretch every eval image relative to production. The front-end letterboxes its drawing area into the square.

## Running it

```bash
npm install
cp .env.example .env     # fill in GEMINI_API_KEY to leave stub mode
npm run dev              # http://localhost:8787
npm run smoke            # end-to-end checks against a running server
npm test                 # unit tests
npm run typecheck
```

`JUDGE_MODE=stub` returns a deterministic rule-based result and never calls Gemini, so the room server has a playable loop without a key. Mode defaults to `gemini` as soon as `GEMINI_API_KEY` is set.

## Deploying

Vercel, with the project root set to `model`. `JUDGE_SHARED_SECRET` and `GEMINI_API_KEY` go in the project's environment variables. The service fails closed when the shared secret is missing, so a misconfigured deploy returns 500 rather than serving free judgments.

## Prompt vocabulary

`contract/src/prompts.ts` is the registry and the model side owns it, as the front-end README asked. It now holds the 73 categories the judge can actually distinguish, with confusable pairs recorded so the eval can target them. A prompt the model cannot judge is not a prompt the game should ask for.

## Eval

`eval/` holds the harness that measures the judge against real human doodles from QuickDraw. The gate is a false accept rate at or under 2 percent, because a cheater winning a round is worse than an unfair rejection. The number being driven down is the false reject rate, target 10 percent.

Only the case manifest and the builder are committed, never the rendered images. Regenerate the exact dataset with `npm run eval:build`.
