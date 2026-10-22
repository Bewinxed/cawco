/**
 * A parent's handoff to a delegate that is finishing is always acted on: it
 * never joins the turn that `finish_item` ends, and the item reopens with it
 * as the delegate's next turn. On a scratch fleet (real hub, agent and
 * sessiond; Claude Code against the mock model). This spec delegates, so its
 * fleet cuts workspaces: it runs on the host, outside every boundary.
 *
 * The scripted delegate commits a file and calls finish_item; once that call
 * answers it ends its turn, whatever came with the answer, as a model told
 * "End your turn" does. The project's gate holds the landing for a few
 * seconds (`sleep 8`). Two legs, one project each:
 *
 * - A, as it calls: the parent's handoff is made, and answered, while the
 *   mock is still holding the model's reply that calls finish_item, so
 *   Claude Code has the message in its queue before the call reaches the
 *   hub. On 2026-10-18 (item 12abddd9) and 2026-10-19 (item ef7a7087) such a
 *   message joined the turn after finish_item's answer, was read after the
 *   item had landed, reopened nothing, and the delegate ended its turn on it.
 * - B, while it lands: the handoff is made once the item's row says its
 *   landing gate runs; the hub answers that it keeps it until the call
 *   answers.
 *
 * For each: the first landing is done; the first model request that carries
 * the message starts a turn with it (not after a tool's result, not words
 * read mid-turn); the item reopens on it, and the follow-up the message asks
 * for lands.
 *
 *   bun scripts/probe-kit/run.ts finish-handoff
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { declareGate } from "../gate";
import type { Kit, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const TAG = /PROBE-FINISH-SEND-([AB])/;
type Tag = "A" | "B";
/** The parent's handoff, by its mark: one more commit, then finish again. */
const again = (tag: Tag) => `PROBE-FINISH-SEND-AGAIN-${tag}`;
/** A gate that holds the landing long enough to hand off during it. */
const SLOW_GATE = "---\nsleep 8\n---\n";
/** How the hub answers a handoff it keeps while the item finishes (delegation-actions.ts). */
const FINISHING_WORDS =
  "It called finish_item, and its turn ends with that call";
const COMMIT =
  "git -c user.name=Delegate -c user.email=d@probe.test commit -qm";

interface Step {
  againFinished?: boolean;
  againSearched?: boolean;
  /** The turn that called finish_item has ended. */
  ended?: boolean;
  finished?: boolean;
  searched?: boolean;
}
const steps: Partial<Record<Tag, Step>> = {};
/** Leg A's handoff, made while the reply calling finish_item is held. */
let asItCalls: (() => Promise<void>) | undefined;

const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** A file committed in the delegate's clone, then a mark its output prints. */
const commitCommand = (name: string, mark: string) =>
  [
    `printf '%s\\n' '${name}' > ${name}.txt`,
    `git add ${name}.txt`,
    `${COMMIT} 'Delegate commit ${name}'`,
    `echo ${mark}`,
  ].join(" && ");

const finishCall = (words: string): Reply =>
  tool(FINISH, { headline: words, summary: `${words}\n\nNot run: none.` });

/** The reopened turn: commit again, finish again, then end. */
const reopened = (request: Seen, tag: Tag, step: Step): Reply => {
  if (step.againFinished) {
    return text("Landed again.");
  }
  if (!request.all.includes(`DONE-AGAIN-${tag}`)) {
    return tool("Bash", {
      command: commitCommand(`again_${tag}`, `DONE-AGAIN-${tag}`),
      description: "Commit again",
    });
  }
  if (request.toolNames.includes(FINISH)) {
    step.againFinished = true;
    return finishCall(`Committed again_${tag}.txt.`);
  }
  if (!step.againSearched && request.toolNames.includes("ToolSearch")) {
    step.againSearched = true;
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("done");
};

/**
 * Each delegate commits and finishes, and ends the turn finish_item answered
 * whatever else that answer carried; a later turn that brings the parent's
 * message commits again and finishes again.
 */
const respond = async (request: Seen): Promise<Reply> => {
  const tag = request.tools
    ? (TAG.exec(request.all)?.[1] as Tag | undefined)
    : undefined;
  if (!tag) {
    return text("ok");
  }
  steps[tag] ??= {};
  const step = steps[tag];
  if (step.ended && request.all.includes(again(tag))) {
    return reopened(request, tag, step);
  }
  if (step.finished) {
    step.ended = true;
    return text("Landed.");
  }
  if (!request.all.includes(`DONE-COMMIT-${tag}`)) {
    return tool("Bash", {
      command: commitCommand(`first_${tag}`, `DONE-COMMIT-${tag}`),
      description: "Commit",
    });
  }
  if (request.toolNames.includes(FINISH)) {
    step.finished = true;
    if (tag === "A") {
      await asItCalls?.();
    }
    return finishCall(`Committed first_${tag}.txt.`);
  }
  if (!step.searched && request.toolNames.includes("ToolSearch")) {
    step.searched = true;
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("done");
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;
type CallAsParent = (
  parent: string,
  name: string,
  args: object
) => Promise<{ status: number; text: string }>;

interface ItemRow {
  landing_since: number | null;
  state: string;
}

const itemRow = (fleet: Fleet, id: string) =>
  fleet.query<ItemRow>(
    "SELECT state, landing_since FROM work_items WHERE id = ?",
    id
  )[0];

/** A project of its own for `tag`, its parent, and the delegate it started. */
const delegated = async (fleet: Fleet, tag: Tag) => {
  const repo = join(fleet.sandbox, `code-${tag}`);
  await mkdir(repo, { recursive: true });
  await writeFile(join(repo, "README.md"), `# finish-handoff ${tag}\n`);
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env({ ...process.env, HOME: fleet.env.HOME as string })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: `Finish handoff ${tag}`,
    machineId: MACHINE,
    cwd: repo,
  });
  await declareGate(fleet.base, project.id, SLOW_GATE);
  const parent = await fleet.spawn("claude", `Parent ${tag}`, repo, {
    projectId: project.id,
  });
  const bare = join(fleet.sandbox, "hub", "git", `${project.id}.git`);
  /** The subjects on the project's main at the hub: what has landed. */
  const landed = () =>
    Bun.$`git log --format=%s main`.cwd(bare).quiet().nothrow().text();
  const started = await fleet.api<{
    instanceId: string;
    workItemId: string;
  }>("/api/work-items", {
    parentInstanceId: parent,
    title: `Commit ${tag}`,
    prompt: `PROBE-FINISH-SEND-${tag}: commit a file, then finish.`,
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: repo,
  });
  return { landed, parent, started };
};

/** One leg: hand off as the delegate finishes, then read what its next turn started with. */
const leg = async (
  kit: Kit,
  fleet: Fleet,
  tag: Tag,
  callAsParent: CallAsParent
): Promise<void> => {
  const { check } = kit;
  const label =
    tag === "A" ? "A (as it calls finish_item)" : "B (while it lands)";
  const { landed, parent, started } = await delegated(fleet, tag);
  const message = `${again(tag)}: commit one more file, then finish.`;
  let handed: { status: number; text: string } | undefined;
  const handoff = async () => {
    handed = await callAsParent(parent, "handoff", {
      target: started.instanceId,
      message,
    });
  };
  if (tag === "A") {
    asItCalls = handoff;
  } else {
    await until(
      `${label}: its landing gate runs`,
      () => itemRow(fleet, started.workItemId),
      (row) => row?.landing_since !== null && row?.landing_since !== undefined,
      300_000
    );
    await handoff();
  }
  await until(
    `${label}: the turn that called finish_item ended`,
    () => steps[tag]?.ended === true,
    (ended) => ended,
    300_000
  ).catch(() => false);
  check(
    `${label}: the handoff is taken${tag === "B" ? ", and the hub says it keeps it until finish_item answers" : ""}`,
    handed?.status === 200 &&
      (tag === "A" || (handed?.text.includes(FINISHING_WORDS) ?? false)),
    `${handed?.status} ${handed?.text.slice(0, 600)}`
  );
  const firstMain = await landed();
  check(
    `${label}: the first finish_item landed its commit on main`,
    firstMain.includes(`Delegate commit first_${tag}`),
    `main: ${firstMain.trim().split("\n").join(" | ")}`
  );
  const opened = await until(
    `${label}: a model request carried the message`,
    () => fleet.seen.find((one) => one.tools && one.all.includes(again(tag))),
    (one) => one !== undefined,
    120_000
  ).catch(() => undefined);
  check(
    `${label}: the first request that carries the message starts the delegate's next turn with it (not after finish_item's answer, not words read mid-turn)`,
    opened !== undefined &&
      !opened.afterTool &&
      !opened.lastMidTurn &&
      opened.last.includes(message),
    opened
      ? `afterTool ${opened.afterTool}, midTurn ${opened.lastMidTurn}, last: ${opened.last.slice(0, 400)}`
      : "no request carried it: the delegate never read it"
  );
  const second = await until(
    `${label}: the reopened item landed its follow-up`,
    () => itemRow(fleet, started.workItemId),
    (row) => steps[tag]?.againFinished === true && row?.state === "done",
    opened ? 300_000 : 30_000
  ).catch(() => itemRow(fleet, started.workItemId));
  const secondMain = await landed();
  check(
    `${label}: the item reopens on the message, and the follow-up it asks for lands on main`,
    second?.state === "done" &&
      steps[tag]?.againFinished === true &&
      secondMain.includes(`Delegate commit again_${tag}`),
    `${second?.state}; main: ${secondMain.trim().split("\n").join(" | ")}`
  );
};

const run = async (kit: Kit) => {
  for (const tag of Object.keys(steps) as Tag[]) {
    delete steps[tag];
  }
  asItCalls = undefined;
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await writeFile(
    join(fleet.env.HOME as string, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  const credentials = new Map<string, string>();
  const callAsParent: CallAsParent = async (parent, name, args) => {
    let credential = credentials.get(parent);
    if (credential === undefined) {
      credential =
        (
          await Bun.file(
            `/proc/${await fleet.sessionPid(parent)}/environ`
          ).text()
        )
          .split("\0")
          .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
          ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? "";
      credentials.set(parent, credential);
    }
    const said = await toolWords(
      { base: fleet.base, id: parent, credential },
      name,
      args as Record<string, unknown>,
      { timeoutMs: 60_000 }
    );
    return { status: said.status, text: said.text };
  };
  await leg(kit, fleet, "A", callAsParent);
  await leg(kit, fleet, "B", callAsParent);
};

export default {
  name: "finish-handoff",
  host: "it delegates, so its fleet cuts workspaces",
  run,
} satisfies Spec;
