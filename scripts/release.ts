/**
 * The release pipeline:
 *   bun scripts/release.ts --commit <sha> --channel stable|nightly --output /absolute/path
 *     [--notes /absolute/notes.md (nightly, required)] [--tag vX.Y.Z] [--publish] [--dry-run]
 *
 * A release names its commit, and is built from exactly that commit: a
 * worktree of it under ~/.worktrees/release-<sha>, on real disk, made here
 * and removed when the build ends, whichever way, that builds, signs and
 * proves. The repository's check (`bun run check --all`) runs only when the
 * hub's merge checks did not pass it on the commit's tree (`GET
 * /api/landing-gate`, hub work-items.ts `gatePassesOn`): then in a second
 * worktree, beside the builds, so it reads no file a build rewrites
 * (SvelteKit's sync writes each route's `$types.d.ts` with a plain
 * writeFileSync on every run, kit 3.1.0 src/core/sync/write_types). The
 * checkout this runs from must be clean (this script and what it imports are
 * read from it), and the commit must be on origin/main; either refuses the
 * run before anything is built. Without --publish nothing is published,
 * tagged or uploaded: the signed artifacts are left in --output.
 *
 * Everything runs at once that can: the steps are a graph (`releaseSteps`,
 * release-graph.ts), each starting as soon as the steps it needs have ended.
 * `--dry-run` prints that graph, with each step's expected time, and runs
 * nothing. What waits on what, and why:
 * - the check (when it runs) and the live database's migration check gate
 *   promotion, and Apple's notarization: nothing is submitted to Apple
 *   before they pass.
 * - The proof build and stage 2's builds come before the proofs that run them.
 * - The four targets compile at once, from assets prepared once; each linux
 *   archive is made at once, each darwin bundle signed, notarized and stapled
 *   on this host (rcodesign, sign-agent-bundle.ts) at once with the other.
 * - With --publish, a draft release is made once the version is known, and
 *   each archive goes up to it as soon as it is made, while the proofs run.
 * - Promotion (the manifest signed and uploaded, the draft published) waits
 *   for every target and every proof; then the hub is told to look.
 * Only the run itself is one at a time: the lock below (no two release runs
 * at once) and its queue of one.
 */
import { Database } from "bun:sqlite";
import { createPublicKey } from "node:crypto";
import { existsSync } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { Subprocess } from "bun";
import { AGENT_BUNDLE_EXECUTABLE } from "../packages/core/src/agent-bundle";
import { releaseTag } from "../packages/core/src/binary-distribution";
import { readInstallation } from "../packages/core/src/binary-installation";
import { readWithin } from "../packages/core/src/bounded";
import { machineFetch } from "../packages/core/src/machine-key";
import { hubDbPath } from "../packages/core/src/paths";
import {
  type ReleaseManifest,
  signManifest,
  verifyManifest,
} from "../packages/core/src/release-manifest";
import { SESSIOND_V1 } from "../packages/core/src/sessiond";
import {
  listedPid,
  signalGroup,
  signal as signalPid,
} from "../packages/core/src/signal";
import { proofInputsKey } from "./binary/proof-inputs";
import {
  archiveBundle,
  notarizeBundle,
  signBundle,
} from "./binary/sign-agent-bundle";
import { PINNED_BUN, TARGETS } from "./build-binary";
import { requireDiskRoom } from "./lib/disk-room";
import { holdAwake } from "./lib/hold-awake";
import { ask, NoAnswer, persist } from "./lib/outside-call";
import {
  createDraft,
  deleteDraft,
  endCalls,
  promoteRelease,
  uploadAssets,
} from "./publish-release";
import { describeSteps, runSteps, type Step } from "./release-graph";
import { quotaRefusal } from "./release-quota";
import {
  missingSecrets,
  signingPem,
  takeReleaseSecrets,
  underSigningEnv,
  writeAppleSecrets,
} from "./release-signing";
import { RCODESIGN_VERSION, rcodesignPath } from "./release-tools";

const repo = resolve(import.meta.dir, "..");
const argv = Bun.argv.slice(2);
function argument(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i < 0 ? undefined : argv[i + 1];
}
const commitInput = argument("--commit");
const channel = argument("--channel");
const output = argument("--output");
const publishing = argv.includes("--publish");
if (
  !(commitInput && output && isAbsolute(output)) ||
  (channel !== "stable" && channel !== "nightly")
) {
  console.error(
    "Usage: bun scripts/release.ts --commit <sha> --channel stable|nightly --output /absolute/path [--notes /absolute/notes.md (nightly, required)] [--tag vX.Y.Z] [--publish] [--dry-run]"
  );
  process.exit(2);
}
/** A refusal before anything is built: its reason, and exit 2. */
const refuse = (why: string): never => {
  console.error(`Release refused: ${why}`);
  process.exit(2);
};

/** One release to build, as the queue keeps it. */
interface Request {
  channel: "stable" | "nightly";
  commit: string;
  /** This request, apart from any other for the same commit. */
  id: string;
  /** A nightly's end-user notes, carried with the request so a queued one keeps its own. */
  notes?: string;
  output: string;
  tag?: string;
}

/** The arm64 userland a published linux-arm64 binary runs on here: see {@link arm64Sysroot}. */
const ARM64_LIBC = {
  url: "https://snapshot.debian.org/file/6ee536e6a461ca319776fac983202946f4d3dce8/libc6_2.41-12%2Bdeb13u4_arm64.deb",
  sha256: "8784eda966b189c777a384dac5ce009e8fc9b52d006926c5a013e7fa8aa688cc",
};
const arm64Root = join(homedir(), ".cache", "cawco-release", "arm64-sysroot");
const state = join(homedir(), ".cache", "cawco", "release-pipeline");
/** Where a failed build's proof evidence outlives its staging; the newest few are kept. */
const failedEvidence = join(homedir(), ".cache", "cawco-release");
const KEPT_FAILURES = 5;
/**
 * How many promoted builds `--output` keeps, newest first ({@link pruneOutputs}).
 * Nothing in CawCo reads them: a machine runs and rolls back from its own
 * binary root's `versions/` (core binary-wrapper.ts), and the hub serves and
 * offers each build from the release host (hub binary-updates.ts
 * `assetBase`). They are for a person on this host: the build just made, and
 * the one it replaced, to compare or upload again by hand when the newest has
 * to be pulled. Unbounded, 75 nightlies of about 3 GB each filled the hub
 * machine's disk on 2026-10-26.
 */
const KEPT_OUTPUTS = 2;
/** Each proven verdict, by the inputs it stands on: `<inputs>/stage1`, and `<inputs>/stage2/<rig>` per stage 2 rig. */
const proofVerdicts = join(
  homedir(),
  ".cache",
  "cawco-release",
  "proof-verdicts"
);

/** The trees a build of `commit` runs in: one builds, one checks (when it must). */
const treesOf = (commit: string) => {
  const base = join(homedir(), ".worktrees", `release-${commit.slice(0, 12)}`);
  return { build: base, check: `${base}-check` };
};

/** The merge check a release takes as its check (gate.md). */
const LANDING_CHECK = "bun run check --all";

/**
 * Whether the hub's merge checks passed {@link LANDING_CHECK} on the tree
 * `commit` holds: the hub on this host is asked (`GET /api/landing-gate`,
 * as this machine). No hub, no answer, or no such pass: the release runs
 * the check itself, and says why.
 */
const gatePassed = async (commit: string): Promise<boolean> => {
  const read = Bun.spawnSync(["git", "rev-parse", `${commit}^{tree}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const tree = read.stdout.toString().trim();
  const installation = await readInstallation();
  if (read.exitCode !== 0 || !installation?.hubUrl) {
    console.log(
      read.exitCode === 0
        ? "This host has no CawCo installation naming a hub: the release runs its own check"
        : `git could not name the tree of ${commit}: the release runs its own check`
    );
    return false;
  }
  const { hubUrl } = installation;
  const asked = await readWithin(ANNOUNCE_MS, async (signal) => {
    const response = await machineFetch(
      `${hubUrl}/api/landing-gate?tree=${tree}`,
      { signal }
    );
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    };
  });
  if (asked.kind === "unanswered" || !asked.value.ok) {
    console.log(
      `The hub at ${hubUrl} ${asked.kind === "unanswered" ? `did not answer within ${ANNOUNCE_MS / 1000} s` : `answered ${asked.value.status}`} on the merge checks of tree ${tree.slice(0, 12)}: the release runs its own check`
    );
    return false;
  }
  const { passed } = JSON.parse(asked.value.text) as { passed: string[] };
  const ok = passed.includes(LANDING_CHECK);
  console.log(
    ok
      ? `The merge checks passed \`${LANDING_CHECK}\` on tree ${tree.slice(0, 12)}: the release checks it no more`
      : `The merge checks passed no \`${LANDING_CHECK}\` on tree ${tree.slice(0, 12)}: the release runs it`
  );
  return ok;
};
const stagingOf = (commit: string): string =>
  join(state, `staging-${commit.slice(0, 12)}`);

/** Whether a target's builds are darwin's: a signed, notarized bundle. */
const isDarwin = (target: string): boolean => target.startsWith("darwin");

/**
 * What a step needs that an earlier step learned: filled in as the build
 * goes, read by the steps after.
 */
interface Learned {
  /** Apple's secrets as the files rcodesign reads, once written. */
  apple?: Promise<{ apiKey: string; identity: string }>;
  /**
   * The draft release this build makes, by its exact tag, from the moment it
   * is asked for: a build that fails or is stopped removes it (`created` has
   * settled first, so a draft still being made is removed too).
   */
  draft?: { created: Promise<unknown>; tag: string };
  /** The proof inputs' key at the commit (proof-inputs.ts). */
  inputs?: string;
  manifest?: ReleaseManifest;
  /** Stage 2's rigs not yet passed on these inputs, with each's check count. */
  stage2?: { counts: Map<string, number>; todo: string[] };
}

/** A command as a step runs it: `run` below in a real build. */
type Runner = (
  command: string[],
  cwd?: string,
  capture?: boolean,
  env?: Record<string, string>
) => Promise<string>;

/**
 * Every step of one build of `current`, and what each waits for: the graph
 * `runSteps` runs and `--dry-run` prints. Nothing runs while it is made.
 */
const releaseSteps = (
  current: Request,
  publish: boolean,
  run: Runner,
  learned: Learned,
  secrets: ReturnType<typeof takeReleaseSecrets>,
  /** Holds a GitHub call from starting while a stop is clearing the run: it never returns then. */
  notStopped: () => Promise<void>,
  /** The merge checks passed the check on this commit's tree ({@link gatePassed}). */
  gated: boolean
): Step[] => {
  const trees = treesOf(current.commit);
  const staging = stagingOf(current.commit);
  const proofBinary = join(staging, "cawco-proof");
  const infoHome = join(staging, "binary-info-home");
  const bundleFiles = join(staging, "agent-bundle");
  const manifest = (): ReleaseManifest =>
    learned.manifest ?? fail("the manifest is made by the version step");
  const tag = (): string => releaseTag(manifest());
  const archiveName = (target: string): string =>
    `cawco-${tag()}-${target}.tar.gz`;
  const step = (
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
  const tree = (which: keyof typeof trees): Step[] => [
    // The release records (shipped.ts): the check's wire check (openapi:check) and the frame
    // read below hold this build to what is in people's hands, as tagged now.
    step(`tree ${which}`, ["fetch"], 1.5, () =>
      run(["git", "worktree", "add", "--detach", trees[which], current.commit])
    ),
    step(`install ${which}`, [`tree ${which}`], 0.4, () =>
      run([process.execPath, "install", "--frozen-lockfile"], trees[which])
    ),
  ];
  /** A target's archive made and checked: its manifest row and its `.sha256` file. */
  const recordArchive = async (
    target: string,
    executable: string
  ): Promise<void> => {
    const archive = archiveName(target);
    const [sha256, binarySha256] = await Promise.all(
      [join(staging, archive), executable].map(async (path) =>
        new Bun.CryptoHasher("sha256")
          .update(await Bun.file(path).bytes())
          .digest("hex")
      )
    );
    manifest().artifacts.push({
      target,
      archive,
      sha256: sha256 as string,
      size: (await stat(join(staging, archive))).size,
      binarySha256: binarySha256 as string,
      binarySize: (await stat(executable)).size,
    });
    await writeFile(
      join(staging, `${archive}.sha256`),
      `${sha256}  ${archive}\n`
    );
  };
  const targetSteps = (target: string): Step[] => {
    const dir = join(staging, target);
    const binary = join(dir, "cawco");
    const compile = step(
      `compile ${target}`,
      ["prepare", "version"],
      4.7,
      async () => {
        await mkdir(dir, { recursive: true });
        await run(
          [
            process.execPath,
            "scripts/build-binary.ts",
            target,
            binary,
            manifest().version,
            current.commit,
            "--skip-prepare",
          ],
          trees.build
        );
      }
    );
    const upload: Step[] = publish
      ? [
          step(
            `upload ${target}`,
            [`archive ${target}`, "draft"],
            5,
            async () => {
              await notStopped();
              await uploadAssets(tag(), [
                join(staging, archiveName(target)),
                join(staging, `${archiveName(target)}.sha256`),
              ]);
            }
          ),
        ]
      : [];
    if (!isDarwin(target)) {
      return [
        compile,
        step(`archive ${target}`, [`compile ${target}`], 7.2, async () => {
          await run(
            [
              "tar",
              "--owner=0",
              "--group=0",
              "--numeric-owner",
              "-czf",
              join(staging, archiveName(target)),
              "-C",
              dir,
              "cawco",
            ],
            trees.build
          );
          await recordArchive(target, binary);
        }),
        step(`run ${target}`, [`compile ${target}`, "build-info"], 3, () =>
          runPublished(run, target, binary, infoHome, manifest())
        ),
        ...upload,
      ];
    }
    // A darwin build ships as its own CawCo Agent.app, signed with the team's
    // Developer ID, notarized by Apple and stapled, all on this host
    // (sign-agent-bundle.ts), with its Info.plist from this commit.
    return [
      compile,
      step(
        `sign ${target}`,
        [`compile ${target}`, "bundle files"],
        3.3,
        async () => {
          await cp(join(bundleFiles, "Info.plist"), join(dir, "Info.plist"));
          learned.apple ??= writeAppleSecrets(join(staging, "apple"), secrets);
          await signBundle(run, dir, (await learned.apple).identity);
        }
      ),
      step(`notarize ${target}`, [`sign ${target}`, "gate"], 80, async () => {
        learned.apple ??= writeAppleSecrets(join(staging, "apple"), secrets);
        await notarizeBundle(
          run,
          dir,
          target,
          manifest().version,
          (await learned.apple).apiKey
        );
      }),
      step(`archive ${target}`, [`notarize ${target}`], 8, async () => {
        await archiveBundle(run, dir, manifest().version, archiveName(target));
        await rename(
          join(dir, archiveName(target)),
          join(staging, archiveName(target))
        );
        await recordArchive(target, join(dir, AGENT_BUNDLE_EXECUTABLE));
      }),
      ...upload,
    ];
  };
  const proving = [
    "stage 1",
    "stage 2",
    "gate",
    ...TARGETS.flatMap((target) => [
      `archive ${target}`,
      ...(isDarwin(target) ? [] : [`run ${target}`]),
      ...(publish ? [`upload ${target}`] : []),
    ]),
  ];
  return [
    step("fetch", [], 2, () =>
      fetchOrigin(async () => {
        if (stopped) {
          await stopped;
        }
        if (abandoned) {
          throw abandoned;
        }
      })
    ),
    ...tree("build"),
    // The check reads its own tree, beside the builds; it gates notarization
    // and promotion, never the builds. None when the merge checks passed it
    // on this tree.
    ...(gated
      ? []
      : [
          ...tree("check"),
          step("check", ["install check"], 30, () =>
            run([process.execPath, "run", "check", "--all"], trees.check)
          ),
        ]),
    step("live database", ["install build"], 15, () =>
      liveDatabase(run, trees.build, staging)
    ),
    step(
      "gate",
      gated ? ["live database"] : ["check", "live database"],
      0,
      async () => {
        // Nothing to run: what notarization and promotion wait for.
      }
    ),
    step("version", ["install build"], 1, async () => {
      learned.manifest = await manifestOf(run, current, trees.build);
      learned.inputs = await proofInputsKey(trees.build, current.commit);
    }),
    // The dashboard and every target-independent asset, once, for all seven compiles.
    step("prepare", ["install build"], 36, () =>
      run([process.execPath, "scripts/build-binary.ts", "prepare"], trees.build)
    ),
    step("proof build", ["prepare", "version"], 4.7, () =>
      run(
        [
          process.execPath,
          "scripts/build-binary.ts",
          "linux-x64",
          proofBinary,
          manifest().version,
          current.commit,
          "--proof",
          "--skip-prepare",
        ],
        trees.build
      )
    ),
    // The hub ↔ agent contract this build speaks, as the build itself says: a joined machine installs it only when
    // it overlaps its hub's. The proof build runs only under a scratch HOME and an isolated loopback hub
    // (scripts/binary/proof-entry.ts), and inherits no credentials, so build-info is asked under exactly those.
    step("build-info", ["proof build"], 0.8, async () => {
      await mkdir(infoHome, { recursive: true });
      const { protocol } = JSON.parse(
        await run(
          [
            "env",
            "-i",
            `PATH=${process.env.PATH ?? ""}`,
            `HOME=${infoHome}`,
            "HOST=127.0.0.1",
            "CAWCO_HUB_PORT=43456",
            "CAWCO_HUB_URL=http://127.0.0.1:43456",
            proofBinary,
            "build-info",
          ],
          trees.build,
          true
        )
      ) as Pick<ReleaseManifest, "protocol">;
      manifest().protocol = protocol;
    }),
    step("stage 1", ["build-info"], 40.2, () =>
      proveStage1(
        run,
        trees.build,
        staging,
        proofBinary,
        learned,
        current.commit
      )
    ),
    step("stage 2 builds", ["prepare", "version"], 4.7, async () => {
      learned.stage2 = await stage2Builds(run, trees.build, staging, learned);
    }),
    step("stage 2", ["stage 2 builds"], 305.8, () =>
      proveStage2(run, trees.build, staging, learned, current.commit)
    ),
    step("bundle files", ["install build"], 0.3, async () => {
      await mkdir(bundleFiles, { recursive: true });
      await run(
        [
          process.execPath,
          "scripts/binary/info-plist.ts",
          join(bundleFiles, "Info.plist"),
        ],
        trees.build
      );
    }),
    ...(publish
      ? [
          step("draft", ["version"], 2, async () => {
            await notStopped();
            const { channel: on, commit, notes, version } = manifest();
            const created = createDraft({
              channel: on,
              commit,
              notes,
              version,
              tag: tag(),
            });
            // Recorded before the first await: a stop from here on removes it.
            learned.draft = { created, tag: tag() };
            await created;
          }),
        ]
      : []),
    ...TARGETS.flatMap(targetSteps),
    step("promote", proving, 5, () =>
      promote(current, publish, staging, manifest(), secrets, notStopped)
    ),
    ...(publish
      ? [
          step("announce", ["promote"], 1, () => announce()),
          // Published: the proof cache keeps this commit's stage 2 builds alone, and
          // its image store sheds its dangling images (proof-cache-prune.sh).
          step("prune proof cache", ["promote"], 2, () =>
            run(
              [
                "bash",
                "scripts/binary/proof-cache-prune.sh",
                learned.inputs ??
                  fail("the proof inputs are read by the version step"),
              ],
              trees.build
            )
          ),
        ]
      : []),
  ];
};

const fail = (why: string): never => {
  throw new Error(`Release build: ${why}`);
};

/** The version a build carries and its manifest so far: no protocol (build-info says it) and no artifact yet. */
const manifestOf = async (
  run: Runner,
  current: Request,
  checkout: string
): Promise<ReleaseManifest> => {
  const base = (
    await Bun.file(join(checkout, "packages/cli/package.json")).json()
  ).version as string;
  // Only grows: no path installs a build whose sequence is not above the running one.
  const sequence = Number(
    await run(
      ["git", "rev-list", "--first-parent", "--count", current.commit],
      checkout,
      true
    )
  );
  let version: string;
  let notes: string;
  if (current.channel === "stable") {
    if (
      current.tag !== `v${base}` ||
      (await run(
        ["git", "rev-parse", `${current.tag}^{commit}`],
        checkout,
        true
      )) !== current.commit
    ) {
      throw new Error(
        "Stable builds require a matching vX.Y.Z tag at the input commit"
      );
    }
    notes = await readFile(
      join(checkout, "docs/releases", `${base}.md`),
      "utf8"
    );
    if (!notes.trim()) {
      throw new Error("Stable end-user release notes are empty");
    }
    version = base;
  } else {
    const { notes: given } = current;
    if (!given?.trim()) {
      throw new Error("Nightly builds need end-user notes: --notes <file>");
    }
    notes = given;
    version = `${base}-nightly.${sequence}+${current.commit.slice(0, 12)}`;
  }
  return {
    version,
    commit: current.commit,
    channel: current.channel,
    sequence,
    // How many database migrations this build carries; never installed over a newer database.
    schemaVersion: (
      (await Bun.file(
        join(checkout, "packages/hub/drizzle/meta/_journal.json")
      ).json()) as { entries: unknown[] }
    ).entries.length,
    protocol: { min: 0, max: 0 },
    sessiondProtocol: SESSIOND_V1,
    notes,
    testSigned: false,
    artifacts: [],
  };
};

/**
 * The hub's own database, migrated by this build before it ships: a copy of
 * the live one on this host (`VACUUM INTO`, a consistent snapshot, as the
 * update helper takes it, cli binary-apply.ts), checked by
 * `migrations:check --db` (hub migrations-check.ts), which never writes the
 * copy it is given. A host with no hub database has nothing to check, and
 * says so; the check's own migrations:check runs over the fixture there.
 */
const liveDatabase = async (
  run: Runner,
  checkout: string,
  staging: string
): Promise<void> => {
  const live = hubDbPath();
  if (!(await Bun.file(live).exists())) {
    console.log(
      `No hub database on this host at ${live}: the live database's migration check does not run`
    );
    return;
  }
  await mkdir(staging, { recursive: true });
  const copy = join(staging, "live-database.sqlite");
  await rm(copy, { force: true });
  const handle = new Database(live, { readonly: true });
  try {
    handle.run(`VACUUM INTO '${copy.replaceAll("'", "''")}'`);
  } finally {
    handle.close();
  }
  try {
    await run(
      [process.execPath, "run", "migrations:check", "--db", copy],
      join(checkout, "packages/hub")
    );
  } finally {
    await rm(copy, { force: true });
  }
};

/**
 * The arm64 userland a published linux-arm64 binary runs on here, through
 * the host's qemu-aarch64 binfmt entry: Debian trixie's glibc, which is all
 * a Bun binary links (libc, ld, libpthread, libdl, libm). Pinned by its
 * snapshot.debian.org address and sha256, unpacked once.
 */
const arm64Sysroot = async (run: Runner): Promise<string> => {
  if (
    await Bun.file(join(arm64Root, "lib", "ld-linux-aarch64.so.1")).exists()
  ) {
    return arm64Root;
  }
  const deb = (
    await ask("the arm64 glibc package", ARM64_LIBC.url, {}, 5 * 60_000)
  ).bytes;
  const sha256 = new Bun.CryptoHasher("sha256").update(deb).digest("hex");
  if (sha256 !== ARM64_LIBC.sha256) {
    throw new Error(
      `The arm64 glibc package's sha256 is ${sha256}, not the pinned ${ARM64_LIBC.sha256}`
    );
  }
  const temp = `${arm64Root}.${process.pid}`;
  await rm(temp, { recursive: true, force: true });
  await mkdir(temp, { recursive: true });
  await writeFile(join(temp, "libc6.deb"), deb);
  await run(["ar", "x", "libc6.deb"], temp);
  await run(
    [
      "sh",
      "-c",
      "tar -xf data.tar.* && rm -f libc6.deb data.tar.* control.tar.* debian-binary && ln -s usr/lib lib",
    ],
    temp
  );
  await rm(arm64Root, { recursive: true, force: true });
  await rename(temp, arm64Root);
  return arm64Root;
};

/** `env`'s exit status when it cannot execute the program: here, an arm64 binary with no binfmt entry. */
const CANNOT_EXECUTE = 126;

/**
 * A published linux binary run on this host before it is published, under a
 * scratch HOME and nothing else of this run's environment: `--version`, and
 * `build-info`, which must name the build's version, commit and protocol.
 * linux-arm64 runs through the qemu-aarch64 binfmt entry on the pinned glibc
 * above; a host without the entry cannot run it, and the release stops there.
 */
const runPublished = async (
  run: Runner,
  target: string,
  binary: string,
  home: string,
  expect: Pick<ReleaseManifest, "commit" | "protocol" | "version">
): Promise<void> => {
  const env = [
    "env",
    "-i",
    `PATH=${process.env.PATH ?? ""}`,
    `HOME=${home}`,
    ...(target === "linux-arm64"
      ? [`QEMU_LD_PREFIX=${await arm64Sysroot(run)}`]
      : []),
  ];
  const say = (args: string[]): Promise<string> =>
    run([...env, binary, ...args], repo, true).catch((error: unknown) => {
      if (String(error).includes(`exit status ${CANNOT_EXECUTE}:`)) {
        throw new Error(
          `The published ${target} binary cannot run on this host: it has no qemu-aarch64 binfmt entry. Install it: sudo apt install qemu-user-binfmt`,
          { cause: error }
        );
      }
      throw error;
    });
  const version = await say(["--version"]);
  if (!version.includes(expect.version)) {
    throw new Error(
      `The published ${target} binary says ${version}, not ${expect.version}`
    );
  }
  const info = JSON.parse(await say(["build-info"])) as Pick<
    ReleaseManifest,
    "commit" | "protocol" | "version"
  >;
  if (
    info.version !== expect.version ||
    info.commit !== expect.commit ||
    JSON.stringify(info.protocol) !== JSON.stringify(expect.protocol)
  ) {
    throw new Error(
      `The published ${target} binary's build-info ${JSON.stringify(info)} is not this build's ${JSON.stringify(expect)}`
    );
  }
  console.log(`published ${target} binary ran: ${version}, build-info matches`);
};

const proven = (path: string): Promise<boolean> => Bun.file(path).exists();
const recordProven = async (path: string, commitId: string): Promise<void> => {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${commitId}\n`);
};
const inputsOf = (learned: Learned): string =>
  learned.inputs ?? fail("the proof inputs are read by the version step");

/**
 * Stage 1 (prove-stage1.sh) on the proof build, unless it passed on these
 * inputs; then the frames its hub sent (kept with the verdict) read with every
 * TestFlight build installable now, on every release, since the builds in
 * testers' hands change when the hub does not.
 */
async function proveStage1(
  run: Runner,
  checkout: string,
  staging: string,
  proofBinary: string,
  learned: Learned,
  commitId: string
): Promise<void> {
  const inputs = inputsOf(learned);
  const verdict = join(proofVerdicts, inputs, "stage1");
  const frames = join(proofVerdicts, inputs, "frames.jsonl");
  if ((await proven(verdict)) && (await proven(frames))) {
    console.log(
      `Stage 1 passed on these inputs (${inputs}) before: not run again`
    );
  } else {
    await run(
      [
        "bash",
        "scripts/binary/prove-stage1.sh",
        join(staging, "container-proof"),
        proofBinary,
      ],
      checkout
    );
    await mkdir(join(proofVerdicts, inputs), { recursive: true });
    await cp(
      join(staging, "container-proof", "clean-binary", "frames.jsonl"),
      frames
    );
    await recordProven(verdict, commitId);
  }
  await run(
    [process.execPath, "packages/hub/scripts/wire-frames.ts", frames],
    checkout
  );
}

const RIG_LINE = /^rig (\S+):$/u;

/**
 * Stage 2's builds (build-stage2.ts) for the rigs that have not passed on
 * these inputs: none when every one has. Answers each rig's check count, as
 * the script lists them (`PROOF_LIST`), and the rigs to run.
 */
async function stage2Builds(
  run: Runner,
  checkout: string,
  staging: string,
  learned: Learned
): Promise<{ counts: Map<string, number>; todo: string[] }> {
  const inputs = inputsOf(learned);
  const out = join(staging, "stage2");
  const bins = join(staging, "stage2-bins");
  const listed = await run(
    ["bash", "scripts/binary/prove-stage2.sh", out, bins],
    checkout,
    true,
    { PROOF_LIST: "1" }
  );
  const counts = new Map<string, number>();
  let rig: string | undefined;
  for (const line of listed.split("\n")) {
    const [, named] = RIG_LINE.exec(line) ?? [];
    if (named) {
      rig = named;
      counts.set(rig, 0);
    } else if (rig && line.startsWith("  ")) {
      counts.set(rig, (counts.get(rig) ?? 0) + 1);
    }
  }
  if (counts.size === 0) {
    throw new Error(`prove-stage2.sh listed no rig: ${listed}`);
  }
  const passed = join(proofVerdicts, inputs, "stage2");
  const done = await Promise.all(
    [...counts.keys()].map((name) => proven(join(passed, name)))
  );
  const todo = [...counts.keys()].filter((_, at) => !done[at]);
  if (todo.length === 0) {
    console.log(
      `Stage 2 passed on these inputs (${inputs}) before, every rig: not run again`
    );
    return { counts, todo };
  }
  if (todo.length < counts.size) {
    console.log(
      `Stage 2 runs the rigs that have not passed on these inputs (${inputs}): ${todo.join(", ")}`
    );
  }
  await run(
    // The prepare step prepared this checkout's assets: stage 2's builds reuse them.
    [
      process.execPath,
      "scripts/binary/build-stage2.ts",
      bins,
      "--skip-prepare",
    ],
    checkout
  );
  return { counts, todo };
}

/**
 * Stage 2 on its builds: a rig passes when every one of its checks says PASS;
 * each one that does is recorded, so a stage 2 that failed runs only its
 * failed rigs again.
 */
async function proveStage2(
  run: Runner,
  checkout: string,
  staging: string,
  learned: Learned,
  commitId: string
): Promise<void> {
  const { counts, todo } =
    learned.stage2 ?? fail("stage 2's rigs are read by its builds' step");
  if (todo.length === 0) {
    return;
  }
  const out = join(staging, "stage2");
  const bins = join(staging, "stage2-bins");
  const passed = join(proofVerdicts, inputsOf(learned), "stage2");
  let failure: unknown;
  await run(
    ["bash", "scripts/binary/prove-stage2.sh", out, bins],
    checkout,
    false,
    {
      PROOF_ONLY: `^(${todo.join("|")})$`,
    }
  ).catch((error: unknown) => {
    failure = error;
  });
  await Promise.all(
    todo.map(async (rig) => {
      const lines = (
        await readFile(join(out, "rigs", rig, "verdicts.tsv"), "utf8").catch(
          () => ""
        )
      )
        .split("\n")
        .filter(Boolean);
      if (
        lines.length === counts.get(rig) &&
        lines.every((line) => line.split("\t")[1]?.startsWith("PASS"))
      ) {
        await recordProven(join(passed, rig), commitId);
      }
    })
  );
  // Not a release's: the proof builds and the proof key's copy, and the proof's own scratch.
  await Promise.all(
    [
      bins,
      ...["feeds", "images", "shared", "tmp"].map((name) => join(out, name)),
    ].map((path) => rm(path, { recursive: true, force: true }))
  );
  if (failure) {
    throw failure;
  }
}

/**
 * Every target built and every proof passed: the manifest signed, the
 * build moved into `--output`, and with `--publish` the draft promoted. A
 * proven build is promoted even when a newer commit was queued while it was
 * built: that one is built next (the loop at the end of this file).
 */
const promote = async (
  current: Request,
  publish: boolean,
  staging: string,
  manifest: ReleaseManifest,
  secrets: ReturnType<typeof takeReleaseSecrets>,
  notStopped: () => Promise<void>
): Promise<void> => {
  manifest.artifacts.sort(
    (a, b) =>
      TARGETS.indexOf(a.target as (typeof TARGETS)[number]) -
      TARGETS.indexOf(b.target as (typeof TARGETS)[number])
  );
  await writeFile(
    join(staging, "SHA256SUMS"),
    manifest.artifacts.map((a) => `${a.sha256}  ${a.archive}\n`).join("")
  );
  const privatePem = signingPem(secrets.manifestKey);
  const { text: manifestText, signature } = signManifest(manifest, privatePem);
  verifyManifest(
    manifestText,
    signature,
    createPublicKey(privatePem)
      .export({ type: "spki", format: "pem" })
      .toString()
  );
  // The installer reads the version off the front of the signed text.
  if (!manifestText.startsWith(`{"version":"${manifest.version}",`)) {
    throw new Error("The manifest must begin with its version");
  }
  await writeFile(join(staging, "release.json"), manifestText);
  await writeFile(join(staging, "release.json.sig"), `${signature}\n`);
  // Not artifacts: the Info.plist the bundles were laid out with, and the
  // Apple secrets' files, which never leave the staging.
  await Promise.all(
    ["agent-bundle", "apple"].map((name) =>
      rm(join(staging, name), { recursive: true, force: true })
    )
  );
  await mkdir(current.output, { recursive: true });
  const published = join(current.output, manifest.version);
  await rm(published, { recursive: true, force: true });
  await rename(staging, published);
  await writeFile(join(current.output, "release.json"), manifestText);
  console.log(`Local artifacts ready: ${published}`);
  if (publish) {
    await notStopped();
    await promoteRelease(releaseTag(manifest), published, manifest);
  }
  await pruneOutputs(current.output, published);
};

/**
 * `--output` cut to its newest {@link KEPT_OUTPUTS} builds by time (each a
 * folder holding its `release.json`; nothing else there is touched), `kept`
 * (the one just promoted) always among them, and the release cache cleared of
 * the `out-<sha>` folders an earlier ship.sh wrote, which nothing reads.
 */
const pruneOutputs = async (folder: string, kept: string): Promise<void> => {
  const builds = await Promise.all(
    (await readdir(folder, { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(join(folder, entry.name, "release.json"))
      )
      .map(async ({ name }) => {
        const path = join(folder, name);
        return { path, time: (await stat(path)).mtimeMs };
      })
  );
  builds.sort(
    (a, b) =>
      Number(b.path === kept) - Number(a.path === kept) || b.time - a.time
  );
  const legacy = (await readdir(failedEvidence))
    .filter((name) => name.startsWith("out-"))
    .map((name) => join(failedEvidence, name));
  const gone = [
    ...builds.slice(KEPT_OUTPUTS).map(({ path }) => path),
    ...legacy,
  ];
  await Promise.all(
    gone.map((path) => rm(path, { recursive: true, force: true }))
  );
  if (gone.length > 0) {
    console.log(
      `Removed ${gone.length} older release folder(s), keeping the newest ${KEPT_OUTPUTS} in ${folder}`
    );
  }
};

/**
 * The hub on this host told to look at its release host now (`POST
 * /api/binary-updates/check`, as this machine), so every machine sees the
 * release at once rather than when the hub's cached release ages out (hub
 * binary-updates.ts `RELEASE_TTL_MS`). A host with no installation names no
 * hub, and says so.
 */
/** How long the hub has to look at its release host and answer. */
const ANNOUNCE_MS = 30_000;
const announce = async (): Promise<void> => {
  const installation = await readInstallation();
  if (!installation?.hubUrl) {
    console.log(
      "This host has no CawCo installation naming a hub: no hub was told of the release"
    );
    return;
  }
  const { hubUrl } = installation;
  const asked = await readWithin(ANNOUNCE_MS, async (signal) => {
    const response = await machineFetch(`${hubUrl}/api/binary-updates/check`, {
      method: "POST",
      signal,
    });
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    };
  });
  if (asked.kind === "unanswered") {
    throw new Error(
      `The hub at ${hubUrl} did not answer the release check within ${ANNOUNCE_MS / 1000} s`
    );
  }
  const { ok, status, text } = asked.value;
  if (!ok) {
    throw new Error(
      `The hub at ${hubUrl} answered the release check ${status}: ${text}`
    );
  }
  console.log(
    `The hub at ${hubUrl} found ${(JSON.parse(text) as { version: string }).version}`
  );
};

if (argv.includes("--dry-run")) {
  const commit = commitInput.padEnd(12, "0");
  const dry: Runner = () => Promise.resolve("");
  console.log(
    `bun scripts/release.ts --channel ${channel}${publishing ? " --publish" : ""}: the step graph (nothing is run)\n`
  );
  console.log(
    describeSteps(
      releaseSteps(
        {
          channel,
          commit,
          id: "dry-run",
          output,
          notes: "dry run",
          tag: argument("--tag"),
        },
        publishing,
        dry,
        {},
        {},
        () => Promise.resolve(),
        // As when the hub has no pass for the tree: the whole graph.
        false
      )
    )
  );
  process.exit(0);
}

const git = (...args: string[]) =>
  Bun.spawnSync(["git", ...args], {
    cwd: repo,
    stdout: "pipe",
    stderr: "pipe",
  });
// This script and everything it imports are read from this checkout.
const dirty = git("status", "--porcelain");
if (dirty.exitCode !== 0 || dirty.stdout.toString().trim()) {
  refuse(
    `the checkout it runs from (${repo}) must be clean, and it holds:\n${dirty.stdout.toString().trimEnd() || dirty.stderr.toString().trim()}`
  );
}
/**
 * `git fetch --quiet --tags origin` here, asked again on any failure (each
 * attempt after `before`): git's exit says only that it failed (128 for a
 * dropped connection and a refusal alike), and a refusal fails the same way
 * every time, so asking again costs only the bounded wait. Git's own retry
 * does not cover a drop: "Maximum number of times to retry after receiving
 * HTTP 429 (Too Many Requests) responses" (git-scm.com/docs/git-config
 * `http.maxRetries`). The last failure quotes git's stderr.
 */
const fetchOrigin = (before: () => Promise<void> = async () => undefined) =>
  persist("git fetch origin", async () => {
    await before();
    const child = Bun.spawn(["git", "fetch", "--quiet", "--tags", "origin"], {
      cwd: repo,
      stdout: "ignore",
      stderr: "pipe",
      env: { ...process.env },
    });
    const [stderr, status] = await Promise.all([
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (status !== 0) {
      throw new NoAnswer(`git fetch exited ${status}: ${stderr.trim()}`);
    }
  });
await fetchOrigin().catch((error: unknown) =>
  refuse(error instanceof Error ? error.message : String(error))
);
const resolved = git("rev-parse", "--verify", `${commitInput}^{commit}`);
if (resolved.exitCode !== 0) {
  refuse(`${commitInput} is not a commit here`);
}
const requestedCommit = resolved.stdout.toString().trim();
/**
 * The repository every worktree of this one shares (its main checkout, or the
 * bare repository): a run's trees are removed and pruned from there, and a
 * stop runs from there, never from the checkout this script runs from, which
 * ship.sh made (its runner) and may be gone by then. A spawn whose cwd is gone
 * fails before it starts: nightly 5186's stop said "ENOENT: no such file or
 * directory, posix_spawn 'git'" and left its trees' records.
 */
const commonDir = git("rev-parse", "--path-format=absolute", "--git-common-dir")
  .stdout.toString()
  .trim();
const mainRepo = commonDir.endsWith("/.git") ? dirname(commonDir) : commonDir;
/** proof-sweep.sh as it is now, read once: a stop runs it whether or not this checkout is still on the disk. */
const SWEEP_SCRIPT = await readFile(
  join(import.meta.dir, "binary", "proof-sweep.sh"),
  "utf8"
);
if (
  git("merge-base", "--is-ancestor", requestedCommit, "origin/main")
    .exitCode !== 0
) {
  refuse(`${requestedCommit} is not on origin/main`);
}
await underSigningEnv(import.meta.path, argv);
// A nightly's notes are written for the person updating; see docs/releases/README.md.
const notesFile = argument("--notes");
if (channel === "nightly" && !(notesFile && isAbsolute(notesFile))) {
  refuse("nightly builds need end-user notes: --notes <file>");
}
const nightlyNotes = notesFile ? await readFile(notesFile, "utf8") : undefined;
if (channel === "nightly" && !nightlyNotes?.trim()) {
  refuse("the nightly's end-user release notes are empty");
}
if (Bun.version !== PINNED_BUN) {
  refuse(
    `the release pipeline requires Bun ${PINNED_BUN}, and this is ${Bun.version}: bash scripts/release-setup.sh installs it`
  );
}
const releaseSecrets = takeReleaseSecrets();
// What the build cannot do without, before anything is queued or built.
const missing = missingSecrets(releaseSecrets);
if (missing.length > 0) {
  refuse(
    `${missing.join(", ")} missing from the release env: bash scripts/release-setup.sh --check says what is missing, and --import-secrets writes them`
  );
}
const rcodesignSays = (await Bun.file(rcodesignPath()).exists())
  ? Bun.spawnSync([rcodesignPath(), "--version"], {
      stdout: "pipe",
      stderr: "ignore",
    }).stdout.toString()
  : "";
if (!rcodesignSays.includes(`apple-codesign ${RCODESIGN_VERSION}`)) {
  refuse(
    `rcodesign ${RCODESIGN_VERSION} is not at ${rcodesignPath()}: bash scripts/release-setup.sh installs it`
  );
}
// No build is released unproven: without podman the container proofs cannot run.
if (!Bun.which("podman")) {
  refuse(
    "podman is not on this machine, so the container proofs cannot run and nothing is released without them: bash scripts/release-setup.sh installs it"
  );
}
const overQuota = await quotaRefusal();
if (overQuota) {
  refuse(overQuota);
}

/** A process named so a reused pid is never taken for it: pid and start time. */
interface Proc {
  pid: number;
  started: string;
}
/** Who holds the build lock and what it is building, for whoever finds it dead. */
interface Holder extends Proc {
  /** The trees it builds and checks in. */
  checkouts?: string[];
  /** The process groups of the commands it is running (many run at once): everything it started. */
  groups?: Proc[];
  staging?: string;
}
const WHITESPACE = /\s+/u;
/** A process's start time (`ps -o lstart=`), or undefined once it is gone. */
async function startedOf(pid: number): Promise<string | undefined> {
  const ps = Bun.spawn(["ps", "-o", "lstart=", "-p", String(pid)], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const text = (await new Response(ps.stdout).text()).trim();
  await ps.exited;
  return text || undefined;
}
const alive = async (proc: Proc): Promise<boolean> =>
  (await startedOf(proc.pid)) === proc.started;
const ownStart = await startedOf(process.pid);
if (!ownStart) {
  throw new Error("Release pipeline could not read its own start time");
}
const me: Holder = { pid: process.pid, started: ownStart };
/** The lock generation this run holds, once it holds one. */
let mine: string | undefined;
/** The holder record's last write: steps run at once, so writes wait in line on one temp file. */
let holderWritten: Promise<void> = Promise.resolve();
/** Records what this holder is building now, in the lock it holds; each write records `me` as it is when its turn comes. */
function writeHolder(): Promise<void> {
  const write = holderWritten
    .catch(() => undefined)
    .then(async () => {
      if (!mine) {
        return;
      }
      const temp = join(mine, `holder.json.${process.pid}`);
      await writeFile(temp, JSON.stringify(me));
      await rename(temp, join(mine, "holder.json"));
    });
  holderWritten = write;
  return write;
}
async function groupMembers(group: number): Promise<number[]> {
  const ps = Bun.spawn(["ps", "-eo", "pid=,pgid="], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const text = await new Response(ps.stdout).text();
  await ps.exited;
  return text
    .split("\n")
    .map((line) => line.trim().split(WHITESPACE).map(Number))
    .filter(([pid, pgid]) => pgid === group && pid !== group)
    .map(([pid]) => pid as number);
}
/**
 * Sends `sig` to the group `group` names: through its leader while `ps`
 * lists its pid with the start recorded, else, the leader gone, to each
 * member `ps` lists in its group. A leader pid listed with another start is
 * another process's now, and nothing is sent.
 */
const signalGroupOf = async (
  group: Proc,
  sig: NodeJS.Signals
): Promise<void> => {
  const leader = await startedOf(group.pid);
  if (leader === group.started) {
    signalGroup(listedPid(group.pid), sig);
    return;
  }
  if (leader !== undefined) {
    return;
  }
  for (const member of await groupMembers(group.pid)) {
    // Gone since the reading, it is nothing to signal.
    signalPid(listedPid(member), sig);
  }
};
/**
 * How long a stopped command has to end before its group is killed: the
 * container proofs' own cleanup (prove-stage1.sh `finish`, prove-stage2.sh
 * `rig_done`) removes every rig's containers through its podman instance and
 * then its vfs storage, which takes tens of seconds; a group killed while it
 * did left its containers, pasta and aardvark-dns running (obelisk,
 * 2026-10-15, at 5 s). A command with nothing to clean ends at once.
 */
const STOP_GRACE_MS = 180_000;
/** Whether the group `group` names has ended, leader and members. */
const groupEnded = async (group: Proc): Promise<boolean> =>
  !(await startedOf(group.pid)) && (await groupMembers(group.pid)).length === 0;
/**
 * Ends a command and everything it started: each command runs as the leader
 * of its own process group. A leader pid now held by another process means the
 * group ended long ago and the pid was reused; that process is left alone.
 * While any member lives, the kernel does not reuse the group's id.
 */
async function endGroup(group: Proc | undefined): Promise<void> {
  if (!group) {
    return;
  }
  const leader = await startedOf(group.pid);
  if (leader !== undefined && leader !== group.started) {
    return;
  }
  await signalGroupOf(group, "SIGTERM");
  const deadline = performance.now() + STOP_GRACE_MS;
  while (performance.now() < deadline) {
    if (await groupEnded(group)) {
      return;
    }
    await Bun.sleep(250);
  }
  console.error(
    `[release] command group ${group.pid} still running ${STOP_GRACE_MS / 1000}s after SIGTERM: killed`
  );
  await signalGroupOf(group, "SIGKILL");
}
/** Ends every command in `groups`, at once: a holder's, or this run's own. */
const endGroups = async (groups: Proc[] | undefined): Promise<void> => {
  await Promise.all((groups ?? []).map(endGroup));
};

/** The commands this run is waiting on (many run at once), so a stop can end them too. */
const running = new Set<Subprocess>();
/** Set once a SIGTERM or SIGINT has begun stopping this run. */
let stopped: Promise<never> | undefined;
/** Set while a failed build's steps are being stopped: no command starts then. */
let abandoned: Error | undefined;
const runCommand: Runner = async (
  command,
  cwd = repo,
  capture = false,
  env = {}
) => {
  if (stopped) {
    await stopped;
  }
  if (abandoned) {
    throw abandoned;
  }
  const started = performance.now();
  const child = Bun.spawn(command, {
    cwd,
    stdout: capture ? "pipe" : "inherit",
    stderr: "inherit",
    detached: true,
    // The live environment, always: Bun hands a child the one this process
    // started with otherwise ("Defaults to process.env as it was when the
    // current Bun process launched", bun.com/reference/bun/Spawn/SpawnOptions/env).
    env: { ...process.env, ...env },
  });
  running.add(child);
  const group = { pid: child.pid, started: (await startedOf(child.pid)) ?? "" };
  me.groups = [...(me.groups ?? []), group];
  await writeHolder();
  try {
    const text = capture
      ? await new Response(child.stdout as ReadableStream).text()
      : "";
    const status = await child.exited;
    if (status !== 0) {
      // Killed by a stop: the stop finishes the run, not a failure path.
      if (stopped) {
        await stopped;
      }
      // Its own output went to this run's stdout and stderr as it ran.
      throw new Error(
        `Release command failed with exit status ${status}: ${command.join(" ")}`
      );
    }
    return text.trim();
  } finally {
    running.delete(child);
    me.groups = me.groups?.filter((one) => one !== group);
    logStep(command.join(" "), started);
  }
};
/** One line per command with its seconds, so a slow release says where the time went. */
function logStep(what: string, started: number): void {
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const label = what.length > 140 ? `${what.slice(0, 137)}...` : what;
  console.log(`[release] ${seconds}s ${label}`);
}

await mkdir(state, { recursive: true });
const queued = join(state, "queued.json");
/** The id of the last queued request a holder finished, built or failed. */
const finished = join(state, "finished.json");
const request: Request = {
  id: crypto.randomUUID(),
  commit: requestedCommit,
  channel,
  notes: channel === "nightly" ? nightlyNotes : undefined,
  tag: argument("--tag"),
  output,
};

// THE QUEUE. One request waits: the newest. A request for a commit that a
// pending one descends from leaves that one in place; whichever run holds the
// lock builds what the queue says when it gets there. An entry stays pending
// until a holder finishes it, so one whose holder died is built by the next
// run to take the lock, and one already finished supersedes nothing.
const readJson = async <T>(path: string): Promise<T | undefined> =>
  (await Bun.file(path)
    .json()
    .catch(() => undefined)) as T | undefined;
const writeJson = async (path: string, value: unknown): Promise<void> => {
  const temp = `${path}.${process.pid}`;
  await writeFile(temp, JSON.stringify(value));
  await rename(temp, path);
};
const pending = async (): Promise<Request | undefined> => {
  const entry = await readJson<Request>(queued);
  const done = await readJson<{ id: string }>(finished);
  return entry && entry.id !== done?.id ? entry : undefined;
};
const previous = await pending();
let superseded = false;
if (previous && previous.commit !== requestedCommit) {
  const ancestry = Bun.spawn(
    ["git", "merge-base", "--is-ancestor", requestedCommit, previous.commit],
    { cwd: repo, stdout: "ignore", stderr: "ignore" }
  );
  superseded = (await ancestry.exited) === 0;
}
if (!superseded) {
  await writeJson(queued, request);
}

// THE LOCK: no two release runs at once. It names its holder by pid and that
// process's start time (`ps -o lstart=`), so a pid reused by another process
// after the holder died is not mistaken for it, plus what the holder is
// building, so a run that finds it dead can clear what it left.
//
// The lock is a line of generations, `build-lock/<n>`, and only the newest
// one counts. A run claims generation n+1 by renaming a directory already
// holding its record onto that name, which fails when the name exists, so
// of the runs that find generation n released or its holder dead exactly
// one wins. Nothing is ever replaced in place: breaking a stale lock by
// renaming it away would race a second run doing the same, and remove the
// lock the first one had just taken. A released generation keeps a marker
// file, so no claim can land on it either.
const locks = join(state, "build-lock");
const GENERATION = /^\d+$/u;
await mkdir(locks, { recursive: true });
const readHolder = async (dir: string): Promise<Holder | undefined> =>
  (await Bun.file(join(dir, "holder.json"))
    .json()
    .catch(() => undefined)) as Holder | undefined;
const generations = async (): Promise<number[]> =>
  (await readdir(locks))
    .filter((name) => GENERATION.test(name))
    .map(Number)
    .sort((a, b) => a - b);
/** Lets the lock go: the generation stays, marked released, never empty. */
const release = async (): Promise<void> => {
  if (!mine) {
    return;
  }
  await holderWritten.catch(() => undefined);
  await rename(join(mine, "holder.json"), join(mine, "released.json")).catch(
    () => undefined
  );
  mine = undefined;
};
/**
 * Ends what container proofs left (scripts/binary/proof-sweep.sh): every
 * process naming one of `dirs` or a proof run dir one of them records (conmon
 * and its container, pasta, aardvark-dns), their mounts in podman's rootless
 * mount namespace, and the dirs themselves; with `stale`, also every proof run
 * dir whose owner is gone. Not a `run`: a stop runs it after its commands have
 * ended. Answers how many processes it ended and dirs it removed.
 */
const sweep = async (
  dirs: string[],
  stale: boolean
): Promise<{ ended: number; removed: number }> => {
  const args = [...(stale ? ["--stale"] : []), ...dirs];
  const child = Bun.spawn(
    ["bash", "-c", SWEEP_SCRIPT, "proof-sweep.sh", ...args],
    { cwd: mainRepo, stdout: "pipe", stderr: "inherit" }
  );
  const said = await new Response(child.stdout).text();
  process.stdout.write(said);
  const status = await child.exited;
  if (status !== 0) {
    throw new Error(
      `The proof sweep failed with exit status ${status}: proof-sweep.sh ${args.join(" ")}`
    );
  }
  const count = (prefix: string): number =>
    said.split("\n").filter((line) => line.startsWith(prefix)).length;
  return {
    ended: count("proof-sweep: ended pid "),
    removed: count("proof-sweep: removed "),
  };
};
/** A git command run in {@link mainRepo}, its status and output. */
const gitMain = async (
  ...args: string[]
): Promise<{ out: string; status: number }> => {
  const child = Bun.spawn(["git", "-C", mainRepo, ...args], {
    cwd: mainRepo,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { out: out || err, status };
};
/** The worktrees git records now, by path. */
const recordedTrees = async (): Promise<Set<string>> => {
  const listed = await gitMain("worktree", "list", "--porcelain");
  if (listed.status !== 0) {
    throw new Error(`git worktree list failed: ${listed.out.trim()}`);
  }
  return new Set(
    listed.out
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length))
  );
};
/**
 * The trees and staging a build left: each tree removed as a worktree and
 * from the disk, the records of any whose folder went another way pruned,
 * then the staging with everything its proofs left (`sweep`, by the run dirs
 * its proofs recorded). Throws when a tree's record outlives it. Answers what
 * it cleared, in words.
 */
const clear = async (
  checkouts: string[],
  staging?: string
): Promise<string[]> => {
  const recorded = await recordedTrees();
  const trees = checkouts.filter(
    (checkout) => recorded.has(checkout) || existsSync(checkout)
  );
  await Promise.all(
    trees.map(async (checkout) => {
      await gitMain("worktree", "remove", "--force", checkout);
      await rm(checkout, { recursive: true, force: true });
    })
  );
  if (trees.length > 0) {
    const pruned = await gitMain("worktree", "prune");
    if (pruned.status !== 0) {
      throw new Error(`git worktree prune failed: ${pruned.out.trim()}`);
    }
    const left = [...(await recordedTrees())].filter((path) =>
      checkouts.includes(path)
    );
    if (left.length > 0) {
      throw new Error(`git still records ${left.join(", ")}`);
    }
  }
  const staged = staging !== undefined && existsSync(staging);
  const { ended, removed } = await sweep(staging ? [staging] : [], false);
  return [
    ...(trees.length > 0 ? [`${trees.length} worktree(s)`] : []),
    ...(staged ? ["its staging"] : []),
    ...(ended > 0 ? [`${ended} proof process(es)`] : []),
    ...(removed > (staged ? 1 : 0)
      ? [`${removed - (staged ? 1 : 0)} proof run dir(s)`]
      : []),
  ];
};
/**
 * Every staging no live build holds (by the holder records in the lock's
 * generations): an earlier run's, left when it was killed or crashed.
 */
const unheldStagings = async (): Promise<string[]> => {
  const held = new Set<string>();
  const holders = await Promise.all(
    (await generations()).map((n) => readHolder(join(locks, String(n))))
  );
  const live = await Promise.all(
    holders.map((holder) => (holder ? alive(holder) : false))
  );
  holders.forEach((holder, at) => {
    if (holder?.staging && live[at]) {
      held.add(holder.staging);
    }
  });
  return (await readdir(state))
    .filter((name) => name.startsWith("staging-"))
    .map((name) => join(state, name))
    .filter((path) => !held.has(path));
};
/** The container proofs' folders in a build's staging: stage 1's and stage 2's. */
const PROOF_DIRS = ["container-proof", "stage2"];
/**
 * A proof's own working state, not evidence: container storage and scratch,
 * stage 2's published feeds (whole builds) and image recipes, and a rig's
 * storage (by its last two path parts, `rigs/<rig>` holding `storage`).
 */
const PROOF_SCRATCH = new Set([
  "storage",
  "run",
  "tmp",
  "cache",
  "config",
  "feeds",
  "images",
]);
/**
 * Copies the container proofs' logs and outputs out of `staging` before it is
 * cleared, and prunes older copies. Undefined when the build reached neither.
 */
const keepEvidence = async (
  commitId: string,
  staging: string
): Promise<string | undefined> => {
  const found = (
    await Promise.all(
      PROOF_DIRS.map(async (name) =>
        (await stat(join(staging, name)).catch(() => undefined))
          ? name
          : undefined
      )
    )
  ).filter((name): name is string => name !== undefined);
  if (found.length === 0) {
    return;
  }
  const time = new Date().toISOString().replace(/[:.]/gu, "-");
  const kept = join(failedEvidence, `failed-${commitId.slice(0, 12)}-${time}`);
  await Promise.all(
    found.map((name) => {
      const proof = join(staging, name);
      return cp(proof, join(kept, name), {
        recursive: true,
        filter: async (source) => {
          const rel = relative(proof, source);
          if (
            PROOF_SCRATCH.has(rel) ||
            PROOF_SCRATCH.has(rel.split("/").at(-1) ?? "")
          ) {
            return false;
          }
          const info = await lstat(source);
          return info.isFile() || info.isDirectory();
        },
      });
    })
  );
  const older = await Promise.all(
    (await readdir(failedEvidence))
      .filter((name) => name.startsWith("failed-"))
      .map(async (name) => {
        const path = join(failedEvidence, name);
        return { path, time: (await stat(path)).mtimeMs };
      })
  );
  older.sort((a, b) => b.time - a.time);
  await Promise.all(
    older
      .slice(KEPT_FAILURES)
      .map(({ path }) => rm(path, { recursive: true, force: true }))
  );
  return kept;
};
/**
 * Takes the lock, or says it is held by a live build. A lock whose holder
 * is gone (killed, crashed, the machine rebooted) is stale: one run takes it
 * over, atomically, and clears the dead build's trees and staging first.
 */
const acquire = async (): Promise<boolean> => {
  for (;;) {
    const seen = await generations();
    const top = seen.at(-1) ?? 0;
    const holder = top ? await readHolder(join(locks, String(top))) : undefined;
    if (holder && (await alive(holder))) {
      return false;
    }
    const temp = join(locks, `.claim-${process.pid}`);
    await rm(temp, { recursive: true, force: true });
    await mkdir(temp);
    await writeFile(join(temp, "holder.json"), JSON.stringify(me));
    const claim = join(locks, String(top + 1));
    try {
      await rename(temp, claim);
    } catch (error) {
      await rm(temp, { recursive: true, force: true });
      const { code } = error as NodeJS.ErrnoException;
      if (code !== "EEXIST" && code !== "ENOTEMPTY") {
        throw error;
      }
      continue;
    }
    // A run that read the line before a newer generation was claimed can
    // land below it, on a number already cleared away: it backs out.
    if (((await generations()).at(-1) ?? 0) !== top + 1) {
      await rm(claim, { recursive: true, force: true });
      continue;
    }
    mine = claim;
    if (holder) {
      console.log(
        `Took over a stale build lock: holder pid ${holder.pid}, started ${holder.started}, is gone`
      );
      // What it was running outlives it and still writes into its trees
      // and staging, which a build of the same commit uses again.
      await endGroups(holder.groups);
      await clear(holder.checkouts ?? [], holder.staging);
    }
    await Promise.all(
      seen.map((n) =>
        rm(join(locks, String(n)), { recursive: true, force: true })
      )
    );
    return true;
  }
};

/** What the build running now has learned: its draft, for a stop to remove. */
let learnedNow: Learned | undefined;
/**
 * The lock being taken, once it is asked for: a stop waits for it to settle,
 * so it never lets go of a lock before the claim lands (the claim would then
 * outlive the run, a holder.json for the next run's stale takeover) and never
 * leaves a stale generation half taken over.
 */
let acquiring: Promise<boolean> | undefined;
const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
// A stop (SIGTERM from a unit stop, which ship.sh hands on, or SIGINT) is the
// one owner of the run's cleanup: it ends the commands and GitHub calls it
// waits on, removes this run's draft release by its tag, clears its trees,
// staging and proofs, says in one line what it cleared, and lets the lock go.
// Nothing starts after it: `run` and every GitHub step wait on it instead, and
// a build that fails under it leaves the cleanup to it.
const stop = async (signal: "SIGTERM" | "SIGINT"): Promise<never> => {
  console.log(`Release build stopped by ${signal}: clearing its work`);
  // Every spawn from here runs from the main checkout, whatever became of this one.
  process.chdir(mainRepo);
  // A lock still being taken is taken, or refused, before anything is let go;
  // whatever it holds then, `release` below lets go of.
  await acquiring?.catch(() => false);
  await Promise.all([endGroups(me.groups), endCalls()]);
  await Promise.all([...running].map((child) => child.exited));
  const cleared: string[] = [];
  const failed: string[] = [];
  const draft = learnedNow?.draft;
  if (draft) {
    await draft.created.catch(() => undefined);
    try {
      if (await deleteDraft(draft.tag)) {
        cleared.push(`draft release ${draft.tag}`);
      }
    } catch (error) {
      failed.push(`draft release ${draft.tag} (${said(error)})`);
    }
  }
  try {
    cleared.push(...(await clear(me.checkouts ?? [], me.staging)));
  } catch (error) {
    // The next run's sweep ends what this one could not.
    failed.push(`its trees and staging (${said(error)})`);
  }
  const line = `Release build stopped by ${signal}: cleared ${cleared.join(", ") || "nothing it had made"}`;
  if (failed.length > 0) {
    console.error(`${line}; could not clear ${failed.join("; ")}`);
  } else {
    console.log(line);
  }
  await release();
  process.exit(signal === "SIGINT" ? 130 : 143);
};
process.on("SIGTERM", () => {
  stopped ??= stop("SIGTERM");
});
process.on("SIGINT", () => {
  stopped ??= stop("SIGINT");
});
acquiring = acquire();
const acquired = await acquiring.catch(async (error: unknown) => {
  // A claim that failed under a stop is the stop's to finish: it exits.
  if (stopped) {
    await stopped;
  }
  throw error;
});
// Stopped while the lock was being taken: the stop clears and lets it go.
if (stopped) {
  await stopped;
}
if (!acquired) {
  console.log(
    superseded
      ? `Superseded by newer queued commit ${previous?.commit}; one build is already running`
      : `Queued ${requestedCommit}; one build is already running`
  );
  process.exit(0);
}
// Every run starts by ending what an earlier one left: a run killed outright
// (SIGKILL, a crash, a reboot) never reached its own cleanup.
try {
  await sweep(await unheldStagings(), true);
} catch (error) {
  await release();
  throw error;
}

/**
 * One commit, built, signed and (unless a newer one is queued) promoted. It
 * starts at once, beside whatever else runs, with room on the disk
 * (lib/disk-room.ts), the machine held awake from then on (lib/hold-awake.ts);
 * its steps run as their graph says.
 */
const build = async (current: Request): Promise<void> => {
  requireDiskRoom(`The release of ${current.commit.slice(0, 12)}`);
  holdAwake(`The release of ${current.commit.slice(0, 12)}`);
  const building = performance.now();
  const trees = treesOf(current.commit);
  const staging = stagingOf(current.commit);
  const gated = await gatePassed(current.commit);
  const checkouts = gated ? [trees.build] : Object.values(trees);
  me.checkouts = checkouts;
  me.staging = staging;
  await writeHolder();
  await mkdir(staging, { recursive: true });
  const learned: Learned = {};
  learnedNow = learned;
  let failedClear: unknown;
  try {
    await runSteps(
      releaseSteps(
        current,
        publishing,
        runCommand,
        learned,
        releaseSecrets,
        async () => {
          if (stopped) {
            await stopped;
          }
        },
        gated
      ),
      {
        say: (line) => console.log(line),
        failed: async () => {
          abandoned = new Error(
            "Not started: another step of this build failed"
          );
          await endGroups(me.groups);
        },
      }
    );
    logStep(`build of ${current.commit.slice(0, 12)}, in all`, building);
  } catch (error) {
    // A step that failed under a stop (a command or gh call it ended) is the
    // stop's to clear, in its order: nightly 5186's upload failed beside its
    // stop and the two cleared at once.
    if (stopped) {
      await stopped;
    }
    const { draft } = learned;
    if (draft) {
      // A build that did not promote leaves no draft behind it.
      await draft.created.catch(() => undefined);
      await deleteDraft(draft.tag).catch((cleanup: unknown) =>
        console.error(
          `Removing the draft release ${draft.tag} failed: ${said(cleanup)}`
        )
      );
    }
    const kept = await keepEvidence(current.commit, staging);
    if (!kept) {
      throw error;
    }
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; proof evidence kept at ${kept}`,
      { cause: error }
    );
  } finally {
    abandoned = undefined;
    // The Apple secrets' files go first, whatever becomes of the rest of the staging.
    await rm(join(staging, "apple"), { recursive: true, force: true });
    // A build that failed fails with its own error; the sweep's, if it fails too, is said beside it.
    await clear(checkouts, staging).catch((error: unknown) => {
      console.error(
        `Clearing the build of ${current.commit} failed: ${error instanceof Error ? error.message : String(error)}`
      );
      failedClear = error;
    });
    me.checkouts = undefined;
    me.staging = undefined;
    learnedNow = undefined;
    await writeHolder();
  }
  if (failedClear) {
    throw failedClear;
  }
};

// The holder builds what the queue says, then looks again: a request queued
// while it built (or one a dead holder left) is built next, whether the build
// before it succeeded or failed. Each is finished once, either way.
try {
  let failure: unknown;
  for (let current = await pending(); current; current = await pending()) {
    if (current.id !== request.id) {
      console.log(`Building queued ${current.commit}`);
    }
    failure = undefined;
    try {
      await build(current);
    } catch (error) {
      failure = error;
      console.error(
        `Release build of ${current.commit} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    await writeJson(finished, { id: current.id });
  }
  if (failure) {
    throw failure;
  }
} finally {
  await release();
}
