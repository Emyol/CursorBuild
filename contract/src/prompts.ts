import type { Brand } from "./brand.js";

export type PromptId = Brand<string, "PromptId">;

export type Prompt = {
  id: PromptId;
  /** Shown to the player and handed to the judge. */
  label: string;
  /** QuickDraw category name, the eval's ground truth and its download key. */
  category: string;
  /** Prompts a drawing of this one is plausibly mistaken for. Symmetric. */
  confusableWith: PromptId[];
};

/**
 * Square on purpose. QuickDraw source drawings are square, so a non-square
 * judging space would stretch every production drawing relative to the eval.
 * The drawing surface letterboxes itself into this box.
 */
export const CANVAS = { width: 1024, height: 1024, aspect: 1 } as const;

const CATEGORIES: ReadonlyArray<readonly [category: string, label: string]> = [
  ["airplane", "an airplane"],
  ["alarm clock", "an alarm clock"],
  ["anvil", "an anvil"],
  ["apple", "an apple"],
  ["banana", "a banana"],
  ["bicycle", "a bicycle"],
  ["birthday cake", "a birthday cake"],
  ["bowtie", "a bowtie"],
  ["bridge", "a bridge"],
  ["broom", "a broom"],
  ["butterfly", "a butterfly"],
  ["cactus", "a cactus"],
  ["camera", "a camera"],
  ["campfire", "a campfire"],
  ["candle", "a candle"],
  ["castle", "a castle"],
  ["cat", "a cat"],
  ["chair", "a chair"],
  ["cloud", "a cloud"],
  ["cookie", "a cookie"],
  ["crab", "a crab"],
  ["crown", "a crown"],
  ["dolphin", "a dolphin"],
  ["donut", "a donut"],
  ["dragon", "a dragon"],
  ["duck", "a duck"],
  ["envelope", "an envelope"],
  ["eyeglasses", "a pair of eyeglasses"],
  ["fish", "a fish"],
  ["flower", "a flower"],
  ["flying saucer", "a flying saucer"],
  ["guitar", "a guitar"],
  ["hammer", "a hammer"],
  ["hat", "a hat"],
  ["helicopter", "a helicopter"],
  ["hourglass", "an hourglass"],
  ["house", "a house"],
  ["ice cream", "an ice cream cone"],
  ["key", "a key"],
  ["ladder", "a ladder"],
  ["light bulb", "a light bulb"],
  ["lightning", "a lightning bolt"],
  ["lion", "a lion"],
  ["lollipop", "a lollipop"],
  ["moon", "a crescent moon"],
  ["mountain", "a mountain"],
  ["mushroom", "a mushroom"],
  ["octopus", "an octopus"],
  ["owl", "an owl"],
  ["palm tree", "a palm tree"],
  ["penguin", "a penguin"],
  ["pizza", "a slice of pizza"],
  ["rainbow", "a rainbow"],
  ["sailboat", "a sailboat"],
  ["scissors", "a pair of scissors"],
  ["shark", "a shark"],
  ["snail", "a snail"],
  ["snowflake", "a snowflake"],
  ["snowman", "a snowman"],
  ["spider", "a spider"],
  ["star", "a star"],
  ["stop sign", "a stop sign"],
  ["strawberry", "a strawberry"],
  ["sun", "the sun"],
  ["sword", "a sword"],
  ["tent", "a tent"],
  ["tornado", "a tornado"],
  ["train", "a train"],
  ["tree", "a tree"],
  ["umbrella", "an umbrella"],
  ["whale", "a whale"],
  ["windmill", "a windmill"],
  ["wine glass", "a wine glass"],
  ["zebra", "a zebra"],
];

/**
 * Pairs a rushed drawing genuinely conflates. Each pair seeds hard negatives in
 * both directions, so the eval measures the false accepts that actually happen
 * rather than the easy ones from unrelated categories.
 */
const CONFUSABLE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["cat", "lion"],
  ["dolphin", "shark"],
  ["dolphin", "whale"],
  ["shark", "whale"],
  ["shark", "fish"],
  ["fish", "whale"],
  ["moon", "banana"],
  ["sun", "flower"],
  ["star", "snowflake"],
  ["cookie", "donut"],
  ["apple", "strawberry"],
  ["tree", "palm tree"],
  ["tree", "mushroom"],
  ["house", "castle"],
  ["house", "tent"],
  ["mountain", "tent"],
  ["candle", "lollipop"],
  ["lollipop", "umbrella"],
  ["owl", "penguin"],
  ["duck", "penguin"],
  ["crab", "spider"],
  ["spider", "octopus"],
  ["snail", "octopus"],
  ["airplane", "helicopter"],
  ["airplane", "flying saucer"],
  ["sailboat", "flying saucer"],
  ["hourglass", "bowtie"],
  ["bowtie", "butterfly"],
  ["crown", "castle"],
  ["crown", "star"],
  ["key", "hammer"],
  ["hammer", "anvil"],
  ["ladder", "bridge"],
  ["train", "bridge"],
  ["light bulb", "lollipop"],
  ["lightning", "tornado"],
  ["tornado", "snail"],
  ["rainbow", "bridge"],
  ["ice cream", "lollipop"],
  ["pizza", "ice cream"],
  ["wine glass", "lollipop"],
  ["stop sign", "sun"],
  ["scissors", "bowtie"],
];

export const slugify = (category: string): PromptId =>
  category.replace(/\s+/g, "-") as PromptId;

function buildRegistry(): Map<PromptId, Prompt> {
  const known = new Set(CATEGORIES.map(([category]) => category));
  const links = new Map<string, Set<string>>();

  for (const [a, b] of CONFUSABLE_PAIRS) {
    if (!known.has(a) || !known.has(b)) continue;
    if (!links.has(a)) links.set(a, new Set());
    if (!links.has(b)) links.set(b, new Set());
    links.get(a)!.add(b);
    links.get(b)!.add(a);
  }

  const registry = new Map<PromptId, Prompt>();
  for (const [category, label] of CATEGORIES) {
    registry.set(slugify(category), {
      id: slugify(category),
      label,
      category,
      confusableWith: [...(links.get(category) ?? [])].map(slugify),
    });
  }
  return registry;
}

export const PROMPT_REGISTRY: ReadonlyMap<PromptId, Prompt> = buildRegistry();

export const ALL_PROMPTS: readonly Prompt[] = [...PROMPT_REGISTRY.values()];

export const PROMPTS: readonly PromptId[] = ALL_PROMPTS.map((prompt) => prompt.id);

export function lookupPrompt(id: string): Prompt | undefined {
  return PROMPT_REGISTRY.get(id as PromptId);
}

export function isPromptId(value: string): value is PromptId {
  return PROMPT_REGISTRY.has(value as PromptId);
}

/** What the player is told to draw. Falls back to the id if a prompt is unknown. */
export function promptLabel(id: PromptId): string {
  return PROMPT_REGISTRY.get(id)?.label ?? id;
}
