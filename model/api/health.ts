import type { IncomingMessage, ServerResponse } from 'node:http';
import { getDeps } from '../src/app.js';
import { handleHealth } from '../src/http.js';

export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  const result = handleHealth(getDeps());
  res.statusCode = result.status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(result.body));
}
