/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the room server. Unset in prod means same-origin (worker-hosted UI). */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
