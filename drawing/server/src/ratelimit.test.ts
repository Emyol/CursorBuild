import { describe, expect, it } from "vitest";

import { TokenBucket } from "./ratelimit.js";

describe("TokenBucket", () => {
  it("allows a burst up to capacity", () => {
    const bucket = new TokenBucket({ capacity: 3, refillPerSecond: 1 });
    expect(bucket.take(0)).toBe(true);
    expect(bucket.take(0)).toBe(true);
    expect(bucket.take(0)).toBe(true);
    expect(bucket.take(0)).toBe(false);
  });

  it("refills over time", () => {
    const bucket = new TokenBucket({ capacity: 2, refillPerSecond: 10 });
    bucket.take(0);
    bucket.take(0);
    expect(bucket.take(0)).toBe(false);
    expect(bucket.take(100)).toBe(true);
  });

  it("never refills past capacity, so idling does not buy a bigger burst", () => {
    const bucket = new TokenBucket({ capacity: 2, refillPerSecond: 10 });
    expect(bucket.take(60_000)).toBe(true);
    expect(bucket.take(60_000)).toBe(true);
    expect(bucket.take(60_000)).toBe(false);
  });

  it("ignores a clock that goes backwards", () => {
    const bucket = new TokenBucket({ capacity: 1, refillPerSecond: 1 });
    expect(bucket.take(1_000)).toBe(true);
    expect(bucket.take(0)).toBe(false);
  });
});
