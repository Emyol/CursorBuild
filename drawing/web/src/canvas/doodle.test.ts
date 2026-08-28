import { describe, expect, it } from "vitest";

import { seedOf, strokeDoodle } from "./doodle.js";

/** Records the path the renderer builds so jitter can be inspected without a DOM. */
function fakeCtx() {
  const path: { op: string; x: number; y: number }[] = [];
  return {
    path,
    ctx: {
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 0,
      lineCap: "",
      lineJoin: "",
      beginPath: () => {},
      moveTo: (x: number, y: number) => path.push({ op: "move", x, y }),
      lineTo: (x: number, y: number) => path.push({ op: "line", x, y }),
      arc: (x: number, y: number) => path.push({ op: "arc", x, y }),
      fill: () => {},
      stroke: () => {},
    } as unknown as CanvasRenderingContext2D,
  };
}

const line = [
  { x: 0, y: 0 },
  { x: 10, y: 10 },
  { x: 20, y: 20 },
];

describe("strokeDoodle", () => {
  it("emits one path node per point", () => {
    const { ctx, path } = fakeCtx();
    strokeDoodle(ctx, line, 1);
    expect(path).toHaveLength(3);
    expect(path[0]?.op).toBe("move");
  });

  it("is deterministic, so a redrawn stroke does not shimmer between frames", () => {
    const a = fakeCtx();
    const b = fakeCtx();
    strokeDoodle(a.ctx, line, 42);
    strokeDoodle(b.ctx, line, 42);
    expect(a.path).toEqual(b.path);
  });

  it("gives different strokes different wobble", () => {
    const a = fakeCtx();
    const b = fakeCtx();
    strokeDoodle(a.ctx, line, 1);
    strokeDoodle(b.ctx, line, 2);
    expect(a.path).not.toEqual(b.path);
  });

  it("displaces points but keeps them near the true line", () => {
    const { ctx, path } = fakeCtx();
    strokeDoodle(ctx, line, 7, { color: "#000", width: 2, roughness: 2 });
    for (let i = 0; i < line.length; i++) {
      const drawn = path[i]!;
      const truth = line[i]!;
      expect(Math.abs(drawn.x - truth.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(drawn.y - truth.y)).toBeLessThanOrEqual(1);
      expect(drawn.x).not.toBe(truth.x);
    }
  });

  it("draws a dot for a single-point stroke rather than nothing", () => {
    const { ctx, path } = fakeCtx();
    strokeDoodle(ctx, [{ x: 5, y: 5 }], 1);
    expect(path[0]?.op).toBe("arc");
  });

  it("handles an empty stroke without throwing", () => {
    const { ctx, path } = fakeCtx();
    expect(() => strokeDoodle(ctx, [], 1)).not.toThrow();
    expect(path).toHaveLength(0);
  });
});

describe("seedOf", () => {
  it("differs per stroke index", () => {
    expect(seedOf(0, { x: 1, y: 1, t: 0 })).not.toBe(seedOf(1, { x: 1, y: 1, t: 0 }));
  });

  it("is stable for the same stroke", () => {
    expect(seedOf(3, { x: 9, y: 4, t: 0 })).toBe(seedOf(3, { x: 9, y: 4, t: 0 }));
  });
});
