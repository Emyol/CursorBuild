import { describe, expect, it } from "vitest";

import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  USERNAME_MAX_LENGTH,
  isRoomCode,
  makeRoomCode,
  normalizeRoomCodeInput,
  normalizeUsername,
} from "./ids.js";
import { MAX_PLAYERS, MIN_PLAYERS } from "./match.js";

describe("room code alphabet", () => {
  it("omits every glyph that is ambiguous when read aloud", () => {
    for (const ambiguous of ["0", "O", "1", "I", "L"]) {
      expect(ROOM_CODE_ALPHABET).not.toContain(ambiguous);
    }
  });

  it("has no duplicate glyphs", () => {
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length);
  });

  it("is large enough that four glyphs exceed half a million combinations", () => {
    expect(ROOM_CODE_ALPHABET.length ** ROOM_CODE_LENGTH).toBeGreaterThan(500_000);
  });
});

describe("makeRoomCode", () => {
  it("produces a code of the declared length drawn only from the alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = makeRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      for (const glyph of code) expect(ROOM_CODE_ALPHABET).toContain(glyph);
    }
  });

  it("is not obviously biased toward one glyph", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) for (const glyph of makeRoomCode()) seen.add(glyph);
    expect(seen.size).toBeGreaterThan(ROOM_CODE_ALPHABET.length / 2);
  });

  it("accepts an injected random source so the server can be deterministic in tests", () => {
    const always = (n: number) => 0;
    expect(makeRoomCode(always)).toBe(ROOM_CODE_ALPHABET[0]!.repeat(ROOM_CODE_LENGTH));
  });
});

describe("isRoomCode", () => {
  it("accepts a freshly generated code", () => {
    expect(isRoomCode(makeRoomCode())).toBe(true);
  });

  it("rejects wrong length, excluded glyphs, and lowercase", () => {
    expect(isRoomCode("ABC")).toBe(false);
    expect(isRoomCode("ABCDE")).toBe(false);
    expect(isRoomCode("ABC0")).toBe(false);
    expect(isRoomCode("ABCO")).toBe(false);
    expect(isRoomCode("abcd")).toBe(false);
    expect(isRoomCode("")).toBe(false);
  });
});

describe("normalizeRoomCodeInput", () => {
  it("uppercases and drops glyphs outside the alphabet", () => {
    expect(normalizeRoomCodeInput("a b-c2")).toBe("ABC2");
  });

  it("truncates past the code length so the field cannot overflow", () => {
    expect(normalizeRoomCodeInput("ABCDEFGH")).toBe("ABCD");
  });

  it("cannot turn a mistyped ambiguous glyph into a different valid code", () => {
    // O, I, L, 0, 1 are absent from the alphabet, so a misheard glyph can only
    // shorten the input into an invalid code, never silently reach another room.
    expect(isRoomCode(normalizeRoomCodeInput("A0BC"))).toBe(false);
  });
});

describe("normalizeUsername", () => {
  it("trims and collapses runs of whitespace", () => {
    expect(normalizeUsername("  ada   lovelace ")).toBe("ada lovelace");
  });

  it("caps length", () => {
    const long = "x".repeat(USERNAME_MAX_LENGTH + 20);
    expect(normalizeUsername(long)).toHaveLength(USERNAME_MAX_LENGTH);
  });

  it("strips control characters and bidirectional overrides that would break layout", () => {
    expect(normalizeUsername("ada\u0000\u202Elovelace")).toBe("adalovelace");
    expect(normalizeUsername("a\u200Bb")).toBe("ab");
  });

  it("returns null when nothing usable survives", () => {
    expect(normalizeUsername("   ")).toBeNull();
    expect(normalizeUsername("\u202E\u200B")).toBeNull();
    expect(normalizeUsername("")).toBeNull();
  });
});

describe("player count bounds", () => {
  it("matches the two-to-eight rule the game is built around", () => {
    expect(MIN_PLAYERS).toBe(2);
    expect(MAX_PLAYERS).toBe(8);
  });
});
