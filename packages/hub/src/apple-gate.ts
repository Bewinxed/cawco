/**
 * The Apple build gate: a project's setting (`projects.apple_gate`) that adds
 * a step to a work item's landing gate, keeping it from landing until the iOS
 * app compiles at its last commit. Nothing on Linux compiles Swift, so a
 * commit that breaks the app passes every command a workspace there can
 * run: 312b43065 changed a wire type
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
import { namedAmong } from "@cawco/core";
import { capabilitiesOf } from "./runs-on";

/** The gate's step, as the landing gate's lines name it. */
export const APPLE_GATE_STEP = "iOS build compiles";

/**
 * What it runs on the Mac, in the item's gate workspace there at its last
 * commit: the iOS Simulator compile, in the one build root every item's gate
 * shares (build-both.sh `--gate`), so Xcode compiles only what the item's
 * tree changed against the last one the gate compiled.
 */
export const APPLE_GATE_COMMAND =
  "bash apps/apple/scripts/build-both.sh ios --gate";

/**
 * What the gate's compile reads, by path in the repository: build-both.sh
 * rsyncs `apps/apple/` alone to the Mac and builds there (xcodegen makes the
 * Xcode project from its project.yml), and every SwiftPM dependency is at the
 * version its committed `apps/apple/Package.resolved` names, resolution off
 * (build-both.sh `PINNED`). So one apps/apple tree is one compile: a pass
 * the gate made on it holds wherever that tree is again, a rebase that left
 * it alone included (work-items.ts `gateOnce`); with it, the one script
 * outside apps/apple that build-both.sh sources ({@link BUILD_SCRIPTS}). The
 * Mac's Xcode toolchain is not in it, as it is not in a whole-tree pass
 * either.
 */
const BUILD_SCRIPTS: ReadonlySet<string> = new Set([
  "scripts/lib/heavy-run.sh",
]);
export const APPLE_GATE_INPUTS: readonly string[] = [
  "apps/apple",
  ...BUILD_SCRIPTS,
];

/** The build waits for the Mac's one build slot, then compiles: half an hour at most. */
export const APPLE_GATE_TIMEOUT_SEC = 1800;

const APP_PREFIX = "apps/apple/";

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
 * online, in one sentence: what it changed, and the Mac the gate would have
 * used, by name ({@link lastMac}), or that the hub knows none.
 */
export const appleGateRefusal = (
  touched: readonly string[],
  mac: string | undefined
): string => {
  const changed =
    touched.length === 1
      ? touched[0]
      : `${touched.length} files the iOS app is built from (${touched[0]} first)`;
  const macs = mac ? `${mac} is offline` : "no Mac is known";
  return `This item changes ${changed}, so it lands only once the iOS build compiles on a Mac, and no apple-capable machine is online (${macs}): wait for one with wait_item and call finish_item again, or call it with blocked.`;
};

/** When a machine was last seen, in ms; 0 when never. */
const seenAt = (machine: {
  lastSeenAt: Date | number | string | null;
}): number =>
  machine.lastSeenAt === null ? 0 : new Date(machine.lastSeenAt).getTime();

/**
 * The Mac the gate would have used, named among the fleet (core
 * `namedAmong`): the darwin machine seen last. Undefined when no Mac ever
 * registered.
 */
export const lastMac = (
  machines: readonly {
    hostname: string;
    lastSeenAt: Date | number | string | null;
    machineId: string;
    os: string;
  }[]
): string | undefined => {
  const [mac] = appleMachines(machines, () => true).sort(
    (a, b) => seenAt(b) - seenAt(a)
  );
  if (!mac) {
    return;
  }
  return namedAmong(mac, machines);
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
