import { useEffect, useRef } from "react";

import type { Player, PlayerId, Stroke } from "@doodle-fight/contract";

import { paintStrokes } from "../canvas/engine.js";

type Props = {
  opponents: Player[];
  peerStrokes: Record<string, Stroke[]>;
  submitted: readonly PlayerId[];
};

export function OpponentStrip({ opponents, peerStrokes, submitted }: Props) {
  if (opponents.length === 0) return null;
  return (
    <div className="strip" aria-label="Other players">
      {opponents.map((player) => (
        <Thumb
          key={player.id}
          player={player}
          strokes={peerStrokes[player.id] ?? []}
          done={submitted.includes(player.id)}
        />
      ))}
    </div>
  );
}

function Thumb({ player, strokes, done }: { player: Player; strokes: Stroke[]; done: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // thumbnails are ambient, so they render at 1x regardless of dpr to stay cheap
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d", { alpha: false });
    if (ctx) paintStrokes(ctx, strokes, width, height, 0.35);
  }, [strokes]);

  const classes = ["thumb", done ? "thumb--done" : "", player.connected ? "" : "thumb--gone"];

  return (
    <div className={classes.filter(Boolean).join(" ")}>
      <canvas ref={ref} />
      <div className="thumb__name">
        <b title={player.username}>{player.username}</b>
        <span>{player.score}</span>
      </div>
    </div>
  );
}
