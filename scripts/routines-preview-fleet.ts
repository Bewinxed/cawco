/**
 * PREVIEW ONLY (uncommitted): the scratch fleet the routines preview's
 * dashboard dev server reads. A real hub, agent and sessiond on loopback
 * (scratch-fleet.ts), against the mock model, seeded with:
 *
 * - "cawco" (code template, Caw on): tasks across its stages, three of
 *   them archived (the T5 switch draws them), and the owner's four routines;
 * - "Field notes" (no template, Caw on): nothing at all, for the empty
 *   board's and the empty Routines page's starters.
 *
 * The routines themselves are the dashboard's preview data
 * (lib/cawco/routines/preview-data.ts), keyed on the project's name: the
 * hub has no read of a routine's event routes yet, which the event routine's
 * line needs.
 *
 * It writes the hub's address to $TMPDIR/routines-preview-hub.txt and
 * stays up until it is stopped; everything it started ends with it.
 *
 *   bun scripts/routines-preview-fleet.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, scratchFleet } from "./scratch-fleet";

const said = (words: string): Reply => ({ everyMs: 5, words: [words] });

const fleet = await scratchFleet({
  name: "routines-preview",
  respond: (request) => said(request.tools ? "ok" : "Preview"),
});
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
  "[user]\n\tname = Owner\n\temail = owner@preview.test\n"
);

/** A git folder on the scratch machine, with one commit. */
async function folder(name: string): Promise<string> {
  const dir = join(fleet.sandbox, "src", name);
  await mkdir(dir, { recursive: true });
  await Bun.$`git init -q -b main && echo ${name} > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(dir)
    .env({ ...process.env, HOME: home })
    .quiet();
  return dir;
}

interface Stage {
  kind: string;
  name: string;
}

const cockpit = await fleet.api<{ id: string }>("/api/projects", {
  name: "cawco",
  machineId: MACHINE,
  cwd: await folder("cawco"),
  caw: true,
  template: "code",
});
await fleet.api<{ id: string }>("/api/projects", {
  name: "Field notes",
  machineId: MACHINE,
  cwd: await folder("field-notes"),
  caw: true,
});

const { stages } = await fleet.api<{ stages: Stage[] }>(
  `/api/projects/${cockpit.id}/stages`
);
const byKind = (kind: string) =>
  stages.find((stage) => stage.kind === kind)?.name ?? stages[0]?.name;

const TASKS: { title: string; kind: string; archived?: boolean }[] = [
  { title: "Retry webhook deliveries on 5xx", kind: "todo" },
  { title: "Relay health check in the smoke suite", kind: "todo" },
  { title: "Label duplicates from the triage run", kind: "todo" },
  { title: "Move the changelog to one file per release", kind: "active" },
  { title: "Fix the flaky relay-health check", kind: "active" },
  { title: "Approve the beta note wording", kind: "you" },
  { title: "Bump Effect to 4.2", kind: "done" },
  { title: "Read Linear issues through the connection", kind: "done" },
  { title: "Old relay docs page", kind: "done", archived: true },
  { title: "Retire the v1 changelog script", kind: "done", archived: true },
  { title: "Spike: poll GitHub every minute", kind: "dropped", archived: true },
];

for (const task of TASKS) {
  // biome-ignore lint/performance/noAwaitInLoops: each task is its own commit, in order
  const made = await fleet.api<{ id: string }>(
    `/api/projects/${cockpit.id}/tasks`,
    { title: task.title }
  );
  const stage = byKind(task.kind);
  if (stage && task.kind !== "todo") {
    await fleet.api(`/api/projects/${cockpit.id}/tasks/${made.id}/stage`, {
      stage,
    });
  }
  if (task.archived) {
    await fleet.api(`/api/projects/${cockpit.id}/tasks/${made.id}/archive`, {
      archived: true,
    });
  }
}

const out = join(
  process.env.TMPDIR ?? fleet.sandbox,
  "routines-preview-hub.txt"
);
await writeFile(out, `${fleet.base}\n`);
console.log(`routines preview fleet: hub ${fleet.base} (written to ${out})`);

const stop = async () => {
  await fleet.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// Stays up: the dashboard reads this hub until the fleet is stopped.
await new Promise(() => undefined);
