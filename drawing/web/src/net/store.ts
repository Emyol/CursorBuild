import type { Match, PlayerId, RejectReason, ServerMsg, Stroke } from "@doodle-fight/contract";

export type Screen = "landing" | "lobby" | "loading" | "match";

export type ClientState = {
  screen: Screen;
  status: "idle" | "connecting" | "live" | "reconnecting" | "rejected";
  rejection: RejectReason | null;
  selfId: PlayerId | null;
  match: Match | null;
  /** Opponent ink for the round in flight, keyed by player. */
  peerStrokes: Record<string, Stroke[]>;
  /** Round-trip time from the last ping, for the connection indicator. */
  latencyMs: number | null;
};

export const initialState: ClientState = {
  screen: "landing",
  status: "idle",
  rejection: null,
  selfId: null,
  match: null,
  peerStrokes: {},
  latencyMs: null,
};

export type LocalEvent =
  | { type: "connecting" }
  | { type: "disconnected" }
  | { type: "leave" }
  | { type: "server"; msg: ServerMsg };

/**
 * A pure mirror of what the server said. It never invents phase transitions —
 * the screen is derived from the authoritative phase, so a client cannot skip
 * the loading gate by mutating its own state.
 */
export function reduceClient(state: ClientState, event: LocalEvent): ClientState {
  switch (event.type) {
    case "connecting":
      return { ...state, status: state.match ? "reconnecting" : "connecting", rejection: null };

    case "disconnected":
      return state.status === "rejected" ? state : { ...state, status: "reconnecting" };

    case "leave":
      return initialState;

    case "server":
      return applyServer(state, event.msg);
  }
}

function applyServer(state: ClientState, msg: ServerMsg): ClientState {
  switch (msg.type) {
    case "joined":
      return {
        ...state,
        status: "live",
        rejection: null,
        selfId: msg.selfId,
        match: msg.match,
        screen: screenFor(msg.match),
      };

    case "match": {
      const roundChanged = roundOf(state.match) !== roundOf(msg.match);
      return {
        ...state,
        status: "live",
        match: msg.match,
        screen: screenFor(msg.match),
        // stale ink from the previous round would bleed into the new thumbnails
        peerStrokes: roundChanged ? {} : state.peerStrokes,
      };
    }

    case "peerStrokes": {
      const held = state.peerStrokes[msg.playerId] ?? [];
      return {
        ...state,
        peerStrokes: { ...state.peerStrokes, [msg.playerId]: [...held, ...msg.appended] },
      };
    }

    case "peerCleared":
      return { ...state, peerStrokes: { ...state.peerStrokes, [msg.playerId]: [] } };

    case "rejected":
      return { ...initialState, status: "rejected", rejection: msg.reason };

    case "pong":
      return { ...state, latencyMs: Math.max(0, Date.now() - msg.sentAt) };
  }
}

function screenFor(match: Match): Screen {
  switch (match.phase.kind) {
    case "lobby":
      return "lobby";
    case "loading":
      return "loading";
    default:
      return "match";
  }
}

function roundOf(match: Match | null): number | null {
  const phase = match?.phase;
  if (!phase) return null;
  return "roundIndex" in phase ? phase.roundIndex : null;
}
