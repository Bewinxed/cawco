/**
 * The package managers' configs a boundary writes, so bun, pnpm and yarn keep
 * their stores outside the clone, and the clone's own hard-linked inodes
 * copied apart.
 */

import { constants } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  rename,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { sessionIdentityDir } from "@cawco/core/paths/cawco";
import {
  userGitConfigDir,
  workspaceCaches,
} from "@cawco/core/paths/host-policy";
import {
  linkWorkspaceTmp,
  scratchSocketProblem,
  workspaceCacheDir,
} from "@cawco/core/paths/workspace";
import { hostEnvironment } from "@cawco/core/session-env";
import { systemProgram } from "@cawco/core/workspace-needs";
import {
  workspaceCacheEnv,
  workspaceMaestroHome,
  workspaceXdgDirs,
} from "../boundary-env";
import { makeRuntimeDir, ownInScratch } from "./exec";
import { gitTemplateOf, roOf, scratchOf, stateDir } from "./state";

/**
 * The folders a boundary needs before it starts: its state dir, the part of
 * it a command reads (with the empty git template), its scratch dir with its
 * XDG homes and Maestro's home in it, and the caches it writes. Never nested in one another
 * (srt #446), but for the XDG homes, which are only the scratch dir's
 * contents. A HOME so long that a browser's socket in the scratch dir cannot
 * fit is said in the log: everything else in the workspace still runs. The
 * workspace writes its scratch dir, so a folder of it that a link the
 * workspace planted leads out of it ({@link ownInScratch}) is never made
 * through or written into, and the log says so; the git config link, the
 * bunfig and pnpm's config go only into a config home of the scratch dir's
 * own, and yarn's link only into a data home of its own.
 */
export const makeDirs = async (id: string): Promise<void> => {
  const tooLong = scratchSocketProblem(id);
  if (tooLong) {
    console.warn(`[workspace] ${id}: ${tooLong}`);
  }
  await mkdir(sessionIdentityDir(), { recursive: true, mode: 0o700 });
  const xdg = workspaceXdgDirs(id);
  const inScratch = [xdg.config, xdg.data, xdg.state, workspaceMaestroHome(id)];
  const own = await Promise.all(
    inScratch.map((path) => ownInScratch(id, path))
  );
  const planted = inScratch.filter((_, at) => !own[at]);
  if (planted.length > 0) {
    console.warn(
      `[workspace] ${id}: ${planted.join(", ")} lead out of its scratch dir through a link in it, so nothing was made or written there`
    );
  }
  await Promise.all(
    [
      stateDir(id),
      roOf(id),
      gitTemplateOf(id),
      scratchOf(id),
      ...inScratch.filter((path) => !planted.includes(path)),
      ...workspaceCaches(),
    ].map((path) => mkdir(path, { recursive: true }))
  );
  await makeRuntimeDir(id);
  if (!planted.includes(xdg.config)) {
    await linkGitConfig(xdg.config);
    await writeBunConfig(xdg.config);
    await writePnpmConfig(id, xdg.config);
  }
  if (!planted.includes(xdg.data)) {
    await linkYarnFolder(id, xdg.data);
  }
  // Its `TMPDIR`'s short name on macOS, made again after a restart cleared it.
  linkWorkspaceTmp(id);
};

/** The global bunfig {@link writeBunConfig} writes: bun's global virtual store on. */
const BUN_GLOBAL_STORE = `# CawCo: bun's global virtual store, so this workspace's installs link from the
# workspaces' cache. A project's own bunfig.toml overrides it (globalStore = false).
[install]
globalStore = true
`;

/**
 * Linux: `<config home>/.bunfig.toml`, the global bunfig of every bun the
 * workspace runs (its `XDG_CONFIG_HOME`, `workspaceXdgEnv`), turning bun's
 * global virtual store on. Inside a boundary the clone and the workspaces'
 * bun cache are each a bind mount of their own, and link(2) refuses across
 * mount points (link(2), EXDEV: "link() does not work across different mount
 * points, even if the same filesystem is mounted on both"), so bun's
 * hardlink backend copied every package into each clone: 2.0 GB in every
 * cockpit clone (2026-10-16). With the store, bun makes each package once in
 * `<cache>/links/`, inside the cache's own mount, and a clone's
 * `node_modules` is symlinks into it (bun.com/docs/pm/global-store: "Package
 * files live in one shared cache; each project's node_modules is a thin tree
 * of symlinks into it"): 5.9 MB a cockpit clone, 2026-10-18. Only the
 * isolated linker uses it ("the hoisted linker does not use it"); a hoisted
 * install copies as before. A global bunfig, and never the env's
 * `BUN_INSTALL_GLOBAL_STORE`, which bun reads after every bunfig: a project
 * whose packages import what they never declare (they no longer reach its
 * root `node_modules` from the store) says `globalStore = false` in its own
 * (bun.com/docs/runtime/bunfig: "keys set in the local file override the
 * same keys in the global file"). Written only as a new file, in a config
 * home of the scratch dir's own ({@link makeDirs}); one there already is
 * the workspace's to keep. On macOS bun clones files inside its boundary
 * already: Seatbelt makes no mounts.
 */
const writeBunConfig = async (configHome: string): Promise<void> => {
  if (process.platform !== "linux") {
    return;
  }
  await writeNew(join(configHome, ".bunfig.toml"), BUN_GLOBAL_STORE);
};

/** Writes `path` only as a new file: one there already is the workspace's to keep. */
const writeNew = async (path: string, content: string): Promise<void> => {
  try {
    await writeFile(path, content, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
};

/** pnpm's store in the workspaces' cache: its content-addressable files and, under `links/`, its global virtual store. */
const pnpmStore = (): string => join(workspaceCacheDir(), "pnpm", "store");

/**
 * pnpm's global config in the workspace's config home (its
 * `XDG_CONFIG_HOME`), turning pnpm's global virtual store on with its store
 * in the workspaces' cache. pnpm's store defaults to
 * `$XDG_DATA_HOME/pnpm/store` (pnpm.io/settings/store#storedir: "If the
 * $XDG_DATA_HOME env variable is set", ahead of the macOS default), the
 * workspace's own data home: every workspace fetched every package again. On
 * Linux, since link(2) refuses across the boundary's mounts (EXDEV,
 * {@link writeBunConfig}), it then copied each one into its clone ("A store
 * on a genuinely different filesystem from `node_modules` cannot be
 * hardlinked from at all — the attempt fails with `EXDEV` — so `auto` already
 * falls back to copying", pnpm.io/settings/node-modules#packageimportmethod).
 * With the global virtual store pnpm hardlinks each package once into
 * `<store>/links/`, inside the cache (on Linux its own mount), and a clone's
 * `node_modules` is symlinks into it ("Each project's `node_modules`
 * contains only symlinks pointing into this shared location",
 * pnpm.io/global-virtual-store): a clone of 138 packages took 780 KB where a
 * copy took 119 MB, 2026-10-18. On macOS Seatbelt lets a command read and
 * write the cache (workspace-policy.ts `workspacePolicy`, `workspaceCaches` in
 * its reads and writes) and judges each link by where it lands, so the same
 * links work there. pnpm 12 locks the store from outside it, in the
 * runtime dir every workspace shares ({@link makeRuntimeDir}).
 *
 * Two files, one for each config pnpm has had. pnpm 11 and later read
 * `$XDG_CONFIG_HOME/pnpm/config.yaml` and take only auth and registry
 * settings from `rc` (pnpm.io/blog/releases/11.0: "Other settings must live
 * in `pnpm-workspace.yaml` or the new global `config.yaml`");
 * `enableGlobalVirtualStore` is the spelling every 11 and 12 reads
 * (`virtualStoreType` came in 11.23.0, and 11.22 warns at every install that
 * it "cannot be set in the global config file"). pnpm 10 reads every setting
 * from `$XDG_CONFIG_HOME/pnpm/rc` (`enable-global-virtual-store` since
 * 10.12.1). A config file and never the env's `pnpm_config_*`, which
 * overrides `pnpm-workspace.yaml` (pnpm.io/configuring#environment-variables):
 * a project's own `virtualStoreType: project` (or `.npmrc` on pnpm 10) still
 * installs into its own `node_modules/.pnpm`. Each written only as a new file,
 * in a config home of the scratch dir's own ({@link makeDirs}).
 */
const writePnpmConfig = async (
  id: string,
  configHome: string
): Promise<void> => {
  const dir = join(configHome, "pnpm");
  if (!(await ownInScratch(id, dir))) {
    console.warn(
      `[workspace] ${id}: ${dir} leads out of its scratch dir through a link in it, so pnpm's config was not written there`
    );
    return;
  }
  await mkdir(dir, { recursive: true });
  const store = pnpmStore();
  const said =
    "# CawCo: pnpm's global virtual store, in the workspaces' cache, so this workspace's\n# installs link from it. A project's own setting overrides it.\n";
  await Promise.all([
    writeNew(
      join(dir, "config.yaml"),
      `${said}storeDir: ${JSON.stringify(store)}\nenableGlobalVirtualStore: true\n`
    ),
    writeNew(
      join(dir, "rc"),
      `${said}store-dir=${store}\nenable-global-virtual-store=true\n`
    ),
  ]);
};

/** Yarn's global folder in the workspaces' cache: its global cache of package zips and its metadata. */
const yarnGlobalFolder = (): string =>
  join(workspaceCacheDir(), "yarn", "berry");

/**
 * `<data home>/yarn/berry`, a link to yarn's global folder in the
 * workspaces' cache. Yarn (2 and later) keeps every package as a zip in its
 * global cache (`enableGlobalCache`, true by default), inside `globalFolder`,
 * whose default off Windows is `$XDG_DATA_HOME/yarn/berry` (yarnpkg/berry
 * folderUtils.ts `getDefaultGlobalFolder`): the workspace's own data home, so
 * every workspace fetched every package again into its scratch dir. Through
 * the link they share one cache, and Plug'n'Play, yarn's default linker,
 * loads each package from its zip there: a clone holds `.pnp.cjs` and only
 * what a package's build unplugs (16 MB of 138 packages, 2026-10-18).
 * Yarn has no global config file outside the home dir (it reads
 * `~/.yarnrc.yml` and the project's own), and its env settings override the
 * project's ("such values will overwrite any that might have been defined in
 * the RC files", yarnpkg.com/configuration/yarnrc), so the default path is
 * where this goes: a project's own `globalFolder` or `enableGlobalCache:
 * false` still wins. Made only in a data home of the scratch dir's own
 * ({@link makeDirs}); a `berry` the workspace made is its own to keep.
 */
const linkYarnFolder = async (id: string, dataHome: string): Promise<void> => {
  const dir = join(dataHome, "yarn");
  if (!(await ownInScratch(id, dir))) {
    console.warn(
      `[workspace] ${id}: ${dir} leads out of its scratch dir through a link in it, so yarn's link was not made there`
    );
    return;
  }
  await mkdir(dir, { recursive: true });
  await mkdir(yarnGlobalFolder(), { recursive: true });
  try {
    await symlink(yarnGlobalFolder(), join(dir, "berry"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
};

/**
 * `<config home>/git`, a link to the user's own git config dir: git reads
 * `$XDG_CONFIG_HOME/git/config` and `…/ignore` (git-config(1) "FILES",
 * gitignore(5) `core.excludesFile`), so with the workspace's own config home
 * it reads the user's, as it did before. Made only in a config home of the
 * scratch dir's own ({@link makeDirs}); a link the workspace replaced is its
 * own to keep.
 */
const linkGitConfig = async (configHome: string): Promise<void> => {
  try {
    await symlink(userGitConfigDir(), join(configHome, "git"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
};

/** How many files {@link ownInodes} copies at once. */
const OWN_INODE_BATCH = 64;

/** A multi-linked file as `find -printf '%D %i %p\0'` names it: its device, inode and path. */
const LINKED_FILE = /^(\d+) (\d+) (.*)$/su;

/**
 * The files under `root` with more than one link, each with its inode as
 * `<device> <inode>`: GNU find names both (`-printf`); BSD find (macOS) has
 * no `-printf`, so each file it lists is looked up.
 */
const linkedFiles = async (
  root: string
): Promise<{ inode: string; file: string }[]> => {
  if (process.platform === "darwin") {
    const listed =
      await Bun.$`${systemProgram("find")} ${root} -xdev -type f -links +1 -print0`
        .env(hostEnvironment())
        .quiet()
        .nothrow();
    const files = listed.stdout.toString().split("\0").filter(Boolean);
    const found = await Promise.all(
      files.map(async (file) => {
        const info = await lstat(file).catch(() => undefined);
        return info ? [{ inode: `${info.dev} ${info.ino}`, file }] : [];
      })
    );
    return found.flat();
  }
  const listed =
    await Bun.$`${systemProgram("find")} ${root} -xdev -type f -links +1 -printf ${"%D %i %p\\0"}`
      .env(hostEnvironment())
      .quiet()
      .nothrow();
  return listed.stdout
    .toString()
    .split("\0")
    .flatMap((line) => {
      const [, device, inode, file] = LINKED_FILE.exec(line) ?? [];
      return file ? [{ inode: `${device} ${inode}`, file }] : [];
    });
};

/**
 * A copy of `file` at `copy` with an inode of its own: on macOS an APFS
 * clone (`cp -c`, clonefile(2): "the cloned file dst shares its data blocks
 * with the src file but has its own copy of attributes"), which costs no
 * space, since Bun's `copyFile` there copies the data (`fcopyfile` with
 * `COPYFILE_DATA`); elsewhere a reflink where the filesystem has them, else
 * a copy.
 */
const copyApart = async (file: string, copy: string): Promise<void> => {
  if (process.platform === "darwin") {
    const cloned = await Bun.$`${systemProgram("cp")} -c ${file} ${copy}`
      .env(hostEnvironment())
      .quiet()
      .nothrow();
    if (cloned.exitCode !== 0) {
      throw new Error(
        `${file} could not be cloned apart: ${cloned.stderr.toString().trim() || `cp exited ${cloned.exitCode}`}`
      );
    }
    return;
  }
  await copyFile(file, copy, constants.COPYFILE_FICLONE);
};

/**
 * Gives every file in a clone an inode of its own, but one it shares
 * with the workspaces' bun cache, and answers how many it copied. bun
 * installs by hardlinking from its cache, so a clone installed from the
 * host's bun cache shares inodes with it and every host tree installed from
 * it, and a write inside the clone would change a file the host runs. A file
 * linked to the workspaces' own bun cache (`workspaceCacheEnv`) stays linked:
 * every workspace writes that cache already, and no host tree is installed
 * from it. It copies and renames files in place, so it runs only before a
 * boundary starts with no sandbox of the workspace running (its first start,
 * a start after a reboot, a replacement once the one before is stopped),
 * never beside an older generation still running in the clone at a handover
 * ({@link launch}). A Linux view of a folder never runs it: its folder is
 * the person's, and the overlay copies a file up before any write reaches
 * it (layer.ts). On macOS each copy is an APFS clone ({@link copyApart}).
 */
export const ownInodes = async (path: string): Promise<number> => {
  const linked = await linkedFiles(path);
  const cached = new Set(
    linked.length > 0
      ? (await linkedFiles(workspaceCacheEnv().BUN_INSTALL_CACHE_DIR)).map(
          ({ inode }) => inode
        )
      : []
  );
  const files = linked
    .filter(({ inode }) => !cached.has(inode))
    .map(({ file }) => file);
  for (let at = 0; at < files.length; at += OWN_INODE_BATCH) {
    await Promise.all(
      files.slice(at, at + OWN_INODE_BATCH).map(async (file) => {
        const copy = `${file}.cawco-own-inode`;
        await copyApart(file, copy);
        await chmod(copy, (await stat(file)).mode);
        await rename(copy, file);
      })
    );
  }
  return files.length;
};
