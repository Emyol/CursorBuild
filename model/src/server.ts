import './env.js';
import { createServer, type IncomingMessage } from 'node:http';
import { getDeps } from './app.js';
import { handleHealth, handleJudge } from './http.js';

const PORT = Number(process.env.PORT ?? 8787);

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const deps = getDeps();

    const result =
      url.pathname === '/api/health'
        ? handleHealth(deps)
        : url.pathname === '/api/judge'
          ? await handleJudge(
              { method: req.method, headers: req.headers, body: await readJson(req) },
              deps,
            )
          : { status: 404, body: { error: 'not found' } };

    res.statusCode = result.status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(result.body));
  })();
});

server.listen(PORT, () => {
  const { config } = getDeps();
  console.log(`judge listening on http://localhost:${PORT} in ${config.mode} mode`);
});
