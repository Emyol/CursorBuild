import { describe, expect, it, vi } from "vitest";

import type { JudgeRequest, PromptId } from "@doodle-fight/contract";

import { RemoteJudge, parseResult } from "./remote.js";

const CAT = "cat" as PromptId;
const request: JudgeRequest = { promptId: CAT, strokes: [[{ x: 1, y: 1, t: 0 }]] };

const respond = (body: unknown, ok = true) =>
  vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status: ok ? 200 : 500 }),
  );

describe("parseResult", () => {
  it("accepts a well formed recognition", () => {
    const result = parseResult(
      { kind: "recognized", confidence: 0.9, top3: [{ promptId: "cat", confidence: 0.9 }] },
      CAT,
    );
    expect(result).toEqual({
      kind: "recognized",
      confidence: 0.9,
      top3: [{ promptId: "cat", confidence: 0.9 }],
    });
  });

  it("clamps a confidence outside 0..1 instead of trusting it", () => {
    const result = parseResult({ kind: "recognized", confidence: 42, top3: [] }, CAT);
    expect(result.kind === "recognized" && result.confidence).toBe(1);
  });

  it("treats a missing confidence as unrecognized rather than awarding points", () => {
    expect(parseResult({ kind: "recognized" }, CAT).kind).toBe("unrecognized");
  });

  it("caps top3 at three guesses", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ promptId: `p${i}`, confidence: 0.5 }));
    const result = parseResult({ kind: "unrecognized", top3: many }, CAT);
    expect(result.top3).toHaveLength(3);
  });

  it("drops malformed guesses without dropping the whole response", () => {
    const result = parseResult(
      { kind: "unrecognized", top3: [{ promptId: "cat", confidence: 0.5 }, null, { junk: 1 }] },
      CAT,
    );
    expect(result.top3).toEqual([{ promptId: "cat", confidence: 0.5 }]);
  });

  it("survives garbage", () => {
    expect(parseResult(null, CAT).kind).toBe("unrecognized");
    expect(parseResult("nope", CAT).kind).toBe("unrecognized");
    expect(parseResult({ kind: "explode" }, CAT).kind).toBe("unrecognized");
  });
});

describe("RemoteJudge", () => {
  it("returns the parsed verdict on success", async () => {
    const fetchImpl = respond({ kind: "recognized", confidence: 0.7, top3: [] });
    const judge = new RemoteJudge({ url: "https://judge.test/judge", fetchImpl });
    expect((await judge.judge(request)).kind).toBe("recognized");
  });

  it("posts the strokes as json", async () => {
    const fetchImpl = respond({ kind: "unrecognized", top3: [] });
    await new RemoteJudge({ url: "https://judge.test/judge", fetchImpl }).judge(request);
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(JSON.parse(init!.body as string)).toEqual(request);
  });

  it("degrades to unrecognized on a server error rather than throwing", async () => {
    const fetchImpl = respond({ kind: "recognized", confidence: 1, top3: [] }, false);
    const judge = new RemoteJudge({ url: "https://judge.test/judge", fetchImpl });
    expect((await judge.judge(request)).kind).toBe("unrecognized");
  });

  it("degrades when the judge is unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const judge = new RemoteJudge({ url: "https://judge.test/judge", fetchImpl });
    expect((await judge.judge(request)).kind).toBe("unrecognized");
  });

  it("gives up rather than hanging the round", async () => {
    const fetchImpl = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    ) as unknown as typeof fetch;
    const judge = new RemoteJudge({ url: "https://judge.test/judge", fetchImpl, timeoutMs: 20 });
    expect((await judge.judge(request)).kind).toBe("unrecognized");
  });
});
