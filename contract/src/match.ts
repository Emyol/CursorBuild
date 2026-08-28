import type { PlayerId, RoomCode } from "./ids.js";
import type { Verdict } from "./judge.js";
import type { PromptId } from "./prompts.js";

export type Player = {
  id: PlayerId;
  username: string;
  /** False while the socket is gone but the seat is still held for reconnect. */
  connected: boolean;
  /** Reported assets-loaded and socket-live for the current loading gate. */
  ready: boolean;
  isHost: boolean;
  score: number;
  joinedAt: number;
};

export type Standing = {
  playerId: PlayerId;
  username: string;
  score: number;
  /** 1-based, shared by ties. */
  rank: number;
};

export type Phase =
  | { kind: "lobby" }
  | { kind: "loading"; roundIndex: number; deadline: number }
  | { kind: "countdown"; roundIndex: number; startsAt: number }
  | { kind: "drawing"; roundIndex: number; promptId: PromptId; endsAt: number }
  | { kind: "reveal"; roundIndex: number; promptId: PromptId; verdicts: Record<PlayerId, Verdict>; endsAt: number }
  | { kind: "finished"; standings: Standing[] };

export type PhaseKind = Phase["kind"];

export type Match = {
  code: RoomCode;
  players: Player[];
  phase: Phase;
  totalRounds: number;
  /** One prompt per round, drawn when the match starts. */
  prompts: PromptId[];
};

export const DEFAULT_TOTAL_ROUNDS = 5;
export const COUNTDOWN_MS = 3_000;
export const DRAWING_MS = 20_000;
export const REVEAL_MS = 6_000;
/** How long the loading gate waits before giving up on a player who never reports ready. */
export const LOADING_TIMEOUT_MS = 15_000;

export function findPlayer(match: Match, id: PlayerId): Player | undefined {
  return match.players.find((player) => player.id === id);
}

export function hostOf(match: Match): Player | undefined {
  return match.players.find((player) => player.isHost);
}

export function connectedPlayers(match: Match): Player[] {
  return match.players.filter((player) => player.connected);
}
