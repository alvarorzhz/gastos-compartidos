// Copia el lector de tickets (Tesseract) a public/ocr para servirlo desde la propia web,
// sin depender de CDNs externos. Se ejecuta solo antes de `npm run dev` y `npm run build`.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const out = join(dirname(new URL(import.meta.url).pathname), '..', 'public', 'ocr');
mkdirSync(out, { recursive: true });

const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));
const files = [
  [join(pkgDir('tesseract.js'), 'dist', 'worker.min.js'), 'worker.min.js'],
  [join(pkgDir('tesseract.js-core'), 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [join(pkgDir('tesseract.js-core'), 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  // Modelo de español compacto (solo LSTM, ~2 MB).
  [join(pkgDir('@tesseract.js-data/spa'), '4.0.0_best_int', 'spa.traineddata.gz'), 'spa.traineddata.gz'],
];
for (const [from, to] of files) copyFileSync(from, join(out, to));
console.log(`Lector de tickets copiado en ${out}`);
