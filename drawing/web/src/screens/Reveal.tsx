import type { Player, PlayerId, PromptId, Verdict } from "@doodle-fight/contract";

type Props = {
  players: Player[];
  verdicts: Record<PlayerId, Verdict>;
  promptId: PromptId;
};

export function Reveal({ players, verdicts, promptId }: Props) {
  const ordered = [...players].sort((a, b) => scoreOf(verdicts[b.id]) - scoreOf(verdicts[a.id]));

  return (
    <div className="overlay">
      <div className="results sketch">
        <h2>
          it was a <span style={{ color: "var(--accent)" }}>{promptId}</span>
        </h2>
        <ul className="results__list">
          {ordered.map((player) => {
            const verdict = verdicts[player.id];
            const hit = verdict?.kind === "accepted";
            return (
              <li
                key={player.id}
                className={`results__row ${hit ? "results__row--hit" : "results__row--miss"}`}
              >
                <span className="results__rank" aria-hidden>
                  {hit ? "✓" : "✕"}
                </span>
                <span className="seat__name">
                  {player.username}
                  <span className="muted"> — {describe(verdict)}</span>
                </span>
                <span className="results__pts">{hit ? `+${verdict.points}` : "+0"}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function describe(verdict: Verdict | undefined): string {
  if (!verdict) return "no verdict";
  switch (verdict.kind) {
    case "accepted":
      return `recognized in ${(verdict.atMs / 1000).toFixed(1)}s`;
    case "rejected": {
      const guess = verdict.top3[0];
      return guess ? `looked like a ${guess.promptId}` : "not recognized";
    }
    case "timeout":
      return "ran out of time";
  }
}

function scoreOf(verdict: Verdict | undefined): number {
  return verdict?.kind === "accepted" ? verdict.points : 0;
}
