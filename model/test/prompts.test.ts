import { describe, expect, it } from 'vitest';
import { ALL_PROMPTS, PROMPTS, lookupPrompt } from '../src/prompts.js';

describe('prompt registry', () => {
  it('has a usable vocabulary', () => {
    expect(ALL_PROMPTS.length).toBeGreaterThanOrEqual(60);
  });

  it('keys every prompt by its own slug', () => {
    for (const prompt of ALL_PROMPTS) {
      expect(PROMPTS.get(prompt.id)).toBe(prompt);
      expect(prompt.id).toBe(prompt.category.replace(/\s+/g, '-'));
    }
  });

  it('has no duplicate categories', () => {
    const categories = ALL_PROMPTS.map((p) => p.category);
    expect(new Set(categories).size).toBe(categories.length);
  });

  it('derives confusable pairs in both directions', () => {
    for (const prompt of ALL_PROMPTS) {
      for (const otherId of prompt.confusableWith) {
        const other = lookupPrompt(otherId);
        expect(other, `${prompt.id} points at missing ${otherId}`).toBeDefined();
        expect(other!.confusableWith).toContain(prompt.id);
      }
    }
  });

  it('gives most prompts at least one confusable partner for hard negatives', () => {
    const withPartner = ALL_PROMPTS.filter((p) => p.confusableWith.length > 0);
    expect(withPartner.length).toBeGreaterThan(ALL_PROMPTS.length / 2);
  });
});
