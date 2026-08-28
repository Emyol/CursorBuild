// Drives a real room end to end against a running server.
// Usage: node smoke.mjs [baseUrl]   e.g. node smoke.mjs https://doodle-fight-rooms.workers.dev
const base = process.argv[2] ?? "http://127.0.0.1:8787";
const ws = base.replace(/^http/, "ws");

const fail = (m) => {
  console.error("FAIL:", m);
  process.exit(1);
};

const res = await fetch(`${base}/api/rooms`, { method: "POST" });
const { code } = await res.json();
if (!code || code.length !== 4) fail(`bad room code: ${JSON.stringify(code)}`);
console.log("room code:", code);

function player(name) {
  const socket = new WebSocket(`${ws}/parties/room-server/${code}`);
  const seen = [];
  const watchers = new Set();
  const ready = new Promise((resolve) => (socket.onopen = resolve));

  socket.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    seen.push(msg);
    if (msg.type === "match" && msg.match.phase.kind === "loading") {
      socket.send(JSON.stringify({ type: "ready", roundIndex: 0 }));
    }
    // phases are settled the moment they arrive; sampling the latest message
    // later would miss any window shorter than the sleep before the assertion
    for (const watcher of [...watchers]) {
      if (!watcher.test(msg)) continue;
      watchers.delete(watcher);
      watcher.settle(msg);
    }
  };

  return {
    seen,
    async join() {
      await ready;
      socket.send(JSON.stringify({ type: "join", username: name }));
    },
    send: (m) => socket.send(JSON.stringify(m)),
    close: () => socket.close(),
    /** Resolves with the first message matching `test`, past ones included. */
    waitFor(label, test, timeoutMs) {
      const already = seen.find(test);
      if (already) return Promise.resolve(already);
      return new Promise((resolve) => {
        const watcher = {
          test,
          settle: (msg) => {
            clearTimeout(timer);
            resolve(msg);
          },
        };
        const timer = setTimeout(() => {
          watchers.delete(watcher);
          fail(`[${name}] timed out after ${timeoutMs}ms waiting for ${label}`);
        }, timeoutMs);
        watchers.add(watcher);
      });
    },
  };
}

const isMatch = (m) => m.type === "match";
const phaseIs = (kind) => (m) => isMatch(m) && m.match.phase.kind === kind;

const a = player("ada");
const b = player("grace");
await a.join();
await b.join();

const joinedA = await a.waitFor("a join acknowledgement", (m) => m.type === "joined", 10_000);
const joinedB = await b.waitFor("a join acknowledgement", (m) => m.type === "joined", 10_000);
if (!joinedA.resumeToken) fail("no resume token issued");

const roster = await a.waitFor("both players on the roster", (m) => isMatch(m) && m.match.players.length === 2, 10_000);
const names = roster.match.players.map((p) => p.username);
if (!names.includes("ada") || !names.includes("grace")) fail(`wrong roster: ${names}`);
console.log("roster:", names.join(", "));

// join order is a race over a real network and only the host may open the gate
const seat = roster.match.players.find((p) => p.isHost);
if (!seat) fail("no host on the roster");
const host = seat.id === joinedA.selfId ? a : seat.id === joinedB.selfId ? b : fail(`host ${seat.id} is neither player`);
console.log("host:", seat.username);

host.send({ type: "start" });
const gated = await a.waitFor("the loading gate to open", (m) => phaseIs("countdown")(m) || phaseIs("drawing")(m), 25_000);
console.log("handshake passed, phase:", gated.match.phase.kind);

const drawing = await a.waitFor("the drawing phase", phaseIs("drawing"), 15_000);
if (!drawing.match.phase.promptId) fail("no prompt issued");
console.log("prompt:", drawing.match.phase.promptId);

const strokes = [Array.from({ length: 40 }, (_, i) => ({ x: i * 10, y: i * 5, t: i * 16 }))];
a.send({ type: "strokes", roundIndex: 0, appended: strokes });
await b.waitFor("the opponent's live strokes", (m) => m.type === "peerStrokes", 10_000);
console.log("live stroke relay works");

a.send({ type: "submit", roundIndex: 0, strokes });
b.send({ type: "submit", roundIndex: 0, strokes: [[{ x: 1, y: 1, t: 1 }]] });

// the stand-in judge answers instantly and a real model call takes seconds, but
// either way the round is forced closed once the drawing deadline passes
const revealed = await a.waitFor(
  "round 0 to reveal",
  (m) => phaseIs("reveal")(m) && m.match.phase.roundIndex === 0,
  40_000,
);

// scribbles from a scripted client deserve to be rejected, so a verdict for
// every submitter is the real proof the judge ran, not a nonzero score
const { verdicts } = revealed.match.phase;
for (const p of revealed.match.players) {
  if (!verdicts[p.id]) fail(`no verdict for ${p.username}`);
}
// the reducer backfills a timeout for anyone the judge never answered for, so
// an all-timeout reveal means the judge never ran at all
if (revealed.match.players.every((p) => verdicts[p.id].kind === "timeout")) {
  fail("every verdict timed out, the judge never answered");
}
const summary = revealed.match.players.map((p) => `${p.username}=${verdicts[p.id].kind}/${p.score}`);
console.log("verdicts in:", summary.join(" "));

a.send({ type: "ping", sentAt: Date.now() });
await a.waitFor("a pong", (m) => m.type === "pong", 10_000);

a.close();
b.close();
console.log("PASS");
process.exit(0);
