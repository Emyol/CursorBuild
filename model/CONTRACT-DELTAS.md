# Contract deltas for layer-contract-0

Seven changes the `contract/` package needs before `layer-contract-0` is committed. Each one is cheap now and expensive once five layers sit on top of it. The reference implementation of all seven lives in `model/src/contract.ts` and `model/src/prompts.ts`, which the judge already builds against. Once `contract/` lands, those two files become re-exports.

## 1. `Verdict` needs a failure variant and a `sees` field

```ts
export type Verdict =
  | { kind: 'accepted'; sees: string; confidence: number }
  | { kind: 'rejected'; sees: string; confidence: number }
  | { kind: 'unjudged'; reason: 'timeout' | 'quota' | 'malformed' };
```

A judge call that times out is neither an accept nor a reject. With only two variants the reducer has to map an outage onto one of them, which either hands a cheater the round or punishes an innocent player for our downtime. The third variant makes the compiler force every call site to decide.

`sees` carries what the model thought it was looking at. It drives the reveal screen, which is the funniest part of the game.

## 2. The state machine needs to say when judging happens

The front-end diagram goes `drawing --> reveal: all submitted or timer expired`. A verdict takes on the order of a second and nothing in the diagram holds that gap.

Recommended resolution is that judging overlaps drawing. A player submits, gets judged immediately, and locks their score while everyone else is still drawing. `reveal` then only waits on players who never submitted. That preserves the race feel and hides the judge latency behind other players' drawing time.

The alternative is an explicit `judging` phase between `drawing` and `reveal`. Either works. The contract has to pick one, because the reducer shape depends on it.

## 3. The port needs a batch method

```ts
export interface Judge {
  judge(req: JudgeRequest): Promise<Verdict>;
  judgeBatch(reqs: JudgeRequest[]): Promise<Verdict[]>;
}
```

Eight players submit inside the same second. One request carrying up to eight drawings shares the prompt tokens and collapses eight round trips into one. Whether batching actually wins on latency gets measured before we use it, but the port should permit it now.

The HTTP surface already works this way. `POST /api/judge` always takes `{ items: JudgeRequest[] }` and returns `{ verdicts: Verdict[] }`, so a single judgment is a batch of one and there is only one endpoint to maintain.

## 4. The coordinate space needs a pinned aspect ratio

```ts
export const CANVAS = { width: 1024, height: 1024, aspect: 1 } as const;
```

`Point` quantized 0..1023 describes a square. If the drawing area is not square and both axes normalize to the same range, every drawing reaches the judge stretched. The eval renders square images from QuickDraw, so a distorted production image would read as "the AI is bad at judging" instead of "our coordinates disagree".

Square is also the right choice on its own merits, because QuickDraw source drawings are square and they are the eval's ground truth. The front-end letterboxes its drawing area into the square.

## 5. The prompt registry belongs in `contract/`

The port takes `promptId: PromptId`, so the judge has to resolve that id to text. Putting the registry in `contract/` gives one source of truth and keeps the room server from shipping a label on every request.

```ts
export type Prompt = {
  id: PromptId;
  label: string;          // shown to the player and handed to the judge
  category: string;       // QuickDraw category, the eval's ground truth
  confusableWith: PromptId[];
};
```

`model/src/prompts.ts` has a working 73-prompt registry with confusable pairs already derived in both directions. Lift it into `contract/` as is.

This settles the open question about free-form prompts. Prompts are a curated list, which is better anyway because the eval can then cover the actual vocabulary the game ships.

## 6. The judge endpoint needs a shared secret

An open endpoint that costs money per call will be drained. The room server sends `x-judge-secret`, the judge compares it in constant time and fails closed when it is unset. Per-room rate limiting lives on the judge side.

`JUDGE_SHARED_SECRET` has to be set in both the Durable Object's environment and the judge's.

## 7. Only one of us creates `model/package.json`

The front-end plan has the front-end creating a stub `package.json` and `README.md` in `model/` so the monorepo typechecks. That folder is now real and complete, so nothing needs to be stubbed. Two people writing the same file is the one collision worth designing out rather than coordinating around.

## Note on the package manager

`model/` installs with npm because pnpm could not be enabled on this machine (corepack hits EPERM on `C:\Program Files\nodejs`). It is a standalone deployable and does not need to be a workspace member. If it is later added to the pnpm workspace, delete `model/package-lock.json` and let the root lockfile own it.
