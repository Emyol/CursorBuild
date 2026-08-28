import { timingSafeEqual } from 'node:crypto';
import type { Config } from './config.js';
import type { Judge, JudgeRequest, PromptId, Verdict } from './contract.js';
import { ALL_PROMPTS } from './prompts.js';
import type { RateLimiter } from './ratelimit.js';
import { JudgeBodySchema } from './wire.js';

export type RawRequest = {
  method: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
};

export type HandlerResult = { status: number; body: unknown };

export type Deps = {
  judge: Judge;
  config: Config;
  limiter: RateLimiter;
};

function header(req: RawRequest, name: string): string | undefined {
  const raw = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
}

function secretMatches(provided: string | undefined, expected: string): boolean {
  if (provided === undefined) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function handleHealth(deps: Deps): HandlerResult {
  return {
    status: 200,
    body: {
      ok: true,
      mode: deps.config.mode,
      model: deps.config.mode === 'gemini' ? deps.config.model : null,
      promptVersion: deps.config.promptVersion,
      prompts: ALL_PROMPTS.length,
      authConfigured: deps.config.sharedSecret !== undefined,
    },
  };
}

export async function handleJudge(req: RawRequest, deps: Deps): Promise<HandlerResult> {
  if (req.method !== 'POST') {
    return { status: 405, body: { error: 'method not allowed' } };
  }

  if (deps.config.sharedSecret === undefined) {
    return { status: 500, body: { error: 'JUDGE_SHARED_SECRET is not configured' } };
  }

  if (!secretMatches(header(req, 'x-judge-secret'), deps.config.sharedSecret)) {
    return { status: 401, body: { error: 'bad or missing x-judge-secret' } };
  }

  const parsed = JudgeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: 'malformed body', issues: parsed.error.issues.map((i) => i.message) },
    };
  }

  const { roomCode, items } = parsed.data;
  if (!deps.limiter.allow(roomCode ?? 'anonymous')) {
    return { status: 429, body: { error: 'rate limited' } };
  }

  const requests: JudgeRequest[] = items.map((item) => ({
    promptId: item.promptId as PromptId,
    strokes: item.strokes,
  }));

  const started = Date.now();
  try {
    const verdicts = await deps.judge.judgeBatch(requests);
    return { status: 200, body: { verdicts, elapsedMs: Date.now() - started } };
  } catch (cause) {
    const verdicts: Verdict[] = requests.map(() => ({ kind: 'unjudged', reason: 'timeout' }));
    console.error('judgeBatch threw, returning unjudged', cause);
    return { status: 200, body: { verdicts, elapsedMs: Date.now() - started } };
  }
}
