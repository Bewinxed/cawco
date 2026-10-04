import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

await rm('dist', { recursive: true, force: true });
await mkdir('dist');
await cp('public', 'dist', { recursive: true });

// The installer text lives in packages/core so the hub and this site serve the
// same script. Bundle that one module and call it; nothing is copied by hand.
const bundle = await build({
  entryPoints: ['../packages/core/src/install-script.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const source = Buffer.from(bundle.outputFiles[0].contents).toString('base64');
const { generateInstallScript } = await import(`data:text/javascript;base64,${source}`);

await writeFile(
  'dist/install.sh',
  generateInstallScript({ origin: 'https://github.com/Bewinxed/cawco' }),
);
