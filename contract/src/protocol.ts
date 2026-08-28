import { z } from "zod";

import { normalizeUsername } from "./ids.js";
import type { PlayerId } from "./ids.js";
import type { Match } from "./match.js";
import type { Stroke } from "./strokes.js";
import {
  COORD_MAX,
  MAX_POINTS_PER_STROKE,
  MAX_POINTS_PER_SUBMISSION,
  MAX_STROKES_PER_SUBMISSION,
  countPoints,
} from "./strokes.js";

const coord = z.number().int().min(0).max(COORD_MAX);
const roundIndex = z.number().int().min(0).max(64);

const pointSchema = z
  .object({ x: coord, y: coord, t: z.number().int().min(0).max(600_000) })
  .strict();

const strokeSchema = z.array(pointSchema).min(1).max(MAX_POINTS_PER_STROKE);

const strokeListSchema = z
  .array(strokeSchema)
  .max(MAX_STROKES_PER_SUBMISSION)
  // a thousand legal strokes of a thousand legal points is still a denial of service
  .refine((strokes) => countPoints(strokes) <= MAX_POINTS_PER_SUBMISSION, {
    message: "too many points",
  });

const usernameSchema = z
  .string()
  // generous: normalization truncates, so this only turns away payloads meant to burn CPU
  .max(512)
  .transform((raw, ctx) => {
    const cleaned = normalizeUsername(raw);
    if (cleaned === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "username is empty" });
      return z.NEVER;
    }
    return cleaned;
  });

export const clientMsgSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), username: usernameSchema }).strip(),
  z.object({ type: z.literal("ready"), roundIndex }).strip(),
  z.object({ type: z.literal("start") }).strip(),
  z.object({ type: z.literal("strokes"), roundIndex, appended: strokeListSchema }).strip(),
  z.object({ type: z.literal("submit"), roundIndex, strokes: strokeListSchema }).strip(),
  z.object({ type: z.literal("rematch") }).strip(),
  z.object({ type: z.literal("ping"), sentAt: z.number().int() }).strip(),
]);

export type ClientMsg = z.infer<typeof clientMsgSchema>;

export type RejectReason =
  | "unknown-room"
  | "room-full"
  | "match-in-progress"
  | "bad-username"
  | "rate-limited"
  | "malformed";

export type ServerMsg =
  | { type: "joined"; selfId: PlayerId; match: Match }
  | { type: "rejected"; reason: RejectReason }
  | { type: "match"; match: Match }
  | { type: "peerStrokes"; playerId: PlayerId; roundIndex: number; appended: Stroke[] }
  | { type: "peerCleared"; playerId: PlayerId; roundIndex: number }
  | { type: "pong"; sentAt: number; serverTime: number };

export type Decoded<T> = { ok: true; msg: T } | { ok: false; reason: string };

export function encode(msg: unknown): string {
  return JSON.stringify(msg);
}

/**
 * The only place inbound data becomes trusted. Everything downstream of this
 * treats a ClientMsg as already valid, so this must never throw and must never
 * pass through a key it did not declare.
 */
export function decodeClientMsg(raw: unknown): Decoded<ClientMsg> {
  if (typeof raw !== "string") return { ok: false, reason: "expected a text frame" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "malformed json" };
  }
  const result = clientMsgSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: result.error.issues[0]?.message ?? "invalid message" };
  }
  return { ok: true, msg: result.data };
}
