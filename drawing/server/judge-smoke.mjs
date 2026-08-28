/**
 * Posts a drawing to a running judge using the exact envelope RemoteJudge emits,
 * so a contract drift between the two halves shows up here rather than mid-round.
 *
 *   node judge-smoke.mjs [baseUrl] [secret]
 */
const baseUrl = process.argv[2] ?? "http://127.0.0.1:8788";
const secret = process.argv[3] ?? "doodle-fight-local-dev-secret";

/** A ring of points, which is about as close to a cookie as a rushed player gets. */
function circle(cx, cy, r, steps = 48) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI;
    return { x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) };
  });
}

const body = {
  roomCode: "SMOK",
  items: [{ promptId: "cookie", strokes: [circle(512, 512, 380)] }],
};

const res = await fetch(`${baseUrl}/api/judge`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-judge-secret": secret },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log(`${res.status} ${res.statusText}`);
console.log(text);
process.exit(res.ok ? 0 : 1);
