import type { IncomingMessage, ServerResponse } from 'node:http';
import { getDeps } from '../src/app.js';
import { handleJudge } from '../src/http.js';

type VercelRequest = IncomingMessage & { body?: unknown };

export default async function handler(
  req: VercelRequest,
  res: ServerResponse,
): Promise<void> {
  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;
  const result = await handleJudge(
    { method: req.method, headers: req.headers, body },
    getDeps(),
  );
  res.statusCode = result.status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(result.body));
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
