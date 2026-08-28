import { describe, expect, it } from "vitest";

import type { Match, PlayerId, RoomCode } from "@doodle-fight/contract";
import { advance, createMatch } from "@doodle-fight/contract";

import { initialState, reduceClient } from "./store.js";

const P1 = "p1" as PlayerId;
const P2 = "p2" as PlayerId;

function lobby(): Match {
  let match = createMatch("AB2C" as RoomCode, 3);
  match = advance(match, { kind: "joined", playerId: P1, username: "ada" }, 0).match;
  return advance(match, { kind: "joined", playerId: P2, username: "grace" }, 0).match;
}

const joined = (match: Match) =>
  reduceClient(initialState, {
    type: "server",
    msg: { type: "joined", selfId: P1, resumeToken: "t", match },
  });

describe("reduceClient", () => {
  it("moves to the lobby screen on join and records who we are", () => {
    const state = joined(lobby());
    expect(state.screen).toBe("lobby");
    expect(state.selfId).toBe(P1);
    expect(state.status).toBe("live");
  });

  it("derives the screen from the server phase rather than tracking its own", () => {
    let state = joined(lobby());
    const loading = advance(
      lobby(),
      { kind: "startRequested", playerId: P1, prompts: [] },
      0,
    ).match;
    state = reduceClient(state, { type: "server", msg: { type: "match", match: loading } });
    expect(state.screen).toBe("loading");
  });

  it("accumulates opponent strokes", () => {
    let state = joined(lobby());
    const appended = [[{ x: 1, y: 1, t: 0 }]];
    state = reduceClient(state, {
      type: "server",
      msg: { type: "peerStrokes", playerId: P2, roundIndex: 0, appended },
    });
    state = reduceClient(state, {
      type: "server",
      msg: { type: "peerStrokes", playerId: P2, roundIndex: 0, appended },
    });
    expect(state.peerStrokes[P2]).toHaveLength(2);
  });

  it("drops stale ink when the round changes", () => {
    let state = joined(lobby());
    state = reduceClient(state, {
      type: "server",
      msg: { type: "peerStrokes", playerId: P2, roundIndex: 0, appended: [[{ x: 1, y: 1, t: 0 }]] },
    });
    const nextRound: Match = {
      ...lobby(),
      phase: { kind: "countdown", roundIndex: 1, startsAt: 0 },
    };
    state = reduceClient(state, { type: "server", msg: { type: "match", match: nextRound } });
    expect(state.peerStrokes).toEqual({});
  });

  it("keeps ink while the round is unchanged", () => {
    const drawing: Match = {
      ...lobby(),
      phase: {
        kind: "drawing",
        roundIndex: 0,
        promptId: "cat" as never,
        endsAt: 0,
        submitted: [],
        verdicts: {},
      },
    };
    let state = joined(drawing);
    state = reduceClient(state, {
      type: "server",
      msg: { type: "peerStrokes", playerId: P2, roundIndex: 0, appended: [[{ x: 1, y: 1, t: 0 }]] },
    });
    state = reduceClient(state, { type: "server", msg: { type: "match", match: drawing } });
    expect(state.peerStrokes[P2]).toHaveLength(1);
  });

  it("resets to the landing screen on rejection and remembers why", () => {
    let state = joined(lobby());
    state = reduceClient(state, { type: "server", msg: { type: "rejected", reason: "room-full" } });
    expect(state.screen).toBe("landing");
    expect(state.rejection).toBe("room-full");
    expect(state.match).toBeNull();
  });

  it("shows reconnecting rather than dropping the match on a socket close", () => {
    let state = joined(lobby());
    state = reduceClient(state, { type: "disconnected" });
    expect(state.status).toBe("reconnecting");
    expect(state.match).not.toBeNull();
  });

  it("does not overwrite a rejection with a reconnect attempt", () => {
    let state = joined(lobby());
    state = reduceClient(state, {
      type: "server",
      msg: { type: "rejected", reason: "match-in-progress" },
    });
    state = reduceClient(state, { type: "disconnected" });
    expect(state.status).toBe("rejected");
  });

  it("records latency from a pong", () => {
    let state = joined(lobby());
    state = reduceClient(state, {
      type: "server",
      msg: { type: "pong", sentAt: Date.now() - 40, serverTime: Date.now() },
    });
    expect(state.latencyMs).toBeGreaterThanOrEqual(35);
  });

  it("clears everything on leave", () => {
    let state = joined(lobby());
    state = reduceClient(state, { type: "leave" });
    expect(state).toEqual(initialState);
  });
});
