import { describe, expect, it, vi } from "vitest";

import type { JudgeRequest, PromptId } from "@doodle-fight/contract";

import { RemoteJudge, parseBatch, parseVerdict } from "./remote.js";

const CAT = "cat" as PromptId;
const request: JudgeRequest = { promptId: CAT, strokes: [[{ x: 1, y: 1, t: 0 }]] };

const respond = (body: unknown, ok = true) =>
  vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status: ok ? 200 : 500 }),
  );

const judgeWith = (fetchImpl: ReturnType<typeof respond>) =>
  new RemoteJudge({ baseUrl: "https://judge.test", sharedSecret: "s3cr3t-value", fetchImpl });

describe("parseVerdict", () => {
  it("maps an accept to a recognition", () => {
    const result = parseVerdict({ kind: "accepted", sees: "a cat", confidence: 0.9 }, CAT);
    expect(result).toEqual({
      kind: "recognized",
      confidence: 0.9,
      top3: [{ promptId: "cat", confidence: 0.9 }],
    });
  });

  it("carries what the model saw through a rejection, for the reveal screen", () => {
    const result = parseVerdict({ kind: "rejected", sees: "palm tree", confidence: 0.6 }, CAT);
    expect(result.top3[0]).toEqual({ promptId: "palm-tree", confidence: 0.6 });
  });

  it("scores nothing for an unjudged outage rather than guessing", () => {
    const result = parseVerdict({ kind: "unjudged", reason: "timeout" }, CAT);
    expect(result.kind).toBe("unrecognized");
    expect(result.top3).toEqual([{ promptId: "cat", confidence: 0 }]);
  });

  it("clamps a confidence outside 0..1 instead of trusting it", () => {
    const result = parseVerdict({ kind: "accepted", sees: "a cat", confidence: 42 }, CAT);
    expect(result.kind === "recognized" && result.confidence).toBe(1);
  });

  it("survives garbage", () => {
    expect(parseVerdict(null, CAT).kind).toBe("unrecognized");
    expect(parseVerdict("nope", CAT).kind).toBe("unrecognized");
    expect(parseVerdict({ kind: "explode" }, CAT).kind).toBe("unrecognized");
  });
});

describe("parseBatch", () => {
  it("pairs verdicts with the requests that produced them, in order", () => {
    const tree = { promptId: "tree" as PromptId, strokes: [] };
    const results = parseBatch(
      {
        verdicts: [
          { kind: "rejected", sees: "a dog", confidence: 0.3 },
          { kind: "accepted", sees: "a tree", confidence: 0.8 },
        ],
      },
      [request, tree],
    );
    expect(results[0]?.kind).toBe("unrecognized");
    expect(results[1]?.kind).toBe("recognized");
  });

  it("fills in for a short response rather than dropping a player's verdict", () => {
    const results = parseBatch({ verdicts: [] }, [request, request]);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.kind === "unrecognized")).toBe(true);
  });
});

describe("RemoteJudge", () => {
  it("posts a batch envelope to /api/judge with the shared secret", async () => {
    const fetchImpl = respond({ verdicts: [{ kind: "accepted", sees: "a cat", confidence: 0.7 }] });
    await judgeWith(fetchImpl).judge(request);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://judge.test/api/judge");
    expect((init!.headers as Record<string, string>)["x-judge-secret"]).toBe("s3cr3t-value");
    expect(JSON.parse(init!.body as string)).toEqual({
      items: [{ promptId: "cat", strokes: [[{ x: 1, y: 1, t: 0 }]] }],
    });
  });

  it("returns the parsed verdict on success", async () => {
    const fetchImpl = respond({ verdicts: [{ kind: "accepted", sees: "a cat", confidence: 0.7 }] });
    expect((await judgeWith(fetchImpl).judge(request)).kind).toBe("recognized");
  });

  it("tags the batch with the room code so the judge can rate limit per room", async () => {
    const fetchImpl = respond({ verdicts: [] });
    const judge = new RemoteJudge({
      baseUrl: "https://judge.test",
      sharedSecret: "s3cr3t-value",
      roomCode: "AB2C",
      fetchImpl,
    });
    await judge.judge(request);
    const body = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string);
    expect(body.roomCode).toBe("AB2C");
  });

  it("degrades on a rejected secret rather than throwing", async () => {
    const fetchImpl = respond({ error: "bad or missing x-judge-secret" }, false);
    expect((await judgeWith(fetchImpl).judge(request)).kind).toBe("unrecognized");
  });

  it("degrades when the judge is unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as ReturnType<typeof respond>;
    expect((await judgeWith(fetchImpl).judge(request)).kind).toBe("unrecognized");
  });

  it("gives up rather than hanging the round", async () => {
    const fetchImpl = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    ) as unknown as typeof fetch;
    const judge = new RemoteJudge({
      baseUrl: "https://judge.test",
      sharedSecret: "s3cr3t-value",
      fetchImpl,
      timeoutMs: 20,
    });
    expect((await judge.judge(request)).kind).toBe("unrecognized");
  });

  it("does not call out at all for an empty batch", async () => {
    const fetchImpl = respond({ verdicts: [] });
    expect(await judgeWith(fetchImpl).judgeBatch([])).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
