/**
 * What the release's steps share: the request, the paths a build keeps, the
 * context a step runs in, and the entry each step module uses to run alone
 * (`bun scripts/release/steps/<name>.ts --help`) on a staging folder an
 * earlier step left.
 */
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { releaseTag } from "../../../packages/core/src/binary-distribution";
import type { ReleaseManifest } from "../../../packages/core/src/release-manifest";
import { SESSIOND_V1 } from "../../../packages/core/src/sessiond";
import type { Step } from "../../release-graph";
import { takeReleaseSecrets, underSigningEnv } from "../../release-signing";
import type { Runner } from "../binary-tests";

/** The checkout the release scripts are read from. */
export const repo = resolve(import.meta.dir, "..", "..", "..");

/** One release to build, as the queue keeps it. */
export interface Request {
  channel: "stable" | "nightly";
  commit: string;
  /** This request, apart from any other for the same commit. */
  id: string;
  /** A nightly's end-user notes, carried with the request so a queued one keeps its own. */
  notes?: string;
  output: string;
  tag?: string;
}

export const state = join(homedir(), ".cache", "cawco", "release-pipeline");
/** Where a failed build's proof evidence outlives its staging; the newest few are kept. */
export const failedEvidence = join(homedir(), ".cache", "cawco-release");

/** The trees a build of `commit` runs in: one builds, one checks (when it must). */
export const treesOf = (commit: string) => {
  const base = join(homedir(), ".worktrees", `release-${commit.slice(0, 12)}`);
  return { build: base, check: `${base}-check` };
};

export const stagingOf = (commit: string): string =>
  join(state, `staging-${commit.slice(0, 12)}`);

/** Whether a target's builds are darwin's: a signed bundle. */
export const isDarwin = (target: string): boolean =>
  target.startsWith("darwin");

const fail = (why: string): never => {
  throw new Error(`Release build: ${why}`);
};

export type ReleaseSecretsTaken = ReturnType<typeof takeReleaseSecrets>;

/**
 * What a step needs that an earlier step learned: filled in as the build
 * goes, read by the steps after.
 */
export interface Learned {
  /** The Developer ID identity as the file rcodesign reads, once written. */
  apple?: Promise<{ identity: string }>;
  /**
   * The draft release this build makes, by its exact tag, from the moment it
   * is asked for: a build that fails or is stopped removes it (`created` has
   * settled first, so a draft still being made is removed too).
   */
  draft?: { created: Promise<unknown>; tag: string };
  manifest?: ReleaseManifest;
}

/** Everything one build's steps read: the request, where it builds, and what earlier steps learned. */
export interface StepContext {
  archiveName: (target: string) => string;
  bundleFiles: string;
  current: Request;
  infoHome: string;
  learned: Learned;
  manifest: () => ReleaseManifest;
  /** Holds a GitHub call from starting while a stop is clearing the run: it never returns then. */
  notStopped: () => Promise<void>;
  proofBinary: string;
  publish: boolean;
  run: Runner;
  secrets: ReleaseSecretsTaken;
  staging: string;
  tag: () => string;
  trees: ReturnType<typeof treesOf>;
}

export const stepContext = (
  current: Request,
  publish: boolean,
  run: Runner,
  learned: Learned,
  secrets: ReleaseSecretsTaken,
  notStopped: () => Promise<void>,
  where: { staging?: string; build?: string } = {}
): StepContext => {
  const trees = treesOf(current.commit);
  if (where.build) {
    trees.build = where.build;
  }
  const staging = where.staging ?? stagingOf(current.commit);
  const manifest = (): ReleaseManifest =>
    learned.manifest ?? fail("the manifest is made by the version step");
  const tag = (): string => releaseTag(manifest());
  return {
    current,
    publish,
    run,
    learned,
    secrets,
    notStopped,
    trees,
    staging,
    proofBinary: join(staging, "cawco-proof"),
    infoHome: join(staging, "binary-info-home"),
    bundleFiles: join(staging, "agent-bundle"),
    manifest,
    tag,
    archiveName: (target) => `cawco-${tag()}-${target}.tar.gz`,
  };
};

/** One node of the graph: `work` runs once the steps in `after` have ended; `expect` is its seconds. */
export const step = (
  name: string,
  after: string[],
  expect: number,
  work: () => Promise<unknown>
): Step => ({
  name,
  after,
  expect,
  run: async () => {
    await work();
  },
});

/** A command run in a standalone step: its output on this terminal, a failure thrown. */
const aloneRunner: Runner = async (command, at, captured, extra) => {
  const child = Bun.spawn(command, {
    cwd: at ?? repo,
    stdout: captured ? "pipe" : "inherit",
    stderr: "inherit",
    env: { ...process.env, ...extra },
  });
  const text = captured
    ? await new Response(child.stdout as ReadableStream).text()
    : "";
  const status = await child.exited;
  if (status !== 0) {
    throw new Error(
      `Release command failed with exit status ${status}: ${command.join(" ")}`
    );
  }
  return text.trim();
};

export interface Flags {
  has: (name: string) => boolean;
  required: (name: string) => string;
  value: (name: string) => string | undefined;
}

/**
 * Runs one step alone when its module is the program: `--help` prints
 * `usage`; otherwise the flags name the commit and the staging folder an
 * earlier step left, and `body` does that one step. The manifest the build
 * keeps in memory lives in `<staging>/manifest.json` here (`--manifest`), read
 * before the step and written after it, so `release:version`,
 * `release:build-info` and `release:archive` leave it for the steps after.
 */
export async function alone(
  meta: ImportMeta,
  usage: string,
  body: (context: StepContext, flags: Flags) => Promise<void>,
  options: { secrets?: boolean; keepsManifest?: boolean } = {}
): Promise<void> {
  if (!meta.main) {
    return;
  }
  const argv = Bun.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage);
    return;
  }
  if (options.secrets) {
    await underSigningEnv(meta.path, argv);
  }
  const flags: Flags = {
    value: (name) => {
      const i = argv.indexOf(name);
      return i < 0 ? undefined : argv[i + 1];
    },
    has: (name) => argv.includes(name),
    required: (name) => {
      const i = argv.indexOf(name);
      const found = i < 0 ? undefined : argv[i + 1];
      if (!found) {
        console.error(`${name} is required.\n${usage}`);
        process.exit(2);
      }
      return found as string;
    },
  };
  const commit = flags.required("--commit");
  const channel = flags.value("--channel") ?? "nightly";
  if (channel !== "stable" && channel !== "nightly") {
    console.error(`--channel is stable or nightly.\n${usage}`);
    process.exit(2);
  }
  const output = flags.value("--output") ?? "";
  if (output && !isAbsolute(output)) {
    console.error(`--output is an absolute path.\n${usage}`);
    process.exit(2);
  }
  const notesFile = flags.value("--notes");
  const learned: Learned = {};
  const context = stepContext(
    {
      channel,
      commit,
      id: "alone",
      output,
      notes: notesFile ? await Bun.file(notesFile).text() : undefined,
      tag: flags.value("--tag"),
    },
    flags.has("--publish"),
    aloneRunner,
    learned,
    options.secrets ? takeReleaseSecrets() : {},
    () => Promise.resolve(),
    { staging: flags.value("--staging"), build: flags.value("--checkout") }
  );
  const manifestFile =
    flags.value("--manifest") ?? join(context.staging, "manifest.json");
  if (await Bun.file(manifestFile).exists()) {
    learned.manifest = (await Bun.file(manifestFile).json()) as ReleaseManifest;
  } else if (flags.value("--version")) {
    learned.manifest = {
      version: flags.value("--version") as string,
      commit,
      channel,
      sequence: 0,
      schemaVersion: 0,
      protocol: { min: 0, max: 0 },
      sessiondProtocol: SESSIOND_V1,
      notes: "",
      testSigned: false,
      artifacts: [],
    };
  }
  await body(context, flags);
  if (options.keepsManifest && learned.manifest) {
    await Bun.write(manifestFile, JSON.stringify(learned.manifest, null, 2));
    console.log(`manifest kept in ${manifestFile}`);
  }
}
