import { useEffect, useState } from "react";

import type { Match, PlayerId } from "@doodle-fight/contract";

type Props = {
  match: Match;
  selfId: PlayerId | null;
  deadline: number;
};

/**
 * The handshake made visible. Every player has to report in before the round
 * starts, so this screen shows exactly who the room is still waiting on rather
 * than spinning anonymously.
 */
export function Loading({ match, selfId, deadline }: Props) {
  const [left, setLeft] = useState(() => secondsLeft(deadline));

  useEffect(() => {
    const id = setInterval(() => setLeft(secondsLeft(deadline)), 250);
    return () => clearInterval(id);
  }, [deadline]);

  const waiting = match.players.filter((player) => player.connected && !player.ready);

  return (
    <main className="shell">
      <div className="gate sketch">
        <h2>getting everyone in</h2>
        <p className="muted">Nobody draws until the whole room is here.</p>

        <ul className="gate__list">
          {match.players.map((player) => (
            <li
              key={player.id}
              className={`gate__row${player.ready ? " gate__row--ready" : ""}`}
            >
              {player.ready ? (
                <span className="gate__tick" aria-hidden>
                  ✓
                </span>
              ) : (
                <span className="gate__spinner" aria-hidden />
              )}
              <span className="seat__name">
                {player.username}
                {player.id === selfId && " (you)"}
              </span>
              <span className="muted" style={{ marginLeft: "auto", fontSize: "0.8rem" }}>
                {!player.connected ? "dropped" : player.ready ? "ready" : "loading…"}
              </span>
            </li>
          ))}
        </ul>

        <p className="muted">
          {waiting.length === 0
            ? "Everyone's in. Starting…"
            : `Waiting on ${waiting.length}. Giving up in ${left}s.`}
        </p>
      </div>
    </main>
  );
}

function secondsLeft(deadline: number): number {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}
