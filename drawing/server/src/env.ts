import type { RoomServer } from "./room.js";

export interface Env {
  RoomServer: DurableObjectNamespace<RoomServer>;
  /** Static UI, present when the worker is deployed with the Vite build. */
  ASSETS?: Fetcher;
  /** Origin of the deployed judge. Unset falls back to the stand-in. */
  JUDGE_URL?: string;
  /** Must match JUDGE_SHARED_SECRET on the judge, which fails closed without it. */
  JUDGE_SHARED_SECRET?: string;
}
