import { z } from 'zod';

const EnvSchema = z.object({
  GEMINI_API_KEY: z.string().min(1).optional(),
  JUDGE_SHARED_SECRET: z.string().min(8).optional(),
  JUDGE_MODE: z.enum(['stub', 'gemini']).optional(),
  GEMINI_MODEL: z.string().default('gemini-3.1-flash-lite'),
  JUDGE_PROMPT_VERSION: z.string().default('v1'),
  JUDGE_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  JUDGE_MEDIA_RESOLUTION: z.enum(['low', 'medium']).default('low'),
  JUDGE_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),
});

export type Config = {
  mode: 'stub' | 'gemini';
  apiKey: string | undefined;
  sharedSecret: string | undefined;
  model: string;
  promptVersion: string;
  timeoutMs: number;
  mediaResolution: 'low' | 'medium';
  rateLimitPerMin: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const present = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ''),
  );
  const parsed = EnvSchema.parse(present);
  return {
    mode: parsed.JUDGE_MODE ?? (parsed.GEMINI_API_KEY ? 'gemini' : 'stub'),
    apiKey: parsed.GEMINI_API_KEY,
    sharedSecret: parsed.JUDGE_SHARED_SECRET,
    model: parsed.GEMINI_MODEL,
    promptVersion: parsed.JUDGE_PROMPT_VERSION,
    timeoutMs: parsed.JUDGE_TIMEOUT_MS,
    mediaResolution: parsed.JUDGE_MEDIA_RESOLUTION,
    rateLimitPerMin: parsed.JUDGE_RATE_LIMIT_PER_MIN,
  };
}
