import type { PromptId } from "./prompts.js";
import type { Stroke } from "./strokes.js";

export type Guess = {
  promptId: PromptId;
  /** 0..1. */
  confidence: number;
};

export type JudgeRequest = {
  promptId: PromptId;
  strokes: Stroke[];
};

/**
 * What the model saw. Deliberately free of points and timing: the judge reports
 * recognition, the reducer decides what a recognition is worth. That split is
 * what keeps scoring on the game side of the boundary.
 */
export type JudgeResult =
  | { kind: "recognized"; confidence: number; top3: Guess[] }
  | { kind: "unrecognized"; top3: Guess[] };

/**
 * Implemented by `model/`. The room server only ever sees this shape.
 *
 * `judgeBatch` exists because eight players submit inside the same second, and
 * one request carrying eight drawings shares the prompt tokens and collapses
 * eight round trips into one.
 */
export interface Judge {
  judge(request: JudgeRequest): Promise<JudgeResult>;
  judgeBatch(requests: JudgeRequest[]): Promise<JudgeResult[]>;
}

/** The game-level outcome, produced by the reducer from a {@link JudgeResult}. */
export type Verdict =
  | { kind: "accepted"; atMs: number; confidence: number; points: number }
  | { kind: "rejected"; top3: Guess[] }
  | { kind: "timeout" };
