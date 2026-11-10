/**
 * Files go with a handoff wherever handoff's relations reach, both ways,
 * across machines, through the hub: a host-scope leaf on a second machine
 * hands its parent, on the first, a file of its machine. On a scratch fleet
 * of two machines on one host, each its own agent, sessiond and HOME (real
 * hub; Claude Code against the mock model). Nothing here cuts a workspace,
 * so it runs inside one too.
 *
 * - f1. A leaf that may start nothing lists `inputs` on its handoff.
 * - f2. Its parent's handoff with inputs to a session it has no relation to
 *   is refused in the inputs' words: nothing lands there, and the message
 *   reaches no one.
 * - f3. Its handoff with inputs to its parent lands the file in the parent's
 *   own inputs folder on the parent's machine (`~/.cawco/tmp/s-<id8>/inputs/`
 *   under the first machine's HOME; the file was under the second's), and
 *   the message that reaches the parent names that folder and the file.
 * - f4. A folder of more files than one handoff once carried, handed with
 *   that file, lands whole in the parent's inputs folder, and the message
 *   names it once with its file count.
 *
 *   bun scripts/probe-kit/run.ts handoff-sends
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Sending } from "../../../packages/core/src/sending";
import { workWords } from "../../../packages/core/src/words/work";
import { listRoleTools } from "../../../packages/hub/src/role-budgets";
import type { ToolArgs } from "../../../packages/hub/src/tool-args";
import {
  type ToolSession,
  type ToolWords,
  toolWords,
} from "../../lib/tool-call";
import {
  ACCOUNT,
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { ToolAnswer } from "../../tool-calls";
import { delegateStarted } from "../kit";
import type { Kit, Spec } from "../spec";

/** The second machine, where the leaf runs. */
const FAR = "machine-sends-far";
/** What opens the leaf's brief, so the mock knows its requests. */
const LEAF = "PROBE-SENDS-LEAF";
/** What the leaf's handoff to its parent says. */
const UP = "PROBE-SENDS-UP: the ledger, from the far machine.";
const REPORT = "[Report from delegate ";
const FILE = "slope-ledger.csv";
/** What the file holds: only its bytes crossing can put it at the parent's. */
const TOKEN = `handoff-sends-${crypto.randomUUID()}`;
/** The folder the leaf hands beside the file, and how many files it holds: past the 50 that were once refused. */
const SHOAL = "shoal";
const SHOAL_FILES = 51;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** Who the leaf hands off to, and the file it hands; set once they stand. */
const plan = { parent: "", stranger: "", file: "", shoal: "" };
/** The leaf's steps done, and the answer its handoff got (at once or from the background). */
const leaf: { handoff: ToolAnswer; searched: boolean; step: number } = {
  step: 0,
  searched: false,
  handoff: new ToolAnswer(),
};

/** The leaf hands off to its parent with the file, then finishes; every other session says "ok". */
const respond = (request: Seen): Reply => {
  if (
    !(request.tools && request.all.includes(`${LEAF}:`)) ||
    request.all.includes(REPORT)
  ) {
    return text("ok");
  }
  if (leaf.step >= 1) {
    leaf.handoff.read(request);
  }
  switch (leaf.step) {
    case 0:
      leaf.step = 1;
      return useTool("mcp__cawco__handoff", {
        target: plan.parent,
        message: UP,
        inputs: [plan.file, plan.shoal],
      });
    case 1:
      if (!(
        request.toolNames.includes("mcp__cawco__finish_item") || leaf.searched
      )) {
        leaf.searched = true;
        return useTool("ToolSearch", {
          query: "select:mcp__cawco__finish_item",
          max_results: 1,
        });
      }
      leaf.step = 2;
      return useTool("mcp__cawco__finish_item", {
        headline: "Sent the ledger up.",
        summary: "Handed the ledger to my parent.",
      });
    default:
      return text("Done.");
  }
};

/** Whether a tool's answer carries `said`. */
const carries = (said: string) => (answer: ToolWords) =>
  answer.text.includes(said);

/**
 * The parent's handoff, which the hub must refuse: called again once when
 * its first answer is not the refusal looked for (a cold target is refused
 * once with the cost considerations, and the repeat goes on to the inputs).
 */
const refusedHandoff = async <const A>(
  session: ToolSession,
  expected: (answer: ToolWords) => boolean,
  args: Sending<A, ToolArgs<"handoff">>
): Promise<ToolWords> => {
  const first = await toolWords(session, "handoff", args);
  return expected(first) ? first : await toolWords(session, "handoff", args);
};
const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "handoff-sends",
  run: async (kit: Kit) => {
    const { check } = kit;
    const handoff = listRoleTools()
      .find(({ role }) => role === "delegate")
      ?.tools.find((tool) => tool.name === "handoff") as
      { inputSchema: { properties?: Record<string, unknown> } } | undefined;
    check(
      "f1: a leaf that may start nothing lists inputs on its handoff",
      handoff?.inputSchema.properties?.inputs !== undefined,
      JSON.stringify(handoff?.inputSchema.properties ?? {})
    );

    const fleet = await kit.fleet(respond);
    const home = fleet.env.HOME as string;
    await fleet.up();
    const far = await fleet.launchMachine(FAR);
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
    const project = await fleet.api((hub) =>
      hub.api.projects.post({
        name: "Handoff sends",
        machineId: MACHINE,
        cwd: fleet.sandbox,
      })
    );
    plan.parent = await fleet.spawn("claude", "Parent", fleet.sandbox, {
      projectId: project.id,
    });
    plan.stranger = await fleet.spawn("claude", "Stranger", fleet.sandbox);
    plan.file = join(far.home, FILE);
    await writeFile(plan.file, TOKEN);
    plan.shoal = join(far.home, SHOAL);
    await mkdir(plan.shoal);
    for (let at = 0; at < SHOAL_FILES; at += 1) {
      await writeFile(join(plan.shoal, `${at}.txt`), `${TOKEN}-${at}`);
    }

    const started = delegateStarted(
      await fleet.api((hub) =>
        hub.api["work-items"].post({
          parentInstanceId: plan.parent,
          title: "Send the ledger up",
          prompt: `${LEAF}: hand the ledger to your parent, then finish.`,
          harness: "claude",
          model: MODEL.claude,
          host: true,
          machineId: FAR,
        })
      )
    );
    const state = await until(
      "the leaf's item ended",
      () =>
        fleet.query<{ state: string }>(
          "SELECT state FROM work_items WHERE id = ?",
          started.workItemId
        )[0]?.state,
      (now) => now === "done" || now === "failed" || now === "cancelled",
      240_000
    ).catch(() => "unended");

    const strangerFolder = join(
      home,
      ".cawco",
      "tmp",
      `s-${plan.stranger.slice(0, 8)}`,
      "inputs",
      FILE
    );
    const refusedWords = workWords.inputsNotTheirs("X").split(";")[0] ?? "";
    const asParent = {
      base: fleet.base,
      id: plan.parent,
      credential: await fleet.sessionCredential(plan.parent),
    };
    const STRANGER_NOTE = `PROBE-SENDS-STRANGER-${crypto.randomUUID()}`;
    const toStranger = await refusedHandoff(asParent, carries(refusedWords), {
      target: plan.stranger,
      message: STRANGER_NOTE,
      inputs: [{ text: TOKEN, name: FILE }],
    });
    const strangerGot = await readFile(strangerFolder, "utf8").catch(() => "");
    check(
      "f2: a handoff with inputs to a session the sender has no relation to is refused in the inputs' words; nothing lands there and the message reaches no one",
      toStranger.refused &&
        toStranger.text.includes(refusedWords) &&
        strangerGot === "" &&
        !fleet.seen.some((one) => one.all.includes(STRANGER_NOTE)),
      `${toStranger.status} ${toStranger.text.slice(0, 400)}`
    );

    const folder = `${join(home, ".cawco", "tmp", `s-${plan.parent.slice(0, 8)}`, "inputs")}/`;
    const named = `${workWords.inputsIn(folder)}${FILE} (from ${plan.file})`;
    const message = await until(
      "the handoff at the parent",
      () =>
        fleet.seen
          .map((one) => one.all)
          .find((all) => all.includes(UP) && all.includes(named)) ?? null,
      Boolean,
      120_000
    ).catch(() => null);
    const landed = await readFile(join(folder, FILE), "utf8").catch(() => "");
    check(
      "f3: its handoff to its parent lands the far machine's file in the parent's own inputs folder on the parent's machine, and the message names it",
      message !== null && landed === TOKEN && !folder.startsWith(far.home),
      `${state}; landed ${JSON.stringify(landed.slice(0, 80))} at ${folder}; answer ${(leaf.handoff.answered?.text ?? "none").slice(0, 400)}`
    );

    const shoalAt = join(folder, SHOAL);
    const shoal = await readdir(shoalAt).catch(() => [] as string[]);
    const said = await Promise.all(
      shoal.map((name) => readFile(join(shoalAt, name), "utf8"))
    );
    const once = `${SHOAL}/ (${SHOAL_FILES} files, from ${plan.shoal})`;
    check(
      "f4: a folder past 50 files handed with a handoff lands whole in the receiver's inputs folder, and the message names it once with its count",
      shoal.length === SHOAL_FILES &&
        said.every((one) => one.startsWith(`${TOKEN}-`)) &&
        (message ?? "").includes(once) &&
        !(message ?? "").includes(`${SHOAL}/0.txt`),
      `${shoal.length} landed at ${shoalAt}; message has "${once}": ${(message ?? "").includes(once)}`
    );
  },
};

export default spec;
