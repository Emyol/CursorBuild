import { describe, expect, it } from "vitest";

import { COORD_MAX, MAX_POINTS_PER_STROKE, MAX_STROKES_PER_SUBMISSION } from "./strokes.js";
import { USERNAME_MAX_LENGTH } from "./ids.js";
import { decodeClientMsg, encode } from "./protocol.js";

const stroke = (points = 3) =>
  Array.from({ length: points }, (_, i) => ({ x: i, y: i, t: i * 10 }));

describe("decodeClientMsg", () => {
  it("accepts a well formed join", () => {
    const result = decodeClientMsg(encode({ type: "join", username: "ada" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.msg).toEqual({ type: "join", username: "ada" });
  });

  it("normalizes the username rather than trusting the client", () => {
    const result = decodeClientMsg(encode({ type: "join", username: "  ada   lovelace " }));
    expect(result.ok && result.msg.type === "join" && result.msg.username).toBe("ada lovelace");
  });

  it("rejects a username that normalizes to nothing", () => {
    expect(decodeClientMsg(encode({ type: "join", username: "\u202E  " })).ok).toBe(false);
  });

  it("truncates an over-long username instead of rejecting the player", () => {
    const result = decodeClientMsg(encode({ type: "join", username: "z".repeat(200) }));
    expect(result.ok && result.msg.type === "join" && result.msg.username.length).toBe(
      USERNAME_MAX_LENGTH,
    );
  });

  it("rejects malformed json without throwing", () => {
    expect(decodeClientMsg("{not json").ok).toBe(false);
    expect(decodeClientMsg("").ok).toBe(false);
  });

  it("rejects an unknown message type", () => {
    expect(decodeClientMsg(JSON.stringify({ type: "drop-table" })).ok).toBe(false);
  });

  it("rejects binary frames", () => {
    expect(decodeClientMsg(new ArrayBuffer(8)).ok).toBe(false);
  });

  it("accepts strokes within the caps", () => {
    const result = decodeClientMsg(
      encode({ type: "strokes", roundIndex: 0, appended: [stroke()] }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects coordinates outside the quantized grid", () => {
    const bad = [[{ x: COORD_MAX + 1, y: 0, t: 0 }]];
    expect(decodeClientMsg(encode({ type: "strokes", roundIndex: 0, appended: bad })).ok).toBe(
      false,
    );
    const negative = [[{ x: -1, y: 0, t: 0 }]];
    expect(
      decodeClientMsg(encode({ type: "strokes", roundIndex: 0, appended: negative })).ok,
    ).toBe(false);
  });

  it("rejects non-integer coordinates", () => {
    const bad = [[{ x: 1.5, y: 0, t: 0 }]];
    expect(decodeClientMsg(encode({ type: "strokes", roundIndex: 0, appended: bad })).ok).toBe(
      false,
    );
  });

  it("rejects a stroke count past the cap", () => {
    const many = Array.from({ length: MAX_STROKES_PER_SUBMISSION + 1 }, () => stroke(1));
    expect(decodeClientMsg(encode({ type: "submit", roundIndex: 0, strokes: many })).ok).toBe(
      false,
    );
  });

  it("rejects a single stroke past the point cap", () => {
    const huge = [stroke(MAX_POINTS_PER_STROKE + 1)];
    expect(decodeClientMsg(encode({ type: "submit", roundIndex: 0, strokes: huge })).ok).toBe(
      false,
    );
  });

  it("rejects a submission whose strokes are individually legal but collectively enormous", () => {
    const strokes = Array.from({ length: 200 }, () => stroke(200));
    expect(decodeClientMsg(encode({ type: "submit", roundIndex: 0, strokes })).ok).toBe(false);
  });

  it("rejects a negative round index", () => {
    expect(decodeClientMsg(encode({ type: "ready", roundIndex: -1 })).ok).toBe(false);
  });

  it("strips unknown keys rather than passing them through", () => {
    const result = decodeClientMsg(JSON.stringify({ type: "start", isAdmin: true }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.msg).toEqual({ type: "start" });
  });
});
