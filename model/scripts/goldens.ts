import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pixelSignature, renderToPng } from '../src/render.js';
import { SYNTHETIC } from '../src/synthetic.js';

const dir = fileURLToPath(new URL('../test/golden/', import.meta.url));
mkdirSync(dir, { recursive: true });

const signatures: Record<string, number[]> = {};
for (const [name, strokes] of Object.entries(SYNTHETIC)) {
  writeFileSync(`${dir}${name}.png`, renderToPng(strokes));
  signatures[name] = pixelSignature(strokes);
}
writeFileSync(`${dir}signatures.json`, `${JSON.stringify(signatures, null, 2)}\n`);

console.log(`wrote ${Object.keys(signatures).length} goldens to test/golden/`);
