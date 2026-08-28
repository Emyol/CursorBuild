import type { Guess, Judge, JudgeRequest, JudgeResult, PromptId } from "@doodle-fight/contract";
import { slugify } from "@doodle-fight/contract";

/**
 * Talks to the judge service in `model/`. Its wire shape is batch-first:
 * `POST /api/judge` always takes `{ items: [...] }` and answers
 * `{ verdicts: [...] }`, so a single judgment is a batch of one.
 *
 * A judge outage must not hang a round, so the call is bounded and every
 * failure degrades to "unrecognized" rather than throwing into the round loop.
 */
const TIMEOUT_MS = 9_000;

/** The judge caps a batch at eight, which is also the room's player cap. */
export const MAX_BATCH = 8;

export type RemoteJudgeOptions = {
  /** Origin of the judge deployment, without a trailing slash. */
  baseUrl: string;
  sharedSecret: string;
  roomCode?: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** What the judge sends back, before we trust any of it. */
type WireVerdict = {
  kind?: unknown;
  sees?: unknown;
  confidence?: unknown;
  reason?: unknown;
};

export class RemoteJudge implements Judge {
  readonly #url: string;
  readonly #secret: string;
  readonly #roomCode: string | undefined;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor({
    baseUrl,
    sharedSecret,
    roomCode,
    fetchImpl = fetch,
    timeoutMs = TIMEOUT_MS,
  }: RemoteJudgeOptions) {
    this.#url = `${baseUrl.replace(/\/+$/, "")}/api/judge`;
    this.#secret = sharedSecret;
    this.#roomCode = roomCode;
    this.#fetch = fetchImpl;
    this.#timeoutMs = timeoutMs;
  }

  async judge(request: JudgeRequest): Promise<JudgeResult> {
    const [only] = await this.judgeBatch([request]);
    return only ?? unrecognized(request.promptId);
  }

  async judgeBatch(requests: JudgeRequest[]): Promise<JudgeResult[]> {
    if (requests.length === 0) return [];
    try {
      const res = await this.#post(requests);
      if (!res.ok) return requests.map((request) => unrecognized(request.promptId));
      return parseBatch(await res.json(), requests);
    } catch {
      return requests.map((request) => unrecognized(request.promptId));
    }
  }

  async #post(requests: JudgeRequest[]): Promise<Response> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.#timeoutMs);
    try {
      return await this.#fetch(this.#url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-judge-secret": this.#secret,
        },
        body: JSON.stringify({
          ...(this.#roomCode ? { roomCode: this.#roomCode } : {}),
          // the judge validates points as {x,y} and ignores our `t`
          items: requests.map((request) => ({
            promptId: request.promptId,
            strokes: request.strokes,
          })),
        }),
        signal: abort.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

/** The judge is a separate service, so its response is untrusted like any other input. */
export function parseBatch(body: unknown, requests: JudgeRequest[]): JudgeResult[] {
  const verdicts = (body as { verdicts?: unknown } | null)?.verdicts;
  const list = Array.isArray(verdicts) ? verdicts : [];
  return requests.map((request, index) => parseVerdict(list[index], request.promptId));
}

export function parseVerdict(raw: unknown, promptId: PromptId): JudgeResult {
  if (typeof raw !== "object" || raw === null) return unrecognized(promptId);
  const wire = raw as WireVerdict;
  const confidence = clamp01(wire.confidence) ?? 0;
  const sees = typeof wire.sees === "string" ? wire.sees : null;

  switch (wire.kind) {
    case "accepted":
      return { kind: "recognized", confidence, top3: [{ promptId, confidence }] };
    case "rejected":
      return { kind: "unrecognized", top3: guessFrom(sees, confidence, promptId) };
    // an outage is neither an accept nor a reject; scoring nothing is the honest
    // answer, and the round loop treats it exactly like a miss
    case "unjudged":
    default:
      return unrecognized(promptId);
  }
}

function guessFrom(sees: string | null, confidence: number, fallback: PromptId): Guess[] {
  if (sees === null) return [{ promptId: fallback, confidence: 0 }];
  return [{ promptId: slugify(sees), confidence }];
}

function clamp01(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function unrecognized(promptId: PromptId): JudgeResult {
  return { kind: "unrecognized", top3: [{ promptId, confidence: 0 }] };
}
