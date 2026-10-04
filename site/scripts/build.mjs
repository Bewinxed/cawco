import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build as bundle } from 'esbuild';
import { build as buildPage } from 'vite';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

// The page: index.html, its styles, scripts, font and pictures, plus everything in public/.
await buildPage();

// The installer text lives in packages/core so the hub and this site serve the
// same script. Bundle that one module and call it; nothing is copied by hand.
const installer = await bundle({
  entryPoints: ['../packages/core/src/install-script.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const source = Buffer.from(installer.outputFiles[0].contents).toString('base64');
const { generateInstallScript } = await import(`data:text/javascript;base64,${source}`);

await writeFile(
  'dist/install.sh',
  generateInstallScript({ origin: 'https://github.com/Bewinxed/cawco' }),
);
