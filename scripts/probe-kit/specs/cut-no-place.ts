/**
 * A delegate's workspace is cut on a machine where its project has no
 * checkout: the cut asks where the project's large files live only once
 * its tree marks some (agent workspace.ts `cutClone`, `marksLfs`), and the
 * hub answers a machine that holds a delegate workspace of the project, one
 * being cut included (server.ts `lfsMachineProject`, work-items.ts
 * `holdsProjectOn`; Projects spec §5.1, "places[] (checkouts on any machine,
 * delegate workspaces)"). On a scratch fleet of two machines on one host
 * (real hub, agents and sessionds; Claude Code against the mock model). Its
 * delegates cut workspaces, whose boundary is user namespaces: it runs on
 * the host.
 *
 * The incident (2026-11-04): a delegate on niftybot.art, a cwd there, lands
 * none: "the hub did not say where project …'s large files live (403: This
 * machine holds no place of …), so git-lfs did not run", and its workspace
 * was discarded.
 *
 * The project declares an LFS endpoint whose connection does not exist, so
 * every answer the hub gives of its large files is a refusal naming that
 * connection (server.ts `/api/lfs/projects/:id`): a cut that asks fails in
 * those words, one that does not ask runs.
 *
 * - n1. A repository with no large files, on the far machine, which holds no
 *   place of the project: its workspace is cut there, and its leaf, briefed
 *   in that clone, finishes its item, so the cut asked nothing of the
 *   project's large files. The leaf calls finish_item: a leaf that only
 *   says "ok" fails its item after three idle turns (work-items.ts, "did
 *   nothing for three turns in a row"), as r422's did, a second after its
 *   clone was cut.
 * - n2. A repository whose tree marks files for LFS, there too: its cut asks,
 *   and the hub answers the machine that holds that cut. Its answer is the
 *   connection's refusal, never "This machine holds no place".
 *
 *   bun scripts/probe-kit/run.ts cut-no-place
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { workWords } from "../../../packages/core/src/words/work";
import {
  ACCOUNT,
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { delegateStarted } from "../kit";
import type { Kit, KitFleet, Spec } from "../spec";

const FAR = "machine-no-place";
const TAG = "PROBE-CUT-NO-PLACE";
/** The project's declared LFS connection, which no fleet connection is. */
const MISSING = "probe-missing-lfs-connection";
/** Its declared endpoint, which nothing is ever fetched from. */
const ENDPOINT = "https://lfs.probe.invalid/info/lfs";

const FINISH = "mcp__cawco__finish_item";
/** Whether the leaf has called finish_item; it says "Done." after. */
let finished = false;

/**
 * The leaf finishes its item, finish_item looked up first when its harness
 * has it deferred; every other session says "ok".
 */
const respond = (request: Seen): Reply => {
  if (!(request.tools && request.all.includes(`${TAG}:`)) || finished) {
    return { everyMs: 5, words: [finished ? "Done." : "ok"] };
  }
  if (!request.toolNames.includes(FINISH)) {
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "ToolSearch",
        input: { query: `select:${FINISH}`, max_results: 1 },
      },
    };
  }
  finished = true;
  return {
    everyMs: 5,
    words: [],
    tool: {
      name: FINISH,
      input: {
        headline: "Cut on the far machine.",
        summary: "Briefed in its clone there; nothing to do.",
      },
    },
  };
};

/** A repository at `dir` with one commit, its `.gitattributes` marking `*.bin` for LFS when `lfs`. */
const repository = async (
  dir: string,
  home: string,
  lfs: boolean
): Promise<void> => {
  await mkdir(dir, { recursive: true });
  if (lfs) {
    await writeFile(
      join(dir, ".gitattributes"),
      "*.bin filter=lfs diff=lfs merge=lfs -text\n"
    );
  }
  await writeFile(join(dir, "README.md"), "audit\n");
  await Bun.$`sh -c ${"git init -q -b main && git add -A && git commit -qm 'First commit'"}`
    .cwd(dir)
    .env({ ...process.env, HOME: home })
    .quiet();
};

type Started = ReturnType<typeof delegateStarted>;

/** Delegates on the far machine in `cwd`, landing none: the start's answer, or its refusal's words. */
const delegateIn = (
  fleet: KitFleet,
  parent: string,
  cwd: string,
  title: string
): Promise<Started | string> =>
  fleet
    .api((hub) =>
      hub.api["work-items"].post({
        parentInstanceId: parent,
        title,
        prompt: `${TAG}: say ok.`,
        harness: "claude",
        model: MODEL.claude,
        machineId: FAR,
        cwd,
        lands: "none",
      })
    )
    .then(delegateStarted)
    .catch((error: unknown) =>
      error instanceof Error ? error.message : String(error)
    );

/** The item's state once it has ended, with its error, or the start's refusal. */
const stateOf = async (
  fleet: KitFleet,
  started: Started | string
): Promise<string> =>
  typeof started === "string"
    ? `refused: ${started}`
    : await until(
        "the item ended",
        () =>
          fleet.query<{ error: string | null; state: string }>(
            "SELECT state, error FROM work_items WHERE id = ?",
            started.workItemId
          )[0],
        (row) =>
          row !== undefined &&
          ["done", "failed", "cancelled"].includes(row.state),
        180_000
      ).then(
        (row) => `${row?.state}${row?.error ? `: ${row.error}` : ""}`,
        () => "not ended"
      );

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "cut-no-place",
  host: "its delegates cut workspaces, whose boundary is user namespaces",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    const home = fleet.env.HOME as string;
    await fleet.up();
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    const src = join(fleet.sandbox, "src");
    await repository(src, home, false);
    const project = await fleet.api((hub) =>
      hub.api.projects.post({
        name: "Cut with no place",
        machineId: MACHINE,
        cwd: src,
      })
    );
    const parent = await fleet.spawn("claude", "Parent", src, {
      projectId: project.id,
    });
    const far = await fleet.launchMachine(FAR);
    await writeFile(
      join(far.home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    await until(
      "the probe's account signed in on the far machine",
      () =>
        fleet.query<{ state: string }>(
          "SELECT state FROM account_signins WHERE account_id = ? AND machine_id = ?",
          ACCOUNT,
          FAR
        )[0]?.state,
      (signin) => signin === "signed-in",
      120_000
    );
    fleet.write(
      "UPDATE projects SET lfs_url = ?, lfs_connection = ? WHERE id = ?",
      ENDPOINT,
      MISSING,
      project.id
    );
    const places = fleet.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM project_places WHERE project_id = ? AND machine_id = ?",
      project.id,
      FAR
    )[0]?.n;

    const plain = join(far.home, "vps-audit");
    await repository(plain, far.home, false);
    const plainStart = await delegateIn(
      fleet,
      parent,
      plain,
      "Audit with no large files"
    );
    const plainState = await stateOf(fleet, plainStart);
    const [cut] =
      typeof plainStart === "string"
        ? []
        : fleet.query<{ machine_id: string; path: string }>(
            "SELECT machine_id, path FROM workspaces WHERE id = ?",
            plainStart.workspaceId
          );
    check(
      "n1: a repository with no large files on a machine with no place of the project: its workspace is cut there and its leaf finishes its item, so nothing asked where its large files live",
      places === 0 &&
        plainState === "done" &&
        cut?.machine_id === FAR &&
        cut.path.startsWith(join(far.home, ".worktrees", "vps-audit-")),
      `places there ${places}; ${plainState}; workspace ${JSON.stringify(cut)}`
    );

    const marked = join(far.home, "vps-assets");
    await repository(marked, far.home, true);
    const markedState = await stateOf(
      fleet,
      await delegateIn(fleet, parent, marked, "Audit with large files")
    );
    check(
      "n2: a repository whose tree marks files for LFS there: its cut asks, and the hub answers the machine that holds the cut, with the declared connection's refusal",
      markedState.includes(ENDPOINT) &&
        !markedState.includes(
          // Whatever the hub names the machine: every fleet machine shares this host's name.
          workWords.lfsNoPlace("", "Cut with no place").trim()
        ),
      markedState
    );
  },
};

export default spec;
