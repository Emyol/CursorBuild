import type { Judge, JudgeRequest, JudgeResult } from "@doodle-fight/contract";
import { countPoints } from "@doodle-fight/contract";

/**
 * Placeholder until `model/` ships. Deterministic on purpose: a random judge
 * would make the game feel broken and would hide real bugs in the round loop.
 * It rewards anyone who actually drew something rather than pretending to see.
 */
export class StandInJudge implements Judge {
  async judgeBatch(requests: JudgeRequest[]): Promise<JudgeResult[]> {
    return Promise.all(requests.map((request) => this.judge(request)));
  }

  async judge(request: JudgeRequest): Promise<JudgeResult> {
    const points = countPoints(request.strokes);
    const enoughInk = request.strokes.length >= 1 && points >= 24;
    const guess = { promptId: request.promptId, confidence: enoughInk ? 0.8 : 0.2 };
    return enoughInk
      ? { kind: "recognized", confidence: 0.8, top3: [guess] }
      : { kind: "unrecognized", top3: [guess] };
  }
}
