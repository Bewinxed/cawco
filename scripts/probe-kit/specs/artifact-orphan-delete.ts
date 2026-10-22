/**
 * An artifact always has someone who can remove it. While its writer can
 * still act, only the writer deletes it; once it can't (its item ended and
 * its workspace was discarded), any session up its delegation tree does. On
 * a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), in a project, as the Backlot case had it (2026-10-22: three
 * pages of a done delegate whose workspace was discarded, which nobody could
 * delete). This spec delegates, so its fleet cuts workspaces: it runs on the
 * host, outside every boundary.
 *
 * A parent delegates; the child creates a page, commits a file on no remote
 * and fails its item as blocked, so its workspace is held. Then:
 * - (a) while the child can still act (its workspace held: a handoff
 *   reopens it), the parent's artifact_delete is refused, saying that
 *   session deletes it now and the parent can once it can't; the page stays;
 * - (b) a session of the project outside the tree is refused, its words
 *   naming who deletes it: the writer, the sessions up its tree, the person;
 * - (c) the parent discards the workspace (a carry holds the commit), and the
 *   child can no longer act: the parent's handoff to it is refused naming
 *   the discard;
 * - (d) the outsider is still refused, with the same words;
 * - (e) the parent's artifact_delete succeeds, and the page is gone.
 *
 *   bun scripts/probe-kit/run.ts artifact-orphan-delete
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const CHILD = "PROBE-ORPHAN-CHILD";
const MADE = "PROBE-ORPHAN-MADE";
const PAGE_NAME = "orphan-page";

const CREATE = "mcp__cawco__artifact_create";
const FINISH = "mcp__cawco__finish_item";
/** What finish_item answers a blocked finish (work-items.ts `finishItem`). */
const BLOCKED = "The item failed as blocked";
const ANSWERED_ID = /"id":"[0-9a-f-]{36}"/;

/** The parent's refusal while its writer can still act (artifacts/service.ts `deletable`). */
const STILL_ACTS = "that session can still act";
/** The outsider's refusal: who deletes it (artifacts/service.ts `deletable`). */
const WHO_DELETES =
  "That session deletes it while it can still act; after that, the sessions up its delegation tree do, and the person can from the dashboard. This session is neither.";

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
  if (ANSWERED_ID.test(request.all)) {
    return useTool("Bash", {
      command: `echo left > orphan-probe.txt && git add orphan-probe.txt && git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Probe commit on no remote' && echo ${MADE}`,
      description: "Probe step",
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
  (await Bun.file(`/proc/${await fleet.sessionPid(id)}/environ`).text())
    .split("\0")
    .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
    ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? "";

/** A CawCo tool called as session `as`, through the door its MCP server and the CLI share. */
const callAs = async (
  fleet: KitFleet,
  as: string,
  name: string,
  args: object
): Promise<{ isError: boolean; text: string }> => {
  const response = await fetch(`${fleet.base}/api/delegation/call/${as}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${await credentialOf(fleet, as)}`,
    },
    body: JSON.stringify({ name, arguments: args }),
  });
  if (!response.ok) {
    return {
      isError: true,
      text: `${response.status} ${await response.text()}`,
    };
  }
  const result = (await response.json()) as {
    content?: { text?: string }[];
    isError?: boolean;
  };
  return {
    isError: !!result.isError,
    text: (result.content ?? []).map((block) => block.text ?? "").join("\n"),
  };
};

/** The child's page on the hub, by its name: its id and writer, or undefined once gone. */
const pageOf = (
  fleet: KitFleet
): { id: string; instance_id: string | null } | undefined =>
  fleet.query<{ id: string; instance_id: string | null }>(
    "SELECT id, instance_id FROM artifacts WHERE name = ? AND kind = 'page'",
    PAGE_NAME
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
  check(
    "setup: the child wrote its page, and its item ended",
    page?.instance_id === started.instanceId,
    JSON.stringify(page ?? null)
  );
  if (!page) {
    return;
  }

  // (a) The child can still act: its workspace is held, a handoff reopens it.
  const early = await callAs(fleet, parent, "artifact_delete", { id: page.id });
  const [workspace] = fleet.query<{ state: string }>(
    "SELECT state FROM workspaces WHERE id = ?",
    started.workspaceId
  );
  check(
    "(a) while the child can still act, the parent's artifact_delete is refused, and the page stays",
    early.isError &&
      early.text.includes(STILL_ACTS) &&
      early.text.includes("you, up its delegation tree, can delete it") &&
      pageOf(fleet)?.id === page.id &&
      workspace?.state !== "archived",
    `workspace ${workspace?.state}; ${early.text.slice(0, 600)}`
  );

  // (b) A session outside the tree is refused, naming who deletes it.
  const outsideEarly = await callAs(fleet, outsider, "artifact_delete", {
    id: page.id,
  });
  check(
    "(b) a session of the project outside the tree is refused, naming the writer, the sessions up its tree and the person",
    outsideEarly.isError &&
      outsideEarly.text.includes(WHO_DELETES) &&
      outsideEarly.text.includes(`cawco:session/${started.instanceId}`) &&
      pageOf(fleet)?.id === page.id,
    outsideEarly.text.slice(0, 600)
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
      discarded.text.startsWith(`Discarded workspace ${started.workspaceId}`) &&
      handoff.isError &&
      handoff.text.includes(
        `its workspace ${started.workspaceId} was discarded`
      ),
    `discard: ${discarded.text.slice(0, 300)}; handoff: ${handoff.text.slice(0, 600)}`
  );

  // (d) The outsider is refused still.
  const outsideLate = await callAs(fleet, outsider, "artifact_delete", {
    id: page.id,
  });
  check(
    "(d) once the child can't act, the outsider is still refused with the same words, and the page stays",
    outsideLate.isError &&
      outsideLate.text.includes(WHO_DELETES) &&
      pageOf(fleet)?.id === page.id,
    outsideLate.text.slice(0, 600)
  );

  // (e) The parent deletes it.
  const late = await callAs(fleet, parent, "artifact_delete", { id: page.id });
  check(
    "(e) the parent's artifact_delete succeeds, and the page is gone from the hub",
    !late.isError && late.text.includes('"showing"') && !pageOf(fleet),
    `${late.text.slice(0, 600)}; row ${JSON.stringify(pageOf(fleet) ?? null)}`
  );
};

const spec: Spec = {
  name: "artifact-orphan-delete",
  host: "it delegates, so its fleet cuts workspaces",
  run,
};

export default spec;
