import type { Brand } from "./brand.js";

export type PromptId = Brand<string, "PromptId">;

/**
 * Provisional vocabulary. `model/` owns the final list — whatever the trained
 * classifier can actually distinguish wins, and confusable pairs get dropped
 * there. This exists so the game loop is playable before the model lands.
 */
export const PROMPTS: readonly PromptId[] = [
  "apple",
  "banana",
  "bicycle",
  "bridge",
  "cactus",
  "candle",
  "cat",
  "chair",
  "cloud",
  "crown",
  "donut",
  "envelope",
  "eye",
  "fish",
  "flower",
  "guitar",
  "hammer",
  "hat",
  "house",
  "key",
  "ladder",
  "lightning",
  "moon",
  "mountain",
  "mushroom",
  "octopus",
  "pencil",
  "pizza",
  "rainbow",
  "sailboat",
  "scissors",
  "snowman",
  "star",
  "sun",
  "sword",
  "tree",
  "umbrella",
  "whale",
] as unknown as readonly PromptId[];

export function isPromptId(value: string): value is PromptId {
  return (PROMPTS as readonly string[]).includes(value);
}
