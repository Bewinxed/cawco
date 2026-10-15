/**
 * The Apple build gate: a project's setting (`projects.apple_gate`) that
 * keeps a work item from landing until the iOS app compiles at its last
 * commit. No Linux check compiles Swift, so a commit that breaks the app
 * passes every check a workspace there can run: 312b43065 changed a wire type
 * the TypeScript gates accepted, 2a4808be8 declared a Swift class twice, and
 * both landed with iOS compile errors.
 *
 * What it reads is the item's diff against its target. The paths that can
 * break the compile are the ones the Swift build reads:
 * - `apps/apple/**`: the Swift sources, the Xcode project, its resources and
 *   build scripts, and every file generated into the app from elsewhere: the
 *   OpenAPI document the Swift client is generated from (`bun run openapi`),
 *   the words (`bun run words`), the tokens (`bun run tokens`) and the tool
 *   presentation (`bun run tools`).
 * - `scripts/lib/heavy-run.sh`: build-both.sh sources it on the Mac.
 * A change to `packages/core` or the hub's routes and frames reaches the
 * Swift build only through those generated files, and openapi:check (with
 * words:check) is what keeps them in step with the TypeScript; what
 * openapi:check can't see is whether Swift compiles against them, and that
 * is every change under `apps/apple`. A core or hub change that leaves them
 * untouched compiles the same Swift main already compiles.
 */
import { capabilitiesOf } from "./runs-on";

/** The gate's check, as an item's check list and its report name it. */
export const APPLE_GATE_CHECK = "iOS build compiles";

/** What it runs on the Mac, in the item's check workspace there. */
export const APPLE_GATE_COMMAND =
  "bash apps/apple/scripts/build-both.sh ios --compile-only";

/** The build waits for the Mac's one build slot, then compiles: half an hour at most. */
export const APPLE_GATE_TIMEOUT_SEC = 1800;

const APP_PREFIX = "apps/apple/";
const BUILD_SCRIPTS: ReadonlySet<string> = new Set([
  "scripts/lib/heavy-run.sh",
]);

/** The diff's paths that the Swift build reads; empty when it reads none. */
export const appPaths = (paths: readonly string[]): string[] =>
  paths.filter(
    (path) => path.startsWith(APP_PREFIX) || BUILD_SCRIPTS.has(path)
  );

/**
 * The item's own changes against its target, one path per line: from where
 * HEAD left `origin/<base>` to HEAD, renames on both sides. Nothing for a
 * clone with no `origin`, which lands nowhere (landing.ts `no-remote`). Run
 * in its workspace, through the safe git shell.
 */
export const appleGateDiff = (quotedBase: string): string =>
  `if git remote get-url origin >/dev/null 2>&1; then base=$(git merge-base ${quotedBase} HEAD) && git diff --name-only --no-renames "$base" HEAD; fi`;

/** The diff's output as paths: one per line, blanks dropped. */
export const diffPaths = (stdout: string): string[] =>
  stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * Why an item that changes the app's sources does not land with no Mac
 * online, in one sentence: what it changed, and the Macs the fleet has.
 */
export const appleGateRefusal = (
  touched: readonly string[],
  offline: readonly string[]
): string => {
  const changed =
    touched.length === 1
      ? touched[0]
      : `${touched.length} files the iOS app is built from (${touched[0]} first)`;
  let macs = "the fleet has none";
  if (offline.length > 0) {
    macs = `${offline.join(", ")} ${offline.length === 1 ? "is" : "are"} offline`;
  }
  return `This item changes ${changed}, so it lands only once the iOS build compiles on a Mac, and no apple-capable machine is online (${macs}): call finish_item again once one is, or with blocked.`;
};

/** The machines the gate may run on: online, and a Mac by the OS each reported. */
export const appleMachines = <M extends { machineId: string; os: string }>(
  machines: readonly M[],
  online: (machineId: string) => boolean
): M[] =>
  machines.filter(
    (machine) =>
      capabilitiesOf(machine.os).includes("apple") && online(machine.machineId)
  );
