import type { PlayerId, RoomCode } from "./ids.js";
import { USERNAME_MAX_LENGTH } from "./ids.js";
import type { JudgeResult, Verdict } from "./judge.js";
import type { Match, Phase, Player } from "./match.js";
import {
  COUNTDOWN_MS,
  DEFAULT_TOTAL_ROUNDS,
  DRAWING_MS,
  LOADING_TIMEOUT_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  REVEAL_MS,
} from "./match.js";
import type { PromptId } from "./prompts.js";
import { pointsFor, standingsOf } from "./scoring.js";
import type { Stroke } from "./strokes.js";

export type MatchEvent =
  | { kind: "joined"; playerId: PlayerId; username: string }
  | { kind: "left"; playerId: PlayerId }
  | { kind: "disconnected"; playerId: PlayerId }
  | { kind: "reconnected"; playerId: PlayerId }
  | { kind: "startRequested"; playerId: PlayerId; prompts: readonly PromptId[] }
  | { kind: "ready"; playerId: PlayerId; roundIndex: number }
  | { kind: "submitted"; playerId: PlayerId; roundIndex: number; strokes: Stroke[] }
  | { kind: "judged"; playerId: PlayerId; roundIndex: number; atMs: number; result: JudgeResult }
  | { kind: "rematchRequested"; playerId: PlayerId }
  | { kind: "tick" };

export type Effect =
  /** Wake the reducer with a `tick` at this timestamp. */
  | { kind: "schedule"; at: number }
  | { kind: "judge"; playerId: PlayerId; roundIndex: number; promptId: PromptId; strokes: Stroke[] }
  | { kind: "broadcast" };

export type Advanced = { match: Match; effects: Effect[] };

export function createMatch(code: RoomCode, totalRounds = DEFAULT_TOTAL_ROUNDS): Match {
  return { code, players: [], phase: { kind: "lobby" }, totalRounds, prompts: [] };
}

const unchanged = (match: Match): Advanced => ({ match, effects: [] });

/**
 * The whole game, as one pure function. Never reads the clock, never mutates its
 * argument, never performs IO — `effects` describe what the caller should do.
 */
export function advance(match: Match, event: MatchEvent, now: number): Advanced {
  switch (event.kind) {
    case "joined":
      return onJoined(match, event.playerId, event.username, now);
    case "left":
      return onLeft(match, event.playerId, now);
    case "disconnected":
      return onConnectionChanged(match, event.playerId, false, now);
    case "reconnected":
      return onConnectionChanged(match, event.playerId, true, now);
    case "startRequested":
      return onStartRequested(match, event.playerId, event.prompts, now);
    case "ready":
      return onReady(match, event.playerId, event.roundIndex, now);
    case "submitted":
      return onSubmitted(match, event.playerId, event.roundIndex, event.strokes);
    case "judged":
      return onJudged(match, event.playerId, event.roundIndex, event.atMs, event.result, now);
    case "rematchRequested":
      return onRematchRequested(match, event.playerId);
    case "tick":
      return onTick(match, now);
  }
}

function onJoined(match: Match, playerId: PlayerId, username: string, now: number): Advanced {
  if (match.phase.kind !== "lobby") return unchanged(match);
  if (match.players.some((player) => player.id === playerId)) return unchanged(match);
  if (match.players.length >= MAX_PLAYERS) return unchanged(match);

  const player: Player = {
    id: playerId,
    username: uniqueUsername(username, match.players),
    connected: true,
    ready: false,
    isHost: match.players.length === 0,
    score: 0,
    joinedAt: now,
  };
  return { match: { ...match, players: [...match.players, player] }, effects: [{ kind: "broadcast" }] };
}

function onLeft(match: Match, playerId: PlayerId, now: number): Advanced {
  if (!match.players.some((player) => player.id === playerId)) return unchanged(match);

  const remaining = match.players.filter((player) => player.id !== playerId);
  const withHost = ensureHost(remaining);
  return withEffects({ ...match, players: withHost }, now);
}

function onConnectionChanged(
  match: Match,
  playerId: PlayerId,
  connected: boolean,
  now: number,
): Advanced {
  const player = match.players.find((candidate) => candidate.id === playerId);
  if (!player || player.connected === connected) return unchanged(match);

  const players = match.players.map((candidate) =>
    candidate.id === playerId ? { ...candidate, connected } : candidate,
  );
  return withEffects({ ...match, players }, now);
}

function onStartRequested(
  match: Match,
  playerId: PlayerId,
  prompts: readonly PromptId[],
  now: number,
): Advanced {
  if (match.phase.kind !== "lobby") return unchanged(match);
  if (!isHost(match, playerId)) return unchanged(match);
  if (connectedCount(match) < MIN_PLAYERS) return unchanged(match);

  const deadline = now + LOADING_TIMEOUT_MS;
  return {
    match: {
      ...match,
      // a ready flag left over from a previous match would open the gate early
      players: match.players.map((player) => ({ ...player, ready: false, score: 0 })),
      prompts: prompts.slice(0, match.totalRounds),
      phase: { kind: "loading", roundIndex: 0, deadline },
    },
    effects: [{ kind: "schedule", at: deadline }, { kind: "broadcast" }],
  };
}

function onReady(match: Match, playerId: PlayerId, roundIndex: number, now: number): Advanced {
  if (match.phase.kind !== "loading" || match.phase.roundIndex !== roundIndex) {
    return unchanged(match);
  }
  const player = match.players.find((candidate) => candidate.id === playerId);
  if (!player || player.ready) return unchanged(match);

  const players = match.players.map((candidate) =>
    candidate.id === playerId ? { ...candidate, ready: true } : candidate,
  );
  return withEffects({ ...match, players }, now);
}

function onSubmitted(
  match: Match,
  playerId: PlayerId,
  roundIndex: number,
  strokes: Stroke[],
): Advanced {
  const phase = match.phase;
  if (phase.kind !== "drawing" || phase.roundIndex !== roundIndex) return unchanged(match);
  if (phase.submitted.includes(playerId)) return unchanged(match);
  if (!match.players.some((player) => player.id === playerId)) return unchanged(match);

  return {
    match: { ...match, phase: { ...phase, submitted: [...phase.submitted, playerId] } },
    effects: [
      { kind: "judge", playerId, roundIndex, promptId: phase.promptId, strokes },
      { kind: "broadcast" },
    ],
  };
}

function onJudged(
  match: Match,
  playerId: PlayerId,
  roundIndex: number,
  atMs: number,
  result: JudgeResult,
  now: number,
): Advanced {
  const phase = match.phase;
  // a verdict that arrives after the round closed is discarded, not applied late
  if (phase.kind !== "drawing" || phase.roundIndex !== roundIndex) return unchanged(match);
  if (!phase.submitted.includes(playerId)) return unchanged(match);
  if (phase.verdicts[playerId]) return unchanged(match);

  const verdict: Verdict =
    result.kind === "recognized"
      ? { kind: "accepted", atMs, confidence: result.confidence, points: pointsFor(atMs) }
      : { kind: "rejected", top3: result.top3 };

  const points = verdict.kind === "accepted" ? verdict.points : 0;
  const players = match.players.map((player) =>
    player.id === playerId ? { ...player, score: player.score + points } : player,
  );

  return withEffects(
    {
      ...match,
      players,
      phase: { ...phase, verdicts: { ...phase.verdicts, [playerId]: verdict } },
    },
    now,
  );
}

function onRematchRequested(match: Match, playerId: PlayerId): Advanced {
  if (match.phase.kind !== "finished" || !isHost(match, playerId)) return unchanged(match);
  return {
    match: {
      ...match,
      players: match.players.map((player) => ({ ...player, score: 0, ready: false })),
      prompts: [],
      phase: { kind: "lobby" },
    },
    effects: [{ kind: "broadcast" }],
  };
}

function onTick(match: Match, now: number): Advanced {
  const phase = match.phase;
  switch (phase.kind) {
    case "loading":
      if (now < phase.deadline) return unchanged(match);
      return toLobby(match);

    case "countdown":
      if (now < phase.startsAt) return unchanged(match);
      return toDrawing(match, phase.roundIndex, now);

    case "drawing":
      if (now < phase.endsAt) return unchanged(match);
      return toReveal(match, phase, now);

    case "reveal": {
      if (now < phase.endsAt) return unchanged(match);
      const next = phase.roundIndex + 1;
      if (next >= match.totalRounds) {
        return {
          match: { ...match, phase: { kind: "finished", standings: standingsOf(match.players) } },
          effects: [{ kind: "broadcast" }],
        };
      }
      const startsAt = now + COUNTDOWN_MS;
      return {
        match: { ...match, phase: { kind: "countdown", roundIndex: next, startsAt } },
        effects: [{ kind: "schedule", at: startsAt }, { kind: "broadcast" }],
      };
    }

    default:
      return unchanged(match);
  }
}

/**
 * Applies the transitions that any event can unblock: the loading gate opening
 * or collapsing, and a round completing early because everyone finished.
 */
function withEffects(match: Match, now: number): Advanced {
  const phase = match.phase;

  if (phase.kind === "loading") {
    const live = match.players.filter((player) => player.connected);
    if (live.length < MIN_PLAYERS) return toLobby(match);
    if (live.every((player) => player.ready)) {
      const startsAt = now + COUNTDOWN_MS;
      return {
        match: { ...match, phase: { kind: "countdown", roundIndex: phase.roundIndex, startsAt } },
        effects: [{ kind: "schedule", at: startsAt }, { kind: "broadcast" }],
      };
    }
  }

  if (phase.kind === "drawing" && roundIsComplete(match, phase)) {
    return toReveal(match, phase, now);
  }

  return { match, effects: [{ kind: "broadcast" }] };
}

function roundIsComplete(match: Match, phase: Extract<Phase, { kind: "drawing" }>): boolean {
  const live = match.players.filter((player) => player.connected);
  if (live.length === 0) return false;
  return live.every((player) => phase.verdicts[player.id] !== undefined);
}

function toDrawing(match: Match, roundIndex: number, now: number): Advanced {
  const promptId = match.prompts[roundIndex];
  if (promptId === undefined) {
    return {
      match: { ...match, phase: { kind: "finished", standings: standingsOf(match.players) } },
      effects: [{ kind: "broadcast" }],
    };
  }
  const endsAt = now + DRAWING_MS;
  return {
    match: {
      ...match,
      phase: { kind: "drawing", roundIndex, promptId, endsAt, submitted: [], verdicts: {} },
    },
    effects: [{ kind: "schedule", at: endsAt }, { kind: "broadcast" }],
  };
}

function toReveal(
  match: Match,
  phase: Extract<Phase, { kind: "drawing" }>,
  now: number,
): Advanced {
  const verdicts: Record<PlayerId, Verdict> = { ...phase.verdicts };
  for (const player of match.players) {
    if (verdicts[player.id] === undefined) verdicts[player.id] = { kind: "timeout" };
  }
  const endsAt = now + REVEAL_MS;
  return {
    match: {
      ...match,
      phase: { kind: "reveal", roundIndex: phase.roundIndex, promptId: phase.promptId, verdicts, endsAt },
    },
    effects: [{ kind: "schedule", at: endsAt }, { kind: "broadcast" }],
  };
}

function toLobby(match: Match): Advanced {
  return {
    match: {
      ...match,
      players: match.players.map((player) => ({ ...player, ready: false })),
      phase: { kind: "lobby" },
    },
    effects: [{ kind: "broadcast" }],
  };
}

function isHost(match: Match, playerId: PlayerId): boolean {
  return match.players.some((player) => player.id === playerId && player.isHost);
}

function connectedCount(match: Match): number {
  return match.players.reduce((total, player) => total + (player.connected ? 1 : 0), 0);
}

/** Keeps exactly one host alive so a room can never become unstartable. */
function ensureHost(players: Player[]): Player[] {
  if (players.length === 0 || players.some((player) => player.isHost)) return players;
  return players.map((player, index) => ({ ...player, isHost: index === 0 }));
}

function uniqueUsername(desired: string, players: readonly Player[]): string {
  const taken = new Set(players.map((player) => player.username));
  if (!taken.has(desired)) return desired;
  for (let suffix = 2; suffix <= MAX_PLAYERS + 1; suffix++) {
    const tag = ` (${suffix})`;
    const trimmed = desired.slice(0, USERNAME_MAX_LENGTH - tag.length);
    const candidate = `${trimmed}${tag}`;
    if (!taken.has(candidate)) return candidate;
  }
  return desired;
}
