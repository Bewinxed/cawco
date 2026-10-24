/**
 * A workspace's private layer of any folder (agent layer.ts), on the
 * machine's own engine: the Linux view (bwrap's overlay, entered by
 * nsenter) or the Mac's APFS clone, driven through layer.ts itself with no
 * hub. Every read is of the folder on the host and of what a process in
 * the copy sees.
 *
 * - v1. A folder that is no repository gets a layer at once; on Linux the
 *   copy's path is the folder's own.
 * - v2. A process in the copy edits `site.conf` and a tool reads that file
 *   at its fixed path (an `nginx -t`-style check): it reads the edit; the
 *   folder on the host still holds the old text.
 * - v3. Deletions and a folder made again stay in the copy: the folder
 *   still holds every file; the change set names each write and deletion,
 *   and none of CawCo's deny paths (a `.mcp.json` written in the copy).
 * - v4. The folder is live underneath (Linux): a file the person edits
 *   after the start, that the delegate never wrote, reads as the person
 *   left it. On the Mac the copy holds the start.
 * - v5. A file both changed is a conflict with both versions, and the
 *   landing writes nothing; once shown, it is no conflict again until the
 *   folder changes once more, and the delegate's version lands.
 * - v6. The landing puts every write and deletion into the folder; the
 *   change set is empty after it.
 * - v7. An untracked `.env` is read in the copy, and a write to it stays
 *   in the copy until it lands.
 * - v8. Removing the layer ends every process of the view and leaves the
 *   folder as landed.
 * - v9 (timings, said, with a sanity check): the layer's start; the
 *   old mechanism's start for the same repository (`git clone
 *   --dissociate`, then its checkout), on a clone of this checkout made in
 *   the scratch HOME; a 100,000-file walk in the copy
 *   against the same walk natively.
 *
 *   bun scripts/probe-kit/run.ts layer-view
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  applyChanges,
  changesOf,
  endView,
  ensureView,
  type Layer,
  makeLayer,
  readChanges,
  readLayer,
  removeLayer,
  viewArgv,
} from "../../../packages/agent/src/layer";
import type { Kit, Spec } from "../kit";
import { ROOT } from "../kit";

const linux = process.platform === "linux";

/** A command in the copy, its stdout and exit. */
const inCopy = async (
  id: string,
  layer: Layer,
  command: string
): Promise<{ code: number; out: string }> => {
  const argv = linux
    ? viewArgv(await ensureView(id, layer), layer.path, [
        "/bin/sh",
        "-c",
        command,
      ])
    : ["/bin/sh", "-c", command];
  const ran = Bun.spawnSync(argv, {
    cwd: linux ? "/" : layer.path,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: ran.exitCode,
    out: `${ran.stdout.toString()}${ran.stderr.toString()}`,
  };
};

const text = (path: string): Promise<string> =>
  readFile(path, "utf8").catch(() => "(gone)");

const ms = (from: number): number => Math.round(performance.now() - from);

const run = async (kit: Kit) => {
  const { check, note } = kit;
  const home = homedir();
  const folder = join(home, "site");
  await rm(folder, { recursive: true, force: true });
  await mkdir(join(folder, "dir"), { recursive: true });
  await writeFile(join(folder, "site.conf"), "listen 80;\n");
  await writeFile(join(folder, "keep.txt"), "start\n");
  await writeFile(join(folder, "gone.txt"), "doomed\n");
  await writeFile(join(folder, "dir", "a.txt"), "a\n");
  await writeFile(join(folder, "dir", "b.txt"), "b\n");
  await writeFile(join(folder, ".env"), "SECRET=1\n");
  const id = crypto.randomUUID();
  const path = linux
    ? folder
    : join(home, ".worktrees", `site-${id.slice(0, 8)}`);
  await mkdir(join(home, ".worktrees"), { recursive: true });

  const startAt = performance.now();
  const layer = await makeLayer(id, folder, path);
  const startMs = ms(startAt);
  check(
    `v1: a folder that is no repository gets a ${linux ? "view at its own path" : "clone"} in ${startMs} ms, recorded unmade until its create is whole`,
    layer.kind === "folder" &&
      !layer.made &&
      (linux
        ? layer.path === folder && layer.form === "overlay"
        : layer.form === "copy"),
    JSON.stringify(layer)
  );

  const edited = await inCopy(
    id,
    layer,
    `sed -i.bak 's/listen 80;/listen 8080;/' ${path}/site.conf && rm ${path}/site.conf.bak && cat ${path}/site.conf`
  );
  check(
    "v2: a tool in the copy reads the delegate's edit at the fixed path; the folder on the host holds the old text",
    edited.code === 0 &&
      edited.out.includes("listen 8080;") &&
      (await text(join(folder, "site.conf"))) === "listen 80;\n",
    `${edited.out} | host: ${await text(join(folder, "site.conf"))}`
  );

  const moved = await inCopy(
    id,
    layer,
    `rm ${path}/gone.txt && rm -rf ${path}/dir && mkdir ${path}/dir && echo new > ${path}/dir/c.txt && echo fresh > ${path}/new.txt && echo '{}' > ${path}/.mcp.json`
  );
  const changes = await changesOf((await readLayer(id)) as Layer);
  const said = changes.map((one) => `${one.change} ${one.path}`).sort();
  const want = [
    "delete dir/a.txt",
    "delete dir/b.txt",
    "delete gone.txt",
    "write dir/c.txt",
    "write new.txt",
    "write site.conf",
  ];
  check(
    "v3: deletions and a folder made again stay in the copy, and the change set names each, no deny path's stand-in",
    moved.code === 0 &&
      (await text(join(folder, "gone.txt"))) === "doomed\n" &&
      (await text(join(folder, "dir", "a.txt"))) === "a\n" &&
      (await text(join(folder, "dir", "c.txt"))) === "(gone)" &&
      JSON.stringify(said) === JSON.stringify(want),
    `${moved.out} | ${said.join(", ")}`
  );

  await writeFile(join(folder, "keep.txt"), "edited by hand\n");
  const kept = await inCopy(id, layer, `cat ${path}/keep.txt`);
  check(
    linux
      ? "v4: the person's edit to a file the delegate never wrote shows in the view"
      : "v4: the clone holds the folder as it started",
    kept.out.trim() === (linux ? "edited by hand" : "start"),
    kept.out
  );

  await writeFile(join(folder, "site.conf"), "listen 9090;\n");
  const refused = await applyChanges(id, (await readLayer(id)) as Layer);
  const conflict = refused.conflicts.find((one) => one.path === "site.conf");
  const shown = await readChanges(id, (await readLayer(id)) as Layer);
  check(
    "v5: a file both changed is a conflict with both versions, and the landing writes nothing",
    refused.applied === 0 &&
      conflict?.yours.kind === "text" &&
      conflict.yours.text === "listen 9090;\n" &&
      conflict.delegate.kind === "text" &&
      conflict.delegate.text === "listen 8080;\n" &&
      (await text(join(folder, "site.conf"))) === "listen 9090;\n" &&
      (await text(join(folder, "new.txt"))) === "(gone)",
    JSON.stringify(refused)
  );
  check(
    "v5: once the landing has shown the conflict, it is no conflict again until the folder changes once more",
    shown.conflicts.length === 0 &&
      shown.changed.some((one) => one.path === "site.conf"),
    JSON.stringify(shown)
  );

  const landed = await applyChanges(id, (await readLayer(id)) as Layer);
  const after = await changesOf((await readLayer(id)) as Layer);
  check(
    "v6: once shown, the delegate's version lands with every write and deletion, and nothing more is left to land",
    landed.conflicts.length === 0 &&
      (await text(join(folder, "site.conf"))) === "listen 8080;\n" &&
      (await text(join(folder, "new.txt"))) === "fresh\n" &&
      (await text(join(folder, "dir", "c.txt"))) === "new\n" &&
      (await text(join(folder, "gone.txt"))) === "(gone)" &&
      (await text(join(folder, "dir", "a.txt"))) === "(gone)" &&
      (await text(join(folder, ".mcp.json"))) === "(gone)" &&
      after.length === 0,
    JSON.stringify({ landed, after })
  );

  const secret = await inCopy(
    id,
    layer,
    `cat ${path}/.env && echo SECRET=2 > ${path}/.env && cat ${path}/.env`
  );
  check(
    "v7: the untracked .env is read in the copy, and its write stays in the copy",
    secret.out === "SECRET=1\nSECRET=2\n" &&
      (await text(join(folder, ".env"))) === "SECRET=1\n",
    `${secret.out} | host: ${await text(join(folder, ".env"))}`
  );

  await removeLayer(id, (await readLayer(id)) as Layer);
  const left = linux ? await endView(id) : [];
  check(
    "v8: removing the layer ends its view and leaves the folder as landed",
    left.length === 0 &&
      (await readLayer(id).catch(() => undefined)) === undefined &&
      (await text(join(folder, "site.conf"))) === "listen 8080;\n" &&
      (await text(join(folder, ".env"))) === "SECRET=1\n",
    `left: ${left.join(", ")}`
  );

  // v9: timings, on a repository of its own: the person's checkout, made
  // from this one (which a host run checks out as a worktree).
  const repo = join(home, "repo");
  await rm(repo, { recursive: true, force: true });
  await Bun.$`git clone -q ${ROOT} ${repo}`.quiet();
  const repoLayerId = crypto.randomUUID();
  const repoPath = linux
    ? repo
    : join(home, ".worktrees", `repo-${repoLayerId.slice(0, 8)}`);
  const layerAt = performance.now();
  const repoLayer = await makeLayer(repoLayerId, repo, repoPath);
  const statusAt = performance.now();
  const status = await inCopy(
    repoLayerId,
    repoLayer,
    `git -C ${repoPath} checkout -q -B probe-view HEAD && git -C ${repoPath} status --porcelain | wc -l`
  );
  const layerStart = ms(layerAt);
  note(
    `v9: layer start of a clone of ${ROOT}: ${Math.round(statusAt - layerAt)} ms to the copy, ${layerStart} ms with its branch checked out (${status.out.trim()} status lines)`
  );
  const clone = join(home, "old-clone");
  await rm(clone, { recursive: true, force: true });
  const cloneAt = performance.now();
  await Bun.$`git clone -q --dissociate --no-checkout ${repo} ${clone} && git -C ${clone} checkout -q HEAD`.quiet();
  const cloneMs = ms(cloneAt);
  note(
    `v9: the old mechanism's start of the same repository (git clone --dissociate, its checkout): ${cloneMs} ms`
  );
  await removeLayer(repoLayerId, repoLayer);
  await rm(clone, { recursive: true, force: true });
  await rm(repo, { recursive: true, force: true });

  const tree = join(home, "walk");
  await rm(tree, { recursive: true, force: true });
  await mkdir(tree, { recursive: true });
  const made = Bun.spawnSync([
    "/bin/sh",
    "-c",
    'for d in $(seq 1 100); do mkdir -p "$1/$d" && (cd "$1/$d" && seq 1 1000 | xargs touch) || exit 1; done',
    "make-tree",
    tree,
  ]);
  if (made.exitCode !== 0) {
    throw new Error(
      `the 100,000-file tree was not made: ${made.stderr.toString()}`
    );
  }
  const nativeAt = performance.now();
  const native = Bun.spawnSync([
    "/bin/sh",
    "-c",
    `find ${tree} -type f | wc -l`,
  ]);
  const nativeMs = ms(nativeAt);
  const walkId = crypto.randomUUID();
  const walkPath = linux
    ? tree
    : join(home, ".worktrees", `walk-${walkId.slice(0, 8)}`);
  const walkStartAt = performance.now();
  const walkLayer = await makeLayer(walkId, tree, walkPath);
  const walkStart = ms(walkStartAt);
  await inCopy(walkId, walkLayer, "true");
  const viewAt = performance.now();
  const viewed = await inCopy(
    walkId,
    walkLayer,
    `find ${walkPath} -type f | wc -l`
  );
  const viewMs = ms(viewAt);
  note(
    `v9: a 100,000-file folder's layer started in ${walkStart} ms; its walk took ${viewMs} ms in the copy against ${nativeMs} ms natively`
  );
  check(
    "v9: the walk in the copy finds every one of the 100,000 files the native walk finds",
    native.stdout.toString().trim() === "100000" &&
      viewed.out.trim() === "100000",
    `native ${native.stdout.toString().trim()}, copy ${viewed.out.trim()}`
  );
  await removeLayer(walkId, walkLayer);
  await rm(tree, { recursive: true, force: true });
};

export default {
  name: "layer-view",
  host: "it mounts a Linux view (bwrap's overlay in a user namespace), which no workspace boundary allows inside it",
  ownHome:
    "its layers' records and upper dirs are under ~/.cawco, which must be its own",
  run,
} satisfies Spec;
