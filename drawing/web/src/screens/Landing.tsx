import { useEffect, useState } from "react";

import type { RejectReason, RoomCode } from "@doodle-fight/contract";
import {
  ROOM_CODE_LENGTH,
  isRoomCode,
  normalizeRoomCodeInput,
  normalizeUsername,
} from "@doodle-fight/contract";

const NAME_KEY = "doodle-fight:username";

const REJECTION_COPY: Record<RejectReason, string> = {
  "unknown-room": "No room with that code. Check the letters and try again.",
  "room-full": "That room is full — it already has eight players.",
  "match-in-progress": "That match already started. Ask them for a rematch.",
  "bad-username": "That name did not survive the trip. Try another.",
  "rate-limited": "Too many tries. Give it a few seconds.",
  malformed: "Something went wrong talking to the server.",
};

type Props = {
  busy: boolean;
  rejection: RejectReason | null;
  onHost: (username: string) => void;
  onJoin: (code: RoomCode, username: string) => void;
};

export function Landing({ busy, rejection, onHost, onJoin }: Props) {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const remembered = localStorage.getItem(NAME_KEY);
    if (remembered) setUsername(remembered);
    const shared = new URLSearchParams(location.search).get("room");
    if (shared) {
      setCode(normalizeRoomCodeInput(shared));
      setJoining(true);
    }
  }, []);

  const cleanName = normalizeUsername(username);
  const nameOk = cleanName !== null;
  const codeOk = isRoomCode(code);

  const remember = (name: string) => localStorage.setItem(NAME_KEY, name);

  const host = () => {
    if (!cleanName) return;
    remember(cleanName);
    onHost(cleanName);
  };

  const join = () => {
    if (!cleanName || !codeOk) return;
    remember(cleanName);
    onJoin(code as RoomCode, cleanName);
  };

  return (
    <main className="shell">
      <div className="landing sketch">
        <h1 className="wordmark">
          <span className="w-doodle">doodle</span> <span className="w-fight">fight</span>
        </h1>
        <p className="tagline muted">
          Same prompt. Same clock. An AI decides who actually drew it.
        </p>

        <label>
          <span className="muted">your name</span>
          <input
            className="field"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="ada"
            maxLength={40}
            autoComplete="nickname"
            aria-label="Your name"
          />
        </label>
        {touched && !nameOk && <p className="error">Pick a name first.</p>}

        {rejection && <p className="error">{REJECTION_COPY[rejection]}</p>}

        {!joining ? (
          <div className="landing__actions">
            <button className="btn btn--primary" disabled={!nameOk || busy} onClick={host}>
              {busy ? "making a room…" : "host a game"}
            </button>
            <div className="landing__or">or</div>
            <button className="btn" disabled={busy} onClick={() => setJoining(true)}>
              join a game
            </button>
          </div>
        ) : (
          <div className="landing__actions join-row">
            <input
              className="field field--code"
              value={code}
              onChange={(e) => setCode(normalizeRoomCodeInput(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && join()}
              placeholder="────"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-label={`Room code, ${ROOM_CODE_LENGTH} characters`}
              autoFocus
            />
            <button className="btn btn--primary" disabled={!nameOk || !codeOk || busy} onClick={join}>
              join
            </button>
            <button className="btn btn--ghost" onClick={() => setJoining(false)}>
              back
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
