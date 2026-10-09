import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.signal) process.kill(process.pid, result.signal);
  if (result.status !== 0) process.exit(result.status);
}

const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
  encoding: 'utf8',
});
if (dirty.trim()) throw new Error('Deploy requires a clean tracked working tree.');

run('git', ['fetch', 'origin', 'main:refs/remotes/origin/main']);
run('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main']);
const revision = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], {
  encoding: 'utf8',
}).trim();

run('npm', ['run', 'build']);
writeFileSync('dist/version.txt', `${revision}\n`);

const logDirectory = mkdtempSync(join(tmpdir(), 'cawco-site-wrangler-'));
run('npx', ['wrangler@latest', 'deploy'], {
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: `${logDirectory}/wrangler.log`,
    WRANGLER_SEND_METRICS: 'false',
  },
});
