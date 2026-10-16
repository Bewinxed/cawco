/**
 * An attempt's brief carries its project's design system only when the
 * task needs it (Projects spec §5.7, "Use": "the agent gets the system only
 * when a task needs it: the usage guide, DESIGN.md and the token CSS
 * first"; hub dispatch.ts `briefOf`, design-system.ts `designSection`,
 * design-offers.ts `needsDesignSystem`). On a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model). Its attempts cut
 * workspaces, so it runs where a boundary can start (a `host` check).
 *
 * Two projects of the code template, Caw off, stages ready → working →
 * review (you) → done: "Quay", whose repository holds design/ with a
 * SKILL.md, and "Dock", whose has none. A "Filer" session in each files and
 * starts its tasks; each attempt's brief is read from the work item the
 * dispatcher filed (`work_items.brief`), as its session got it.
 *
 * 1. Quay's task labelled `ui` (design-shaped) gets a `## Design system`
 *    section after its project context, holding design/SKILL.md's words and
 *    the line naming DESIGN.md and tokens.css first.
 * 2. Quay's code task, no `ui` or `design` label, gets no such section.
 * 3. Dock's task labelled `design` gets none: Dock has no design/.
 *
 *   bun scripts/probe-kit/run.ts design-brief
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const CREATE = "mcp__cawco__task_create";
const START = "mcp__cawco__task_start";
const TURN = /PROBE-CMD:\w+/g;
const STAGES =
  "---\nready      todo\nworking    active\nreview     you\ndone       done\ndropped    dropped\nmoves\n  * → *    you, session, action\nviews\n  board      by stage\n---\n";
/** The words only Quay's design/SKILL.md holds: what the section must carry whole. */
const SKILL_WORDS = "Quay's look: harbour blues, PROBE-SKILL-WORDS.";
const SKILL = `---\nname: quay-design\ndescription: Quay's design system.\n---\n\n${SKILL_WORDS}\n`;
const SECTION = "## Design system";
const READ_FIRST =
  "Read `design/DESIGN.md` and `design/tokens.css` first; `design/tokens.resolver.json`, `design/manifest.json`, fonts and specimens only as the work needs them.";

interface Call {
  input: object;
  name: string;
}
/** The filers' calls, by a command's marker. */
const commands = new Map<string, Call[]>();
/** The calls a turn already looked for with ToolSearch, by key. */
const searched = new Map<string, Set<string>>();

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const key = [...request.all.matchAll(TURN)].at(-1)?.[0];
  const queue = key ? commands.get(key) : undefined;
  const [call] = queue ?? [];
  // An attempt's turn, or a command done: nothing more to do.
  if (!(key && queue && call)) {
    return text("ok");
  }
  if (!request.toolNames.includes(call.name)) {
    const looked = searched.get(key) ?? new Set<string>();
    if (looked.has(call.name) || !request.toolNames.includes("ToolSearch")) {
      queue.shift();
      return text(`${call.name} is not offered`);
    }
    looked.add(call.name);
    searched.set(key, looked);
    return {
      everyMs: 1,
      words: [],
      tool: {
        name: "ToolSearch",
        input: { query: `select:${call.name}`, max_results: 1 },
      },
    };
  }
  queue.shift();
  return {
    everyMs: 1,
    words: [],
    tool: { name: call.name, input: call.input },
  };
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
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

  /** A repository of its own, design/ committed in it when `design` says, and its project with a filer. */
  const projectWith = async (name: string, design: boolean) => {
    const repo = join(fleet.sandbox, name.toLowerCase());
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "README.md"), `${name}\n`);
    if (design) {
      await mkdir(join(repo, "design"), { recursive: true });
      await writeFile(join(repo, "design/SKILL.md"), SKILL);
      await writeFile(join(repo, "design/DESIGN.md"), `# ${name}\n`);
      await writeFile(
        join(repo, "design/tokens.css"),
        "@layer tokens { :root { --ink: oklch(0.3 0.02 250); } }\n"
      );
    }
    await Bun.$`git init -q -b main && git add -A && git commit -qm ${name}`
      .cwd(repo)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name,
      machineId: MACHINE,
      cwd: repo,
      caw: false,
      template: "code",
    });
    const put = await fetch(
      `${fleet.base}/api/projects/${project.id}/folder/file`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "stages.md", content: STAGES }),
      }
    );
    if (!put.ok) {
      throw new Error(`${name} stages.md: ${put.status} ${await put.text()}`);
    }
    const filer = await fleet.spawn("claude", `${name} filer`, repo, {
      projectId: project.id,
    });
    return { id: project.id, filer };
  };
  const quay = await projectWith("Quay", true);
  const dock = await projectWith("Dock", false);

  /** Files a task and starts it; the brief its attempt was filed with. */
  const briefOf = async (
    project: { filer: string; id: string },
    marker: string,
    title: string,
    labels: string[]
  ): Promise<string> => {
    commands.set(`PROBE-CMD:${marker}FILE`, [
      {
        name: CREATE,
        input: { title, stage: "ready", lands: "none", labels },
      },
    ]);
    await fleet.send(project.filer, `PROBE-CMD:${marker}FILE`);
    const task = await until(
      `${marker}: the filed task`,
      async () =>
        (
          await fleet.api<{ tasks: { id: string; title: string }[] }>(
            `/api/projects/${project.id}/tasks`
          )
        ).tasks.find((each) => each.title === title),
      Boolean,
      120_000
    );
    if (!task) {
      throw new Error(`${marker}: no task filed`);
    }
    commands.set(`PROBE-CMD:${marker}START`, [
      { name: START, input: { id: task.id } },
    ]);
    await fleet.send(project.filer, `PROBE-CMD:${marker}START`);
    const rows = await until(
      `${marker}: ${task.id}'s attempt filed`,
      () =>
        fleet.query<{ brief: string }>(
          "SELECT brief FROM work_items WHERE project_id = ? AND task_id = ? ORDER BY created_at DESC",
          project.id,
          task.id
        ),
      (found) => found.length > 0,
      300_000
    ).catch(async (error: unknown) => {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}; ${await taskNow(project.id, task.id)}`
      );
    });
    return rows[0]?.brief ?? "";
  };
  /** A task as it stands, for why its attempt never filed: its start problem says it. */
  const taskNow = async (projectId: string, id: string): Promise<string> => {
    try {
      return JSON.stringify(
        await fleet.api(`/api/projects/${projectId}/tasks/${id}`)
      ).slice(0, 1600);
    } catch (error) {
      return `the task did not read: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
  /** The brief's design section, from its heading to the next section. */
  const sectionOf = (brief: string): string | undefined => {
    const at = brief.indexOf(SECTION);
    if (at < 0) {
      return;
    }
    const next = brief.indexOf("\n## ", at + SECTION.length);
    return brief.slice(at, next < 0 ? undefined : next);
  };

  // ── 1. Design work in a project with design/ gets the section ────────
  const designBrief = await briefOf(quay, "Q1", "Quay hero PROBE-Q1", ["ui"]);
  const section = sectionOf(designBrief);
  const contextAt = designBrief.indexOf("## Project context");
  kit.check(
    "1: a design-shaped task in a project with design/ gets the Design system section, holding SKILL.md's words and the read-first line",
    section?.includes(SKILL_WORDS) === true &&
      section.includes(READ_FIRST) &&
      (contextAt < 0 || contextAt < designBrief.indexOf(SECTION)),
    `section ${section === undefined ? "absent" : `“${section.slice(0, 400)}”`}; project context at ${contextAt}, section at ${designBrief.indexOf(SECTION)}`
  );

  // ── 2. A code task in the same project gets none ──────────────────────
  const codeBrief = await briefOf(quay, "Q2", "Quay parser PROBE-Q2", []);
  kit.check(
    "2: a code task with no ui or design label, in the same project, gets no Design system section",
    codeBrief.length > 0 &&
      !codeBrief.includes(SECTION) &&
      !codeBrief.includes(SKILL_WORDS),
    `brief ${codeBrief.length} chars; section ${codeBrief.includes(SECTION) ? "present" : "absent"}`
  );

  // ── 3. Design work in a project without design/ gets none ────────────
  const bareBrief = await briefOf(dock, "D1", "Dock hero PROBE-D1", ["design"]);
  kit.check(
    "3: a design-shaped task in a project without design/ gets no Design system section",
    bareBrief.length > 0 && !bareBrief.includes(SECTION),
    `brief ${bareBrief.length} chars; section ${bareBrief.includes(SECTION) ? "present" : "absent"}`
  );
};

export default { name: "design-brief", run } satisfies Spec;
