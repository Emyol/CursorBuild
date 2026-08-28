import { describe, expect, it } from 'vitest';
import type { Config } from '../src/config.js';
import { handleHealth, handleJudge, type Deps } from '../src/http.js';
import { RateLimiter } from '../src/ratelimit.js';
import { stubJudge } from '../src/stub.js';
import { SYNTHETIC } from '../src/synthetic.js';

const config: Config = {
  mode: 'stub',
  apiKey: undefined,
  sharedSecret: 'test-secret-value',
  model: 'gemini-3.1-flash-lite',
  promptVersion: 'v1',
  timeoutMs: 8000,
  mediaResolution: 'low',
  rateLimitPerMin: 5,
};

const deps = (over: Partial<Deps> = {}): Deps => ({
  judge: stubJudge,
  config,
  limiter: new RateLimiter(config.rateLimitPerMin),
  ...over,
});

const auth = { 'x-judge-secret': config.sharedSecret! };

const post = (body: unknown, headers: Record<string, string> = auth, d = deps()) =>
  handleJudge({ method: 'POST', headers, body }, d);

describe('auth', () => {
  it('rejects a missing secret', async () => {
    expect((await post({ items: [] }, {})).status).toBe(401);
  });

  it('rejects a wrong secret of the same length', async () => {
    const same = { 'x-judge-secret': 'x'.repeat(config.sharedSecret!.length) };
    expect((await post({ items: [] }, same)).status).toBe(401);
  });

  it('fails closed when no secret is configured', async () => {
    const d = deps({ config: { ...config, sharedSecret: undefined } });
    expect((await post({ items: [] }, auth, d)).status).toBe(500);
  });
});

describe('validation', () => {
  it('rejects a non-POST', async () => {
    const res = await handleJudge({ method: 'GET', headers: auth, body: {} }, deps());
    expect(res.status).toBe(405);
  });

  it('rejects an unknown promptId', async () => {
    const res = await post({ items: [{ promptId: 'unicorn', strokes: SYNTHETIC.house }] });
    expect(res.status).toBe(400);
  });

  it('rejects a point outside the canvas', async () => {
    const res = await post({ items: [{ promptId: 'house', strokes: [[{ x: 2048, y: 0 }]] }] });
    expect(res.status).toBe(400);
  });

  it('rejects a batch over the limit', async () => {
    const item = { promptId: 'house', strokes: SYNTHETIC.house };
    const res = await post({ items: Array.from({ length: 9 }, () => item) });
    expect(res.status).toBe(400);
  });
});

describe('judging', () => {
  it('accepts a drawn house and rejects a bare dot', async () => {
    const res = await post({
      items: [
        { promptId: 'house', strokes: SYNTHETIC.house },
        { promptId: 'house', strokes: SYNTHETIC.dot },
      ],
    });
    expect(res.status).toBe(200);
    const { verdicts } = res.body as { verdicts: Array<{ kind: string }> };
    expect(verdicts.map((v) => v.kind)).toEqual(['accepted', 'rejected']);
  });

  it('returns unjudged rather than throwing when the judge fails', async () => {
    const exploding = {
      judge: async () => {
        throw new Error('boom');
      },
      judgeBatch: async () => {
        throw new Error('boom');
      },
    };
    const res = await post(
      { items: [{ promptId: 'house', strokes: SYNTHETIC.house }] },
      auth,
      deps({ judge: exploding }),
    );
    expect(res.status).toBe(200);
    const { verdicts } = res.body as { verdicts: Array<{ kind: string }> };
    expect(verdicts[0]?.kind).toBe('unjudged');
  });

  it('rate limits a room past its window', async () => {
    const d = deps();
    const body = { roomCode: 'AAAA', items: [{ promptId: 'house', strokes: SYNTHETIC.house }] };
    for (let i = 0; i < config.rateLimitPerMin; i += 1) {
      expect((await post(body, auth, d)).status).toBe(200);
    }
    expect((await post(body, auth, d)).status).toBe(429);
  });
});

describe('health', () => {
  it('reports mode and prompt count without leaking config', () => {
    const res = handleHealth(deps());
    const body = res.body as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('stub');
    expect(body.prompts).toBeGreaterThan(50);
    expect(JSON.stringify(body)).not.toContain(config.sharedSecret!);
  });
});
