import { beforeEach, describe, expect, it } from "vitest";

import type { PlayerId, RoomCode } from "./ids.js";
import type { Match } from "./match.js";
import type { PromptId } from "./prompts.js";
import {
  COUNTDOWN_MS,
  DRAWING_MS,
  LOADING_TIMEOUT_MS,
  MAX_PLAYERS,
  REVEAL_MS,
} from "./match.js";
import type { JudgeResult } from "./judge.js";
import { advance, createMatch } from "./reducer.js";
import type { Effect, MatchEvent } from "./reducer.js";

const CODE = "AB2C" as RoomCode;
const P1 = "p1" as PlayerId;
const P2 = "p2" as PlayerId;
const P3 = "p3" as PlayerId;
const PROMPTS = ["cat", "tree", "star"] as unknown as PromptId[];

let clock = 1_000;
const at = (t: number) => (clock = t);

function withPlayers(...ids: PlayerId[]): Match {
  let match = createMatch(CODE, 3);
  for (const id of ids) {
    match = advance(match, { kind: "joined", playerId: id, username: id }, clock).match;
  }
  return match;
}

/** Drives a match from lobby to a live drawing phase. */
function toDrawing(ids: PlayerId[] = [P1, P2]): Match {
  let match = withPlayers(...ids);
  match = advance(match, { kind: "startRequested", playerId: P1, prompts: PROMPTS }, at(1_000))
    .match;
  for (const id of ids) {
    match = advance(match, { kind: "ready", playerId: id, roundIndex: 0 }, at(1_100)).match;
  }
  return advance(match, { kind: "tick" }, at(1_100 + COUNTDOWN_MS)).match;
}

const kinds = (effects: Effect[]) => effects.map((e) => e.kind);

beforeEach(() => {
  clock = 1_000;
});

describe("joining", () => {
  it("makes the first player the host", () => {
    const match = withPlayers(P1);
    expect(match.players[0]?.isHost).toBe(true);
  });

  it("does not promote later joiners", () => {
    const match = withPlayers(P1, P2);
    expect(match.players.map((p) => p.isHost)).toEqual([true, false]);
  });

  it("refuses a seat past the maximum", () => {
    let match = createMatch(CODE, 3);
    for (let i = 0; i < MAX_PLAYERS; i++) {
      match = advance(
        match,
        { kind: "joined", playerId: `p${i}` as PlayerId, username: `p${i}` },
        clock,
      ).match;
    }
    const after = advance(match, { kind: "joined", playerId: P3, username: "late" }, clock).match;
    expect(after.players).toHaveLength(MAX_PLAYERS);
  });

  it("is idempotent, so a duplicate join does not clone a seat", () => {
    let match = withPlayers(P1);
    match = advance(match, { kind: "joined", playerId: P1, username: "ada" }, clock).match;
    expect(match.players).toHaveLength(1);
  });

  it("disambiguates a username already taken in the room", () => {
    let match = createMatch(CODE, 3);
    match = advance(match, { kind: "joined", playerId: P1, username: "ada" }, clock).match;
    match = advance(match, { kind: "joined", playerId: P2, username: "ada" }, clock).match;
    expect(match.players[1]?.username).not.toBe("ada");
  });
});

describe("starting", () => {
  it("only the host may start", () => {
    const match = withPlayers(P1, P2);
    const { match: after } = advance(
      match,
      { kind: "startRequested", playerId: P2, prompts: PROMPTS },
      clock,
    );
    expect(after.phase.kind).toBe("lobby");
  });

  it("refuses to start below the minimum player count", () => {
    const match = withPlayers(P1);
    const { match: after } = advance(
      match,
      { kind: "startRequested", playerId: P1, prompts: PROMPTS },
      clock,
    );
    expect(after.phase.kind).toBe("lobby");
  });

  it("enters loading with a deadline and schedules the timeout", () => {
    const match = withPlayers(P1, P2);
    const { match: after, effects } = advance(
      match,
      { kind: "startRequested", playerId: P1, prompts: PROMPTS },
      at(5_000),
    );
    expect(after.phase).toMatchObject({ kind: "loading", roundIndex: 0 });
    if (after.phase.kind === "loading") {
      expect(after.phase.deadline).toBe(5_000 + LOADING_TIMEOUT_MS);
    }
    expect(kinds(effects)).toContain("schedule");
  });

  it("clears stale ready flags so the gate cannot be pre-satisfied", () => {
    let match = withPlayers(P1, P2);
    match = { ...match, players: match.players.map((p) => ({ ...p, ready: true })) };
    const { match: after } = advance(
      match,
      { kind: "startRequested", playerId: P1, prompts: PROMPTS },
      clock,
    );
    expect(after.players.every((p) => !p.ready)).toBe(true);
  });
});

describe("the loading handshake", () => {
  it("holds until every connected player reports ready", () => {
    let match = withPlayers(P1, P2);
    match = advance(match, { kind: "startRequested", playerId: P1, prompts: PROMPTS }, clock).match;
    match = advance(match, { kind: "ready", playerId: P1, roundIndex: 0 }, clock).match;
    expect(match.phase.kind).toBe("loading");
    match = advance(match, { kind: "ready", playerId: P2, roundIndex: 0 }, clock).match;
    expect(match.phase.kind).toBe("countdown");
  });

  it("ignores a ready for a different round", () => {
    let match = withPlayers(P1, P2);
    match = advance(match, { kind: "startRequested", playerId: P1, prompts: PROMPTS }, clock).match;
    match = advance(match, { kind: "ready", playerId: P1, roundIndex: 4 }, clock).match;
    expect(match.players[0]?.ready).toBe(false);
  });

  it("does not wait on a player who is disconnected", () => {
    let match = withPlayers(P1, P2, P3);
    match = advance(match, { kind: "startRequested", playerId: P1, prompts: PROMPTS }, clock).match;
    match = advance(match, { kind: "disconnected", playerId: P3 }, clock).match;
    match = advance(match, { kind: "ready", playerId: P1, roundIndex: 0 }, clock).match;
    match = advance(match, { kind: "ready", playerId: P2, roundIndex: 0 }, clock).match;
    expect(match.phase.kind).toBe("countdown");
  });

  it("falls back to the lobby when the gate times out", () => {
    let match = withPlayers(P1, P2);
    match = advance(match, { kind: "startRequested", playerId: P1, prompts: PROMPTS }, at(1_000))
      .match;
    match = advance(match, { kind: "tick" }, at(1_000 + LOADING_TIMEOUT_MS)).match;
    expect(match.phase.kind).toBe("lobby");
  });

  it("falls back to the lobby when a player drops below the minimum", () => {
    let match = withPlayers(P1, P2);
    match = advance(match, { kind: "startRequested", playerId: P1, prompts: PROMPTS }, clock).match;
    match = advance(match, { kind: "disconnected", playerId: P2 }, clock).match;
    expect(match.phase.kind).toBe("lobby");
  });
});

describe("countdown and drawing", () => {
  it("reveals the prompt only once drawing begins", () => {
    let match = withPlayers(P1, P2);
    match = advance(match, { kind: "startRequested", playerId: P1, prompts: PROMPTS }, clock).match;
    match = advance(match, { kind: "ready", playerId: P1, roundIndex: 0 }, clock).match;
    match = advance(match, { kind: "ready", playerId: P2, roundIndex: 0 }, at(2_000)).match;
    expect(JSON.stringify(match.phase)).not.toContain("cat");

    match = advance(match, { kind: "tick" }, at(2_000 + COUNTDOWN_MS)).match;
    expect(match.phase).toMatchObject({ kind: "drawing", promptId: "cat" });
  });

  it("gives every round its own prompt", () => {
    const match = toDrawing();
    expect(match.phase.kind === "drawing" && match.phase.promptId).toBe(PROMPTS[0]);
  });

  it("ends the round when the timer expires, timing out whoever did not submit", () => {
    let match = toDrawing();
    const endsAt = match.phase.kind === "drawing" ? match.phase.endsAt : 0;
    match = advance(match, { kind: "tick" }, at(endsAt)).match;
    expect(match.phase.kind).toBe("reveal");
    if (match.phase.kind === "reveal") {
      expect(match.phase.verdicts[P1]).toEqual({ kind: "timeout" });
      expect(match.phase.verdicts[P2]).toEqual({ kind: "timeout" });
    }
  });
});

describe("submitting and judging", () => {
  it("emits a judge effect carrying the strokes", () => {
    const match = toDrawing();
    const { effects } = advance(
      match,
      { kind: "submitted", playerId: P1, roundIndex: 0, strokes: [[{ x: 1, y: 1, t: 5 }]] },
      clock,
    );
    const judge = effects.find((e) => e.kind === "judge");
    expect(judge).toBeDefined();
    if (judge?.kind === "judge") {
      expect(judge.playerId).toBe(P1);
      expect(judge.promptId).toBe(PROMPTS[0]);
      expect(judge.strokes).toHaveLength(1);
    }
  });

  it("ignores a second submission from the same player", () => {
    let match = toDrawing();
    const submit: MatchEvent = {
      kind: "submitted",
      playerId: P1,
      roundIndex: 0,
      strokes: [[{ x: 1, y: 1, t: 5 }]],
    };
    match = advance(match, submit, clock).match;
    const { effects } = advance(match, submit, clock);
    expect(kinds(effects)).not.toContain("judge");
  });

  it("ignores a submission for a stale round", () => {
    const match = toDrawing();
    const { effects } = advance(
      match,
      { kind: "submitted", playerId: P1, roundIndex: 9, strokes: [[{ x: 1, y: 1, t: 5 }]] },
      clock,
    );
    expect(kinds(effects)).not.toContain("judge");
  });

  it("awards points for a recognized drawing and none for an unrecognized one", () => {
    let match = toDrawing();
    const strokes = [[{ x: 1, y: 1, t: 5 }]];
    match = advance(match, { kind: "submitted", playerId: P1, roundIndex: 0, strokes }, clock).match;
    match = advance(match, { kind: "submitted", playerId: P2, roundIndex: 0, strokes }, clock).match;
    match = advance(
      match,
      {
        kind: "judged",
        playerId: P1,
        roundIndex: 0,
        atMs: 0,
        result: { kind: "recognized", confidence: 0.9, top3: [] },
      },
      clock,
    ).match;
    match = advance(
      match,
      {
        kind: "judged",
        playerId: P2,
        roundIndex: 0,
        atMs: 0,
        result: { kind: "unrecognized", top3: [] },
      },
      clock,
    ).match;

    expect(match.phase.kind).toBe("reveal");
    expect(match.players.find((p) => p.id === P1)?.score).toBeGreaterThan(0);
    expect(match.players.find((p) => p.id === P2)?.score).toBe(0);
  });

  it("rewards the faster of two correct drawings", () => {
    let match = toDrawing();
    const strokes = [[{ x: 1, y: 1, t: 5 }]];
    const recognized: JudgeResult = { kind: "recognized", confidence: 0.9, top3: [] };
    match = advance(match, { kind: "submitted", playerId: P1, roundIndex: 0, strokes }, clock).match;
    match = advance(match, { kind: "submitted", playerId: P2, roundIndex: 0, strokes }, clock).match;
    match = advance(
      match,
      { kind: "judged", playerId: P1, roundIndex: 0, atMs: 1_000, result: recognized },
      clock,
    ).match;
    match = advance(
      match,
      { kind: "judged", playerId: P2, roundIndex: 0, atMs: 15_000, result: recognized },
      clock,
    ).match;

    const p1 = match.players.find((p) => p.id === P1)?.score ?? 0;
    const p2 = match.players.find((p) => p.id === P2)?.score ?? 0;
    expect(p1).toBeGreaterThan(p2);
  });

  it("closes the round to late verdicts once reveal has begun", () => {
    let match = toDrawing();
    const endsAt = match.phase.kind === "drawing" ? match.phase.endsAt : 0;
    match = advance(match, { kind: "tick" }, at(endsAt)).match;
    const before = match.players.find((p) => p.id === P1)?.score;
    match = advance(
      match,
      {
        kind: "judged",
        playerId: P1,
        roundIndex: 0,
        atMs: 100,
        result: { kind: "recognized", confidence: 1, top3: [] },
      },
      clock,
    ).match;
    expect(match.players.find((p) => p.id === P1)?.score).toBe(before);
  });
});

describe("round progression", () => {
  it("moves to the next countdown while rounds remain", () => {
    let match = toDrawing();
    const endsAt = match.phase.kind === "drawing" ? match.phase.endsAt : 0;
    match = advance(match, { kind: "tick" }, at(endsAt)).match;
    match = advance(match, { kind: "tick" }, at(endsAt + REVEAL_MS)).match;
    expect(match.phase).toMatchObject({ kind: "countdown", roundIndex: 1 });
  });

  it("finishes after the last round and ranks the players", () => {
    let match = toDrawing();
    for (let round = 0; round < 3; round++) {
      const endsAt = match.phase.kind === "drawing" ? match.phase.endsAt : clock;
      match = advance(match, { kind: "tick" }, at(endsAt)).match;
      match = advance(match, { kind: "tick" }, at(endsAt + REVEAL_MS)).match;
      if (match.phase.kind === "countdown") {
        match = advance(match, { kind: "tick" }, at(match.phase.startsAt)).match;
      }
    }
    expect(match.phase.kind).toBe("finished");
    if (match.phase.kind === "finished") {
      expect(match.phase.standings).toHaveLength(2);
      expect(match.phase.standings.every((s) => s.rank === 1)).toBe(true);
    }
  });

  it("returns to the lobby on a host rematch with scores cleared", () => {
    let match = toDrawing();
    match = { ...match, phase: { kind: "finished", standings: [] } };
    match = {
      ...match,
      players: match.players.map((p) => ({ ...p, score: 42 })),
    };
    match = advance(match, { kind: "rematchRequested", playerId: P1 }, clock).match;
    expect(match.phase.kind).toBe("lobby");
    expect(match.players.every((p) => p.score === 0)).toBe(true);
  });
});

describe("disconnects", () => {
  it("holds the seat so a reconnect keeps the score", () => {
    let match = toDrawing([P1, P2, P3]);
    match = { ...match, players: match.players.map((p) => ({ ...p, score: 10 })) };
    match = advance(match, { kind: "disconnected", playerId: P3 }, clock).match;
    expect(match.players.find((p) => p.id === P3)?.connected).toBe(false);
    match = advance(match, { kind: "reconnected", playerId: P3 }, clock).match;
    expect(match.players.find((p) => p.id === P3)).toMatchObject({ connected: true, score: 10 });
  });

  it("frees the seat entirely on an explicit leave from the lobby", () => {
    let match = withPlayers(P1, P2);
    match = advance(match, { kind: "left", playerId: P2 }, clock).match;
    expect(match.players).toHaveLength(1);
  });

  it("hands the host role to the next player when the host leaves", () => {
    let match = withPlayers(P1, P2);
    match = advance(match, { kind: "left", playerId: P1 }, clock).match;
    expect(match.players[0]).toMatchObject({ id: P2, isHost: true });
  });
});

describe("purity", () => {
  it("never mutates the match it was given", () => {
    const match = withPlayers(P1, P2);
    const snapshot = JSON.stringify(match);
    advance(match, { kind: "startRequested", playerId: P1, prompts: PROMPTS }, clock);
    advance(match, { kind: "joined", playerId: P3, username: "c" }, clock);
    advance(match, { kind: "disconnected", playerId: P1 }, clock);
    expect(JSON.stringify(match)).toBe(snapshot);
  });

  it("is deterministic for the same inputs", () => {
    const match = withPlayers(P1, P2);
    const a = advance(match, { kind: "startRequested", playerId: P1, prompts: PROMPTS }, 7_000);
    const b = advance(match, { kind: "startRequested", playerId: P1, prompts: PROMPTS }, 7_000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not read the wall clock", () => {
    const match = toDrawing();
    const endsAt = match.phase.kind === "drawing" ? match.phase.endsAt : 0;
    // a tick one millisecond early must not end the round, whatever Date.now says
    expect(advance(match, { kind: "tick" }, endsAt - 1).match.phase.kind).toBe("drawing");
  });
});

describe("scheduling", () => {
  it("asks to be woken at every phase deadline", () => {
    let match = withPlayers(P1, P2);
    const started = advance(
      match,
      { kind: "startRequested", playerId: P1, prompts: PROMPTS },
      at(1_000),
    );
    expect(started.effects).toContainEqual({ kind: "schedule", at: 1_000 + LOADING_TIMEOUT_MS });

    match = started.match;
    match = advance(match, { kind: "ready", playerId: P1, roundIndex: 0 }, clock).match;
    const gated = advance(match, { kind: "ready", playerId: P2, roundIndex: 0 }, at(2_000));
    expect(gated.effects).toContainEqual({ kind: "schedule", at: 2_000 + COUNTDOWN_MS });

    const drawing = advance(gated.match, { kind: "tick" }, at(2_000 + COUNTDOWN_MS));
    expect(drawing.effects).toContainEqual({
      kind: "schedule",
      at: 2_000 + COUNTDOWN_MS + DRAWING_MS,
    });
  });

  it("broadcasts whenever the match actually changed and stays quiet otherwise", () => {
    const match = toDrawing();
    const noop = advance(match, { kind: "ready", playerId: P1, roundIndex: 0 }, clock);
    expect(kinds(noop.effects)).not.toContain("broadcast");

    const real = advance(match, { kind: "disconnected", playerId: P2 }, clock);
    expect(kinds(real.effects)).toContain("broadcast");
  });
});
