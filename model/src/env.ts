import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Local runs only. On Vercel the environment is already populated. */
const dotenv = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(dotenv)) process.loadEnvFile(dotenv);
