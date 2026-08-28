import type { RoomServer } from "./room.js";

export interface Env {
  RoomServer: DurableObjectNamespace<RoomServer>;
  /** Origin of the deployed judge. Unset falls back to the stand-in. */
  JUDGE_URL?: string;
  /** Must match JUDGE_SHARED_SECRET on the judge, which fails closed without it. */
  JUDGE_SHARED_SECRET?: string;
}
