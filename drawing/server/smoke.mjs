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
  const ready = new Promise((resolve) => (socket.onopen = resolve));
  socket.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    seen.push(msg);
    if (msg.type === "match" && msg.match.phase.kind === "loading") {
      socket.send(JSON.stringify({ type: "ready", roundIndex: 0 }));
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
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const a = player("ada");
const b = player("grace");
await a.join();
await b.join();
await wait(400);

const joinedA = a.seen.find((m) => m.type === "joined");
if (!joinedA) fail("player a never got a joined message");
if (!joinedA.resumeToken) fail("no resume token issued");

const roster = a.seen.filter((m) => m.type === "match").pop() ?? joinedA;
const names = roster.match.players.map((p) => p.username);
if (names.length !== 2) fail(`expected 2 players, got ${JSON.stringify(names)}`);
if (!names.includes("ada") || !names.includes("grace")) fail(`wrong roster: ${names}`);
console.log("roster:", names.join(", "));

a.send({ type: "start" });
await wait(500);
const afterStart = a.seen.filter((m) => m.type === "match").pop();
const phase = afterStart.match.phase.kind;
if (phase !== "countdown" && phase !== "drawing") {
  fail(`handshake did not open the gate, phase is ${phase}`);
}
console.log("handshake passed, phase:", phase);

await wait(3200);
const drawing = a.seen.filter((m) => m.type === "match").pop();
if (drawing.match.phase.kind !== "drawing") fail(`expected drawing, got ${drawing.match.phase.kind}`);
if (!drawing.match.phase.promptId) fail("no prompt issued");
console.log("prompt:", drawing.match.phase.promptId);

const strokes = [Array.from({ length: 40 }, (_, i) => ({ x: i * 10, y: i * 5, t: i * 16 }))];
a.send({ type: "strokes", roundIndex: 0, appended: strokes });
await wait(150);
if (!b.seen.some((m) => m.type === "peerStrokes")) fail("opponent never received live strokes");
console.log("live stroke relay works");

a.send({ type: "submit", roundIndex: 0, strokes });
b.send({ type: "submit", roundIndex: 0, strokes: [[{ x: 1, y: 1, t: 1 }]] });
await wait(600);
const revealed = a.seen.filter((m) => m.type === "match").pop();
if (revealed.match.phase.kind !== "reveal") fail(`expected reveal, got ${revealed.match.phase.kind}`);
const scores = revealed.match.players.map((p) => `${p.username}=${p.score}`);
console.log("verdicts in, scores:", scores.join(" "));
if (revealed.match.players.every((p) => p.score === 0)) fail("nobody scored, judge never ran");

a.send({ type: "ping", sentAt: Date.now() });
await wait(200);
if (!a.seen.some((m) => m.type === "pong")) fail("no pong");

a.close();
b.close();
console.log("PASS");
process.exit(0);
