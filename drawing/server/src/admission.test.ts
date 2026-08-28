import { describe, expect, it } from "vitest";

import type { PlayerId, RoomCode } from "@doodle-fight/contract";
import { MAX_PLAYERS, advance, createMatch } from "@doodle-fight/contract";

import { admit } from "./admission.js";

const CODE = "AB2C" as RoomCode;
const seat = (id: string) => ({ playerId: id as PlayerId, token: "t".repeat(43) });

function lobbyWith(count: number) {
  let match = createMatch(CODE, 3);
  for (let i = 0; i < count; i++) {
    match = advance(
      match,
      { kind: "joined", playerId: `p${i}` as PlayerId, username: `p${i}` },
      0,
    ).match;
  }
  return match;
}

describe("admit", () => {
  it("rejects a room that was never created", () => {
    expect(admit(null, undefined, new Map())).toEqual({ ok: false, reason: "unknown-room" });
  });

  it("admits a new player into an open lobby", () => {
    const result = admit(lobbyWith(1), undefined, new Map());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe("new");
  });

  it("rejects once the room is full", () => {
    expect(admit(lobbyWith(MAX_PLAYERS), undefined, new Map())).toEqual({
      ok: false,
      reason: "room-full",
    });
  });

  it("rejects a newcomer once the match has started", () => {
    let match = lobbyWith(2);
    match = advance(
      match,
      { kind: "startRequested", playerId: "p0" as PlayerId, prompts: [] },
      0,
    ).match;
    expect(admit(match, undefined, new Map())).toEqual({ ok: false, reason: "match-in-progress" });
  });

  it("lets a known player resume mid-match with a valid token", () => {
    let match = lobbyWith(2);
    match = advance(
      match,
      { kind: "startRequested", playerId: "p0" as PlayerId, prompts: [] },
      0,
    ).match;
    const tokens = new Map([["p0", "t".repeat(43)]]);
    const result = admit(match, seat("p0"), tokens);
    expect(result).toEqual({ ok: true, kind: "resume", playerId: "p0" });
  });

  it("refuses a resume whose token does not match, so a seat cannot be stolen", () => {
    const match = lobbyWith(2);
    const tokens = new Map([["p0", "correct".padEnd(43, "x")]]);
    expect(admit(match, seat("p0"), tokens)).toEqual({ ok: false, reason: "unknown-room" });
  });

  it("refuses a resume for a player who is not in the room", () => {
    const match = lobbyWith(2);
    const tokens = new Map([["ghost", "t".repeat(43)]]);
    expect(admit(match, seat("ghost"), tokens)).toEqual({ ok: false, reason: "unknown-room" });
  });

  it("lets a full room accept a reconnect from one of its own players", () => {
    const match = lobbyWith(MAX_PLAYERS);
    const tokens = new Map([["p3", "t".repeat(43)]]);
    const result = admit(match, seat("p3"), tokens);
    expect(result).toEqual({ ok: true, kind: "resume", playerId: "p3" });
  });
});
