/**
 * A machine keeps the build it runs and the two installed before it, in
 * `binary/versions/` and, on the hub's machine, in the hub's archive cache
 * (`binary-releases/`), by install order, never by name; a build an older
 * session keeper still runs from stays until that keeper ends. The cache
 * holds archives alone: the fleet's update policy lives beside the hub's
 * database, so a cache emptied whole (a hand-run prune that took every entry
 * for a release) leaves the policy as it was.
 *
 * A scratch machine (its own `XDG_DATA_HOME` and hub database path) starts a
 * hub with no policy (it says, once, that it runs the first policy and where
 * it looked), saves a nightly one, then installs six builds one after
 * another: the first as the installer's `binary-install` records it (core
 * `recordInstall` with no build before it), each after it as the update
 * helper confirms it: the build staged under `versions/`, its archive in the
 * hub's cache, `current` moved to it, then the confirm (`recordInstall`
 * naming the build it replaced, `prune`). After the first install and two
 * updates the install order is exactly those three.
 * The names sort apart from the order they went on (`0.9.0` is the first,
 * and sorts last). The second build's keeper runs from its folder (a real
 * process started as `versions/0.10.0/cawco`) through every install after
 * it. The agent prunes again when it removes a retiring keeper that
 * holds nothing (binary-update.ts `#tendKeepers`); here the keeper ends and
 * the same prune runs. Then every entry of `binary-releases/` goes, and a
 * hub started again answers the policy it was given.
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
import { dirname, join } from "node:path";
import {
  binaryRoot,
  currentDirectory,
  hubReleasesDir,
  installOrderPath,
  prune,
  recordInstall,
  versionDirectory,
} from "../../../packages/core/src/binary-installation";
import { systemProgram } from "../../../packages/core/src/workspace-needs";
import { createBinaryUpdates } from "../../../packages/hub/src/binary-updates";
import type { Kit, Spec } from "../kit";

/** In the order they are installed; by name, `0.9.0` sorts last. */
const BUILDS = ["0.9.0", "0.10.0", "0.11.0", "0.12.0", "0.13.0", "0.14.0"];
/** The build whose keeper runs on through every install after it. */
const KEEPER = "0.10.0";
/** The policy the owner saves: not the one a hub with none starts with. */
const SAVED = { channel: "nightly", autoUpdate: true } as const;

const listed = async (dir: string): Promise<string> =>
  (await readdir(dir).catch(() => [] as string[])).sort().join(" ");
const sorted = (want: string[]): string => [...want].sort().join(" ");

/**
 * The hub's update routes as a hub starts them (server.ts), on the scratch
 * database, with what it said to its journal (`console.info`, `console.warn`)
 * while it started.
 */
const startHub = (dbPath: string) => {
  const said: string[] = [];
  const { info, warn } = console;
  console.info = (...words: unknown[]) => said.push(words.join(" "));
  console.warn = (...words: unknown[]) => said.push(words.join(" "));
  try {
    const { routes } = createBinaryUpdates({
      cancel: async () => undefined,
      configure: async () => undefined,
      dbPath,
      online: () => [],
      setState: () => undefined,
      states: () => new Map(),
    });
    const settings = async (init?: RequestInit): Promise<unknown> => {
      const response = await routes.handle(
        new Request("http://hub/api/binary-updates/settings", init)
      );
      return response.ok
        ? await response.json()
        : `${response.status} ${await response.text()}`;
    };
    return { said, settings };
  } finally {
    console.info = info;
    console.warn = warn;
  }
};

const spec: Spec = {
  group: "Release checks",
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
    const dbPath = join(scratch, "share", "cawco", "cawco.db");
    process.env.CAWCO_DB_PATH = dbPath;
    let keeper: ReturnType<typeof Bun.spawn> | undefined;
    try {
      const versions = join(binaryRoot(), "versions");
      const releases = hubReleasesDir();
      await mkdir(releases, { recursive: true });

      // A hub with no policy says so as it starts, naming where it looked.
      const first = startHub(dbPath);
      const looked = join(dirname(dbPath), "update-policy.json");
      const firstLine = first.said.find((line) =>
        line.startsWith("[updates] no update policy at ")
      );
      kit.check(
        `a hub that starts with no policy says it runs the first policy, and where it looked (${looked})`,
        firstLine?.includes(looked) === true &&
          firstLine.includes("stable, auto-update off"),
        firstLine ?? `it said: ${JSON.stringify(first.said)}`
      );
      const put = await first.settings({
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(SAVED),
      });
      kit.note(`saved the policy: ${JSON.stringify(put)}`);

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
          `#!${systemProgram("sh")}\nsleep "$1"\ntrue\n`
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
        await recordInstall(version, previous);
        await prune();
        if (version === BUILDS[2]) {
          const order = (await Bun.file(installOrderPath()).json()) as string[];
          kit.check(
            "a first install, then two updates: the install order is exactly those three, in order",
            order.join(" ") === BUILDS.slice(0, 3).join(" "),
            order.join(" ")
          );
        }
        kit.note(
          `installed ${version}: versions/ holds ${await listed(versions)}; binary-releases/ holds ${await listed(releases)}`
        );
        previous = version;
      }
      const newest = BUILDS.slice(-3);
      kit.check(
        `six builds installed one after another: binary-releases/ holds exactly the newest three by install order (${newest.join(", ")}), archives alone`,
        (await listed(releases)) === sorted(newest),
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
        "binary-releases/ still holds exactly the newest three",
        (await listed(releases)) === sorted(newest),
        await listed(releases)
      );

      // Every entry of the cache goes, each taken for a release, as a
      // hand-run prune took them; then the hub starts again.
      for (const name of await readdir(releases)) {
        // biome-ignore lint/performance/noAwaitInLoops: one entry after another, as the loop it reproduces
        await rm(join(releases, name), { recursive: true, force: true });
      }
      const again = startHub(dbPath);
      const held = await again.settings();
      kit.check(
        `binary-releases/ emptied whole and the hub started again: it answers the policy it was given (${JSON.stringify(SAVED)})`,
        JSON.stringify(held) === JSON.stringify(SAVED),
        `${JSON.stringify(held)}; binary-releases/ holds "${await listed(releases)}"`
      );
      kit.check(
        "a hub that starts with its policy says nothing of the first policy",
        !again.said.some((line) => line.startsWith("[updates] no update")),
        JSON.stringify(again.said)
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
