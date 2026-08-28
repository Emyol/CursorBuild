# model/ — the judge

This folder belongs to the model side of the project. Nothing here is written or
modified by the front-end and multiplayer work; this file and `package.json`
exist only so the pnpm workspace resolves.

## What the game needs from you

One HTTPS endpoint. The room server calls it once per player per round and
blocks the reveal on the answer, so it must be fast and it must always answer.

### Request

`POST /judge`

```jsonc
{
  "promptId": "cactus",
  "strokes": [
    [{ "x": 512, "y": 300, "t": 0 }, { "x": 515, "y": 310, "t": 16 }]
  ]
}
```

- `x` and `y` are integers on a `0..1023` grid, a fraction of canvas width and
  height. They are already clamped and validated; you do not need to re-check.
- `t` is milliseconds since the round started.
- Strokes arrive in draw order, points within a stroke in time order.

### Response

```jsonc
{ "kind": "recognized", "confidence": 0.91, "top3": [{ "promptId": "cactus", "confidence": 0.91 }] }
```

or

```jsonc
{ "kind": "unrecognized", "top3": [{ "promptId": "tree", "confidence": 0.44 }] }
```

`confidence` is `0..1`. `top3` is at most three guesses, highest first.

## The contract in TypeScript

The authoritative shapes live in `contract/src/judge.ts`:

```ts
export interface Judge {
  judge(request: JudgeRequest): Promise<JudgeResult>;
}
```

If you need that shape to change, change it in `contract/` and tell the other
side — it is the one file set both halves of the project edit.

## What the game does *not* need from you

- **Scoring.** You report recognition; the reducer turns that into points. Speed
  bonuses, round scoring, and standings are game logic and live in `contract/`.
- **Timing.** The room server owns the clock.
- **The appeal path.** If a vision-LLM appeal is added, it sits behind this same
  endpoint or a sibling of it, and the game does not model it.

## Prompt vocabulary

`contract/src/prompts.ts` holds a provisional list so the game loop is playable
before the model exists. Replace it with whatever your classifier can actually
distinguish, and drop confusable pairs. A prompt the model cannot judge is not a
prompt the game should ask for.
