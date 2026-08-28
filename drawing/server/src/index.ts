import { getServerByName, routePartykitRequest } from "partyserver";

import { DEFAULT_TOTAL_ROUNDS, makeRoomCode } from "@doodle-fight/contract";

import type { Env } from "./env.js";

export { RoomServer } from "./room.js";

/** Enough attempts that a collision is vanishingly unlikely, few enough to stay cheap. */
const CODE_ATTEMPTS = 8;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (url.pathname === "/health") {
      return json({ ok: true });
    }

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      return createRoom(env);
    }

    const routed = await routePartykitRequest(request, env);
    return routed ?? new Response("not found", { status: 404, headers: CORS });
  },
};

async function createRoom(env: Env): Promise<Response> {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = makeRoomCode();
    const room = await getServerByName(env.RoomServer, code);
    // reserve() is the uniqueness check: a code already in use refuses to be claimed
    if (await room.reserve(DEFAULT_TOTAL_ROUNDS)) {
      return json({ code });
    }
  }
  return json({ error: "could not allocate a room code" }, 503);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}
