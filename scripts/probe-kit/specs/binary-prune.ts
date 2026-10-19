/**
 * A machine keeps the build it runs and the two installed before it, in
 * `binary/versions/` and, on the hub's machine, in the hub's archive cache
 * (`binary-releases/`), by install order, never by name; a build an older
 * session keeper still runs from stays until that keeper ends.
 *
 * A scratch machine (its own `XDG_DATA_HOME` and hub database path) installs
 * six builds one after another, as the update helper confirms each: the
 * build staged under `versions/`, its archive in the hub's cache, `current`
 * moved to it, then the helper's confirm (core `recordInstall`, `prune`).
 * The names sort apart from the order they went on (`0.9.0` is the first,
 * and sorts last). The second build's keeper runs from its folder (a real
 * process started as `versions/0.10.0/cawco`) through every install after
 * it. The agent prunes again when it removes a retiring keeper that
 * holds nothing (binary-update.ts `#tendKeepers`); here the keeper ends and
 * the same prune runs.
 *
 *   bun scripts/probe-kit/run.ts binary-prune
 */
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  binaryRoot,
  currentDirectory,
  hubReleasesDir,
  prune,
  recordInstall,
  versionDirectory,
} from "../../../packages/core/src/binary-installation";
import type { Kit, Spec } from "../kit";

/** In the order they are installed; by name, `0.9.0` sorts last. */
const BUILDS = ["0.9.0", "0.10.0", "0.11.0", "0.12.0", "0.13.0", "0.14.0"];
/** The build whose keeper runs on through every install after it. */
const KEEPER = "0.10.0";

const listed = async (dir: string): Promise<string> =>
  (await readdir(dir).catch(() => [] as string[])).sort().join(" ");
const sorted = (want: string[]): string => [...want].sort().join(" ");

const spec: Spec = {
  name: "binary-prune",
  run: async (kit: Kit) => {
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "binary-prune-")
    );
    const saved = {
      XDG_DATA_HOME: process.env.XDG_DATA_HOME,
      CAWCO_DB_PATH: process.env.CAWCO_DB_PATH,
    };
    process.env.XDG_DATA_HOME = join(scratch, "share");
    process.env.CAWCO_DB_PATH = join(scratch, "share", "cawco", "cawco.db");
    let keeper: ReturnType<typeof Bun.spawn> | undefined;
    try {
      const versions = join(binaryRoot(), "versions");
      const releases = hubReleasesDir();
      await mkdir(releases, { recursive: true });
      // The hub's update policy lives in its cache, and is no build.
      await Bun.write(join(releases, "policy.json"), "{}\n");
      let previous: string | undefined;
      for (const version of BUILDS) {
        // Staged as the agent stages it, its archive fetched through the hub.
        // biome-ignore lint/performance/noAwaitInLoops: installs go on one after another
        await mkdir(versionDirectory(version), { recursive: true });
        await Bun.write(
          join(releases, version, "cawco-linux-x64.tar.gz"),
          version
        );
        // A stand-in executable that stays up: its command line names its
        // build's folder, as a keeper's does (live-processes.ts reads both the
        // executable and the command line).
        await Bun.write(
          join(versionDirectory(version), "cawco"),
          '#!/bin/sh\nsleep "$1"\ntrue\n'
        );
        await chmod(join(versionDirectory(version), "cawco"), 0o755);
        const link = `${currentDirectory()}.next`;
        await rm(link, { force: true });
        await symlink(join("versions", version), link);
        await rename(link, currentDirectory());
        if (version === KEEPER) {
          keeper = Bun.spawn(
            [join(versionDirectory(version), "cawco"), "600"],
            { stdout: "ignore", stderr: "ignore" }
          );
          await Bun.sleep(200);
          kit.check(
            `the keeper of ${KEEPER} runs from its build`,
            keeper.exitCode === null,
            `exited ${keeper.exitCode}`
          );
        }
        if (previous) {
          await recordInstall(version, previous);
        }
        await prune();
        kit.note(
          `installed ${version}: versions/ holds ${await listed(versions)}; binary-releases/ holds ${await listed(releases)}`
        );
        previous = version;
      }
      const newest = BUILDS.slice(-3);
      kit.check(
        `six builds installed one after another: binary-releases/ holds the newest three by install order (${newest.join(", ")}) and the hub's policy`,
        (await listed(releases)) === sorted([...newest, "policy.json"]),
        await listed(releases)
      );
      kit.check(
        `versions/ holds the newest three and ${KEEPER}, which a live keeper still runs from`,
        (await listed(versions)) === sorted([...newest, KEEPER]),
        await listed(versions)
      );
      keeper?.kill("SIGTERM");
      await keeper?.exited;
      keeper = undefined;
      await prune();
      kit.check(
        `the keeper of ${KEEPER} ended, and the prune its removal runs leaves versions/ with exactly the newest three`,
        (await listed(versions)) === sorted(newest),
        await listed(versions)
      );
      kit.check(
        "binary-releases/ still holds the newest three and the policy",
        (await listed(releases)) === sorted([...newest, "policy.json"]),
        await listed(releases)
      );
    } finally {
      keeper?.kill("SIGKILL");
      process.env.XDG_DATA_HOME = saved.XDG_DATA_HOME;
      process.env.CAWCO_DB_PATH = saved.CAWCO_DB_PATH;
      if (saved.XDG_DATA_HOME === undefined) {
        delete process.env.XDG_DATA_HOME;
      }
      if (saved.CAWCO_DB_PATH === undefined) {
        delete process.env.CAWCO_DB_PATH;
      }
      await rm(scratch, { recursive: true, force: true });
    }
  },
};

export default spec;
