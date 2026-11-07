/**
 * The git filter-repo every CawCo carries (packages/hub/src/filter-repo.ts
 * `FILTER_REPO`), as its pinned release published it:
 *
 *   bun scripts/git-filter-repo.ts
 *       Downloads the pinned release's archive, refuses it unless its sha256
 *       is the pin's, and writes each carried file from it into
 *       packages/hub/vendor/git-filter-repo/, each refused unless its sha256
 *       is the pin's. Run after moving the pin to a newer release.
 *   bun scripts/git-filter-repo.ts --check
 *       (part of `bun run check`) Each carried file is the pinned release's,
 *       byte for byte, and nothing else is in the folder. Reads no network.
 *
 * Exits 1 naming each file that is not.
 */
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FILTER_REPO, sha256Of } from "../packages/hub/src/filter-repo";

const DIR = join(import.meta.dir, "../packages/hub/vendor/git-filter-repo");
const pinned = Object.entries(FILTER_REPO.files);

/** What is wrong with the carried folder, one line each; empty when it is the release's. */
const wrong = async (): Promise<string[]> => {
  const out: string[] = [];
  const present = new Set(await readdir(DIR).catch(() => []));
  for (const [name, sum] of pinned) {
    if (!present.has(name)) {
      out.push(`${name} is missing`);
      continue;
    }
    const got = await sha256Of(join(DIR, name));
    if (got !== sum) {
      out.push(`${name}'s sha256 is ${got}, not the pinned ${sum}`);
    }
  }
  for (const name of present) {
    if (!(name in FILTER_REPO.files)) {
      out.push(`${name} is not a file the pin carries`);
    }
  }
  return out;
};

const fail = (lines: string[]): never => {
  console.error(
    `packages/hub/vendor/git-filter-repo is not git filter-repo ${FILTER_REPO.version} as published:\n${lines.map((line) => `  ${line}`).join("\n")}\nRun \`bun scripts/git-filter-repo.ts\` to write it from the pinned release.`
  );
  process.exit(1);
};

if (process.argv.includes("--check")) {
  const lines = await wrong();
  if (lines.length > 0) {
    fail(lines);
  }
  console.log(
    `git filter-repo ${FILTER_REPO.version}: every carried file is the release's`
  );
  process.exit(0);
}

const scratch = await mkdtemp(
  join(process.env.TMPDIR ?? tmpdir(), "filter-repo-")
);
try {
  const response = await fetch(FILTER_REPO.archive.url);
  if (!response.ok) {
    throw new Error(`${FILTER_REPO.archive.url} answered ${response.status}`);
  }
  const archive = join(scratch, "release.tar.xz");
  await writeFile(archive, new Uint8Array(await response.arrayBuffer()));
  const sum = await sha256Of(archive);
  if (sum !== FILTER_REPO.archive.sha256) {
    throw new Error(
      `The release archive's sha256 is ${sum}, not the pinned ${FILTER_REPO.archive.sha256}`
    );
  }
  const top = `git-filter-repo-${FILTER_REPO.version}`;
  const untar = Bun.spawnSync(
    [
      "tar",
      "-xJf",
      archive,
      "-C",
      scratch,
      ...pinned.map(([name]) => `${top}/${name}`),
    ],
    { env: process.env, stdout: "inherit", stderr: "inherit" }
  );
  if (untar.exitCode !== 0) {
    throw new Error(`tar could not unpack ${archive} (exit ${untar.exitCode})`);
  }
  await rm(DIR, { recursive: true, force: true });
  for (const [name] of pinned) {
    const from = Bun.file(join(scratch, top, name));
    await Bun.write(join(DIR, name), from, { createPath: true });
  }
  const lines = await wrong();
  if (lines.length > 0) {
    fail(lines);
  }
  console.log(`Wrote git filter-repo ${FILTER_REPO.version} to ${DIR}`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
