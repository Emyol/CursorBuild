import { describe, expect, it } from "vitest";

import { partySocketTarget, roomServerUrl } from "./origin.js";

describe("roomServerUrl", () => {
  it("prefers an explicit env origin and strips a trailing slash", () => {
    expect(roomServerUrl("https://rooms.example/", false, "https://game.example")).toBe(
      "https://rooms.example",
    );
  });

  it("talks to local wrangler in dev when env is unset", () => {
    expect(roomServerUrl(undefined, true, "http://localhost:5173")).toBe("http://127.0.0.1:8787");
  });

  it("uses the page origin in production so a worker-hosted UI is same-origin", () => {
    expect(roomServerUrl(undefined, false, "https://doodle-fight-rooms.example.workers.dev")).toBe(
      "https://doodle-fight-rooms.example.workers.dev",
    );
  });
});

describe("partySocketTarget", () => {
  it("uses wss against an https room server even if the page itself is http", () => {
    expect(partySocketTarget("https://doodle-fight-rooms.example.workers.dev")).toEqual({
      host: "doodle-fight-rooms.example.workers.dev",
      protocol: "wss",
    });
  });

  it("keeps ws for local wrangler", () => {
    expect(partySocketTarget("http://127.0.0.1:8787")).toEqual({
      host: "127.0.0.1:8787",
      protocol: "ws",
    });
  });
});
