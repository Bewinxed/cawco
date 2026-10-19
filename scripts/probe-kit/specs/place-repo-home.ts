/**
 * A place's first commit never reads a file whole and never makes a home or
 * cache folder a repository; a delegate is cut from the checkout its `cwd`
 * is in (agent place-repo.ts `notAProject`, `judge`; hub place-repo.ts
 * `beforeCut`). On a scratch fleet (real hub, agent and sessiond; Claude
 * Code against the mock model). The fleet's HOME stands in for the owner's:
 * it holds `.cache/huggingface/hub/blobs/<sha>`, a sparse file of
 * 8,463,330,762 bytes (the blob that stopped Backlot's delegates), and
 * `backlot`, a git repository. A project is made from HOME and a session
 * started in it.
 *
 * - A: a delegate from that session with `cwd` = `backlot` is cut from
 *   `backlot`, and no repo step runs on HOME: HOME gets no `.git`, and the
 *   item is not refused by a first commit. Inside a workspace the cut itself
 *   is refused by the host (a boundary cannot start inside another, core
 *   boundary-nesting.ts): that refusal, from the workspace's own create,
 *   is what it then reads; on the host, the workspace's repo root is
 *   `backlot`.
 * - B: a delegate with `cwd` = HOME, which asks for HOME as a repository,
 *   is refused in words naming HOME as the home folder and asking for a
 *   project folder, before anything is read: no `.git` in HOME, and the
 *   agent says nothing of the large file.
 * - C: a project made from a plain folder still becomes a repository, its
 *   files in one commit.
 * - D: a project made from a plain folder holding a sparse file of the same
 *   size becomes a repository, that file left out (named in .gitignore, not
 *   committed) and never read.
 *
 *   bun scripts/probe-kit/run.ts place-repo-home
 */
import { existsSync } from "node:fs";
import { mkdir, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** The blob's size on obelisk, as the Backlot session reported it. */
const BLOB_BYTES = 8_463_330_762;
const BLOB_SHA =
  "5099fd6dce1ae79e9db655c4fb0146de7f575255a6fe4a2507f32884c2e05fbb";
/** The host's refusal of a sandbox inside another (core boundary-nesting.ts). */
const NESTED = /inside another (bwrap|macOS) sandbox|unpriv_bwrap/;
/** What a first commit that read the blob whole said (agent place-repo.ts on main). */
const READ_WHOLE = /couldn't read .* to make it a git repository/;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** A plain folder of a few small sources. */
const plainFolder = async (folder: string): Promise<void> => {
  await mkdir(join(folder, "src"), { recursive: true });
  await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      writeFile(
        join(folder, "src", `file-${index}.ts`),
        `export const value${index} = ${index};\n`
      )
    )
  );
  await writeFile(join(folder, "README.md"), "# Plain\n");
};

/** A sparse file of `bytes`: no disk is spent on it, and reading it whole is what failed. */
const sparse = async (path: string, bytes: number): Promise<void> => {
  await writeFile(path, "");
  await truncate(path, bytes);
};

/** The hub's answer to a delegate, or its refusal's words. */
const delegate = (
  fleet: KitFleet,
  parent: string,
  cwd: string,
  title: string
): Promise<{ workspaceId?: string } | { refused: string }> =>
  fleet
    .api<{ workspaceId: string }>("/api/work-items", {
      parentInstanceId: parent,
      title,
      prompt: `${title}: say ok.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd,
      lands: "none",
    })
    .then(
      (started) => ({ workspaceId: started.workspaceId }),
      (error: Error) => ({ refused: error.message })
    );

const git = (cwd: string, ...args: string[]): Promise<string> =>
  Bun.$`git -C ${cwd} ${args}`
    .quiet()
    .nothrow()
    .text()
    .then((out) => out.trim());

/** Whether `folder` holds a `.git`, in words. */
const gitIn = (folder: string): string =>
  `${folder}/.git ${existsSync(join(folder, ".git")) ? "exists" : "absent"}`;

/** A: cwd is a repository in the home place: cut from it, nothing on HOME. */
const legA = async (
  { check }: Kit,
  fleet: KitFleet,
  parent: string,
  home: string,
  backlot: string
): Promise<void> => {
  const cut = await delegate(fleet, parent, backlot, "Backlot cut");
  const [workspace] =
    "workspaceId" in cut && cut.workspaceId
      ? fleet.query<{ repo_root: string }>(
          "SELECT repo_root FROM workspaces WHERE id = ?",
          cut.workspaceId
        )
      : [];
  const refused = "refused" in cut ? cut.refused : "";
  const cutByHost =
    refused.includes("Workspace create on") &&
    NESTED.test(refused) &&
    !READ_WHOLE.test(refused);
  check(
    "A: a delegate with cwd = a repository in the home place is cut from that repository, with no repo step on the home",
    !existsSync(join(home, ".git")) &&
      (workspace?.repo_root === backlot || cutByHost),
    workspace
      ? `cut, repo root ${workspace.repo_root}; ${gitIn(home)}`
      : `${refused.slice(0, 600)}; ${gitIn(home)}`
  );
};

/** B: HOME itself asked to become a repository. */
const legB = async (
  { check }: Kit,
  fleet: KitFleet,
  parent: string,
  home: string
): Promise<void> => {
  const homeCut = await delegate(fleet, parent, home, "Home cut");
  const refused = "refused" in homeCut ? homeCut.refused : "started";
  const named = (await fleet.logs("agent")).includes(BLOB_SHA);
  check(
    "B: the home folder asked to become a repository is refused in words naming it, asking for a project folder",
    refused.includes(
      `${home} is the home folder on this machine, which holds far more than one project, so CawCo won't make it a git repository.`
    ) && refused.includes("Make a folder for the project"),
    refused.slice(0, 600)
  );
  const unread = !(existsSync(join(home, ".git")) || named);
  check(
    "B: nothing of the home was read: no .git in it, and the agent never names the large file",
    unread,
    `${gitIn(home)}; agent log ${named ? "names" : "does not name"} the blob`
  );
};

/** A project made from `folder`, and whether it became a repository within a minute. */
const madeRepo = async (
  fleet: KitFleet,
  name: string,
  folder: string
): Promise<boolean> => {
  await fleet.api("/api/projects", { name, machineId: MACHINE, cwd: folder });
  return await until(
    `${name} a repository`,
    () => existsSync(join(folder, ".git")),
    Boolean,
    60_000
  ).catch(() => false);
};

/** C: a plain project folder still becomes a repository. */
const legC = async (
  { check }: Kit,
  fleet: KitFleet,
  plain: string
): Promise<void> => {
  await plainFolder(plain);
  const made = await madeRepo(fleet, "Plain", plain);
  const files = made ? await git(plain, "ls-files") : "";
  const commits = made ? await git(plain, "rev-list", "--count", "HEAD") : "";
  check(
    "C: a plain project folder becomes a repository, its files in one commit",
    made && files.split("\n").includes("src/file-0.ts") && commits === "1",
    `made ${made}; ${commits} commit(s); files: ${files.replaceAll("\n", " ")}`
  );
};

/** D: a plain project folder holding a large file: made, the file left out unread. */
const legD = async (
  { check }: Kit,
  fleet: KitFleet,
  large: string
): Promise<void> => {
  await plainFolder(large);
  await sparse(join(large, "weights.bin"), BLOB_BYTES);
  const made = await madeRepo(fleet, "Plain large", large);
  const files = made ? (await git(large, "ls-files")).split("\n") : [];
  const ignore = made
    ? (await Bun.file(join(large, ".gitignore")).text()).split("\n")
    : [];
  const said = (await fleet.logs("agent"))
    .split("\n")
    .filter((line) => line.includes(large))
    .slice(-3)
    .join(" | ")
    .slice(0, 600);
  check(
    "D: a plain folder holding a large file becomes a repository, the large file left out and named in .gitignore",
    made &&
      files.includes("src/file-0.ts") &&
      !files.includes("weights.bin") &&
      ignore.includes("/weights.bin"),
    `made ${made}; files: ${files.join(" ")}; .gitignore: ${ignore.join(" | ")}; agent: ${said}`
  );
};

/** The fleet's HOME as the owner's: a sparse blob in its cache, and a repository beside it. */
const furnishHome = async (home: string): Promise<string> => {
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  const blobs = join(
    home,
    ".cache",
    "huggingface",
    "hub",
    "models--OmniLottie--OmniLottie",
    "blobs"
  );
  await mkdir(blobs, { recursive: true });
  await sparse(join(blobs, BLOB_SHA), BLOB_BYTES);
  const backlot = join(home, "backlot");
  await mkdir(backlot, { recursive: true });
  await Bun.$`sh -c ${"git init -q -b main && echo backlot > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(backlot)
    .env({ ...process.env, HOME: home })
    .quiet();
  return backlot;
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  const backlot = await furnishHome(home);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const homeProject = await fleet.api<{ id: string }>("/api/projects", {
    name: "Home",
    machineId: MACHINE,
    cwd: home,
  });
  const parent = await fleet.spawn("claude", "Home parent", home, {
    projectId: homeProject.id,
  });
  await legA(kit, fleet, parent, home, backlot);
  await legB(kit, fleet, parent, home);
  await legC(kit, fleet, join(fleet.sandbox, "plain"));
  await legD(kit, fleet, join(fleet.sandbox, "plain-large"));
};

export default { name: "place-repo-home", run } satisfies Spec;
