import type { Config } from './config.js';
import type { Judge } from './contract.js';
import { stubJudge } from './stub.js';

export function createJudge(config: Config): Judge {
  if (config.mode === 'stub') return stubJudge;
  throw new Error(
    'gemini mode is not wired yet, set JUDGE_MODE=stub or wait for the gemini judge',
  );
}
