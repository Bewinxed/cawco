/**
 * A scratch fleet's folders go whole, read-only folders in them included:
 * as a kept fleet is removed by the next fleet of its name, and as a fleet
 * cleans up after itself (scratch-fleet.ts `removeKept`, `FleetDirs.remove`,
 * through agent remove-tree.ts).
 *
 * A kept HOME holds what its workspaces left as it stood: each workspace
 * layer's upper `.opencode`, the read-only stand-in (core workspace-policy.ts
 * `OPENCODE_DIR`, 0555), with what was written into it, and a Go module
 * cache's folders. Bun's `rm` refuses such a tree whole and names only its
 * top: boundary-quiet failed at its start in round r336, "EACCES: permission
 * denied, rm '/home/bewinxed/.cache/1d'", on the HOME of a fleet of its name
 * that an earlier failed run had kept.
 *
 * - K: a fleet stood up, each of its folders given such a read-only folder
 *   with a file in it, then kept for reading (`clean(true)`): its folders and
 *   those read-only folders stand, unstamped.
 * - N: the next fleet of the same name stands up over it: every folder K
 *   kept is gone.
 * - N, given the same read-only folders, then cleaned up (`clean(false)`):
 *   every folder of its own is gone.
 *
 * Nothing is launched: only the fleets' folders are read. It runs anywhere,
 * a workspace included.
 *
 *   bun scripts/probe-kit/run.ts fleet-kept-removal
 */
import { chmod, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Kit, Spec } from "../kit";

/** The fleets' name: the same for both, so the second removes the first's (`removeKept`). */
const NAME = "fleet-kept-removal-leg";
/** What the next fleet of the name reads to remove a kept one (scratch-fleet.ts `KEPT_FILE`). */
const KEPT_FILE = ".kept.json";

/** The read-only folders a kept fleet's folder holds, each with a file in it, as a workspace leaves them. */
const READ_ONLY = [
  join(
    ".cawco",
    "workspaces",
    "probe",
    "layer",
    "mounts",
    "0",
    "upper",
    ".opencode"
  ),
  join("gopath", "pkg", "mod", "example.com", "probe@v1.0.0"),
];

type Fleet = Awaited<
  ReturnType<(typeof import("../../scratch-fleet"))["scratchFleet"]>
>;

const standUp = async (): Promise<Fleet> => {
  const { scratchFleet } = await import("../../scratch-fleet");
  return scratchFleet({
    name: NAME,
    respond: () => ({ words: ["ok"], everyMs: 0 }),
  });
};

/** Every folder `fleet` made: its sandbox, HOME and runtime dir. */
const foldersOf = (fleet: Fleet): string[] =>
  [
    fleet.sandbox,
    fleet.home,
    fleet.env.XDG_RUNTIME_DIR as string | undefined,
  ].filter((dir): dir is string => Boolean(dir));

/** Puts the {@link READ_ONLY} folders in each of `dirs`, a file in each, then takes their write bits away. */
const plant = async (dirs: readonly string[]): Promise<string[]> => {
  const planted: string[] = [];
  for (const dir of dirs) {
    for (const folder of READ_ONLY) {
      const at = join(dir, folder);
      // biome-ignore lint/performance/noAwaitInLoops: a few folders, each made before its mode is taken
      await mkdir(at, { recursive: true });
      await writeFile(join(at, "probe.txt"), "kept\n");
      await chmod(at, 0o555);
      planted.push(at);
    }
  }
  return planted;
};

/** The modes of `paths` that stand, as `mode path`; one gone is said so. */
const modes = async (paths: readonly string[]): Promise<string[]> =>
  Promise.all(
    paths.map(async (path) => {
      const info = await lstat(path).catch(() => undefined);
      return info
        ? `${(info.mode % 0o1000).toString(8)} ${path}`
        : `gone ${path}`;
    })
  );

const standing = async (paths: readonly string[]): Promise<string[]> =>
  (
    await Promise.all(
      paths.map(async (path) =>
        (await lstat(path).catch(() => undefined)) ? [path] : []
      )
    )
  ).flat();

const run = async (kit: Kit) => {
  const kept = await standUp();
  const keptDirs = foldersOf(kept);
  const keptReadOnly = await plant(keptDirs);
  await kept.close();
  await kept.clean(true);
  const said = JSON.parse(
    await readFile(join(kept.sandbox, KEPT_FILE), "utf8")
  ) as { dirs: string[] };
  const keptModes = await modes(keptReadOnly);
  kit.check(
    "K: kept for reading, its folders stand, each holding a read-only folder (0555) with a file in it",
    keptDirs.every((dir) => said.dirs.includes(dir)) &&
      keptModes.every((line) => line.startsWith("555 ")),
    `kept ${said.dirs.join(", ")}; ${keptModes.join("; ")}`
  );

  const next = await standUp();
  const left = await standing(said.dirs);
  kit.check(
    "N: the next fleet of the name stands up, and every folder K kept is gone, its read-only folders with it",
    left.length === 0,
    left.length === 0
      ? `gone: ${said.dirs.join(", ")}`
      : `still there: ${left.join(", ")}`
  );

  const nextDirs = foldersOf(next);
  const nextReadOnly = await plant(nextDirs);
  await next.close();
  await next.clean(false);
  const leftNext = await standing(nextDirs);
  kit.check(
    "N: cleaned up, every folder of its own is gone, its read-only folders with it",
    leftNext.length === 0,
    leftNext.length === 0
      ? `gone: ${nextDirs.join(", ")} (${nextReadOnly.length} read-only folders in them)`
      : `still there: ${leftNext.join(", ")}`
  );
};

export default {
  group: "The probe kit's own rig",
  name: "fleet-kept-removal",
  run,
} satisfies Spec;
