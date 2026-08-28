/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the room server, e.g. https://doodle-fight-rooms.workers.dev */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
