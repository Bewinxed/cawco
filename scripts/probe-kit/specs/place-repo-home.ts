/**
 * No folder is made a repository for a project or a delegate: a delegate
 * works in a private copy of the folder its `cwd` is in, its repository's
 * root when it is in one, and a home's large files are never read (hub
 * place-repo.ts, agent layer.ts). On a scratch fleet (real hub, agent and sessiond; Claude
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
 * - B: a delegate with `cwd` = HOME works in a private copy of HOME, a
 *   folder's (no repository): no `.git` in HOME, and the agent says nothing
 *   of the large file. Inside a workspace the host refuses it as it refuses
 *   A.
 * - C: a project made from a plain folder stays a plain folder (hub
 *   place-repo.ts: only a publish makes one a repository), and its
 *   delegate works in a private copy of it, a folder's: no `.git` in it.
 * - D: so does a plain folder holding a sparse file of the same size: no
 *   `.git`, and the agent never names the file.
 *
 *   bun scripts/probe-kit/run.ts place-repo-home
 */
import { existsSync } from "node:fs";
import { mkdir, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** The blob's size on obelisk, as the Backlot session reported it. */
const BLOB_BYTES = 8_463_330_762;
const BLOB_SHA =
  "5099fd6dce1ae79e9db655c4fb0146de7f575255a6fe4a2507f32884c2e05fbb";
/** The host's refusal of a sandbox inside another (core boundary-nesting.ts). */
const NESTED = /inside another (bwrap|macOS) sandbox|unpriv_bwrap/u;
/** What a first commit that read the blob whole said (agent place-repo.ts on main). */
const READ_WHOLE = /couldn't read .* to make it a git repository/u;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** Whether a create was refused by the host, a boundary inside another. */
const refusedByHost = (refused: string): boolean =>
  refused.includes("Workspace create on") && NESTED.test(refused);

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
  const cutByHost = refusedByHost(refused) && !READ_WHOLE.test(refused);
  check(
    "A: a delegate with cwd = a repository in the home place is cut from that repository, with no repo step on the home",
    !existsSync(join(home, ".git")) &&
      (workspace?.repo_root === backlot || cutByHost),
    workspace
      ? `cut, repo root ${workspace.repo_root}; ${gitIn(home)}`
      : `${refused.slice(0, 600)}; ${gitIn(home)}`
  );
};

/** B: a delegate in HOME itself: a folder's private copy, nothing of HOME read. */
const legB = async (
  { check }: Kit,
  fleet: KitFleet,
  parent: string,
  home: string
): Promise<void> => {
  const homeCut = await delegate(fleet, parent, home, "Home cut");
  const [workspace] =
    "workspaceId" in homeCut && homeCut.workspaceId
      ? fleet.query<{ kind: string; repo_root: string }>(
          "SELECT kind, repo_root FROM workspaces WHERE id = ?",
          homeCut.workspaceId
        )
      : [];
  const refused = "refused" in homeCut ? homeCut.refused : "";
  const cutByHost = refusedByHost(refused);
  check(
    "B: a delegate with cwd = the home folder works in a private copy of it, a folder's, and no repository is made",
    (workspace?.kind === "folder" && workspace.repo_root === home) || cutByHost,
    workspace ? JSON.stringify(workspace) : refused.slice(0, 600)
  );
  const named = (await fleet.logs("agent")).includes(BLOB_SHA);
  const unread = !(existsSync(join(home, ".git")) || named);
  check(
    "B: nothing of the home was read: no .git in it, and the agent never names the large file",
    unread,
    `${gitIn(home)}; agent log ${named ? "names" : "does not name"} the blob`
  );
};

/**
 * A project made from `folder` and a delegate of its own session there: the
 * workspace the delegate got, and whether the folder holds a `.git` once
 * that workspace is made (a project's making once made a plain folder a
 * repository off its request, within seconds).
 */
const projectOf = async (
  fleet: KitFleet,
  name: string,
  folder: string
): Promise<{
  git: boolean;
  workspace: { kind: string; repo_root: string } | string;
}> => {
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name,
    machineId: MACHINE,
    cwd: folder,
  });
  const parent = await fleet.spawn("claude", `${name} parent`, folder, {
    projectId: project.id,
  });
  const cut = await delegate(fleet, parent, folder, `${name} cut`);
  const [row] =
    "workspaceId" in cut && cut.workspaceId
      ? fleet.query<{ kind: string; repo_root: string }>(
          "SELECT kind, repo_root FROM workspaces WHERE id = ?",
          cut.workspaceId
        )
      : [];
  return {
    git: existsSync(join(folder, ".git")),
    workspace: row ?? ("refused" in cut ? cut.refused : "no workspace"),
  };
};

/** Whether a delegate's workspace is a folder's, made of `folder`, or one the host refused (a boundary inside another). */
const folderCopy = (
  workspace: { kind: string; repo_root: string } | string,
  folder: string
): boolean =>
  typeof workspace === "string"
    ? refusedByHost(workspace)
    : workspace.kind === "folder" && workspace.repo_root === folder;

/** C: a plain project folder stays a folder, its delegate in a copy of it. */
const legC = async (
  { check }: Kit,
  fleet: KitFleet,
  plain: string
): Promise<void> => {
  await plainFolder(plain);
  const made = await projectOf(fleet, "Plain", plain);
  check(
    "C: a project made from a plain folder stays a plain folder, and its delegate works in a private copy of it, a folder's",
    !made.git && folderCopy(made.workspace, plain),
    `${gitIn(plain)}; ${typeof made.workspace === "string" ? made.workspace.slice(0, 600) : JSON.stringify(made.workspace)}`
  );
};

/** D: a plain project folder holding a large file stays a folder, the file never read. */
const legD = async (
  { check }: Kit,
  fleet: KitFleet,
  large: string
): Promise<void> => {
  await plainFolder(large);
  await sparse(join(large, "weights.bin"), BLOB_BYTES);
  const made = await projectOf(fleet, "Plain large", large);
  const named = (await fleet.logs("agent"))
    .split("\n")
    .filter((line) => line.includes("weights.bin"))
    .slice(-3)
    .join(" | ")
    .slice(0, 600);
  check(
    "D: a plain folder holding a large file stays a folder: no .git, its delegate in a folder's copy, and the agent never names the file",
    !made.git && folderCopy(made.workspace, large) && named === "",
    `${gitIn(large)}; ${typeof made.workspace === "string" ? made.workspace.slice(0, 600) : JSON.stringify(made.workspace)}; agent: ${named || "names nothing of it"}`
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

export default {
  group: "Workspaces and what agents may touch",
  name: "place-repo-home",
  run,
} satisfies Spec;
