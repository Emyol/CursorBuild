declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type PromptId = Brand<string, 'PromptId'>;
export type PlayerId = Brand<string, 'PlayerId'>;

/**
 * Square on purpose. QuickDraw source drawings are square, so a non-square
 * judging space would stretch every eval image relative to production.
 * The front-end letterboxes its drawing area into this box.
 */
export const CANVAS = {
  width: 1024,
  height: 1024,
  aspect: 1,
} as const;

export type Point = { x: number; y: number };
export type Stroke = Point[];

export type JudgeRequest = {
  promptId: PromptId;
  strokes: Stroke[];
};

export type Verdict =
  | { kind: 'accepted'; sees: string; confidence: number }
  | { kind: 'rejected'; sees: string; confidence: number }
  | { kind: 'unjudged'; reason: UnjudgedReason };

export type UnjudgedReason = 'timeout' | 'quota' | 'malformed';

export interface Judge {
  judge(req: JudgeRequest): Promise<Verdict>;
  judgeBatch(reqs: JudgeRequest[]): Promise<Verdict[]>;
}

export const LIMITS = {
  maxBatch: 8,
  maxStrokesPerDrawing: 400,
  maxPointsPerDrawing: 12000,
} as const;

export function isAccepted(v: Verdict): boolean {
  return v.kind === 'accepted';
}

export function describeVerdict(v: Verdict): string {
  switch (v.kind) {
    case 'accepted':
      return `accepted, saw ${v.sees}`;
    case 'rejected':
      return `rejected, saw ${v.sees}`;
    case 'unjudged':
      return `unjudged, ${v.reason}`;
    default: {
      const exhaustive: never = v;
      return exhaustive;
    }
  }
}
