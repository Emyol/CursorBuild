import type { Judge, JudgeRequest, JudgeResult, PromptId } from "@doodle-fight/contract";

/**
 * A judge outage must not hang a round, so the call is bounded and any failure
 * degrades to "unrecognized" rather than throwing into the round loop.
 */
const TIMEOUT_MS = 2_500;

export type RemoteJudgeOptions = {
  url: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export class RemoteJudge implements Judge {
  readonly #url: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor({ url, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }: RemoteJudgeOptions) {
    this.#url = url;
    this.#fetch = fetchImpl;
    this.#timeoutMs = timeoutMs;
  }

  async judge(request: JudgeRequest): Promise<JudgeResult> {
    try {
      const res = await this.#post(request);
      if (!res.ok) return unrecognized(request.promptId);
      return parseResult(await res.json(), request.promptId);
    } catch {
      return unrecognized(request.promptId);
    }
  }

  async #post(request: JudgeRequest): Promise<Response> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.#timeoutMs);
    try {
      return await this.#fetch(this.#url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: abort.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

/** The judge is a separate service, so its response is untrusted like any other input. */
export function parseResult(body: unknown, promptId: PromptId): JudgeResult {
  if (typeof body !== "object" || body === null) return unrecognized(promptId);
  const shape = body as { kind?: unknown; confidence?: unknown; top3?: unknown };
  const top3 = parseGuesses(shape.top3);

  if (shape.kind === "recognized") {
    const confidence = clamp01(shape.confidence);
    if (confidence === null) return unrecognized(promptId);
    return { kind: "recognized", confidence, top3 };
  }
  return { kind: "unrecognized", top3 };
}

function parseGuesses(raw: unknown): { promptId: PromptId; confidence: number }[] {
  if (!Array.isArray(raw)) return [];
  const guesses: { promptId: PromptId; confidence: number }[] = [];
  for (const entry of raw.slice(0, 3)) {
    if (typeof entry !== "object" || entry === null) continue;
    const { promptId, confidence } = entry as { promptId?: unknown; confidence?: unknown };
    const score = clamp01(confidence);
    if (typeof promptId !== "string" || score === null) continue;
    guesses.push({ promptId: promptId as PromptId, confidence: score });
  }
  return guesses;
}

function clamp01(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function unrecognized(promptId: PromptId): JudgeResult {
  return { kind: "unrecognized", top3: [{ promptId, confidence: 0 }] };
}
