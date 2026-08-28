import type { PlayerId, Standing } from "@doodle-fight/contract";

type Props = {
  standings: Standing[];
  selfId: PlayerId | null;
  isHost: boolean;
  onRematch: () => void;
  onLeave: () => void;
};

const MEDALS = ["1st", "2nd", "3rd"];

export function Scoreboard({ standings, selfId, isHost, onRematch, onLeave }: Props) {
  const winner = standings[0];

  return (
    <div className="overlay">
      <div className="results sketch">
        <h2>{winner ? `${winner.username} wins` : "that's a wrap"}</h2>

        <ul className="results__list">
          {standings.map((standing) => (
            <li
              key={standing.playerId}
              className={`results__row${standing.rank === 1 ? " results__row--hit" : ""}`}
            >
              <span className="results__rank">{MEDALS[standing.rank - 1] ?? `${standing.rank}th`}</span>
              <span className="seat__name">
                {standing.username}
                {standing.playerId === selfId && " (you)"}
              </span>
              <span className="results__pts">{standing.score}</span>
            </li>
          ))}
        </ul>

        <div className="landing__actions">
          {isHost ? (
            <button className="btn btn--primary" onClick={onRematch}>
              rematch
            </button>
          ) : (
            <p className="muted">Waiting for the host to call a rematch…</p>
          )}
          <button className="btn btn--ghost" onClick={onLeave}>
            leave
          </button>
        </div>
      </div>
    </div>
  );
}
