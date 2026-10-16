/**
 * A delegate's inputs reach its `$TMPDIR/inputs/` before its first turn
 * (agent inputs.ts), and a handoff's before the message that names them. On
 * a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model). This spec delegates, so its fleet cuts workspaces: it runs on
 * the host, outside every boundary.
 *
 * - An input under the fleet's `~/.ssh` is refused at delegate time, naming
 *   the credential store, and no workspace is cut.
 * - A parent delegates a leaf with an input file. The leaf's brief names the
 *   input, and its Bash reads it from `$TMPDIR/inputs/`.
 * - A handoff from the parent adds an input while the leaf works: it lands in
 *   the leaf's `$TMPDIR/inputs/`, and the handoff names it.
 * - The leaf then calls finish_item; its item, which lands none, is done.
 *
 *   bun scripts/probe-kit/run.ts delegate-inputs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const TAG = "PROBE-DELEGATE-INPUTS";
const FINISH = "mcp__cawco__finish_item";
const INPUT = "probe-input.txt";
const HANDED = "probe-handoff.txt";
/** What the input holds: only a read of the file can put it in a request. */
const TOKEN = `delegate-inputs-${crypto.randomUUID()}`;
const HANDED_TOKEN = `delegate-inputs-handoff-${crypto.randomUUID()}`;
/** How the handoff names its input to the leaf (core `withInputsLine`). */
const HANDED_LINE = `Your parent's inputs are in $TMPDIR/inputs/: ${HANDED}`;

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
      command: `cat "$TMPDIR/inputs/${INPUT}"`,
      description: "Read the input",
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
): Promise<{ fleet: Fleet; home: string; parent: string; src: string }> => {
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
  return { fleet, home, parent, src };
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

const spec: Spec = {
  name: "delegate-inputs",
  run: async (kit: Kit) => {
    const { check } = kit;
    const { fleet, home, parent, src } = await setUp(kit);
    const delegate = (inputs: string[]) =>
      fleet.api<Started>("/api/work-items", {
        parentInstanceId: parent,
        title: "Delegate inputs probe",
        prompt: `${TAG}: read your input, then finish.`,
        harness: "claude",
        model: "claude-haiku-4-5",
        cwd: src,
        lands: "none",
        inputs,
      });
    await refusesKeys(kit, fleet, home, delegate);

    const outside = join(fleet.sandbox, "parent-files");
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, INPUT), `${TOKEN}\n`);
    const started = await delegate([join(outside, INPUT)]);

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
  },
};

export default spec;
