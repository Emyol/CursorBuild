import { useEffect, useMemo, useRef, useState } from "react";

import type { Match as MatchState, PlayerId, Stroke } from "@doodle-fight/contract";
import { DRAWING_MS } from "@doodle-fight/contract";

import { DrawingEngine } from "../canvas/engine.js";
import { OpponentStrip } from "../components/OpponentStrip.js";
import { Reveal } from "./Reveal.js";
import { Scoreboard } from "./Scoreboard.js";

type Props = {
  match: MatchState;
  selfId: PlayerId | null;
  peerStrokes: Record<string, Stroke[]>;
  latencyMs: number | null;
  onStroke: (stroke: Stroke) => void;
  onSubmit: (roundIndex: number, strokes: Stroke[]) => void;
  onRematch: () => void;
  onLeave: () => void;
};

export function Match({
  match,
  selfId,
  peerStrokes,
  latencyMs,
  onStroke,
  onSubmit,
  onRematch,
  onLeave,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DrawingEngine | null>(null);
  const roundStartRef = useRef(performance.now());
  const [now, setNow] = useState(Date.now());
  const [submitted, setSubmitted] = useState(false);

  const phase = match.phase;
  const drawing = phase.kind === "drawing";

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new DrawingEngine({
      canvas,
      startedAt: () => roundStartRef.current,
      onStroke,
    });
    engineRef.current = engine;
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      engine.destroy();
      engineRef.current = null;
    };
  }, [onStroke]);

  // a new round means a blank page and a fresh clock
  const roundIndex = "roundIndex" in phase ? phase.roundIndex : -1;
  useEffect(() => {
    roundStartRef.current = performance.now();
    setSubmitted(false);
    engineRef.current?.clear();
  }, [roundIndex]);

  useEffect(() => {
    engineRef.current?.setEnabled(drawing && !submitted);
  }, [drawing, submitted]);

  const opponents = useMemo(
    () => match.players.filter((player) => player.id !== selfId),
    [match.players, selfId],
  );

  const secondsLeft = drawing ? Math.max(0, Math.ceil((phase.endsAt - now) / 1000)) : 0;

  const submit = () => {
    if (!drawing || submitted) return;
    const strokes = [...(engineRef.current?.strokes ?? [])];
    setSubmitted(true);
    onSubmit(phase.roundIndex, strokes);
  };

  return (
    <main className="match">
      <header className="hud sketch sketch--sm">
        <div className="hud__prompt">
          {drawing ? (
            <>
              draw: <em>{phase.promptId}</em>
            </>
          ) : phase.kind === "countdown" ? (
            "get ready"
          ) : phase.kind === "reveal" ? (
            <>
              it was: <em>{phase.promptId}</em>
            </>
          ) : (
            "final scores"
          )}
        </div>
        <span className="conn">
          <span className={`conn__dot${(latencyMs ?? 0) > 250 ? " conn__dot--bad" : ""}`} />
          {latencyMs === null ? "…" : `${latencyMs}ms`}
        </span>
        {drawing && (
          <span className={`timer${secondsLeft <= 5 ? " timer--urgent" : ""}`}>{secondsLeft}s</span>
        )}
      </header>

      <section className="stage">
        <canvas ref={canvasRef} className="board" />

        <OpponentStrip
          opponents={opponents}
          peerStrokes={peerStrokes}
          submitted={drawing ? phase.submitted : []}
        />

        {drawing && (
          <div className="toolbar">
            <button className="btn btn--ghost" onClick={() => engineRef.current?.clear()}>
              clear
            </button>
            <button className="btn btn--primary" disabled={submitted} onClick={submit}>
              {submitted ? "submitted" : "done"}
            </button>
          </div>
        )}

        {phase.kind === "countdown" && <Countdown startsAt={phase.startsAt} now={now} />}

        {phase.kind === "reveal" && (
          <Reveal players={match.players} verdicts={phase.verdicts} promptId={phase.promptId} />
        )}

        {phase.kind === "finished" && (
          <Scoreboard
            standings={phase.standings}
            selfId={selfId}
            isHost={match.players.find((p) => p.id === selfId)?.isHost ?? false}
            onRematch={onRematch}
            onLeave={onLeave}
          />
        )}
      </section>
    </main>
  );
}

function Countdown({ startsAt, now }: { startsAt: number; now: number }) {
  const left = Math.max(0, Math.ceil((startsAt - now) / 1000));
  return (
    <div className="overlay">
      <div>
        <div className="countdown__n" key={left}>
          {left === 0 ? "go" : left}
        </div>
        <p className="muted">you get {Math.round(DRAWING_MS / 1000)} seconds</p>
      </div>
    </div>
  );
}
