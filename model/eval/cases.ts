import type { PromptId, Stroke } from '../src/contract.js';

export type CaseKind =
  | 'positive'
  | 'negative'
  | 'hard-negative'
  | 'partial-30'
  | 'partial-60'
  | 'adversarial-text'
  | 'adversarial-scribble';

export type Split = 'dev' | 'holdout';

export type EvalCase = {
  id: string;
  kind: CaseKind;
  split: Split;
  /** What the player was told to draw. */
  promptId: PromptId;
  /** What is actually on the canvas, or 'none' for synthesized cases. */
  drawn: string;
  strokes: Stroke[];
};

type KindSpec = {
  expected: 'accept' | 'reject';
  /** Which headline number this class feeds. Partials are reported on their own. */
  metric: 'frr' | 'far' | 'partial';
  description: string;
};

export const KINDS: Record<CaseKind, KindSpec> = {
  positive: {
    expected: 'accept',
    metric: 'frr',
    description: 'a finished drawing of the prompt',
  },
  negative: {
    expected: 'reject',
    metric: 'far',
    description: 'a finished drawing of something unrelated',
  },
  'hard-negative': {
    expected: 'reject',
    metric: 'far',
    description: 'a drawing of a category the prompt is genuinely confused with',
  },
  'partial-30': {
    expected: 'accept',
    metric: 'partial',
    description: 'the prompt drawn 30 percent of the way',
  },
  'partial-60': {
    expected: 'accept',
    metric: 'partial',
    description: 'the prompt drawn 60 percent of the way',
  },
  'adversarial-text': {
    expected: 'reject',
    metric: 'far',
    description: 'the word written out instead of drawn',
  },
  'adversarial-scribble': {
    expected: 'reject',
    metric: 'far',
    description: 'meaningless strokes',
  },
};

export const kindsFor = (metric: KindSpec['metric']): CaseKind[] =>
  (Object.keys(KINDS) as CaseKind[]).filter((k) => KINDS[k].metric === metric);
