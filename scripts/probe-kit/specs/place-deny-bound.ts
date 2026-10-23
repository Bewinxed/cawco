/**
 * A place's boundary starts whatever its folder holds, and srt's refusal
 * reaches the person in srt's own words (core workspace-policy.ts, the one
 * budget: `PROTECTED_MAX`, `OWNER_ONLY_MAX`, `LINKED_MAX`; agent
 * boundary-host.ts and core srt-refusal.ts, boundary.ts `ready`,
 * `settleGonePlaces`). On 2026-10-23 the owner's Caw for cockpit would not
 * start: two clones left behind had hard-linked 4,342 of
 * `~/cockpit/.git/objects`' files, `linkedIn` denied each one for writing,
 * srt refused the profile (14,370 bwrap words, its cap 9,000), and the
 * person read only "the boundary exited (code 1) as it started". On a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model), boundaries included: Caw's place starts one, so it runs on the
 * host, outside every workspace.
 *
 * - A: project "Bound", Caw on, its place a repository holding 3,100 files
 *   in 31 dirs, each hard-linked to a copy outside it, all committed, and
 *   every object file in its `.git/objects` (over 3,000) linked from a
 *   husk's objects beside it, as a local clone links them. Your words in a thread
 *   wake Caw: his place's boundary starts and runs, and the policy it started
 *   with denies at most `LINKED_MAX` linked entries, none under
 *   `.git/objects`, the 31 dirs standing for their files; and the place's
 *   empty Claude Code hooks dir, a person's own, for writing.
 * - B: project "Crowded", Caw on, its place holding 3,100 files only their
 *   owner may read (0600) and 3,100 empty protected config folders (`.vscode`),
 *   each list past srt's cap alone. Your words wake Caw: his boundary starts
 *   and runs, the policy's denies in the place within the budget (at most
 *   `OWNER_ONLY_MAX` for reading; protected, owner-only and linked for
 *   writing), and every list under srt's 3,000 paths together.
 * - C: project "Spilled", Caw on, a plain place, and his place's record of
 *   spill folders (`spills.json`, which the agent writes as sessions save
 *   tool results there) crafted to name 3,200 of them before he starts: a
 *   profile past srt's cap that no folder makes. Your words do not wake him,
 *   and the note says why in srt's own words, after the host's line
 *   (`SRT_REFUSED`): its profile's size and bwrap's cap. Linux only: on
 *   macOS the boundary is Seatbelt's, with no such cap.
 * - D: a place on record naming a folder that is gone (a `boundary.json`
 *   left in its state dir). At the agent's next start it is settled: its
 *   state dir goes, and the agent says so.
 *
 *   bun scripts/probe-kit/run.ts place-deny-bound
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  chmod,
  link,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import { isAlive, listedPid } from "../../../packages/core/src/signal";
import { SRT_REFUSED } from "../../../packages/core/src/srt-refusal";
import {
  LINKED_MAX,
  OWNER_ONLY_MAX,
  PROTECTED_MAX,
} from "../../../packages/core/src/workspace-policy";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** Dirs and files a dir in A's and B's plants: 3,100 in all, past srt's 3,000 paths. */
const DIRS = 31;
const FILES = 100;
/** srt's cap on one profile's paths (`BWRAP_MAX_ARGS / 3`, srt 0.0.81). */
const SRT_PATHS = 3000;
/** C's spill folders: each one srt binds back, past its cap with nothing else. */
const SPILLS = 3200;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const pad = (n: number, width: number): string =>
  String(n).padStart(width, "0");

/**
 * {@link DIRS} dirs under `root` (`dNN`), each made, then `make` run on each
 * of its {@link FILES} entries (`dNN/fNNN`), a dir at a time.
 */
const plant = async (
  root: string,
  make: (file: string, dir: string, index: number) => Promise<unknown>
): Promise<void> => {
  for (const dir of Array.from({ length: DIRS }, (_, d) => `d${pad(d, 2)}`)) {
    // biome-ignore lint/performance/noAwaitInLoops: one dir's hundred files at a time
    await mkdir(join(root, dir), { recursive: true }).then(() =>
      Promise.all(
        Array.from({ length: FILES }, (_, f) =>
          make(join(root, dir, `f${pad(f, 3)}`), dir, f)
        )
      )
    );
  }
};

/** How many files under `dir` share their inode. */
const linkedCount = async (dir: string): Promise<number> =>
  (await Bun.$`find ${dir} -type f -links +1`.quiet().nothrow().text())
    .split("\n")
    .filter(Boolean).length;

/** `command` run to its end, or an error naming `what` with git's own words. */
const ran = async (
  command: ReturnType<typeof Bun.$>,
  what: string
): Promise<void> => {
  const run = await command.quiet().nothrow();
  if (run.exitCode !== 0) {
    throw new Error(
      `${what} failed (exit ${run.exitCode}): ${run.stderr.toString().trim()}`
    );
  }
};

/** A repository at `repo` with its first commit, as the fleet's owner. */
const repository = async (
  repo: string,
  home: string,
  files: Record<string, string>
): Promise<void> => {
  await mkdir(repo, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([name, text]) =>
      writeFile(join(repo, name), text)
    )
  );
  await ran(
    Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
      .cwd(repo)
      .env({ ...process.env, HOME: home }),
    `the first commit in ${repo}`
  );
};

/** A project with Caw on over `cwd`; no thread yet, so Caw has not started. */
const cawProject = async (
  fleet: KitFleet,
  name: string,
  cwd: string
): Promise<string> =>
  (
    await fleet.api<{ id: string }>("/api/projects", {
      name,
      machineId: MACHINE,
      cwd,
      caw: true,
    })
  ).id;

/** A thread of project `id` opened with your words, which wake Caw. */
const openThread = async (
  fleet: KitFleet,
  id: string,
  name: string
): Promise<string> =>
  (
    await fleet.api<{ thread: { id: string } }>(`/api/projects/${id}/threads`, {
      body: `PROBE-${name.toUpperCase()}: hello Caw.`,
    })
  ).thread.id;

/** Caw's place id for project `project` over `cwd` on `machine` (hub caw.ts `leadPlaceRef`). */
const placeIdOf = (project: string, machine: string, cwd: string): string =>
  `${createHash("sha256")
    .update(`${project}\0${machine}\0${cwd}`)
    .digest("hex")
    .slice(0, 8)}-caw`;

interface Held {
  gen?: string;
  path?: string;
  pid?: number;
}

interface Started {
  answered: number;
  denyRead: string[];
  denyWrite: string[];
  held: Held;
  placeId: string;
  running: boolean;
}

/** Your words wake Caw in project `project`: his answer, and the boundary his place started with its policy. */
const wokenPlace = async (
  fleet: KitFleet,
  home: string,
  project: string,
  name: string
): Promise<Started> => {
  const thread = await openThread(fleet, project, name);
  const answered = await until(
    `${name}: Caw answered`,
    () =>
      fleet.query<{ n: number }>(
        "SELECT count(*) AS n FROM thread_messages WHERE thread_id = ? AND author = 'caw'",
        thread
      )[0]?.n ?? 0,
    (count) => count > 0,
    240_000
  ).catch(() => 0);
  const [lead] = fleet.query<{ cwd: string; machine_id: string }>(
    "SELECT i.cwd, i.machine_id FROM projects p JOIN instances i ON i.id = p.lead_instance_id WHERE p.id = ?",
    project
  );
  const placeId = lead ? placeIdOf(project, lead.machine_id, lead.cwd) : "";
  const state = join(home, ".cawco", "workspaces", placeId);
  const held = JSON.parse(
    await readFile(join(state, "boundary.json"), "utf8").catch(() => "{}")
  ) as Held;
  const policy = JSON.parse(
    await readFile(
      join(state, "boundaries", held.gen ?? "none", "policy.json"),
      "utf8"
    ).catch(() => "{}")
  ) as { denyRead?: string[]; denyWrite?: string[] };
  return {
    answered,
    denyRead: policy.denyRead ?? [],
    denyWrite: policy.denyWrite ?? [],
    held,
    placeId,
    running: held.pid !== undefined && isAlive(listedPid(held.pid)),
  };
};

/** A: linked files past srt's cap, and a git object tree linked whole. */
const boundLeg = async (kit: Kit, fleet: KitFleet, home: string) => {
  // By its real path, as the policy names it: on macOS the sandbox is under
  // /var, a link to /private/var.
  await mkdir(join(fleet.sandbox, "bound"), { recursive: true });
  const place = await realpath(join(fleet.sandbox, "bound"));
  const elsewhere = join(dirname(place), "elsewhere");
  await repository(place, home, { "README.md": "bound\n" });
  await plant(elsewhere, (copy, dir, f) => writeFile(copy, `${dir}/${f}\n`));
  await plant(join(place, "shared"), (file, dir, f) =>
    link(join(elsewhere, dir, `f${pad(f, 3)}`), file)
  );
  await ran(
    Bun.$`git add -A && git commit -qm 'Linked files'`
      .cwd(place)
      .env({ ...process.env, HOME: home }),
    "the linked files' commit"
  );
  // A husk's objects beside it, each object file linked as a local clone
  // links them (git-clone(1) `--local`). Linked here one by one rather than
  // by `git clone --local`: on the Mac (r242) that left 4 of the place's
  // object files linked, not its 3,000 and more.
  const objectsDir = join(place, ".git", "objects");
  const husk = join(dirname(place), "husk-objects");
  const objectFiles = (
    await Bun.$`find ${objectsDir} -type f -print0`.quiet().nothrow().text()
  )
    .split("\0")
    .filter(Boolean);
  await Promise.all(
    [...new Set(objectFiles.map((file) => dirname(file)))].map((dir) =>
      mkdir(join(husk, relative(objectsDir, dir)), { recursive: true })
    )
  );
  await Promise.all(
    objectFiles.map((file) =>
      link(file, join(husk, relative(objectsDir, file)))
    )
  );
  const objects = await linkedCount(objectsDir);
  const shared = await linkedCount(join(place, "shared"));
  kit.check(
    `A: the place holds ${DIRS * FILES} files hard-linked outside it, and over ${SRT_PATHS} of its .git/objects files are linked to a husk's objects beside it`,
    shared === DIRS * FILES && objects > SRT_PATHS,
    `${shared} linked files in shared/, ${objects} in .git/objects`
  );

  // A person's own empty hooks dir: a hook planted in it would run in their
  // own Claude Code, so it is denied however empty.
  const hooks = projectClaudeDir(place, "hooks");
  await mkdir(hooks, { recursive: true });
  const project = await cawProject(fleet, "Bound", place);
  const started = await wokenPlace(fleet, home, project, "Bound");
  const { denyWrite } = started;
  // The policy names every path by its real path.
  const real = await realpath(place);
  const inPlace = denyWrite.filter((path) => path.startsWith(`${real}/`));
  const underObjects = inPlace.filter((path) =>
    path.startsWith(join(real, ".git", "objects"))
  );
  const sharedDirs = Array.from({ length: DIRS }, (_, d) =>
    join(real, "shared", `d${pad(d, 2)}`)
  );
  const sharedEntries = inPlace.filter((path) =>
    path.startsWith(join(real, "shared", "d"))
  );
  kit.check(
    "A: your words wake Caw, his place's boundary starts and runs",
    started.answered > 0 && started.running,
    `Caw's messages ${started.answered}; place ${started.placeId || "unknown"}; boundary ${JSON.stringify(started.held)} ${started.running ? "running" : "not running"}`
  );
  kit.check(
    `A: the policy it started with denies at most ${LINKED_MAX + PROTECTED_MAX} entries in the place for writing, ${denyWrite.length} in all (under srt's ${SRT_PATHS}); none under .git/objects; the ${DIRS} shared dirs stand for their ${DIRS * FILES} files`,
    denyWrite.length > 0 &&
      denyWrite.length < SRT_PATHS &&
      inPlace.length <= LINKED_MAX + PROTECTED_MAX &&
      underObjects.length === 0 &&
      sharedDirs.every((dir) => denyWrite.includes(dir)) &&
      sharedEntries.length === DIRS,
    `${denyWrite.length} denied for writing, ${inPlace.length} in the place, ${underObjects.length} under .git/objects; shared: ${sharedEntries.slice(0, 4).join(", ")}${sharedEntries.length > 4 ? ` and ${sharedEntries.length - 4} more` : ""}`
  );
  const realHooks = projectClaudeDir(real, "hooks");
  kit.check(
    "A: the place's empty hooks dir of its Claude Code config, a person's own, is denied for writing",
    denyWrite.includes(realHooks),
    `${realHooks} ${denyWrite.includes(realHooks) ? "in" : "not in"} denyWrite; protected in the place: ${inPlace.filter((path) => path.includes("/.")).join(", ") || "none"}`
  );
};

/** B: owner-only files and protected config, each past srt's cap alone; Caw still wakes. */
const crowdedLeg = async (kit: Kit, fleet: KitFleet, home: string) => {
  const place = join(fleet.sandbox, "crowded");
  await repository(place, home, {
    "README.md": "crowded\n",
    ".gitignore": "vault/\n",
  });
  await plant(join(place, "vault"), async (file) => {
    await writeFile(file, "only mine\n");
    await chmod(file, 0o600);
  });
  // Empty, as a person's own may be: denied all the same.
  await plant(join(place, "pkgs"), (dir) =>
    mkdir(join(dir, ".vscode"), { recursive: true })
  );
  const project = await cawProject(fleet, "Crowded", place);
  const started = await wokenPlace(fleet, home, project, "Crowded");
  const real = await realpath(place);
  const readInPlace = started.denyRead.filter((path) =>
    path.startsWith(`${real}/`)
  );
  const writeInPlace = started.denyWrite.filter((path) =>
    path.startsWith(`${real}/`)
  );
  const paths = started.denyRead.length + started.denyWrite.length;
  kit.check(
    `B: with ${DIRS * FILES} owner-only files and ${DIRS * FILES} protected config folders in his place, your words wake Caw, and his place's boundary starts and runs`,
    started.answered > 0 && started.running,
    `Caw's messages ${started.answered}; place ${started.placeId || "unknown"}; boundary ${JSON.stringify(started.held)} ${started.running ? "running" : "not running"}`
  );
  kit.check(
    `B: the policy denies at most ${OWNER_ONLY_MAX} entries in the place for reading and ${PROTECTED_MAX + OWNER_ONLY_MAX + LINKED_MAX} for writing, every one of them under vault/ or pkgs/ covered, ${paths} denies in all (under srt's ${SRT_PATHS})`,
    readInPlace.length > 0 &&
      readInPlace.length <= OWNER_ONLY_MAX &&
      writeInPlace.length <= PROTECTED_MAX + OWNER_ONLY_MAX + LINKED_MAX &&
      paths < SRT_PATHS &&
      readInPlace.every((path) => path.startsWith(join(real, "vault"))) &&
      writeInPlace.some((path) => path.startsWith(join(real, "pkgs"))),
    `${readInPlace.length} denied for reading in the place (${readInPlace.slice(0, 3).join(", ")}…), ${writeInPlace.length} for writing (${writeInPlace.slice(0, 3).join(", ")}…); ${started.denyRead.length} + ${started.denyWrite.length} in all`
  );
};

/** C: a profile past srt's cap no folder makes; the refusal's note in srt's own words. */
const refusedLeg = async (kit: Kit, fleet: KitFleet, home: string) => {
  const place = join(fleet.sandbox, "spilled");
  await repository(place, home, { "README.md": "spilled\n" });
  const project = await cawProject(fleet, "Spilled", place);
  // Before he starts, at the place his session will have, as the lead row
  // will name its folder (as given, or as its real path).
  const ids = [
    ...new Set(
      [place, await realpath(place)].map((cwd) =>
        placeIdOf(project, MACHINE, cwd)
      )
    ),
  ];
  await Promise.all(
    ids.map(async (id) => {
      const state = join(home, ".cawco", "workspaces", id);
      await mkdir(state, { recursive: true });
      const spills = Array.from({ length: SPILLS }, (_, n) =>
        join(state, "spills", `probe-${pad(n, 4)}`)
      );
      // Made as the agent makes each before a start (boundary.ts `keepSpills`).
      await Promise.all(spills.map((dir) => mkdir(dir, { recursive: true })));
      await writeFile(
        join(state, "spills.json"),
        `${JSON.stringify(spills)}\n`
      );
    })
  );
  const thread = await openThread(fleet, project, "Spilled");
  // Your first words in a project made from a folder open its Setup thread
  // (caw.ts `wakeForSetup`), which notes a start that failed as "could not
  // start", its words the note's body; a later thread's words note it as not
  // woken, its words in `notWoken` (`wakeForYou`). Either is the person's.
  const notes = () =>
    fleet
      .query<{ body: string; event: string | null }>(
        "SELECT body, event FROM thread_messages WHERE thread_id = ? AND author = 'event'",
        thread
      )
      .map((row) => {
        const event = JSON.parse(row.event ?? "{}") as {
          notWoken?: { reason?: string; words?: string };
          what?: string;
        };
        return {
          what: event.what ?? "",
          words: event.notWoken?.words ?? row.body,
        };
      });
  const note = await until(
    "C: the note that Caw did not start",
    () =>
      notes().find((one) =>
        ["not-woken", "could-not-start"].includes(one.what)
      ),
    () => true,
    240_000
  ).catch(() => undefined);
  const words = note?.words ?? "";
  const caw = fleet.query<{ n: number }>(
    "SELECT count(*) AS n FROM thread_messages WHERE thread_id = ? AND author = 'caw'",
    thread
  )[0]?.n;
  kit.check(
    "C: past srt's cap, your words do not wake Caw, and the thread's note names why in srt's own words after the host's line: its profile's size and bwrap's cap",
    note !== undefined &&
      caw === 0 &&
      words.includes(`${SRT_REFUSED}: Sandbox profile has`) &&
      words.includes("bwrap accepts at most 9000"),
    `${JSON.stringify(note ?? "no note")}; every note: ${JSON.stringify(notes()).slice(0, 600)}; Caw's messages ${caw}; places ${ids.join(", ")}`
  );
};

/** D: a place on record whose folder is gone is settled at the agent's start. */
const goneLeg = async (kit: Kit, fleet: KitFleet, home: string) => {
  const id = "0badf01d-caw";
  const state = join(home, ".cawco", "workspaces", id);
  const gone = join(fleet.sandbox, "gone-place");
  await mkdir(state, { recursive: true });
  await writeFile(
    join(state, "boundary.json"),
    `${JSON.stringify({ path: gone, gen: "probegone" })}\n`
  );
  await fleet.stop("agent");
  const mark = await fleet.logMark("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  const said = `[workspace] ${id}: its folder ${gone} is gone, so the place is settled`;
  const logged = await until(
    "D: the agent settled the place",
    async () => await mark.since(),
    (text) => text.includes(said) && !existsSync(state),
    60_000
  ).catch(() => mark.since());
  kit.check(
    "D: a place on record whose folder is gone is settled at the agent's start: its state dir goes, and the agent says so",
    logged.includes(said) && !existsSync(state),
    `state dir ${existsSync(state) ? "stands" : "gone"}; ${
      logged
        .split("\n")
        .filter((line) => line.includes(id))
        .join(" | ") || "no line naming the place"
    }`
  );
};

const spec: Spec = {
  name: "place-deny-bound",
  host: "Caw's place starts a boundary of its own",
  run: async (kit: Kit) => {
    const fleet: KitFleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const home = fleet.env.HOME as string;
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    await boundLeg(kit, fleet, home);
    await crowdedLeg(kit, fleet, home);
    // srt builds a bwrap profile on Linux alone; macOS's Seatbelt has no such cap.
    if (process.platform === "linux") {
      await refusedLeg(kit, fleet, home);
    }
    await goneLeg(kit, fleet, home);
  },
};

export default spec;
