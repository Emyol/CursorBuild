import type { Judge, JudgeRequest, Verdict } from './contract.js';
import { lookupPrompt } from './prompts.js';

const MIN_STROKES = 2;
const MIN_POINTS = 60;

/**
 * Deterministic stand-in so the room server has a playable loop before the
 * Gemini path lands. Judges effort, not content.
 */
export const stubJudge: Judge = {
  async judge(req: JudgeRequest): Promise<Verdict> {
    const points = req.strokes.reduce((n, s) => n + s.length, 0);
    const enough = req.strokes.length >= MIN_STROKES && points >= MIN_POINTS;
    const prompt = lookupPrompt(req.promptId);
    const confidence = Math.min(0.99, Math.round((points / 400) * 100) / 100);

    return enough
      ? { kind: 'accepted', sees: prompt?.label ?? req.promptId, confidence }
      : { kind: 'rejected', sees: 'a scribble', confidence };
  },

  async judgeBatch(reqs: JudgeRequest[]): Promise<Verdict[]> {
    return Promise.all(reqs.map((r) => stubJudge.judge(r)));
  },
};
