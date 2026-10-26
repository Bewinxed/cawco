/**
 * A whole's coordinator, for real (task links, hub dispatch.ts
 * `coordinates`): on a scratch fleet (real hub, agent and sessiond; Claude
 * Code against the mock model) with Caw on and dispatch on, a whole's
 * attempt is a coordinator that may delegate; while it is live the hub's
 * own dispatch starts none of its parts, though it starts other ready work;
 * and the coordinator starts a part itself with task_start, as that part's
 * parent. Run it where a workspace boundary can start (not inside another
 * one): every attempt cuts a workspace.
 *
 * a. You start an attempt at whole P (parts C and D): it is a coordinator,
 *    its session may delegate.
 * b. Dispatch on, with Caw on: the hub starts plain ready task Z, and
 *    neither C nor D, nor P a second time.
 * c. The coordinator's task_start of C starts it, reporting to the
 *    coordinator; D stays held.
 *
 *   bun scripts/probe-kit/run.ts task-links-coordinator
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

interface Item {
  instance_id: string;
  parent_instance_id: string;
  state: string;
}

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
  const repo = join(fleet.sandbox, "code");
  await mkdir(repo, { recursive: true });
  await Bun.$`git init -q -b main && echo code > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Coordinators",
    machineId: MACHINE,
    cwd: repo,
    caw: true,
  });
  const file = async (title: string, partOf?: string) =>
    (
      await fleet.api<{ id: string }>(`/api/projects/${project.id}/tasks`, {
        title,
        ...(partOf ? { partOf } : {}),
      })
    ).id;
  const itemsOf = (task: string): Item[] =>
    fleet.query<Item>(
      "SELECT instance_id, parent_instance_id, state FROM work_items WHERE task_id = ? AND project_id = ?",
      task,
      project.id
    );

  // a. The whole's attempt is a coordinator.
  const p = await file("Tray");
  const c = await file("Tray chips", p);
  const d = await file("Tray counts", p);
  await fleet.api(`/api/projects/${project.id}/tasks/${p}/attempts`, {});
  const coordinator = (await until(
    "a: the coordinator's item",
    () => itemsOf(p).find((item) => item.state === "running"),
    Boolean,
    180_000
  )) as Item;
  const [row] = fleet.query<{ can_delegate: number | null }>(
    "SELECT can_delegate FROM instances WHERE id = ?",
    coordinator.instance_id
  );
  kit.check(
    "a: a whole's attempt is a coordinator, its session may delegate",
    row?.can_delegate === 1,
    JSON.stringify(row)
  );

  // b. Dispatch on: other ready work starts, the parts do not.
  const z = await file("Tray empty state copy");
  const patched = await fetch(
    `${fleet.base}/api/projects/${project.id}/dispatch`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dispatch: true, maxAttempts: 5 }),
    }
  );
  kit.check("b: dispatch turned on", patched.ok, String(patched.status));
  await until(
    "b: the hub's dispatch starts plain ready task Z",
    () => itemsOf(z)[0],
    Boolean,
    240_000
  );
  kit.check(
    "b: while the coordinator is live the hub starts neither part, nor the whole again",
    itemsOf(c).length === 0 &&
      itemsOf(d).length === 0 &&
      itemsOf(p).length === 1,
    JSON.stringify({ c: itemsOf(c), d: itemsOf(d), p: itemsOf(p).length })
  );

  // c. The coordinator starts C itself.
  const credential = await fleet.sessionCredential(coordinator.instance_id);
  const started = await toolWords(
    { base: fleet.base, id: coordinator.instance_id, credential },
    "task_start",
    { id: c }
  );
  const part = (await until(
    "c: C's attempt",
    () => itemsOf(c)[0],
    Boolean,
    180_000
  )) as Item;
  kit.check(
    "c: the coordinator's task_start starts its part, reporting to it",
    !started.refused && part.parent_instance_id === coordinator.instance_id,
    `${started.text.slice(0, 300)} | ${JSON.stringify(part)}`
  );
  kit.check(
    "c: the other part stays held",
    itemsOf(d).length === 0,
    JSON.stringify(itemsOf(d))
  );
};

export default {
  name: "task-links-coordinator",
  host: "a coordinator delegates, so its fleet cuts workspaces",
  run,
} satisfies Spec;
