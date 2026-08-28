import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('config', () => {
  it('treats a blank env var as absent', () => {
    const config = loadConfig({ GEMINI_API_KEY: '', JUDGE_SHARED_SECRET: 'abcdefgh' });
    expect(config.apiKey).toBeUndefined();
    expect(config.mode).toBe('stub');
  });

  it('defaults to gemini mode once a key is present', () => {
    const config = loadConfig({ GEMINI_API_KEY: 'k', JUDGE_SHARED_SECRET: 'abcdefgh' });
    expect(config.mode).toBe('gemini');
  });

  it('lets JUDGE_MODE override a present key', () => {
    const config = loadConfig({ GEMINI_API_KEY: 'k', JUDGE_MODE: 'stub' });
    expect(config.mode).toBe('stub');
  });

  it('refuses a short shared secret', () => {
    expect(() => loadConfig({ JUDGE_SHARED_SECRET: 'short' })).toThrow();
  });
});
