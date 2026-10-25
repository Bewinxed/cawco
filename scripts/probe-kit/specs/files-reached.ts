/**
 * Files lists what reached the person, and nothing made only as an agent's
 * working step crowds it; whoever is up a delegation tree cleans up after a
 * delegate whose work item ended (owner, 2026-10-23: "also idk why the files
 * pane is spammed": 31 working canvases, 8 browsers and the rest of a
 * project's leftovers among about 100 rows).
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), in a project: a parent, two delegates and a session outside
 * the tree. The delegates' work items are seeded on the hub's own rows (a
 * held workspace, its item and the session's link to both), so no boundary
 * is cut and the spec runs inside a workspace; their ends go through the
 * person's stop, the path every item end takes (work-items.ts `finish`).
 *
 * (a) A delegate's canvas handed to its parent and never shown is absent
 *     from the parent's Files (`artifacts/files`) while its panel's menu
 *     (`artifacts`) holds it; shown in the parent's open panel, the pane's
 *     word reaches the hub, and Files lists it, its count in the bar with it.
 * (b) A decision page whose option embeds a page as a Preview: the page is
 *     listed, the Preview it embeds has no row of its own (the menu keeps
 *     it), though it was shown first.
 * (c) A delegate's browser artifact is no file: its menu has it, Files never.
 * (d) The parent's artifact_delete of a live delegate's canvas is refused,
 *     naming that its item is still live; an outsider's of an ended one is
 *     refused, naming who deletes it; the parent's of the ended one, and of
 *     its own ended delegate's two levels down, each named by its name as
 *     an agent names it, succeed.
 * (e) The live delegate's item ends: its browser artifact leaves every list
 *     and the hub, and the parent's artifact_delete of its canvas succeeds.
 *
 *   bun scripts/probe-kit/run.ts files-reached
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ArtifactSummary } from "../../../packages/core/src";
import { artifactToolWords } from "../../../packages/core/src/words/artifact-tools";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";
import { shaped } from "../words";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const pageOf = (heading: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${heading}</title></head><body><h1>${heading}</h1><p>${heading}, as the panel shows it.</p></body></html>`;

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
  const base = await fleet.dashboard();
  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`sh -c ${"git init -q -b main && echo files > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Files reached",
    machineId: MACHINE,
    cwd: src,
  });
  const inProject = { projectId: project.id };
  const parent = await fleet.spawn("claude", "Parent", src, inProject);
  const outsider = await fleet.spawn("claude", "Outsider", src, inProject);
  const ended = await fleet.spawn("claude", "Ended delegate", src, inProject);
  const live = await fleet.spawn("claude", "Live delegate", src, inProject);
  const nested = await fleet.spawn("claude", "Nested delegate", src, inProject);

  // The delegates: each a work item in a workspace of its own, as `delegate`
  // writes them, the parent its parent; the nested one the ended delegate's
  // own, its item already done.
  const now = Date.now();
  for (const [child, above, state, title] of [
    [ended, parent, "running", "Ended delegate"],
    [live, parent, "running", "Live delegate"],
    [nested, ended, "done", "Nested delegate"],
  ] as const) {
    const workspace = crypto.randomUUID();
    const item = crypto.randomUUID();
    fleet.write(
      "INSERT INTO workspaces (id, machine_id, repo_root, path, branch, state, created_by_instance_id, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
      workspace,
      MACHINE,
      src,
      join(fleet.sandbox, `ws-${workspace.slice(0, 8)}`),
      `ws/${workspace.slice(0, 8)}`,
      above,
      now
    );
    fleet.write(
      "INSERT INTO work_items (id, workspace_id, parent_instance_id, instance_id, brief, title, harness, state, project_id, created_at) VALUES (?, ?, ?, ?, ?, ?, 'claude', ?, ?, ?)",
      item,
      workspace,
      above,
      child,
      "Check your own screens.",
      title,
      state,
      project.id,
      now
    );
    fleet.write(
      "UPDATE instances SET parent_instance_id = ?, work_item_id = ? WHERE id = ?",
      above,
      item,
      child
    );
  }
  const itemOf = (child: string): string =>
    fleet.query<{ state: string }>(
      "SELECT w.state FROM work_items w JOIN instances i ON i.work_item_id = w.id WHERE i.id = ?",
      child
    )[0]?.state ?? "none";

  const files = (id: string) =>
    fleet.api<ArtifactSummary[]>(`/api/instances/${id}/artifacts/files`);
  const menu = (id: string) =>
    fleet.api<ArtifactSummary[]>(`/api/instances/${id}/artifacts`);
  const create = (id: string, body: object) =>
    fleet.api<{ id: string }>(`/api/instances/${id}/artifacts`, body);

  // The parent's conversation open on a desk, its panel the person's.
  const page = await kit.page("desk");
  await page.addInitScript(
    ([tab]) => {
      localStorage.setItem(
        "cawco-workspace",
        JSON.stringify({
          v: 1,
          root: { t: "l", id: "pone", tabs: [tab], active: tab, opened: null },
          focusedLeaf: "pone",
        })
      );
    },
    [parent] as const
  );
  await open(page, `${base}/session/${parent}`, '[data-slot="pane"]');

  // (a) A delegate's working canvas, handed to its parent, never shown.
  const working = await create(live, {
    kind: "canvas",
    name: "working-canvas",
    does: "judge",
    ask: "Judge the edit surface as drawn",
    to: "parent",
  });
  const before = await files(parent);
  const held = await menu(parent);
  check(
    "(a) a delegate's canvas handed up and never shown is absent from the parent's Files, while the panel's menu holds it",
    !before.some((one) => one.id === working.id) &&
      held.some((one) => one.id === working.id),
    `files [${before.map((one) => one.name).join(", ")}]; menu [${held.map((one) => one.name).join(", ")}]`
  );
  await fleet.api(`/api/instances/${parent}/artifacts/${working.id}/show`, {});
  const after = await until(
    "the shown canvas in the parent's Files",
    () => files(parent),
    (list) => list.some((one) => one.id === working.id),
    30_000
  );
  const count = await until(
    "the bar's Files count",
    () =>
      page
        .locator("[data-files-count]")
        .first()
        .textContent()
        .catch(() => null),
    (text) => text?.trim() === String(after.length),
    30_000
  );
  check(
    "(a) once the parent's open panel showed it, Files lists it, and the bar's count says so",
    after.some((one) => one.id === working.id) &&
      count?.trim() === String(after.length),
    `files [${after.map((one) => one.name).join(", ")}]; count ${count}`
  );

  // (b) A decision page embedding a page as a Preview, both shown.
  const mock = await create(parent, {
    kind: "page",
    name: "mock-shot",
    does: "judge",
    ask: "Judge the mock as drawn",
    html: pageOf("Mock shot"),
  });
  await until(
    "the mock in the parent's Files",
    () => files(parent),
    (list) => list.some((one) => one.id === mock.id),
    30_000
  );
  const decision = await create(parent, {
    kind: "page",
    name: "pick-shot",
    does: "pick",
    ask: "Pick the shot",
    program: `root = Decisions("Which shot?", [shot])
shot = Decision("shot", "Which shot leads the page?", [drawn, plain], "The mock is drawn below.")
drawn = Option("drawn", "The drawn mock", "As the mock has it.", true, [mockup], "One more picture to keep.")
plain = Option("plain", "No picture", "The words alone.", false, [], "Nothing to see.")
mockup = Preview("${mock.id}", "The mock")`,
  });
  const embedded = await until(
    "the decision page in the parent's Files",
    () => files(parent),
    (list) => list.some((one) => one.id === decision.id),
    30_000
  );
  const menuNow = await menu(parent);
  check(
    "(b) the decision page is listed, and the page it embeds as a Preview has no row of its own; the panel's menu keeps both",
    embedded.some((one) => one.id === decision.id) &&
      !embedded.some((one) => one.id === mock.id) &&
      menuNow.some((one) => one.id === mock.id) &&
      menuNow.some((one) => one.id === decision.id),
    `files [${embedded.map((one) => one.name).join(", ")}]; menu [${menuNow.map((one) => one.name).join(", ")}]`
  );

  // (c) The project's browser, as its machine reports it, and the live
  // delegate's browser artifact, made as its list is read.
  fleet.write(
    "INSERT INTO browsers (key, machine_id, project_id, name, host, state, last_used_at, updated_at) VALUES (?, ?, ?, ?, 'local', 'asleep', ?, ?)",
    `project:${project.id}`,
    MACHINE,
    project.id,
    "Files reached",
    now,
    now
  );
  const liveMenu = await menu(live);
  const browser = liveMenu.find((one) => one.kind === "browser");
  const liveFiles = await files(live);
  check(
    "(c) the delegate's browser artifact is in its panel's menu, never in its Files",
    !!browser && !liveFiles.some((one) => one.kind === "browser"),
    `menu [${liveMenu.map((one) => `${one.kind} ${one.name}`).join(", ")}]; files [${liveFiles.map((one) => `${one.kind} ${one.name}`).join(", ")}]`
  );

  // (d) One canvas in each delegate's own panel; the ended one's item ends.
  const endedCanvas = await create(ended, {
    kind: "canvas",
    name: "ended-canvas",
    does: "judge",
    ask: "Judge what the delegate drew",
  });
  const liveCanvas = await create(live, {
    kind: "canvas",
    name: "live-canvas",
    does: "judge",
    ask: "Judge what the delegate drew",
  });
  const nestedCanvas = await create(nested, {
    kind: "canvas",
    name: "nested-canvas",
    does: "judge",
    ask: "Judge what the delegate drew",
  });
  await fleet.stopSession(ended);
  await until(
    "the ended delegate's item ended",
    () => itemOf(ended),
    (state) => state === "cancelled",
    60_000
  );
  const rowOf = (id: string) =>
    fleet.query<{ id: string }>("SELECT id FROM artifacts WHERE id = ?", id)[0];
  const refusedLive = await callAs(fleet, parent, "artifact_delete", {
    id: liveCanvas.id,
  });
  check(
    "(d) the parent's artifact_delete of a live delegate's canvas is refused, saying its item is still live, and the canvas stays",
    itemOf(live) === "running" &&
      refusedLive.isError &&
      shaped(artifactToolWords.makerDeletes).test(refusedLive.text) &&
      !!rowOf(liveCanvas.id),
    `item ${itemOf(live)}; ${refusedLive.text.slice(0, 600)}`
  );
  const refusedOutside = await callAs(fleet, outsider, "artifact_delete", {
    id: endedCanvas.id,
  });
  check(
    "(d) a session outside the tree is refused the ended delegate's canvas, naming who deletes it, and the canvas stays",
    refusedOutside.isError &&
      shaped(artifactToolWords.notInTree).test(refusedOutside.text) &&
      refusedOutside.text.includes(`cawco:session/${ended}`) &&
      !!rowOf(endedCanvas.id),
    refusedOutside.text.slice(0, 600)
  );
  // Named as an agent names it: by its name (2026-10-23, every name refused).
  const deletedEnded = await callAs(fleet, parent, "artifact_delete", {
    id: "ended-canvas",
  });
  check(
    "(d) the parent's artifact_delete of the ended delegate's canvas, by its name, succeeds, and it is gone from the hub",
    !(deletedEnded.isError || rowOf(endedCanvas.id)),
    `${deletedEnded.text.slice(0, 600)}; row ${JSON.stringify(rowOf(endedCanvas.id) ?? null)}`
  );
  // Two levels down: a delegate of the ended delegate, its own item done.
  const deletedNested = await callAs(fleet, parent, "artifact_delete", {
    id: "nested-canvas",
  });
  check(
    "(d) the parent's artifact_delete of its delegate's delegate's canvas, by its name, succeeds once that one's item ended",
    !(deletedNested.isError || rowOf(nestedCanvas.id)),
    `${deletedNested.text.slice(0, 600)}; row ${JSON.stringify(rowOf(nestedCanvas.id) ?? null)}`
  );

  // (e) The live delegate's item ends.
  await fleet.stopSession(live);
  await until(
    "the live delegate's item ended",
    () => itemOf(live),
    (state) => state === "cancelled",
    60_000
  );
  const gone = await until(
    "the delegate's browser artifact gone",
    async () => ({
      menu: await menu(live),
      rows: fleet.query<{ id: string }>(
        "SELECT id FROM artifacts WHERE instance_id = ? AND kind = 'browser'",
        live
      ),
    }),
    (read) =>
      read.rows.length === 0 &&
      !read.menu.some((one) => one.kind === "browser"),
    30_000
  );
  check(
    "(e) once its item ended, the delegate's browser artifact is gone from its panel's menu and the hub, and listing it again makes none",
    gone.rows.length === 0 &&
      !gone.menu.some((one) => one.kind === "browser") &&
      !!browser &&
      !rowOf(browser.id),
    `menu [${gone.menu.map((one) => `${one.kind} ${one.name}`).join(", ")}]`
  );
  // By its handle, the id's first eight.
  const deletedLive = await callAs(fleet, parent, "artifact_delete", {
    id: liveCanvas.id.slice(0, 8),
  });
  check(
    "(e) once its item ended, the parent's artifact_delete of that delegate's canvas, by its handle, succeeds",
    !(deletedLive.isError || rowOf(liveCanvas.id)),
    deletedLive.text.slice(0, 600)
  );
};

const spec: Spec = { name: "files-reached", run };

export default spec;
