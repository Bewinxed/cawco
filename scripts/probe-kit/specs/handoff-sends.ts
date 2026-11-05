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
 * - f4. Its parent's handoff to it with inputs past the count limit is
 *   refused in the limit's words, naming the limit.
 *
 *   bun scripts/probe-kit/run.ts handoff-sends
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { INPUTS_COUNT_LIMIT } from "../../../packages/core/src/harness";
import { workWords } from "../../../packages/core/src/index";
import { listRoleTools } from "../../../packages/hub/src/role-budgets";
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
import type { Kit, Spec } from "../kit";

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

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** Who the leaf hands off to, and the file it hands; set once they stand. */
const plan = { parent: "", stranger: "", file: "" };
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
        inputs: [plan.file],
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
const refusedHandoff = async (
  session: ToolSession,
  expected: (answer: ToolWords) => boolean,
  args: Record<string, unknown>
): Promise<ToolWords> => {
  const first = await toolWords(session, "handoff", args);
  return expected(first) ? first : await toolWords(session, "handoff", args);
};

interface Started {
  instanceId: string;
  workItemId: string;
}

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
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
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
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Handoff sends",
      machineId: MACHINE,
      cwd: fleet.sandbox,
    });
    plan.parent = await fleet.spawn("claude", "Parent", fleet.sandbox, {
      projectId: project.id,
    });
    plan.stranger = await fleet.spawn("claude", "Stranger", fleet.sandbox);
    plan.file = join(far.home, FILE);
    await writeFile(plan.file, TOKEN);

    const started = await fleet.api<Started>("/api/work-items", {
      parentInstanceId: plan.parent,
      title: "Send the ledger up",
      prompt: `${LEAF}: hand the ledger to your parent, then finish.`,
      harness: "claude",
      model: MODEL.claude,
      host: true,
      machineId: FAR,
    });
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

    const many = Array.from(
      { length: INPUTS_COUNT_LIMIT + 1 },
      (_, at) => `/nowhere/${at}`
    );
    const limitWords = workWords.inputsLimits.entries(
      many.length,
      INPUTS_COUNT_LIMIT
    );
    const over = await refusedHandoff(asParent, carries(limitWords), {
      target: started.instanceId,
      message: "PROBE-SENDS-OVER: too many.",
      inputs: many,
    });
    check(
      "f4: a handoff with inputs past the count limit is refused in the limit's words, naming it",
      over.refused && over.text.includes(limitWords),
      `${over.status} ${over.text.slice(0, 400)}`
    );
  },
};

export default spec;
