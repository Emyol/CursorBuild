import type { Match, PlayerId, RejectReason } from "@doodle-fight/contract";
import { MAX_PLAYERS } from "@doodle-fight/contract";

export type Resume = { playerId: PlayerId; token: string };

export type Admission =
  | { ok: true; kind: "new" }
  | { ok: true; kind: "resume"; playerId: PlayerId }
  | { ok: false; reason: RejectReason };

/**
 * Decides whether a socket may take a seat. A resume that fails for any reason
 * reports `unknown-room` rather than the real cause, so this cannot be used to
 * probe which player ids exist in a room.
 */
export function admit(
  match: Match | null,
  resume: Resume | undefined,
  tokens: ReadonlyMap<string, string>,
): Admission {
  if (match === null) return { ok: false, reason: "unknown-room" };

  if (resume) {
    const expected = tokens.get(resume.playerId);
    const known = match.players.some((player) => player.id === resume.playerId);
    if (!known || expected === undefined || !timingSafeEqual(expected, resume.token)) {
      return { ok: false, reason: "unknown-room" };
    }
    return { ok: true, kind: "resume", playerId: resume.playerId };
  }

  if (match.phase.kind !== "lobby") return { ok: false, reason: "match-in-progress" };
  if (match.players.length >= MAX_PLAYERS) return { ok: false, reason: "room-full" };
  return { ok: true, kind: "new" };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
