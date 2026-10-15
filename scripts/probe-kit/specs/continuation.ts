/**
 * What "continue in new session" carries, read from the opening the hub
 * hands the new session (`/api/continuations/:id/outcome`). On a scratch
 * fleet (real hub, agent and sessiond; Claude Code against the mock model),
 * one session is driven through:
 *
 * - one turn of shell commands whose text holds `=>`, `===` and `>` inside
 *   quoted JS and commit messages (never a redirect), then
 *   {@link WRITES} files written with the Write tool;
 * - a hand-off (a message that opens with cawco's hand-off marker: another
 *   agent's words, not the person's);
 * - the person's further asks, one turn each, so a summary has a middle to
 *   read.
 *
 * Then:
 * 1. continued from a summary: the artifact index lists only files the edit
 *   tools wrote (none of the words after a `>` in a command), and at most
 *   {@link FILES_SHOWN} of them, the newest;
 * 2. continued from the person's asks: the sizing route counts them and has
 *   nothing to summarise, no summariser runs, and the opening holds exactly
 *   the person's messages, verbatim and in order, under one heading each:
 *   no hand-off, no answer of the agent's, no summary.
 *
 *   bun scripts/probe-kit/run.ts continuation
 */
import { join } from "node:path";
import { handoffMarker } from "../../../packages/core/src/injected";
import { askHeading } from "../../../packages/hub/src/continuation";
import { MODEL, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** Files the first turn writes with the Write tool: more than the index shows. */
const WRITES = 32;
/** How many changed files the artifact index shows (hub continuation.ts). */
const FILES_SHOWN = 30;

/**
 * Commands whose text the old shell-redirect parsing read as writes: an
 * arrow function (`x.getAttribute`), a `>` in a commit message (`the`,
 * `in`), a number after `>` in inline JS (`3*3600e3`).
 */
const COMMANDS = [
  `echo "if (a === b) [1].map((x) => x.getAttribute('id'))"`,
  `git -c user.email=p@p -c user.name=p commit -q --allow-empty -m "keeps a > the b and c >in d" || true`,
  `echo 'const ok = Date.now() - t >3*3600e3 && n === 2'`,
];
/** Words the old parsing made files of, from {@link COMMANDS}. */
const BOGUS = ["x.getAttribute", "the", "in", "3*3600e3"];

/** The person's asks after the first, one turn each. */
const LATER_ASKS = [
  "ASK-THREE: now tidy the release notes",
  "ASK-FOUR: keep this verbatim,\n  indented `code` > arrow === same\n\nand a blank line above",
  "ASK-FIVE: check the build",
  "ASK-SIX: and the lint",
  "ASK-SEVEN: open a pull request",
  "ASK-EIGHT: tell me when it is done",
];
const FIRST_ASK = "ASK-ONE: run the release commands and write the files";
const HANDOFF = `${handoffMarker("other-session", "1234abcd")}HANDOFF-MARK: an agent's brief, not the person's`;
const SUMMARY = "SUMMARY-MARK: the summariser's words";
const ASK = /ASK-[A-Z]+/;
/** A file line of the artifact index: `- <path> (<n>×)`. */
const BULLET = /^- /;
const TOUCHES = / \(\d+×\)$/;

/** Where the session runs: set once the fleet is up, read by the mock. */
let workdir = "";
/** The first turn's final answer went out. */
let firstDone = false;

const words = (text: string): Reply => ({ everyMs: 5, words: [text] });

/** The first turn's tool calls, in order: the commands, then the writes. */
const steps = (): { name: string; input: object }[] => [
  ...COMMANDS.map((command) => ({
    name: "Bash",
    input: { command, description: "A release step" },
  })),
  ...Array.from({ length: WRITES }, (_, at) => ({
    name: "Write",
    input: {
      file_path: join(workdir, `written-${String(at).padStart(2, "0")}.txt`),
      content: `file ${at}\n`,
    },
  })),
];

/** How many tool results a request carries: the first turn's progress. */
const toolResults = (request: Seen): number =>
  request.body.split('"tool_result"').length - 1;

const respond = (request: Seen): Reply => {
  if (request.all.includes("<transcript>")) {
    return words(SUMMARY);
  }
  if (!request.tools) {
    return words("Probe title");
  }
  // A continuation's new session, opened on what it carries.
  if (
    request.all.includes("Continuing session") ||
    request.all.includes("Restarting session")
  ) {
    return words("TARGET-OK");
  }
  if (request.afterTool) {
    const done = toolResults(request);
    const all = steps();
    if (done < all.length) {
      return { everyMs: 5, words: [], tool: all[done] };
    }
    firstDone = true;
    return words("AGENT-SAID-ONE: every step ran");
  }
  if (request.last.includes(FIRST_ASK)) {
    return { everyMs: 5, words: [], tool: steps()[0] };
  }
  if (request.last.includes("HANDOFF-MARK")) {
    return words("AGENT-SAID-HANDOFF");
  }
  return words(`AGENT-SAID-${ASK.exec(request.last)?.[0] ?? "OTHER"}`);
};

/** The lines of one `### ` section of the artifact index. */
const section = (opening: string, title: string): string[] => {
  const lines = opening.split("\n");
  const at = lines.findIndex((line) => line.startsWith(`### ${title}`));
  if (at < 0) {
    return [];
  }
  const end = lines.findIndex(
    (line, i) => i > at && (line.startsWith("#") || line === "")
  );
  return lines.slice(at + 1, end < 0 ? undefined : end);
};

interface Outcome {
  opening: string;
  summariserInstanceId: string | null;
  summary: string | null;
  targetInstanceId: string;
}

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  ({ workdir } = fleet);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const id = await fleet.spawn("claude", "Continuation probe");
  /** Sends `text` and waits for the turn it starts to end, answered. */
  const turn = async (text: string, answered: () => boolean) => {
    const sentAt = Date.now();
    await fleet.send(id, text);
    await until(
      `the turn on "${text.slice(0, 40)}" answered`,
      () => fleet.seen.some((one) => one.at >= sentAt) && answered(),
      Boolean,
      240_000
    );
    await until(
      `the turn on "${text.slice(0, 40)}" ended`,
      () => fleet.instance(id),
      (row) => row?.turn_open_at === null,
      60_000
    );
  };
  await turn(FIRST_ASK, () => firstDone);
  await turn(HANDOFF, () =>
    fleet.seen.some((one) => one.last.includes("HANDOFF-MARK"))
  );
  for (const ask of LATER_ASKS) {
    const mark = ASK.exec(ask)?.[0] ?? ask;
    // biome-ignore lint/performance/noAwaitInLoops: one turn after another, as the person sends them
    await turn(ask, () => fleet.seen.some((one) => one.last.includes(mark)));
  }

  /** Starts a continuation and waits for the hub's report of what it carried. */
  const continued = async (from: object): Promise<Outcome> => {
    const { continuationId } = await fleet.api<{ continuationId: string }>(
      `/api/instances/${id}/continue`,
      {
        target: { harness: "claude", model: MODEL.claude },
        ...from,
      }
    );
    const response = await fetch(
      `${fleet.base}/api/continuations/${continuationId}/outcome`,
      { signal: AbortSignal.timeout(300_000) }
    );
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `continuation ${continuationId}: ${response.status} ${text}`
      );
    }
    return JSON.parse(text) as Outcome;
  };

  // ── 1. from a summary ───────────────────────────────────────────────────
  const summarised = await continued({
    summarizer: { harness: "claude", model: MODEL.claude },
  });
  const changed = section(summarised.opening, "Files changed");
  const written = Array.from({ length: WRITES }, (_, at) =>
    join(workdir, `written-${String(at).padStart(2, "0")}.txt`)
  );
  const listed = changed.map((line) =>
    line.replace(BULLET, "").replace(TOUCHES, "")
  );
  kit.check(
    "1: the summary ran and the opening carries it",
    summarised.summariserInstanceId !== null &&
      summarised.opening.includes(SUMMARY),
    summarised.summary?.slice(0, 200) ?? "no summary"
  );
  kit.check(
    "1: the commands are listed as commands",
    COMMANDS.every((command) =>
      section(summarised.opening, "Commands run").some((line) =>
        line.includes(command.slice(0, 40))
      )
    ),
    section(summarised.opening, "Commands run").join(" | ").slice(0, 600)
  );
  const bogus = listed.filter((path) => !written.includes(path));
  kit.check(
    "1: files changed lists only files an edit tool wrote: none of `=>`, `===` or a commit message's `>`",
    bogus.length === 0 &&
      !BOGUS.some((word) => listed.some((path) => path.endsWith(word))),
    bogus.length ? `bogus: ${bogus.join(", ")}` : `${listed.length} listed`
  );
  kit.check(
    `1: files changed is capped at the ${FILES_SHOWN} newest of ${WRITES}`,
    listed.length === FILES_SHOWN &&
      listed.join("\n") === written.slice(-FILES_SHOWN).reverse().join("\n"),
    `${listed.length} listed, first ${listed[0]}, last ${listed.at(-1)}`
  );

  // ── 2. from the person's asks ───────────────────────────────────────────
  const asks = [FIRST_ASK, ...LATER_ASKS];
  const sized = await fleet.api<{ asks: number; summariseInputTokens: number }>(
    `/api/instances/${id}/continue?asks=1`
  );
  kit.check(
    "2: sized as a restart from the asks: their count, nothing to summarise",
    sized.asks === asks.length && sized.summariseInputTokens === 0,
    JSON.stringify(sized)
  );
  const restarted = await continued({ asksOnly: true });
  kit.check(
    "2: no summariser ran",
    restarted.summariserInstanceId === null && restarted.summary === null,
    String(restarted.summariserInstanceId)
  );
  const [, ...body] = restarted.opening.split("\n");
  const expected = asks
    .flatMap((ask, at) => ["", askHeading(at), ask])
    .join("\n");
  kit.check(
    "2: the opening holds exactly the person's messages, verbatim and in order",
    body.join("\n") === expected,
    `got:\n${body.join("\n").slice(0, 1200)}`
  );
  kit.check(
    "2: none of the agent's words, the hand-off or the summary",
    !(
      restarted.opening.includes("AGENT-SAID") ||
      restarted.opening.includes("HANDOFF-MARK") ||
      restarted.opening.includes("SUMMARY-MARK")
    )
  );
  const opened = await until(
    "2: the new session's first request",
    () =>
      fleet.seen.find(
        (one) =>
          one.tools &&
          one.all.includes("Restarting session") &&
          one.all.includes(LATER_ASKS.at(-1) ?? "")
      ),
    Boolean,
    120_000
  ).catch(() => undefined);
  kit.check(
    "2: the new session was opened on it",
    opened !== undefined && !opened.all.includes("AGENT-SAID")
  );
};

export default { name: "continuation", run } satisfies Spec;
