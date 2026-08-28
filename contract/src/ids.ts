import type { Brand } from "./brand.js";

/** A room code, already validated against {@link ROOM_CODE_ALPHABET}. */
export type RoomCode = Brand<string, "RoomCode">;

/** Server-issued, unique for the lifetime of a room. */
export type PlayerId = Brand<string, "PlayerId">;

/**
 * Every glyph that survives being read aloud across a table. O, I, L, 0 and 1
 * are absent, so a misheard code can only fail to parse — it can never resolve
 * to a different live room.
 */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const ROOM_CODE_LENGTH = 4;

export const USERNAME_MAX_LENGTH = 16;

/** Returns a uniformly distributed integer in `[0, n)`. */
export type RandomIndex = (n: number) => number;

const secureIndex: RandomIndex = (n) => {
  // rejection sampling, plain modulo would over-weight the first 0xffffffff % n glyphs
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  let draw: number;
  do {
    crypto.getRandomValues(buf);
    draw = buf[0]!;
  } while (draw >= limit);
  return draw % n;
};

export function makeRoomCode(random: RandomIndex = secureIndex): RoomCode {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[random(ROOM_CODE_ALPHABET.length)];
  }
  return code as RoomCode;
}

export function isRoomCode(value: string): value is RoomCode {
  if (value.length !== ROOM_CODE_LENGTH) return false;
  for (const glyph of value) if (!ROOM_CODE_ALPHABET.includes(glyph)) return false;
  return true;
}

/**
 * Shapes raw keystrokes into something that could be a room code. Safe to run on
 * every keypress: it only ever removes characters.
 */
export function normalizeRoomCodeInput(raw: string): string {
  let out = "";
  for (const glyph of raw.toUpperCase()) {
    if (out.length === ROOM_CODE_LENGTH) break;
    if (ROOM_CODE_ALPHABET.includes(glyph)) out += glyph;
  }
  return out;
}

export function makePlayerId(): PlayerId {
  return crypto.randomUUID() as PlayerId;
}

// C0/C1 controls, zero-width glyphs, and the bidi overrides that let a name
// reorder the text around it in a roster.
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/gu;

/** Returns null when nothing displayable survives, which the caller must reject. */
export function normalizeUsername(raw: string): string | null {
  const collapsed = raw.replace(INVISIBLE, "").replace(/\s+/gu, " ").trim();
  if (collapsed.length === 0) return null;
  return [...collapsed].slice(0, USERNAME_MAX_LENGTH).join("");
}
