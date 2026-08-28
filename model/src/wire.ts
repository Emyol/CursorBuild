import { z } from 'zod';
import { CANVAS, LIMITS } from './contract.js';
import { PROMPTS } from './prompts.js';

const PointSchema = z.object({
  x: z.number().int().min(0).max(CANVAS.width - 1),
  y: z.number().int().min(0).max(CANVAS.height - 1),
});

const StrokeSchema = z.array(PointSchema).min(1);

const ItemSchema = z
  .object({
    promptId: z.string().min(1),
    strokes: z.array(StrokeSchema).max(LIMITS.maxStrokesPerDrawing),
  })
  .superRefine((item, ctx) => {
    if (!PROMPTS.has(item.promptId as never)) {
      ctx.addIssue({ code: 'custom', message: `unknown promptId: ${item.promptId}` });
    }
    const points = item.strokes.reduce((n, s) => n + s.length, 0);
    if (points > LIMITS.maxPointsPerDrawing) {
      ctx.addIssue({
        code: 'custom',
        message: `too many points: ${points} > ${LIMITS.maxPointsPerDrawing}`,
      });
    }
  });

export const JudgeBodySchema = z.object({
  roomCode: z.string().min(1).max(16).optional(),
  items: z.array(ItemSchema).min(1).max(LIMITS.maxBatch),
});

export type JudgeBody = z.infer<typeof JudgeBodySchema>;
