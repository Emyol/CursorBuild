import { useState } from "react";

import type { Match, PlayerId } from "@doodle-fight/contract";
import { MAX_PLAYERS, MIN_PLAYERS } from "@doodle-fight/contract";

type Props = {
  match: Match;
  selfId: PlayerId | null;
  onStart: () => void;
  onLeave: () => void;
};

export function Lobby({ match, selfId, onStart, onLeave }: Props) {
  const [copied, setCopied] = useState(false);
  const self = match.players.find((player) => player.id === selfId);
  const live = match.players.filter((player) => player.connected).length;
  const canStart = (self?.isHost ?? false) && live >= MIN_PLAYERS;

  const copy = async () => {
    const link = `${location.origin}${location.pathname}?room=${match.code}`;
    await navigator.clipboard.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main className="shell">
      <div className="lobby sketch">
        <h2>waiting room</h2>

        <div className="code-plate sketch sketch--sm" style={{ marginTop: "1rem" }}>
          <div className="code-plate__label muted">room code</div>
          <div className="code-plate__value">{match.code}</div>
          <button className="btn btn--ghost" onClick={copy}>
            {copied ? "link copied" : "copy invite link"}
          </button>
        </div>

        <ul className="roster">
          {match.players.map((player) => (
            <li
              key={player.id}
              className={`seat${player.connected ? "" : " seat--gone"}`}
            >
              <span className="seat__name">
                {player.username}
                {player.id === selfId && " (you)"}
              </span>
              {player.isHost && <span className="badge">host</span>}
            </li>
          ))}
          {Array.from({ length: MAX_PLAYERS - match.players.length }, (_, i) => (
            <li key={`empty-${i}`} className="seat seat--empty muted">
              empty
            </li>
          ))}
        </ul>

        <p className="muted">
          {live} of {MAX_PLAYERS} here. Needs at least {MIN_PLAYERS} to start.
        </p>

        <div className="landing__actions">
          {self?.isHost ? (
            <button className="btn btn--primary" disabled={!canStart} onClick={onStart}>
              {canStart ? "start the fight" : `waiting for ${MIN_PLAYERS - live} more`}
            </button>
          ) : (
            <p className="muted">Waiting for the host to start…</p>
          )}
          <button className="btn btn--ghost" onClick={onLeave}>
            leave
          </button>
        </div>
      </div>
    </main>
  );
}
