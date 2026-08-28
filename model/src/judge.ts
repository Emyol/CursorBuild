import type { Config } from './config.js';
import type { Judge } from './contract.js';
import { createGeminiJudge } from './gemini.js';
import { stubJudge } from './stub.js';

export function createJudge(config: Config): Judge {
  return config.mode === 'stub' ? stubJudge : createGeminiJudge(config);
}
