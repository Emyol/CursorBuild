import type { Connection, ConnectionContext, WSMessage } from "partyserver";
import { Server } from "partyserver";

import type {
  Effect,
  Match,
  MatchEvent,
  PlayerId,
  PromptId,
  RejectReason,
  RoomCode,
  ServerMsg,
  Stroke,
} from "@doodle-fight/contract";
import {
  DEFAULT_TOTAL_ROUNDS,
  DRAWING_MS,
  PROMPTS,
  advance,
  createMatch,
  decodeClientMsg,
  encode,
  makePlayerId,
} from "@doodle-fight/contract";

import type { Env } from "./env.js";
import { admit } from "./admission.js";
import { StandInJudge } from "./judge/standin.js";
import { TokenBucket } from "./ratelimit.js";

/** Survives hibernation on the socket attachment. */
type SeatState = { playerId: PlayerId };

const MATCH_KEY = "match";
const TOKENS_KEY = "tokens";

/** Generous enough for 20Hz stroke batches, tight enough to stop a flood. */
const MESSAGE_BUCKET = { capacity: 60, refillPerSecond: 30 };

export class RoomServer extends Server<Env> {
  static override options = { hibernate: true };

  #match: Match | null = null;
  #tokens = new Map<string, string>();
  #buckets = new WeakMap<Connection, TokenBucket>();
  /** Strokes for the round in flight. Transient; a round is far shorter than an idle timeout. */
  #strokes = new Map<PlayerId, Stroke[]>();
  #judge = new StandInJudge();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // hibernation wipes memory but not storage, so every entry point must find state here
    ctx.blockConcurrencyWhile(async () => {
      this.#match = (await ctx.storage.get<Match>(MATCH_KEY)) ?? null;
      this.#tokens = new Map((await ctx.storage.get<[string, string][]>(TOKENS_KEY)) ?? []);
    });
  }

  /**
   * Claims this code for a new room. Returns false if the code is already taken,
   * which is what makes server-side code issuance collision-free.
   */
  async reserve(totalRounds = DEFAULT_TOTAL_ROUNDS): Promise<boolean> {
    if (this.#match !== null) return false;
    this.#match = createMatch(this.name as RoomCode, totalRounds);
    await this.ctx.storage.put(MATCH_KEY, this.#match);
    return true;
  }

  override async onConnect(connection: Connection, _ctx: ConnectionContext): Promise<void> {
    // identity is established by the `join` message, not the upgrade, so a
    // username never lands in a URL or an access log
    if (this.#match === null) {
      this.#reject(connection, "unknown-room");
      return;
    }
    this.#buckets.set(connection, new TokenBucket(MESSAGE_BUCKET));
  }

  override async onMessage(connection: Connection, raw: WSMessage): Promise<void> {
    const bucket = this.#buckets.get(connection) ?? new TokenBucket(MESSAGE_BUCKET);
    this.#buckets.set(connection, bucket);
    if (!bucket.take(Date.now())) {
      this.#reject(connection, "rate-limited");
      return;
    }

    const decoded = decodeClientMsg(raw);
    if (!decoded.ok) {
      this.#reject(connection, "malformed");
      return;
    }
    const msg = decoded.msg;

    if (msg.type === "join") {
      await this.#onJoin(connection, msg.username, msg.resume);
      return;
    }

    const seat = connection.state as SeatState | null;
    if (!seat) return;

    switch (msg.type) {
      case "ready":
        await this.#apply({ kind: "ready", playerId: seat.playerId, roundIndex: msg.roundIndex });
        return;
      case "start":
        await this.#apply({
          kind: "startRequested",
          playerId: seat.playerId,
          prompts: drawPrompts(this.#match?.totalRounds ?? DEFAULT_TOTAL_ROUNDS),
        });
        return;
      case "strokes":
        this.#onStrokes(connection, seat.playerId, msg.roundIndex, msg.appended);
        return;
      case "submit":
        await this.#apply({
          kind: "submitted",
          playerId: seat.playerId,
          roundIndex: msg.roundIndex,
          strokes: msg.strokes,
        });
        return;
      case "rematch":
        await this.#apply({ kind: "rematchRequested", playerId: seat.playerId });
        return;
      case "ping":
        connection.send(encode({ type: "pong", sentAt: msg.sentAt, serverTime: Date.now() }));
        return;
    }
  }

  override async onClose(connection: Connection): Promise<void> {
    const seat = connection.state as SeatState | null;
    if (!seat) return;
    await this.#apply({ kind: "disconnected", playerId: seat.playerId });
    if (this.#everyoneGone()) await this.#destroy();
  }

  override async onAlarm(): Promise<void> {
    await this.#apply({ kind: "tick" });
  }

  async #onJoin(
    connection: Connection,
    username: string,
    resume: { playerId: string; token: string } | undefined,
  ): Promise<void> {
    const decision = admit(
      this.#match,
      resume ? { playerId: resume.playerId as PlayerId, token: resume.token } : undefined,
      this.#tokens,
    );
    if (!decision.ok) {
      this.#reject(connection, decision.reason);
      return;
    }

    if (decision.kind === "resume") {
      // a second socket for the same seat would double-broadcast, so evict the first
      this.#evictOtherSockets(connection, decision.playerId);
      setSeat(connection, { playerId: decision.playerId });
      await this.#apply({ kind: "reconnected", playerId: decision.playerId });
      this.#sendJoined(connection, decision.playerId);
      return;
    }

    const playerId = makePlayerId();
    const token = makeResumeToken();
    this.#tokens.set(playerId, token);
    await this.ctx.storage.put(TOKENS_KEY, [...this.#tokens]);
    setSeat(connection, { playerId });
    await this.#apply({ kind: "joined", playerId, username });
    this.#sendJoined(connection, playerId);
  }

  #onStrokes(
    connection: Connection,
    playerId: PlayerId,
    roundIndex: number,
    appended: Stroke[],
  ): void {
    const phase = this.#match?.phase;
    if (phase?.kind !== "drawing" || phase.roundIndex !== roundIndex) return;

    const held = this.#strokes.get(playerId) ?? [];
    this.#strokes.set(playerId, [...held, ...appended]);
    // relayed as-is: opponents only need to see the ink, not wait for a state round trip
    this.#broadcast({ type: "peerStrokes", playerId, roundIndex, appended }, connection);
  }

  async #apply(event: MatchEvent): Promise<void> {
    if (this.#match === null) return;
    const { match, effects } = advance(this.#match, event, Date.now());
    const changed = match !== this.#match;
    this.#match = match;
    if (changed) await this.ctx.storage.put(MATCH_KEY, match);
    await this.#run(effects);
  }

  async #run(effects: Effect[]): Promise<void> {
    for (const effect of effects) {
      switch (effect.kind) {
        case "broadcast":
          this.#broadcast({ type: "match", match: this.#match! });
          break;
        case "schedule":
          await this.ctx.storage.setAlarm(effect.at);
          break;
        case "judge":
          this.ctx.waitUntil(this.#judgeAndApply(effect));
          break;
      }
    }
  }

  async #judgeAndApply(effect: Extract<Effect, { kind: "judge" }>): Promise<void> {
    const startedAt = roundStart(this.#match);
    const result = await this.#judge.judge({
      promptId: effect.promptId,
      strokes: effect.strokes,
    });
    await this.#apply({
      kind: "judged",
      playerId: effect.playerId,
      roundIndex: effect.roundIndex,
      atMs: Math.max(0, Date.now() - startedAt),
      result,
    });
  }

  #sendJoined(connection: Connection, playerId: PlayerId): void {
    const token = this.#tokens.get(playerId);
    if (!this.#match || token === undefined) return;
    const msg: ServerMsg = {
      type: "joined",
      selfId: playerId,
      resumeToken: token,
      match: this.#match,
    };
    connection.send(encode(msg));
  }

  #broadcast(msg: ServerMsg, except?: Connection): void {
    this.broadcast(encode(msg), except ? [except.id] : undefined);
  }

  #reject(connection: Connection, reason: RejectReason): void {
    const msg: ServerMsg = { type: "rejected", reason };
    connection.send(encode(msg));
    connection.close(1008, reason);
  }

  #evictOtherSockets(keep: Connection, playerId: PlayerId): void {
    for (const other of this.getConnections<SeatState>()) {
      if (other.id !== keep.id && other.state?.playerId === playerId) {
        other.close(1000, "resumed elsewhere");
      }
    }
  }

  #everyoneGone(): boolean {
    return [...this.getConnections()].length === 0;
  }

  /** Rooms are ephemeral: an empty one leaves nothing behind. */
  async #destroy(): Promise<void> {
    this.#match = null;
    this.#tokens.clear();
    this.#strokes.clear();
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}

/** Persisted on the socket attachment, so it survives hibernation. */
function setSeat(connection: Connection, seat: SeatState): void {
  (connection as Connection<SeatState>).setState(seat);
}

function roundStart(match: Match | null): number {
  const phase = match?.phase;
  if (phase?.kind !== "drawing") return Date.now();
  return phase.endsAt - DRAWING_MS;
}

function drawPrompts(count: number): PromptId[] {
  const pool = [...PROMPTS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}

function makeResumeToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
