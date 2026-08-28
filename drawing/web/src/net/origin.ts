/** Room-server origin. Dev talks to local wrangler; prod is same-origin unless overridden. */
export function roomServerUrl(
  envUrl: string | undefined,
  isDev: boolean,
  pageOrigin: string,
): string {
  const trimmed = envUrl?.trim().replace(/\/$/, "");
  if (trimmed) return trimmed;
  return isDev ? "http://127.0.0.1:8787" : pageOrigin;
}

export function partySocketTarget(serverUrl: string): { host: string; protocol: "ws" | "wss" } {
  const url = new URL(serverUrl);
  return {
    host: url.host,
    protocol: url.protocol === "https:" ? "wss" : "ws",
  };
}
