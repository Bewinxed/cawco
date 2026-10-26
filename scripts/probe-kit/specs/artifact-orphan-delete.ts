/**
 * An artifact always has someone who can remove it, and whoever is up a
 * delegation tree cleans up after a delegate whose work item ended, whatever
 * its workspace's state (owner, 2026-10-23: a project's Files crowded with
 * done delegates' leftovers the parent was refused). On a scratch fleet
 * (real hub, agent and sessiond; Claude Code against the mock model), in a
 * project, as the Backlot case had it (2026-10-22: three pages of a done
 * delegate whose workspace was discarded, which nobody could delete). This
 * spec delegates, so its fleet cuts workspaces: it runs on the host, outside
 * every boundary. A live delegate's refusal is files-reached's.
 *
 * A parent delegates; the child creates two pages, commits a file on no
 * remote and fails its item as blocked, so its workspace is held. Then:
 * - (a) a session of the project outside the tree is refused, its words
 *   naming who deletes it: the writer, the sessions up its tree, the person;
 * - (b) the item ended, its workspace still held (a handoff would reopen
 *   it): the parent's artifact_delete of the first page, by its name,
 *   succeeds;
 * - (c) the parent discards the workspace (a carry holds the commit): the
 *   parent's handoff to the child is refused naming the discard; the
 *   discard's answer names the page the child left, by link and id, and
 *   says artifact_delete removes it from here;
 * - (d) the outsider is still refused, with the same words;
 * - (e) the parent's artifact_delete of the second, by its handle,
 *   succeeds, and it is gone.
 *
 *   bun scripts/probe-kit/run.ts artifact-orphan-delete
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { artifactToolWords } from "../../../packages/core/src/words/artifact-tools";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { shaped } from "../words";

const CHILD = "PROBE-ORPHAN-CHILD";
const MADE = "PROBE-ORPHAN-MADE";
const PAGE_NAME = "orphan-page";
const SECOND_NAME = "orphan-second";

const CREATE = "mcp__cawco__artifact_create";
const FINISH = "mcp__cawco__finish_item";
/** What finish_item answers a blocked finish (work-items.ts `finishItem`). */
const BLOCKED = "The item failed as blocked";
/** artifact_create's answer in its words (hub presenters/artifacts.ts `artifactCreatedWords`): the page made, and its link. */
const MADE_PAGE =
  /Made orphan-page \(page [0-9a-f]{8}\)[\s\S]*?cawco:artifact\/[0-9a-f-]{36}/u;
const MADE_SECOND =
  /Made orphan-second \(page [0-9a-f]{8}\)[\s\S]*?cawco:artifact\/[0-9a-f-]{36}/u;

/** The outsider's refusal: who deletes it (artifacts/service.ts `deletable`). */
const WHO_DELETES = shaped(artifactToolWords.notInTree);

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
/** A deferred tool is found first, then called. */
const found = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return useTool(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? useTool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};

/**
 * The child: creates its page, commits a file on no remote (so the discard
 * writes a carry; finish_item refuses a clone with uncommitted files,
 * work-items.ts "Not finished: your clone holds work that is in no
 * commit"), then fails its item as blocked.
 */
const child = (request: Seen): Reply => {
  if (request.all.includes(BLOCKED)) {
    return text("Stopped.");
  }
  if (request.all.includes(MADE)) {
    return useTool(FINISH, {
      headline: "Stopped here for the probe.",
      summary: "Stopped here for the probe.",
      blocked: { command: "probe", error: "the probe ends this item here" },
    });
  }
  if (MADE_SECOND.test(request.all)) {
    return useTool("Bash", {
      command: `echo left > orphan-probe.txt && git add orphan-probe.txt && git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Probe commit on no remote' && echo ${MADE}`,
      description: "Probe step",
    });
  }
  if (MADE_PAGE.test(request.all)) {
    return useTool(CREATE, {
      kind: "page",
      does: "judge",
      ask: "Judge the second mock of the edit surface",
      name: SECOND_NAME,
      html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Second</title></head><body><h1>Second</h1></body></html>`,
    });
  }
  return found(request, CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this mock of the edit surface",
    name: PAGE_NAME,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Orphan</title></head><body><h1>Orphan</h1></body></html>`,
  });
};

const respond = (request: Seen): Reply => {
  if (request.tools && request.all.includes(CHILD)) {
    return child(request);
  }
  return text("ok");
};

interface Started {
  instanceId: string;
  workItemId: string;
  workspaceId: string;
}

/** A session's own credential, as its tools call the hub with it. */
const credentialOf = async (fleet: KitFleet, id: string): Promise<string> =>
  await fleet.sessionCredential(id);

/** A CawCo tool called as session `as`, through the door its MCP server and the CLI share: its words. */
const callAs = async (
  fleet: KitFleet,
  as: string,
  name: string,
  args: Record<string, unknown>
): Promise<{ isError: boolean; text: string }> => {
  const said = await toolWords(
    { base: fleet.base, id: as, credential: await credentialOf(fleet, as) },
    name,
    args
  );
  return { isError: said.refused, text: said.text };
};

/** The child's page `name` on the hub: its id and writer, or undefined once gone. */
const pageOf = (
  fleet: KitFleet,
  name = PAGE_NAME
): { id: string; instance_id: string | null } | undefined =>
  fleet.query<{ id: string; instance_id: string | null }>(
    "SELECT id, instance_id FROM artifacts WHERE name = ? AND kind = 'page'",
    name
  )[0];

const run = async (kit: Kit) => {
  const { check } = kit;
  const fleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`sh -c ${"git init -q -b main && echo orphan > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Orphan pages",
    machineId: MACHINE,
    cwd: src,
  });
  const parent = await fleet.spawn("claude", "Parent", src, {
    projectId: project.id,
  });
  const outsider = await fleet.spawn("claude", "Outsider", src, {
    projectId: project.id,
  });

  const started = await fleet.api<Started>("/api/work-items", {
    parentInstanceId: parent,
    title: "Mock the edit surface",
    prompt: `${CHILD}: mock the edit surface as a page, then stop.`,
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: src,
    lands: "none",
  });
  await until(
    "the child's item failed as blocked",
    () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM work_items WHERE id = ?",
        started.workItemId
      )[0]?.state,
    (state) => state === "failed",
    240_000
  );
  const page = pageOf(fleet);
  const second = pageOf(fleet, SECOND_NAME);
  check(
    "setup: the child wrote its two pages, and its item ended",
    page?.instance_id === started.instanceId &&
      second?.instance_id === started.instanceId,
    JSON.stringify([page ?? null, second ?? null])
  );
  if (!(page && second)) {
    return;
  }

  // (a) A session outside the tree is refused, naming who deletes it.
  const outsideEarly = await callAs(fleet, outsider, "artifact_delete", {
    id: page.id,
  });
  check(
    "(a) a session of the project outside the tree is refused, naming the writer, the sessions up its tree and the person",
    outsideEarly.isError &&
      WHO_DELETES.test(outsideEarly.text) &&
      outsideEarly.text.includes(`cawco:session/${started.instanceId}`) &&
      pageOf(fleet)?.id === page.id,
    outsideEarly.text.slice(0, 600)
  );

  // (b) The item ended, its workspace held: the parent deletes the first page.
  // By its name, as an agent names it: a name or handle resolved to the
  // writer's row before the tree is asked (2026-10-23: every name refused
  // with "only that session changes it").
  const early = await callAs(fleet, parent, "artifact_delete", {
    id: PAGE_NAME,
  });
  const [workspace] = fleet.query<{ state: string }>(
    "SELECT state FROM workspaces WHERE id = ?",
    started.workspaceId
  );
  check(
    "(b) its item ended and its workspace still held, the parent's artifact_delete of the page by its name succeeds, and the page is gone",
    !(early.isError || pageOf(fleet)) && workspace?.state !== "archived",
    `workspace ${workspace?.state}; ${early.text.slice(0, 600)}`
  );

  // (c) The parent discards the workspace: the child can no longer act.
  const discarded = await callAs(fleet, parent, "discard_workspace", {
    workspace: started.workspaceId,
  });
  const handoff = await callAs(fleet, parent, "handoff", {
    target: started.instanceId,
    message: "Delete your page.",
  });
  check(
    "(c) the parent discards the workspace into a carry, and the child can no longer act: the parent's handoff is refused naming the discard",
    !discarded.isError &&
      discarded.text.startsWith(
        `Discarded workspace ${started.workspaceId.slice(0, 8)}`
      ) &&
      handoff.isError &&
      handoff.text.includes(
        `its workspace ${started.workspaceId.slice(0, 8)} was discarded`
      ),
    `discard: ${discarded.text.slice(0, 300)}; handoff: ${handoff.text.slice(0, 600)}`
  );
  check(
    "(c) the discard's answer names the page the child left, by its link and handle, and says artifact_delete removes it from here",
    discarded.text.includes(`cawco:artifact/${second.id}`) &&
      discarded.text.includes(`(page ${second.id.slice(0, 8)})`) &&
      discarded.text.includes(artifactToolWords.leftoverEnded),
    discarded.text.slice(0, 900)
  );

  // (d) The outsider is refused still.
  const outsideLate = await callAs(fleet, outsider, "artifact_delete", {
    id: second.id,
  });
  check(
    "(d) once the child can't act, the outsider is still refused with the same words, and the page stays",
    outsideLate.isError &&
      WHO_DELETES.test(outsideLate.text) &&
      pageOf(fleet, SECOND_NAME)?.id === second.id,
    outsideLate.text.slice(0, 600)
  );

  // (e) The parent deletes the second.
  // By its handle, the id's first eight.
  const late = await callAs(fleet, parent, "artifact_delete", {
    id: second.id.slice(0, 8),
  });
  check(
    "(e) the parent's artifact_delete of the second page by its handle succeeds, and it is gone from the hub",
    !(late.isError || pageOf(fleet, SECOND_NAME)),
    `${late.text.slice(0, 600)}; row ${JSON.stringify(pageOf(fleet, SECOND_NAME) ?? null)}`
  );
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "artifact-orphan-delete",
  host: "it delegates, so its fleet cuts workspaces",
  run,
};

export default spec;
