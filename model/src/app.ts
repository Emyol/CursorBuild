import { loadConfig } from './config.js';
import type { Deps } from './http.js';
import { createJudge } from './judge.js';
import { RateLimiter } from './ratelimit.js';

let cached: Deps | undefined;

/** Cached so a warm serverless instance reuses the judge and the limiter window. */
export function getDeps(): Deps {
  if (cached) return cached;
  const config = loadConfig();
  cached = {
    config,
    judge: createJudge(config),
    limiter: new RateLimiter(config.rateLimitPerMin),
  };
  return cached;
}
