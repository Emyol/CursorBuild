import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Config } from './config.js';
import type { Judge, JudgeRequest, Verdict } from './contract.js';
import { lookupPrompt } from './prompts.js';
import { renderToPng } from './render.js';

const ReplySchema = z.object({
  match: z.boolean(),
  sees: z.string().min(1).max(80),
  confidence: z.number().min(0).max(1),
});

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    match: { type: 'boolean' },
    sees: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['match', 'sees', 'confidence'],
} as const;

export function loadSystemPrompt(version: string): string {
  return readFileSync(fileURLToPath(new URL(`../prompts/${version}.md`, import.meta.url)), 'utf8');
}

export type GeminiJudge = Judge & { lastUsage?: { input: number; output: number } };

export function createGeminiJudge(config: Config): GeminiJudge {
  if (!config.apiKey) throw new Error('GEMINI_API_KEY is required for gemini mode');
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const systemInstruction = loadSystemPrompt(config.promptVersion);

  const judge = async (req: JudgeRequest): Promise<Verdict> => {
    const prompt = lookupPrompt(req.promptId);
    if (!prompt) return { kind: 'unjudged', reason: 'malformed' };

    const png = renderToPng(req.strokes);
    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), config.timeoutMs),
    );

    try {
      const call = ai.models.generateContent({
        model: config.model,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/png', data: png.toString('base64') } },
              { text: `The player was asked to draw: ${prompt.label}` },
            ],
          },
        ],
        config: {
          systemInstruction,
          temperature: 0,
          responseMimeType: 'application/json',
          responseJsonSchema: RESPONSE_SCHEMA,
        },
      });

      const result = await Promise.race([call, timeout]);
      if (result === 'timeout') return { kind: 'unjudged', reason: 'timeout' };

      const usage = result.usageMetadata;
      judgeState.lastUsage = {
        input: usage?.promptTokenCount ?? 0,
        output: usage?.candidatesTokenCount ?? 0,
      };

      const parsed = ReplySchema.safeParse(JSON.parse(result.text ?? ''));
      if (!parsed.success) return { kind: 'unjudged', reason: 'malformed' };

      const { match, sees, confidence } = parsed.data;
      return { kind: match ? 'accepted' : 'rejected', sees, confidence };
    } catch (cause) {
      const message = String(cause);
      const quota = /429|quota|RESOURCE_EXHAUSTED/i.test(message);
      console.error('gemini judge failed', message.slice(0, 200));
      return { kind: 'unjudged', reason: quota ? 'quota' : 'timeout' };
    }
  };

  const judgeState: GeminiJudge = {
    judge,
    judgeBatch: (reqs) => Promise.all(reqs.map(judge)),
  };
  return judgeState;
}
