/**
 * A place's boundary starts however many of its files share an inode, and
 * srt's refusal reaches the person in srt's own words (core
 * workspace-policy.ts `linkedIn`, `LINKED_MAX`; agent boundary-host.ts
 * `srtRefused`, boundary.ts `ready`, `settleGonePlaces`). On 2026-10-23
 * the owner's Caw for cockpit would not start: two clones left behind had
 * hard-linked 4,342 of `~/cockpit/.git/objects`' files, `linkedIn` denied
 * each one for writing, srt refused the profile (14,370 bwrap words, its cap
 * 9,000), and the person read only "the boundary exited (code 1) as it
 * started". On a scratch fleet (real hub, agent and sessiond; Claude Code
 * against the mock model), boundaries included: Caw's place starts one, so
 * it runs on the host, outside every workspace.
 *
 * - A: project "Bound", Caw on, its place a repository holding 3,100 files
 *   in 31 dirs, each hard-linked to a copy outside it, all committed, and a
 *   local clone of it beside it (`git clone --local`), which links every
 *   object file in its `.git/objects` (over 3,000). Your words in a thread
 *   wake Caw: his place's boundary starts and runs, and the policy it started
 *   with denies at most `LINKED_MAX` linked entries, none under
 *   `.git/objects`, the 31 dirs standing for their files.
 * - B: project "Refused", Caw on, its place holding 3,100 files only their
 *   owner may read (0600), which the place hides for reading and writing:
 *   past srt's cap. Your words do not wake Caw, and the note says why in
 *   srt's own words: its profile's size and bwrap's cap.
 * - C: a place on record naming a folder that is gone (a `boundary.json`
 *   left in its state dir). At the agent's next start it is settled: its
 *   state dir goes, and the agent says so.
 *
 *   bun scripts/probe-kit/run.ts place-deny-bound
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, link, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LINKED_MAX } from "../../../packages/core/src/workspace-policy";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** Dirs and files a dir in A's and B's plants: 3,100 in all, past srt's 3,000 paths. */
const DIRS = 31;
const FILES = 100;
/** srt's cap on one profile's paths (`BWRAP_MAX_ARGS / 3`, srt 0.0.81). */
const SRT_PATHS = 3000;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const pad = (n: number, width: number): string =>
  String(n).padStart(width, "0");

/**
 * {@link DIRS} dirs under `root` (`dNN`), each made, then `make` run on each
 * of its {@link FILES} files (`dNN/fNNN`), a dir at a time.
 */
const plant = async (
  root: string,
  make: (file: string, dir: string, index: number) => Promise<void>
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
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env({ ...process.env, HOME: home })
    .quiet();
};

/** A project with Caw on over `cwd`, and a thread opened with your words. */
const cawProject = async (
  fleet: KitFleet,
  name: string,
  cwd: string
): Promise<{ id: string; thread: string }> => {
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name,
    machineId: MACHINE,
    cwd,
    caw: true,
  });
  const opened = await fleet.api<{ thread: { id: string } }>(
    `/api/projects/${project.id}/threads`,
    { body: `PROBE-${name.toUpperCase()}: hello Caw.` }
  );
  return { id: project.id, thread: opened.thread.id };
};

interface Held {
  gen?: string;
  path?: string;
  pid?: number;
}

/** A: linked files past srt's cap, and a git object tree linked whole. */
const boundLeg = async (kit: Kit, fleet: KitFleet, home: string) => {
  const place = join(fleet.sandbox, "bound");
  const elsewhere = join(fleet.sandbox, "elsewhere");
  await repository(place, home, { "README.md": "bound\n" });
  await plant(elsewhere, (copy, dir, f) => writeFile(copy, `${dir}/${f}\n`));
  await plant(join(place, "shared"), (file, dir, f) =>
    link(join(elsewhere, dir, `f${pad(f, 3)}`), file)
  );
  await Bun.$`git add -A && git commit -qm 'Linked files'`
    .cwd(place)
    .env({ ...process.env, HOME: home })
    .quiet();
  await Bun.$`git clone --quiet --no-checkout --local ${place} ${join(fleet.sandbox, "husk")}`
    .env({ ...process.env, HOME: home })
    .quiet();
  const objects = await linkedCount(join(place, ".git", "objects"));
  const shared = await linkedCount(join(place, "shared"));
  kit.check(
    `A: the place holds ${DIRS * FILES} files hard-linked outside it, and over ${SRT_PATHS} of its .git/objects files are linked to a local clone beside it`,
    shared === DIRS * FILES && objects > SRT_PATHS,
    `${shared} linked files in shared/, ${objects} in .git/objects`
  );

  const project = await cawProject(fleet, "Bound", place);
  const answered = await until(
    "A: Caw answered",
    () =>
      fleet.query<{ n: number }>(
        "SELECT count(*) AS n FROM thread_messages WHERE thread_id = ? AND author = 'caw'",
        project.thread
      )[0]?.n ?? 0,
    (count) => count > 0,
    240_000
  ).catch(() => 0);
  const [lead] = fleet.query<{ cwd: string; machine_id: string }>(
    "SELECT i.cwd, i.machine_id FROM projects p JOIN instances i ON i.id = p.lead_instance_id WHERE p.id = ?",
    project.id
  );
  const placeId = lead
    ? `${createHash("sha256")
        .update(`${project.id}\0${lead.machine_id}\0${lead.cwd}`)
        .digest("hex")
        .slice(0, 8)}-caw`
    : "";
  const state = join(home, ".cawco", "workspaces", placeId);
  const held = JSON.parse(
    await readFile(join(state, "boundary.json"), "utf8").catch(() => "{}")
  ) as Held;
  const policy = JSON.parse(
    await readFile(
      join(state, "boundaries", held.gen ?? "none", "policy.json"),
      "utf8"
    ).catch(() => "{}")
  ) as { denyWrite?: string[] };
  const denyWrite = policy.denyWrite ?? [];
  const inPlace = denyWrite.filter((path) => path.startsWith(`${place}/`));
  const underObjects = inPlace.filter((path) =>
    path.startsWith(join(place, ".git", "objects"))
  );
  const sharedDirs = Array.from({ length: DIRS }, (_, d) =>
    join(place, "shared", `d${pad(d, 2)}`)
  );
  const sharedFiles = inPlace.filter((path) =>
    path.startsWith(join(place, "shared", "d"))
  );
  const running =
    held.pid !== undefined && existsSync(`/proc/${held.pid}/status`);
  kit.check(
    "A: your words wake Caw, his place's boundary starts and runs",
    answered > 0 && running,
    `Caw's messages ${answered}; place ${placeId || "unknown"}; boundary ${JSON.stringify(held)} ${running ? "running" : "not running"}`
  );
  kit.check(
    `A: the policy it started with denies at most ${LINKED_MAX} entries in the place, ${denyWrite.length} in all (under srt's ${SRT_PATHS}); none under .git/objects; the ${DIRS} shared dirs stand for their ${DIRS * FILES} files`,
    denyWrite.length > 0 &&
      denyWrite.length < SRT_PATHS &&
      inPlace.length <= LINKED_MAX &&
      underObjects.length === 0 &&
      sharedDirs.every((dir) => denyWrite.includes(dir)) &&
      sharedFiles.length === DIRS,
    `${denyWrite.length} denied for writing, ${inPlace.length} in the place, ${underObjects.length} under .git/objects; shared: ${sharedFiles.slice(0, 4).join(", ")}${sharedFiles.length > 4 ? ` and ${sharedFiles.length - 4} more` : ""}`
  );
};

/** B: owner-only files past srt's cap; the refusal's note in srt's own words. */
const refusedLeg = async (kit: Kit, fleet: KitFleet, home: string) => {
  const place = join(fleet.sandbox, "refused");
  await repository(place, home, {
    "README.md": "refused\n",
    ".gitignore": "vault/\n",
  });
  await plant(join(place, "vault"), async (file) => {
    await writeFile(file, "only mine\n");
    await chmod(file, 0o600);
  });
  const project = await cawProject(fleet, "Refused", place);
  const note = await until(
    "B: the note that Caw was not woken",
    () =>
      fleet
        .query<{ event: string | null }>(
          "SELECT event FROM thread_messages WHERE thread_id = ? AND author = 'event'",
          project.thread
        )
        .map(
          (row) =>
            JSON.parse(row.event ?? "{}") as {
              notWoken?: { reason?: string; words?: string };
            }
        )
        .find((event) => event.notWoken)?.notWoken,
    () => true,
    240_000
  ).catch(() => undefined);
  const words = note?.words ?? "";
  const caw = fleet.query<{ n: number }>(
    "SELECT count(*) AS n FROM thread_messages WHERE thread_id = ? AND author = 'caw'",
    project.thread
  )[0]?.n;
  kit.check(
    "B: past srt's cap, your words do not wake Caw, and the note names why in srt's own words: its profile's size and bwrap's cap",
    // "place" when his session runs and its boundary is read again,
    // "could-not-start" when his session's own start needs it (caw.ts `deliver`).
    ["place", "could-not-start"].includes(note?.reason ?? "") &&
      caw === 0 &&
      words.includes("Sandbox profile has") &&
      words.includes("bwrap accepts at most 9000"),
    `${JSON.stringify(note ?? "no note")}; Caw's messages ${caw}`
  );
};

/** C: a place on record whose folder is gone is settled at the agent's start. */
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
    "C: the agent settled the place",
    async () => await mark.since(),
    (text) => text.includes(said) && !existsSync(state),
    60_000
  ).catch(() => mark.since());
  kit.check(
    "C: a place on record whose folder is gone is settled at the agent's start: its state dir goes, and the agent says so",
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
    await refusedLeg(kit, fleet, home);
    await goneLeg(kit, fleet, home);
  },
};

export default spec;
