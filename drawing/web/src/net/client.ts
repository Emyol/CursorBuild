import PartySocket from "partysocket";

import type { ClientMsg, RoomCode, ServerMsg, Stroke } from "@doodle-fight/contract";
import { encode } from "@doodle-fight/contract";

import type { LocalEvent } from "./store.js";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://127.0.0.1:8787";

/** Ink is flushed on a fixed tick, not per pointer event, to keep frames cheap. */
const STROKE_TICK_MS = 50;
const PING_INTERVAL_MS = 5_000;

export type Resume = { playerId: string; token: string };

const RESUME_KEY = "doodle-fight:resume";

export function rememberResume(code: string, playerId: string, token: string): void {
  sessionStorage.setItem(RESUME_KEY, JSON.stringify({ code, playerId, token }));
}

export function forgetResume(): void {
  sessionStorage.removeItem(RESUME_KEY);
}

/** Only returned for the room it was issued in, so a ticket cannot leak sideways. */
export function readResume(code: RoomCode): Resume | undefined {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY);
    if (!raw) return undefined;
    const saved = JSON.parse(raw) as { code: string; playerId: string; token: string };
    return saved.code === code ? { playerId: saved.playerId, token: saved.token } : undefined;
  } catch {
    return undefined;
  }
}

export async function createRoom(): Promise<RoomCode> {
  const res = await fetch(`${SERVER_URL}/api/rooms`, { method: "POST" });
  if (!res.ok) throw new Error("could not create a room");
  const body = (await res.json()) as { code: RoomCode };
  return body.code;
}

export type ConnectOptions = {
  code: RoomCode;
  username: string;
  resume?: Resume | undefined;
  dispatch: (event: LocalEvent) => void;
};

export class RoomClient {
  #socket: PartySocket;
  #dispatch: (event: LocalEvent) => void;
  #outbox: Stroke[] = [];
  #roundIndex = 0;
  #flusher: ReturnType<typeof setInterval>;
  #pinger: ReturnType<typeof setInterval>;

  constructor({ code, username, resume, dispatch }: ConnectOptions) {
    this.#dispatch = dispatch;
    dispatch({ type: "connecting" });

    this.#socket = new PartySocket({
      host: SERVER_URL.replace(/^https?:\/\//, ""),
      party: "room-server",
      room: code,
    });

    this.#socket.addEventListener("open", () => {
      // identity is re-sent on every open, which is what makes reconnect work
      this.#send({ type: "join", username, ...(resume ? { resume } : {}) });
    });
    this.#socket.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data as string) as ServerMsg;
      // banked immediately so a refresh mid-match can reclaim the same seat
      if (msg.type === "joined") rememberResume(code, msg.selfId, msg.resumeToken);
      dispatch({ type: "server", msg });
    });
    this.#socket.addEventListener("close", () => dispatch({ type: "disconnected" }));

    this.#flusher = setInterval(() => this.#flush(), STROKE_TICK_MS);
    this.#pinger = setInterval(() => this.#send({ type: "ping", sentAt: Date.now() }), PING_INTERVAL_MS);
  }

  setRound(roundIndex: number): void {
    if (roundIndex === this.#roundIndex) return;
    this.#roundIndex = roundIndex;
    this.#outbox = [];
  }

  queueStroke(stroke: Stroke): void {
    this.#outbox.push(stroke);
  }

  ready(roundIndex: number): void {
    this.#send({ type: "ready", roundIndex });
  }

  start(): void {
    this.#send({ type: "start" });
  }

  rematch(): void {
    this.#send({ type: "rematch" });
  }

  submit(roundIndex: number, strokes: Stroke[]): void {
    this.#flush();
    this.#send({ type: "submit", roundIndex, strokes });
  }

  close(): void {
    clearInterval(this.#flusher);
    clearInterval(this.#pinger);
    this.#socket.close();
    this.#dispatch({ type: "leave" });
  }

  #flush(): void {
    if (this.#outbox.length === 0) return;
    const appended = this.#outbox;
    this.#outbox = [];
    this.#send({ type: "strokes", roundIndex: this.#roundIndex, appended });
  }

  #send(msg: ClientMsg): void {
    if (this.#socket.readyState !== WebSocket.OPEN) return;
    this.#socket.send(encode(msg));
  }
}
