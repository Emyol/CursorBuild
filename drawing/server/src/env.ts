import type { RoomServer } from "./room.js";

export interface Env {
  RoomServer: DurableObjectNamespace<RoomServer>;
  /** Set once `model/` is deployed; until then the stand-in judge is used. */
  JUDGE_URL?: string;
}
