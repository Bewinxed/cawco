/**
 * A boundary's plan and form: how a generation of one workspace starts in this
 * build, and the parts a form is made of, so a move names what moved.
 */

import { createHash } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fleetHooksDir, fleetMcpInstallsDir } from "@cawco/core/paths/fleet";
import { darwinUserDirs } from "@cawco/core/paths/host-policy";
import { workspacesDir, workspaceTmpDir } from "@cawco/core/paths/workspace";
import { HUB_PREVIEWS_ENV } from "@cawco/core/preview/hub-previews";
import { standalone } from "@cawco/core/runtime";
import type { ProcSpec } from "@cawco/core/sessiond";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import type { Policy } from "@cawco/core/workspace-judge";
import { systemProgram, trustedPath } from "@cawco/core/workspace-needs";
import {
  isPlace,
  workspaceDenies,
  workspacePolicy,
} from "@cawco/core/workspace-policy";
import {
  membershipName,
  readOnlyDeniesBwrap,
  seatbeltProfile,
  srtSettings,
} from "../boundary-policy";
import { bunNodeShim } from "../bun-node-shim";
import { syncedHeld } from "../fleet-converged";
import { githubDoorOf } from "../github-door";
import { gitDoorOf } from "../hub-git";
import { hubPreviewsPath } from "../hub-previews";
import { folderSync } from "../layer";
import { toolDoorOf } from "../tool-door";
import { execScript } from "./exec";
import { bunRuntime } from "./hook-judge";
import { guardFiles, placeGuard } from "./place-guard";
import { HOST_ENV, hostArgv } from "./protocol";
import {
  bwrapLauncherOf,
  containerSockets,
  hostBwrap,
  hostScript,
  LAUNCHD_SOCKETS,
  REMOTE_AUTOMATION_SOCKET,
  readHostText,
  ripgrep,
  ripgrepForm,
  runnerText,
  runtimePlaces,
  SIMULATOR_SOCKETS,
  srtTmpOf,
  TEST_MANAGER_SOCKET,
} from "./runner";
import {
  type FormParts,
  fifoOf,
  generationDir,
  grantedOf,
  grantedPolicy,
  type Held,
  READY,
  scratchOf,
  sessiondPath,
  stateDir,
} from "./state";

let hostText: Promise<string> | undefined;

/** How a workspace's boundary of one generation starts in this build, and the form that names it. */
interface Plan {
  /** Written into the generation's dir before the boundary starts: path, text and, for one that runs, its mode. */
  readonly files: readonly (readonly [string, string, number?])[];
  /**
   * A hash of what the boundary runs under: its srt settings or Seatbelt
   * profile (so the policy as this machine stands now), the runner, the
   * executor and, on Linux, the host script, each as a boundary of
   * {@link FORM_GENERATION} has them, so every generation of one form has
   * the same. A boundary started in another form is handed over
   * ({@link handOver}, REPORT.md §7.7).
   */
  readonly form: string;
  /** Each part {@link form} hashes over, hashed on its own, by name ({@link formFrom}). */
  readonly parts: FormParts;
  readonly spec: ProcSpec;
}

/**
 * The part of a Linux form that is what the fleet sync wrote that the
 * boundary binds, named by the hashes of the items it converged into each
 * (fleet-converged.ts `syncedHeld`): srt binds a read path back only when
 * it resolves ("Not restoring … nothing there resolves (absent, dangling or
 * unreadable)", its linux-sandbox-utils.js 0.0.81), and a file's bind keeps
 * the file it was made over, so a bound file written again, or a bound dir
 * made since the boundary started, is a later form, and a boundary in use is
 * handed over to it ({@link rearmMoved}). Seatbelt grants by path rule,
 * there or not.
 */
export const SYNCED_PART = "synced";

/**
 * A form, and its parts, from what it is made of, in order: the form hashes
 * every part's text, each after a NUL but the first, and each part keeps a
 * hash of its own text alone.
 */
const formFrom = (
  made: readonly (readonly [string, string])[]
): { form: string; parts: FormParts } => {
  const hash = createHash("sha256");
  const parts: Record<string, string> = {};
  made.forEach(([name, text], at) => {
    if (at > 0) {
      hash.update("\0");
    }
    hash.update(text);
    parts[name] = createHash("sha256").update(text).digest("hex").slice(0, 12);
  });
  return { form: hash.digest("hex").slice(0, 16), parts };
};

/** The parts that moved from `was` to `now`, by name; every one of `now`'s when `was` names none. */
export const movedParts = (
  was: FormParts | undefined,
  now: FormParts
): string[] => Object.keys(now).filter((name) => was?.[name] !== now[name]);

/** The parts of a form its workspace's policy is written into: Linux's srt settings, macOS's Seatbelt profile. */
const POLICY_PARTS: ReadonlySet<string> = new Set(["settings", "profile"]);

/**
 * How policy `now` differs from `was`, a boundary's grant ({@link
 * grantedOf}), in words: each path a list holds now that it did not then
 * (`+`), or held then and not now (`-`), and each other field that changed.
 * None when `was` is not on record.
 */
const policyMoves = (was: Policy | undefined, now: Policy): string[] => {
  if (!was) {
    return [];
  }
  const before: Record<string, unknown> = { ...was };
  const after: Record<string, unknown> = { ...now };
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .flatMap((field) => {
      const then = pathsOf(before[field]);
      const nowPaths = pathsOf(after[field]);
      if (then && nowPaths) {
        return [
          ...nowPaths
            .filter((path) => !then.includes(path))
            .map((path) => `${field} +${path}`),
          ...then
            .filter((path) => !nowPaths.includes(path))
            .map((path) => `${field} -${path}`),
        ];
      }
      return JSON.stringify(before[field]) === JSON.stringify(after[field])
        ? []
        : [`${field} changed`];
    });
};

/**
 * What moved in workspace `ref`'s form since its boundary `held` started,
 * for the log line that hands it over or keeps it: each part that moved
 * ({@link movedParts}) and, when its policy's part did, how the policy moved
 * ({@link policyMoves}), the first {@link REASONS_SAID} of it. Empty when
 * its form did not move, or cannot be read now.
 */
export const formMoveWords = async (
  ref: WorkspaceRef,
  held: Held
): Promise<string> => {
  try {
    const now = await formNow(ref);
    if (held.form === now.form) {
      return "";
    }
    if (!held.parts) {
      return "; its form moved from one a build before form parts started";
    }
    const moved = movedParts(held.parts, now.parts);
    const paths = moved.some((part) => POLICY_PARTS.has(part))
      ? policyMoves(
          await grantedPolicy(ref.id, held.gen),
          await workspacePolicy(ref)
        )
      : [];
    const more = paths.length - REASONS_SAID;
    return `; its form moved: ${moved.join(", ")}${paths.length > 0 ? ` (${paths.slice(0, REASONS_SAID).join("; ")}${more > 0 ? `; and ${more} more` : ""})` : ""}`;
  } catch {
    return "";
  }
};

/** The generation every form is computed for ({@link Plan.form}): no boundary has it. */
const FORM_GENERATION = "form";

/** The form, with its parts, a boundary of workspace `ref` takes in this build on this machine now. */
export const formNow = async (
  ref: WorkspaceRef
): Promise<{ form: string; parts: FormParts }> => {
  const { form, parts } = await planFor(ref, FORM_GENERATION);
  return { form, parts };
};

/** The form a boundary of workspace `ref` takes in this build on this machine now. */
export const formOf = async (ref: WorkspaceRef): Promise<string> =>
  (await formNow(ref)).form;

/** The {@link Plan} of generation `gen` of workspace `ref`'s boundary on this machine now. */
export const planOf = async (ref: WorkspaceRef, gen: string): Promise<Plan> => {
  const [plan, now] = await Promise.all([planFor(ref, gen), formNow(ref)]);
  return { ...plan, ...now };
};

/** {@link planOf}, its form hashed from `gen`'s own files. */
const planFor = async (ref: WorkspaceRef, gen: string): Promise<Plan> => {
  const { id } = ref;
  const policy = await workspacePolicy(ref);
  // Kept beside the generation's other files, never hashed into its form:
  // what it grants, to judge a later policy by (narrowing.ts `narrowing`).
  const granted = `${JSON.stringify(policy, null, 2)}\n`;
  const runtime = await bunRuntime(id);
  const exec = execScript(id, {
    exec: join(stateDir(id), "exec"),
    gen,
    path: ref.path,
    pid: undefined,
    scratch: scratchOf(id),
  });
  const runtimes = await containerSockets();
  // Made on the host at every look, on both OSes, where Bun looks for it
  // (bun-node-shim.ts); macOS reads `/private/tmp` as it stands, Linux binds it
  // back into the sandbox's `/tmp`.
  const bunNode = await bunNodeShim();
  if (process.platform === "darwin") {
    const profile = seatbeltProfile(policy, {
      // With the scratch dir's short name, its `TMPDIR`: a tool's socket
      // there (Chromium's singleton) is reached by that name too.
      doors: [
        toolDoorOf(id),
        gitDoorOf(id),
        githubDoorOf(id),
        workspaceTmpDir(id),
      ],
      hostSockets: [
        ...(await Promise.all(
          [
            dirname(workspacesDir()),
            dirname(sessiondPath()),
            LAUNCHD_SOCKETS,
            SIMULATOR_SOCKETS,
            // The per-user temp and cache dirs: a workspace writes them for
            // Apple's build tools, and every host app keeps its sockets there
            // (VS Code's git askpass, browsers' singletons, srt's proxies,
            // Podman machine's API socket).
            ...(await darwinUserDirs()),
          ].map((path) => realpath(path).catch(() => path))
        )),
        // The container runtimes' sockets, the browsers' among them, each
        // by the path a runtime is dialled at and by the file it names.
        ...runtimes.dirs,
        ...runtimes.sockets,
      ],
      reachedHostSockets: [TEST_MANAGER_SOCKET, REMOTE_AUTOMATION_SOCKET],
      // How every process this generation starts is found, wherever it
      // moves and whatever it runs ({@link MEMBERSHIP_PREFIX}).
      members: [membershipName(id), membershipName(id, gen)],
    });
    const file = join(generationDir(id, gen), "boundary.sb");
    return {
      files: [
        [file, profile],
        [grantedOf(id, gen), granted],
        ...guardFiles(id, gen),
      ],
      ...formFrom([
        ["profile", profile],
        ["runner", runnerText()],
        ["exec", exec],
        ["place", isPlace(id) ? placeGuard() : ""],
      ]),
      spec: {
        command: systemProgram("sandbox-exec"),
        args: [
          "-f",
          file,
          systemProgram("bash"),
          "--norc",
          "--noprofile",
          "-c",
          runnerText(),
          "cawco-boundary",
          fifoOf(id, gen),
        ],
        // In the clone, as the srt host starts its sandbox on Linux: every
        // command's shell starts in the runner's directory before it moves to
        // its caller's, and one the profile denies (sessiond's own, under the
        // home dir) fails bash's getcwd ("shell-init: error retrieving current
        // directory") on every command.
        cwd: policy.clone,
        env: {
          TMPDIR: workspaceTmpDir(id),
          ...(isPlace(id) ? { [HOST_ENV.place]: "1" } : {}),
        },
      },
    };
  }
  // CawCo's own dirs the fleet sync writes into, which a boundary binds
  // whole: made before any boundary starts, so none is made under one
  // running, and the form names them by nothing ({@link SYNCED_PART}).
  await Promise.all(
    [fleetHooksDir(), fleetMcpInstallsDir()].map((dir) =>
      mkdir(dir, { recursive: true })
    )
  );
  const srtTmp = srtTmpOf(id, gen);
  const bwrap = bwrapLauncherOf(id, gen);
  const launcher = readOnlyDeniesBwrap(hostBwrap());
  const settingsWith = (rg: string): string =>
    `${JSON.stringify(
      srtSettings(policy, {
        bwrap,
        rg,
        srtTmp,
        bunNode,
        containerSockets: runtimes,
      }),
      null,
      2
    )}\n`;
  const settings = settingsWith(ripgrep());
  const host = hostScript();
  hostText ??= readHostText(host);
  // What the host makes in the clone before each sandbox, so srt binds
  // each deny path onto itself and leaves nothing on the host
  // (`cloneDenies`), and guards for the sandbox's whole life.
  const denies = `${JSON.stringify(await workspaceDenies(ref), null, 2)}\n`;
  const files = {
    settings: join(generationDir(id, gen), "srt.json"),
    runner: join(generationDir(id, gen), "runner.sh"),
    denies: join(generationDir(id, gen), "denies.json"),
  };
  const place = isPlace(id);
  return {
    files: [
      [files.settings, settings],
      [files.runner, runnerText()],
      [files.denies, denies],
      [bwrap, launcher, 0o755],
      [grantedOf(id, gen), granted],
      ...guardFiles(id, gen),
    ],
    ...formFrom([
      ["settings", settingsWith(ripgrepForm())],
      [SYNCED_PART, await syncedHeld()],
      ["launcher", launcher],
      ["runner", runnerText()],
      ["exec", exec],
      ["denies", denies],
      ["host", await hostText],
      ["place", place ? `${policy.scratch}\0${placeGuard()}` : ""],
    ]),
    spec: {
      command: runtime,
      args: [
        host,
        ...hostArgv({
          settingsFile: files.settings,
          runnerFile: files.runner,
          fifo: fifoOf(id, gen),
          clone: policy.clone,
          readyLine: READY,
          deniesFile: files.denies,
          places: runtimePlaces(id, [...policy.allowRead, srtTmp]),
        }),
      ],
      // The host starts here, never in the clone: Bun reads bunfig.toml and
      // .env from where it starts (boundary-host.ts). It names its sandbox
      // here too ({@link placeOf}).
      cwd: generationDir(id, gen),
      env: {
        ...(standalone ? { BUN_BE_BUN: "1" } : {}),
        // srt's own temp dir, for its sockets; the commands' TMPDIR is the
        // scratch dir, which srt hands in from CLAUDE_CODE_TMPDIR.
        TMPDIR: srtTmp,
        CLAUDE_CODE_TMPDIR: policy.scratch,
        CAWCO_WORKSPACE: id,
        // The hub's preview origins, which the relay dials from here
        // (proxy-relay.ts): a file of the agent's that no sandbox reads.
        [HUB_PREVIEWS_ENV]: hubPreviewsPath(),
        PATH: trustedPath(),
        // A place is a person's own folder: srt resolves its own
        // mandatory names against the host's working directory and makes a
        // mount point for each one absent, so the host starts srt in the
        // place's scratch dir, never in the place (boundary-host.ts); and
        // what each command leaves running goes with it (`runnerText`).
        ...(place
          ? { [HOST_ENV.sandboxCwd]: policy.scratch, [HOST_ENV.place]: "1" }
          : {}),
        // A delegate's copy of a folder that is no repository: the host
        // holds it as a folder, never asking it for a `.git` (layer.ts).
        ...(folderSync(id) ? { [HOST_ENV.folder]: "1" } : {}),
      },
    },
  };
};

/** A list of a policy's as paths; undefined when it is no list of strings. */
export const pathsOf = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : undefined;

/** At most this many reasons for a narrowing are said, then how many more. */
export const REASONS_SAID = 3;
