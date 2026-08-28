import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import type { RoomCode, Stroke } from "@doodle-fight/contract";

import { RoomClient, createRoom, forgetResume, readResume } from "./net/client.js";
import { initialState, reduceClient } from "./net/store.js";
import { Landing } from "./screens/Landing.js";
import { Lobby } from "./screens/Lobby.js";
import { Loading } from "./screens/Loading.js";
import { Match } from "./screens/Match.js";

export function App() {
  const [state, dispatch] = useReducer(reduceClient, initialState);
  const [busy, setBusy] = useState(false);
  const clientRef = useRef<RoomClient | null>(null);

  const connect = useCallback((code: RoomCode, username: string) => {
    clientRef.current?.close();
    clientRef.current = new RoomClient({
      code,
      username,
      resume: readResume(code),
      dispatch,
    });
  }, []);

  const host = useCallback(
    async (username: string) => {
      setBusy(true);
      try {
        connect(await createRoom(), username);
      } catch {
        dispatch({ type: "server", msg: { type: "rejected", reason: "malformed" } });
      } finally {
        setBusy(false);
      }
    },
    [connect],
  );

  const leave = useCallback(() => {
    clientRef.current?.close();
    clientRef.current = null;
    forgetResume();
    history.replaceState(null, "", location.pathname);
  }, []);

  useEffect(() => () => clientRef.current?.close(), []);

  const phase = state.match?.phase;

  // report ready as soon as the gate opens; the canvas has nothing to preload
  useEffect(() => {
    if (phase?.kind === "loading") clientRef.current?.ready(phase.roundIndex);
  }, [phase?.kind, phase && "roundIndex" in phase ? phase.roundIndex : -1]);

  useEffect(() => {
    if (phase && "roundIndex" in phase) clientRef.current?.setRound(phase.roundIndex);
  }, [phase && "roundIndex" in phase ? phase.roundIndex : -1]);

  const onStroke = useCallback((stroke: Stroke) => clientRef.current?.queueStroke(stroke), []);
  const onSubmit = useCallback(
    (roundIndex: number, strokes: Stroke[]) => clientRef.current?.submit(roundIndex, strokes),
    [],
  );

  if (!state.match || state.screen === "landing") {
    return (
      <Landing
        busy={busy || state.status === "connecting"}
        rejection={state.rejection}
        onHost={host}
        onJoin={(code, username) => connect(code, username)}
      />
    );
  }

  if (state.screen === "lobby") {
    return (
      <Lobby
        match={state.match}
        selfId={state.selfId}
        onStart={() => clientRef.current?.start()}
        onLeave={leave}
      />
    );
  }

  if (state.screen === "loading" && phase?.kind === "loading") {
    return <Loading match={state.match} selfId={state.selfId} deadline={phase.deadline} />;
  }

  return (
    <Match
      match={state.match}
      selfId={state.selfId}
      peerStrokes={state.peerStrokes}
      latencyMs={state.latencyMs}
      onStroke={onStroke}
      onSubmit={onSubmit}
      onRematch={() => clientRef.current?.rematch()}
      onLeave={leave}
    />
  );
}

