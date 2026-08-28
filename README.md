# doodle fight

## Main feature

doodle fight is a real-time drawing race for 2 to 8 players. Everyone in a room
receives the same prompt at the same moment, draws it simultaneously, and a
model decides who actually drew the thing. Points go to whoever is both correct
and fast, and the highest score across the rounds wins.

The project is split in two halves that meet at a single shared package. This
repository holds the front-end and the multiplayer layer; the judging model is
developed separately and reached through one HTTP interface.

## Functionalities

- Rooms addressed by a short spoken-friendly code, created on the server so two
  hosts can never collide on the same code.
- A readiness handshake that holds the match at a loading gate until every
  player reports their socket is live and their assets are loaded, with a
  timeout that returns the room to the lobby rather than hanging.
- A server-authoritative match state machine covering lobby, loading, countdown,
  drawing, reveal, and finished. Clients render this state and never decide it.
- Scoring that pays a base amount for a recognized drawing plus a speed bonus on
  a linear ramp, with ties sharing a rank.
- Seat retention across disconnects, so a player who drops and returns keeps
  their score, and host reassignment when the host leaves.
- Wire-level validation of every inbound message, including bounds on stroke
  counts and point counts so a malformed or hostile client cannot flood a room.
- Username normalization that strips control characters and bidirectional
  overrides, and disambiguates names already taken in the room.

## Tech stack and dependencies

- TypeScript in strict mode across every package, Node 22, pnpm workspaces.
- `contract/` is a zero-runtime-dependency package holding the wire protocol,
  the match state machine, the scoring rules, and the judge interface. Both the
  server and the browser import it, which is what keeps the two halves of the
  project honest with each other.
- `zod` validates inbound socket messages at the edge; nothing revalidates after
  that point.
- `vitest` for unit tests.
- The realtime layer targets Cloudflare Durable Objects through `partyserver`
  and `partysocket`, so all clients sharing a room code are guaranteed to reach
  the same instance. The browser client deploys as a static build to Vercel.

## Installation

Requires Node 22 or newer and pnpm 9.

```bash
git clone https://github.com/Emyol/CursorBuild.git
cd CursorBuild
pnpm install
```

Run the test suite and the type checker:

```bash
pnpm test
pnpm typecheck
```

## Repository layout

- `contract/` — shared types, wire protocol, match reducer, and scoring. Edited
  by both halves of the project.
- `drawing/` — the browser client and the room server.
- `model/` — the judging service. See `model/README.md` for the interface it
  must satisfy.
