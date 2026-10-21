/**
 * A delegate's inputs reach its `$TMPDIR/inputs/` before its first turn
 * (agent inputs.ts), and a handoff's before the message that names them. On
 * a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model). This spec delegates, so its fleet cuts workspaces: it runs on
 * the host, outside every boundary.
 *
 * - An input under the fleet's `~/.ssh` is refused at delegate time, naming
 *   the credential store, and no workspace is cut.
 * - An input that doesn't exist is refused as "there's no file at <path>",
 *   and no workspace is cut.
 * - A missing path in `~/.ssh`, and a dangling link to one, get the store's
 *   refusal: neither says the file is missing, nor names the link's target.
 * - The hub's database, in the hub's data dir beside the projects' folders,
 *   is refused as a credential store.
 * - A parent delegates a leaf with an input file. The leaf's brief names the
 *   input, and its Bash reads it from `$TMPDIR/inputs/`.
 * - A file in the parent's project's `assets/`, which its delegates'
 *   boundaries read, goes with it and lands in `$TMPDIR/inputs/`.
 * - A handoff from the parent adds an input while the leaf works: it lands in
 *   the leaf's `$TMPDIR/inputs/`, and the handoff names it.
 * - The leaf then calls finish_item; its item, which lands none, is done.
 * - Its output is a folder (`.decisions/deck/`, named with a trailing slash)
 *   holding two files and a subfolder: the item finishes, and the project's
 *   `assets/<item>/.decisions/deck/` holds every file, the subfolder's
 *   included, at its whole path from the workspace's root.
 *
 *   bun scripts/probe-kit/run.ts delegate-inputs
 */
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const TAG = "PROBE-DELEGATE-INPUTS";
const FINISH = "mcp__cawco__finish_item";
const INPUT = "probe-input.txt";
const HANDED = "probe-handoff.txt";
const ASSET = "probe-asset.md";
const ASSET_TOKEN = `delegate-inputs-asset-${crypto.randomUUID()}`;
/** What the input holds: only a read of the file can put it in a request. */
const TOKEN = `delegate-inputs-${crypto.randomUUID()}`;
const HANDED_TOKEN = `delegate-inputs-handoff-${crypto.randomUUID()}`;
/** How the handoff names its input to the leaf (core `withInputsLine`). */
const HANDED_LINE = `Your parent's inputs are in $TMPDIR/inputs/: ${HANDED}`;
/** The leaf's output: a folder of two files and a subfolder, by its path in the workspace and what each holds. */
const OUTPUT = ".decisions/deck/";
const DECK: Record<string, string> = {
  ".decisions/deck/page.oui": `page-${crypto.randomUUID()}`,
  ".decisions/deck/notes.md": `notes-${crypto.randomUUID()}`,
  ".decisions/deck/shots/one.txt": `shot-${crypto.randomUUID()}`,
};
const WRITE_DECK = [
  "mkdir -p .decisions/deck/shots",
  ...Object.entries(DECK).map(([path, body]) => `printf %s ${body} > ${path}`),
].join(" && ");

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

/** Where the leaf is: its Bash sent, its finish_item sent. */
const leaf: { finished: boolean; read: boolean } = {
  read: false,
  finished: false,
};

/**
 * The leaf: read its input, work (short sleeps) until the handoff's input is
 * named, then finish; the parent and every later turn answer "ok".
 */
const respond = (request: Seen): Reply => {
  if (!(request.tools && request.all.includes(TAG)) || leaf.finished) {
    return text("ok");
  }
  if (!leaf.read) {
    leaf.read = true;
    return useTool("Bash", {
      command: `cat "$TMPDIR/inputs/${INPUT}" && ${WRITE_DECK}`,
      description: "Read the input and write the output folder",
    });
  }
  if (!request.all.includes(HANDED_LINE)) {
    return useTool("Bash", { command: "sleep 2", description: "Work" });
  }
  const headline = "Read both inputs.";
  const reply = found(request, FINISH, {
    headline,
    summary: `${headline}\n\n\`cat "$TMPDIR/inputs/${INPUT}"\` printed the input's token.`,
  });
  if (reply.tool?.name === FINISH) {
    leaf.finished = true;
  }
  return reply;
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

interface Started {
  instanceId: string;
  workItemId: string;
  workspaceId: string;
  workspaceTmp: string;
}

/** The fleet up, a repository in a project, and its parent session running. */
const setUp = async (
  kit: Kit
): Promise<{
  fleet: Fleet;
  home: string;
  parent: string;
  projectId: string;
  src: string;
}> => {
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
  await Bun.$`sh -c ${"git init -q -b main && echo inputs > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Delegate inputs",
    machineId: MACHINE,
    cwd: src,
  });
  const parent = await fleet.spawn("claude", "Parent", src, {
    projectId: project.id,
  });
  return { fleet, home, parent, projectId: project.id, src };
};

const workspaceCount = (fleet: Fleet): number =>
  fleet.query<{ n: number }>("SELECT COUNT(*) AS n FROM workspaces")[0]?.n ?? 0;

/** An input in a credential store is refused before anything is cut. */
const refusesKeys = async (
  { check }: Kit,
  fleet: Fleet,
  home: string,
  delegate: (inputs: string[]) => Promise<Started>
): Promise<void> => {
  const key = join(home, ".ssh", "id_probe");
  await mkdir(join(home, ".ssh"), { recursive: true, mode: 0o700 });
  await writeFile(key, "not a key\n", { mode: 0o600 });
  const before = workspaceCount(fleet);
  const refused = await delegate([key]).then(
    () => "started",
    (error: unknown) => String(error)
  );
  check(
    "an input under ~/.ssh is refused at delegate time, naming the credential store",
    refused.includes(": 400 ") && refused.includes(join(home, ".ssh")),
    refused.slice(0, 400)
  );
  check(
    "the refused delegate cut no workspace",
    workspaceCount(fleet) === before,
    `${before} before, ${workspaceCount(fleet)} after`
  );
};

/** An input that hasn't been written yet is refused as missing, not as on another machine. */
const refusesMissing = async (
  { check }: Kit,
  fleet: Fleet,
  delegate: (inputs: string[]) => Promise<Started>
): Promise<void> => {
  const missing = join(fleet.sandbox, "not-written-yet.png");
  const before = workspaceCount(fleet);
  const refused = await delegate([missing]).then(
    () => "started",
    (error: unknown) => String(error)
  );
  check(
    "an input that doesn't exist is refused as no file at its path",
    refused.includes(": 400 ") &&
      refused.includes(`there's no file at ${missing}`),
    refused.slice(0, 400)
  );
  check(
    "the refused delegate cut no workspace",
    workspaceCount(fleet) === before,
    `${before} before, ${workspaceCount(fleet)} after`
  );
};

/**
 * A missing path in a credential store, and a dangling link to one, get the
 * store's refusal: neither says whether the file exists, nor where the link
 * leads. Runs after {@link refusesKeys}, which makes `~/.ssh`.
 */
const refusesHiddenMissing = async (
  { check }: Kit,
  fleet: Fleet,
  home: string,
  delegate: (inputs: string[]) => Promise<Started>
): Promise<void> => {
  const store = join(home, ".ssh");
  const missing = join(store, "not-written-yet");
  const refusal = (inputs: string[]) =>
    delegate(inputs).then(
      () => "started",
      (error: unknown) => String(error)
    );
  const hidden = await refusal([missing]);
  check(
    "a missing path in a credential store gets the store's refusal, not \"there's no file\"",
    hidden.includes(": 400 ") &&
      hidden.includes(`in ${store}`) &&
      !hidden.includes("there's no file"),
    hidden.slice(0, 400)
  );
  const target = join(store, "gone-key");
  const link = join(fleet.sandbox, "dangling-to-store");
  await symlink(target, link);
  const linked = await refusal([link]);
  check(
    "a dangling link into a credential store gets the store's refusal, and doesn't name its target",
    linked.includes(": 400 ") &&
      linked.includes(`in ${store}`) &&
      !linked.includes(target),
    linked.slice(0, 400)
  );
};

/**
 * The hub's database, beside the projects' folders in the hub's data dir, is
 * refused as a credential store: only the caller's project folder opens.
 */
const refusesHubDatabase = async (
  { check }: Kit,
  fleet: Fleet,
  delegate: (inputs: string[]) => Promise<Started>
): Promise<void> => {
  const db = fleet.env.CAWCO_DB_PATH as string;
  const before = workspaceCount(fleet);
  const refused = await delegate([db]).then(
    () => "started",
    (error: unknown) => String(error)
  );
  check(
    "the hub's database is refused as a credential store",
    refused.includes(": 400 ") &&
      refused.includes(`${db} is in `) &&
      refused.includes("a credential store no workspace reads"),
    refused.slice(0, 400)
  );
  check(
    "the refused delegate cut no workspace",
    workspaceCount(fleet) === before,
    `${before} before, ${workspaceCount(fleet)} after`
  );
};

/** A file in the parent's project's assets landed in the leaf's inputs. */
const landsAsset = async ({ check }: Kit, started: Started): Promise<void> => {
  const landed = await readFile(
    join(started.workspaceTmp, "inputs", ASSET),
    "utf8"
  ).catch(() => "");
  check(
    "a file in the parent's project's assets is admitted and lands in the leaf's $TMPDIR/inputs/",
    landed.includes(ASSET_TOKEN),
    landed.slice(0, 120) || "missing"
  );
};

/** The parent's own credential, as its tools call the hub with it. */
const credentialOf = async (fleet: Fleet, parent: string): Promise<string> =>
  (await Bun.file(`/proc/${await fleet.sessionPid(parent)}/environ`).text())
    .split("\0")
    .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
    ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? "";

/** A handoff from the parent with an input: it lands in the leaf's inputs. */
const handsOn = async (
  { check }: Kit,
  fleet: Fleet,
  parent: string,
  started: Started,
  dir: string
): Promise<void> => {
  const path = join(dir, HANDED);
  await writeFile(path, `${HANDED_TOKEN}\n`);
  const response = await fetch(`${fleet.base}/api/delegation/call/${parent}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${await credentialOf(fleet, parent)}`,
    },
    body: JSON.stringify({
      name: "handoff",
      arguments: {
        target: started.instanceId,
        message: `${TAG}: one more input for you.`,
        inputs: [path],
      },
    }),
  });
  check(
    "a handoff with an input is taken",
    response.ok,
    `${response.status} ${(await response.text()).slice(0, 300)}`
  );
  const landed = await readFile(
    join(started.workspaceTmp, "inputs", HANDED),
    "utf8"
  ).catch(() => "");
  check(
    "the handoff's input is in the leaf's $TMPDIR/inputs/",
    landed.includes(HANDED_TOKEN),
    landed.slice(0, 120) || "missing"
  );
  const named = await until(
    "the handoff reached the leaf",
    () => fleet.seen.find((one) => one.all.includes(HANDED_LINE)),
    Boolean,
    120_000
  ).catch(() => undefined);
  check("the handoff names its input to the leaf", named !== undefined);
};

/**
 * The folder output, collected whole: the report lists each of its files at
 * its whole path, `<project folder>/assets/<item>/.decisions/deck/…` (hub
 * work-items.ts `outputsFolder`: an item of no task by its id's first eight
 * characters), and each holds what the leaf wrote.
 */
const collectsFolder = async (
  { check }: Kit,
  workItemId: string,
  result: string
): Promise<void> => {
  const assets = `/assets/${workItemId.slice(0, 8)}/`;
  const listed = result
    .split("\n")
    .filter((line) => line.startsWith("- /") && line.includes("/assets/"))
    .map((line) => line.slice(2));
  const copied = await Promise.all(
    Object.entries(DECK).map(async ([path, body]) => {
      const at = listed.find((one) => one.endsWith(`${assets}${path}`));
      const held = at ? await readFile(at, "utf8").catch(() => "") : "";
      return { path, at, ok: held === body };
    })
  );
  check(
    "the folder output's two files and its subfolder's file are all in the item's assets folder, at their whole paths",
    copied.every((one) => one.ok),
    copied
      .map(
        (one) =>
          `${one.path}: ${one.at ?? "not listed"} ${one.ok ? "ok" : "wrong"}`
      )
      .join("; ") || result.slice(-600)
  );
};

const spec: Spec = {
  name: "delegate-inputs",
  host: "it delegates, so its fleet cuts workspaces",
  run: async (kit: Kit) => {
    const { check } = kit;
    const { fleet, home, parent, projectId, src } = await setUp(kit);
    const delegate = (inputs: string[]) =>
      fleet.api<Started>("/api/work-items", {
        parentInstanceId: parent,
        title: "Delegate inputs probe",
        prompt: `${TAG}: read your input, then finish.`,
        harness: "claude",
        model: "claude-haiku-4-5",
        cwd: src,
        lands: "none",
        outputs: [OUTPUT],
        inputs,
      });
    await refusesKeys(kit, fleet, home, delegate);
    await refusesMissing(kit, fleet, delegate);
    await refusesHiddenMissing(kit, fleet, home, delegate);
    await refusesHubDatabase(kit, fleet, delegate);

    const outside = join(fleet.sandbox, "parent-files");
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, INPUT), `${TOKEN}\n`);
    // A file a delegate handed in (hub work-items.ts `outputsFolder`).
    const assets = join(
      dirname(fleet.env.CAWCO_DB_PATH as string),
      "projects",
      projectId,
      "assets",
      "probe"
    );
    await mkdir(assets, { recursive: true });
    await writeFile(join(assets, ASSET), `${ASSET_TOKEN}\n`);
    const started = await delegate([join(outside, INPUT), join(assets, ASSET)]);

    // The hub answers before the inputs are in; the brief goes once they are
    // (hub work-items.ts `spawnIn`: `handIn(...).then(brief, notIn)`).
    const brief = await until(
      "the leaf's brief",
      () =>
        fleet.seen.find(
          (one) => one.tools && one.all.includes(TAG) && !one.afterTool
        ),
      Boolean,
      180_000
    );
    check(
      "the brief names the input in $TMPDIR/inputs/",
      brief.all.includes(
        `Your parent's inputs are in $TMPDIR/inputs/: ${INPUT} (from ${join(outside, INPUT)})`
      )
    );
    await landsAsset(kit, started);
    const read = await until(
      "the leaf read its input",
      () => fleet.seen.find((one) => one.afterTool && one.all.includes(TOKEN)),
      Boolean,
      180_000
    ).catch(() => undefined);
    check("the leaf reads the input from $TMPDIR/inputs/", read !== undefined);

    await handsOn(kit, fleet, parent, started, outside);

    const ended = await until(
      "the leaf's item ended",
      () =>
        fleet.query<{ state: string; result: string | null }>(
          "SELECT state, result FROM work_items WHERE id = ?",
          started.workItemId
        )[0],
      (row) => ["done", "failed", "cancelled"].includes(row.state),
      300_000
    ).catch(() => undefined);
    check(
      "the leaf finishes, and its item, which lands none, is done",
      ended?.state === "done" &&
        (ended.result ?? "").includes("Read both inputs."),
      `${ended?.state}: ${(ended?.result ?? "").slice(0, 400)}`
    );
    await collectsFolder(kit, started.workItemId, ended?.result ?? "");
  },
};

export default spec;
