import type { Point, Stroke } from "@doodle-fight/contract";
import { COORD_MAX, quantizeCoord } from "@doodle-fight/contract";

import { DEFAULT_STYLE, seedOf, strokeDoodle } from "./doodle.js";

export type EngineOptions = {
  canvas: HTMLCanvasElement;
  /** Round start, so every point carries a `t` the server can trust. */
  startedAt: () => number;
  onStroke?: (stroke: Stroke) => void;
};

/**
 * The input pipeline that makes fast strokes look smooth: the pointer handler
 * only appends numbers, and one rAF loop does all the drawing. Drawing inside
 * the handler is what produces chicken scratch on exactly the quick strokes
 * where smoothness matters most.
 */
export class DrawingEngine {
  #canvas: HTMLCanvasElement;
  #ctx: CanvasRenderingContext2D;
  #startedAt: () => number;
  #onStroke: ((stroke: Stroke) => void) | undefined;

  /** Flat x,y,t triples awaiting the next frame. No allocation per event. */
  #pending: number[] = [];
  #current: Stroke | null = null;
  #strokes: Stroke[] = [];
  #frame = 0;
  #dirty = false;
  #enabled = false;
  #lastFrameMs = 0;

  constructor({ canvas, startedAt, onStroke }: EngineOptions) {
    this.#canvas = canvas;
    this.#startedAt = startedAt;
    this.#onStroke = onStroke;

    const ctx = canvas.getContext("2d", {
      // skips the compositor queue; the single biggest win for pen latency
      desynchronized: true,
      alpha: false,
    });
    if (!ctx) throw new Error("2d canvas context unavailable");
    this.#ctx = ctx;

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.#onDown);
    canvas.addEventListener("pointermove", this.#onMove);
    canvas.addEventListener("pointerup", this.#onUp);
    canvas.addEventListener("pointercancel", this.#onUp);
    this.resize();
  }

  get strokes(): readonly Stroke[] {
    return this.#strokes;
  }

  /** Milliseconds spent in the last render, for the frame budget readout. */
  get lastFrameMs(): number {
    return this.#lastFrameMs;
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    if (!enabled) this.#endStroke();
  }

  clear(): void {
    this.#strokes = [];
    this.#current = null;
    this.#pending.length = 0;
    this.#dirty = true;
    this.#schedule();
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.#canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
    }
    this.#dirty = true;
    this.#schedule();
  }

  destroy(): void {
    this.#canvas.removeEventListener("pointerdown", this.#onDown);
    this.#canvas.removeEventListener("pointermove", this.#onMove);
    this.#canvas.removeEventListener("pointerup", this.#onUp);
    this.#canvas.removeEventListener("pointercancel", this.#onUp);
    if (this.#frame) cancelAnimationFrame(this.#frame);
  }

  #onDown = (event: PointerEvent): void => {
    if (!this.#enabled || !event.isPrimary) return;
    this.#canvas.setPointerCapture(event.pointerId);
    this.#current = [];
    this.#strokes.push(this.#current);
    this.#push(event);
  };

  #onMove = (event: PointerEvent): void => {
    if (!this.#enabled || !this.#current) return;
    // the browser coalesces moves; without this the fast parts of a stroke vanish
    const batch = event.getCoalescedEvents?.() ?? [event];
    for (const sample of batch) this.#push(sample);
  };

  #onUp = (event: PointerEvent): void => {
    if (!this.#current) return;
    if (this.#canvas.hasPointerCapture(event.pointerId)) {
      this.#canvas.releasePointerCapture(event.pointerId);
    }
    this.#endStroke();
  };

  #push(event: PointerEvent): void {
    const rect = this.#canvas.getBoundingClientRect();
    this.#pending.push(
      quantizeCoord((event.clientX - rect.left) / rect.width),
      quantizeCoord((event.clientY - rect.top) / rect.height),
      Math.max(0, Math.round(performance.now() - this.#startedAt())),
    );
    this.#schedule();
  }

  #endStroke(): void {
    this.#drain();
    const finished = this.#current;
    this.#current = null;
    if (finished && finished.length > 0) this.#onStroke?.(finished);
  }

  #schedule(): void {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(this.#render);
  }

  #drain(): void {
    if (this.#pending.length === 0 || !this.#current) return;
    for (let i = 0; i < this.#pending.length; i += 3) {
      this.#current.push({
        x: this.#pending[i]!,
        y: this.#pending[i + 1]!,
        t: this.#pending[i + 2]!,
      });
    }
    this.#pending.length = 0;
    this.#dirty = true;
  }

  #render = (): void => {
    this.#frame = 0;
    this.#drain();
    if (!this.#dirty) return;
    const began = performance.now();
    this.#paint();
    this.#lastFrameMs = performance.now() - began;
    this.#dirty = false;
  };

  #paint(): void {
    const { width, height } = this.#canvas;
    const ctx = this.#ctx;
    ctx.fillStyle = "#fffdf7";
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < this.#strokes.length; i++) {
      const stroke = this.#strokes[i]!;
      const scaled = stroke.map((point) => toPixels(point, width, height));
      strokeDoodle(ctx, scaled, seedOf(i, stroke[0]), {
        ...DEFAULT_STYLE,
        width: DEFAULT_STYLE.width * (window.devicePixelRatio || 1),
      });
    }
  }
}

export function toPixels(point: Point, width: number, height: number): { x: number; y: number } {
  return { x: (point.x / COORD_MAX) * width, y: (point.y / COORD_MAX) * height };
}

/** Renders someone else's strokes into a thumbnail. Shares the doodle look. */
export function paintStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  width: number,
  height: number,
  scale = 1,
): void {
  ctx.fillStyle = "#fffdf7";
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < strokes.length; i++) {
    const stroke = strokes[i]!;
    strokeDoodle(
      ctx,
      stroke.map((point) => toPixels(point, width, height)),
      seedOf(i, stroke[0]),
      { ...DEFAULT_STYLE, width: DEFAULT_STYLE.width * scale, roughness: DEFAULT_STYLE.roughness * scale },
    );
  }
}
