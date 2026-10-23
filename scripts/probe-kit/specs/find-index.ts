/**
 * `find` reads what the machines' transcript indexes hold, never a session's
 * stored transcript (hub find-tool.ts), on a scratch fleet (real hub, agent
 * and sessiond; Claude Code against the mock model).
 *
 * Seeded: a session where the person types a sentence of their own, with a
 * made-up password in it far from the word "password"; a second session
 * handed the hub's summariser prompt (hub continuation.ts
 * `summariserPrompt`) that quotes the same sentence. Then the first
 * session's stored transcript loses the person's turn (its line cut out, as
 * a compaction or an account move leaves a transcript), and the machine's
 * agent restarts.
 *
 * a. `find` with `by: "person"` answers the person's turn as its top hit,
 *    its words shown, and the summariser's prompt is no
 *    hit of the person's; without `by`, the person's turn ranks above it.
 * b. The password in that turn comes back [redacted] in the hit and in
 *    `around`, which reads the turn from the index: the turn is the centre.
 * c. After the agent's restart the machine says nothing of indexing (no
 *    "catching up", no "indexed through") within {@link INDEXED_WITHIN_MS}.
 *
 *   bun scripts/probe-kit/run.ts find-index
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { toolRecord } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** A made-up password, password-shaped (secret-filter.ts `passwordShaped`): never a real one. */
const PASSWORD = "Wm4$kTq8Rz";
const WORDS = "heron slot pool";
const MARK = "PROBE-IDX-MINE";
/** The person's words: the password more than 16 words past "password", outside an index snippet's window. */
const MINE = `${MARK} we literally retired the ${WORDS} yesterday; my password for the build box that we set up last spring on the shared rack beside the old printer near the window is ${PASSWORD} until the ${WORDS} returns.`;
/** The hub's summariser prompt, its opening as continuation.ts writes it, quoting the person's words. */
const SUMMARISER = `Below is the transcript of a coding-agent session, up to its last few turns. Old tool output is hidden; failed calls keep the head of their error. A section labelled as compacted by the source session is that session's own earlier summary.\n\n<transcript>\nperson: ${MINE}\n</transcript>\n\nUse no tools. Reply only with the summary.`;
/** How long the machine may take, from its agent's restart, to answer without a word of indexing. */
const INDEXED_WITHIN_MS = 30_000;
/** How long the machine's index may take to hold a turn. */
const HELD_MS = 120_000;

interface Hit {
  excerpt?: string;
  id: string;
  ref?: string;
  who?: string;
}
interface Answer {
  hits?: Hit[];
  turns?: { here?: true; text: string; who: string }[];
  unsearched?: string[];
}

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.last.includes(MARK) ? "Noted." : "ok"],
});

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
  const cwd = join(fleet.workdir, "find-index");
  await mkdir(cwd, { recursive: true });
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Find index probe",
    machineId: MACHINE,
    cwd,
    caw: false,
  });
  /** A session in the project, its credential read from its process. */
  const session = async (title: string) => {
    const id = await fleet.spawn("claude", title, cwd, {
      projectId: project.id,
    });
    const environ = await Bun.file(
      `/proc/${await fleet.sessionPid(id)}/environ`
    ).text();
    const credential =
      environ
        .split("\0")
        .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
        ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? "";
    return { id, credential };
  };
  /** One session's words, answered and its turn closed. */
  const say = async (id: string, words: string) => {
    await fleet.send(id, words);
    await until(
      `the reply to ${words.slice(0, 30)}`,
      () =>
        fleet.seen.some((request) =>
          request.last.includes(words.slice(0, 60))
        ) && fleet.instance(id)?.turn_open_at === null,
      Boolean,
      60_000
    ).catch(() => false);
  };
  const talker = await session("Heron log");
  const summariser = await session("Summary stand-in");
  const asker = await session("Asker");
  await say(talker.id, MINE);
  await say(summariser.id, SUMMARISER);
  const find = async (args: Record<string, unknown>) => {
    const read = await toolRecord<Answer>(
      { base: fleet.base, id: asker.id, credential: asker.credential },
      "find",
      args
    );
    return read.refused
      ? { text: read.text, answer: {} as Answer }
      : { text: read.text, answer: read.record };
  };
  const everyone = () => find({ query: WORDS, project: "all", limit: 20 });
  const held = await until(
    "both sessions' turns in the machine's index",
    everyone,
    ({ answer }) =>
      [talker.id, summariser.id].every((id) =>
        (answer.hits ?? []).some((hit) => hit.id === id && hit.ref)
      ),
    HELD_MS
  ).catch(() => undefined);
  kit.check(
    `the machine's index holds both turns within ${HELD_MS / 1000} s`,
    held !== undefined,
    held ? held.text.slice(0, 900) : (await everyone()).text.slice(0, 900)
  );

  // The person's turn, gone from the stored transcript.
  const [row] = fleet.query<{ session_id: string | null }>(
    "SELECT session_id FROM instances WHERE id = ?",
    talker.id
  );
  const glob = new Bun.Glob(`**/${row?.session_id ?? "none"}.jsonl`);
  const files = await Array.fromAsync(
    glob.scan({ cwd: fleet.home, dot: true, absolute: true })
  );
  for (const file of files) {
    // biome-ignore lint/performance/noAwaitInLoops: one transcript, rewritten whole
    const lines = (await readFile(file, "utf8")).split("\n");
    await writeFile(
      file,
      lines.filter((line) => !line.includes(MARK)).join("\n")
    );
  }
  const left = await Promise.all(files.map((file) => readFile(file, "utf8")));
  kit.check(
    "the person's turn is gone from the session's stored transcript",
    files.length > 0 && left.every((text) => !text.includes(MARK)),
    `${files.length} transcript file(s): ${files.join(", ")}`
  );

  // The agent restarts.
  await fleet.stop("agent");
  const restarted = Date.now();
  fleet.launch("agent");
  await fleet.agentUp();
  const whole = await until(
    "the machine answering with nothing said of its index",
    everyone,
    ({ answer }) =>
      answer.unsearched === undefined &&
      (answer.hits ?? []).some((hit) => hit.id === talker.id),
    INDEXED_WITHIN_MS
  ).catch(() => undefined);
  const tookS = Math.round((Date.now() - restarted) / 100) / 10;
  kit.check(
    `c: after its agent restarts, the machine says nothing of indexing within ${INDEXED_WITHIN_MS / 1000} s`,
    whole !== undefined,
    whole
      ? `answered whole ${tookS} s after the restart`
      : (await everyone()).text.slice(0, 900)
  );

  const mine = await find({ query: WORDS, by: "person", project: "all" });
  const hits = mine.answer.hits ?? [];
  const [top] = hits;
  kit.check(
    "a: by person, the person's turn is the top hit with its words, and the summariser's prompt is no hit of theirs",
    top?.id === talker.id &&
      top.who === "person" &&
      (top.excerpt ?? "").replace(/[「」]/g, "").includes(`the ${WORDS}`) &&
      !hits.some((hit) => hit.id === summariser.id),
    mine.text.slice(0, 1200)
  );
  const all = (await everyone()).answer.hits ?? [];
  const at = (id: string) => all.findIndex((hit) => hit.id === id);
  kit.check(
    "a: without by, the person's turn ranks above the summariser's prompt",
    at(talker.id) >= 0 && at(talker.id) < at(summariser.id),
    JSON.stringify(all.map((hit) => [hit.id, hit.who])).slice(0, 900)
  );
  const around = top?.ref ? await find({ around: top.ref }) : undefined;
  const here = around?.answer.turns?.find((turn) => turn.here);
  kit.check(
    "b: the password comes back [redacted] in the hit and in around, which reads the turn from the index",
    Boolean(top?.excerpt?.includes("[redacted]")) &&
      !mine.text.includes(PASSWORD) &&
      Boolean(here?.text.includes(`retired the ${WORDS}`)) &&
      Boolean(here?.text.includes("[redacted]")) &&
      !around?.text.includes(PASSWORD),
    `hit: ${top?.excerpt}\naround: ${around?.text.slice(0, 900)}`
  );
};

export default { name: "find-index", run } satisfies Spec;
