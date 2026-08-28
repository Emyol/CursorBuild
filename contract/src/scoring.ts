import type { Player, Standing } from "./match.js";
import { DRAWING_MS } from "./match.js";

/** Paid for being recognized at all. */
export const BASE_POINTS = 100;

/** Paid on a linear ramp for being recognized early in the round. */
export const SPEED_POINTS_MAX = 100;

export function pointsFor(atMs: number, roundMs: number = DRAWING_MS): number {
  const remaining = 1 - Math.max(0, Math.min(atMs, roundMs)) / roundMs;
  return BASE_POINTS + Math.round(SPEED_POINTS_MAX * remaining);
}

export function standingsOf(players: readonly Player[]): Standing[] {
  return [...players]
    .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
    .map((player) => ({
      playerId: player.id,
      username: player.username,
      score: player.score,
      // ties share a rank rather than being broken arbitrarily
      rank: 1 + players.filter((other) => other.score > player.score).length,
    }));
}
