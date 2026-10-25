/**
 * A Claude session that runs a manual `/compact` gets a new Claude Code
 * process before its next one, so no compaction writes the conversation's
 * rows a second time (agent `#askCompactRelaunch`, hub `relaunchAtRest`,
 * core `COMPACT_RELAUNCH`). On a scratch fleet (real hub, agent and
 * sessiond; the real Claude Code CLI against the mock model), one session:
 * a turn that runs a Bash command, a second turn, `/compact`, two turns,
 * `/compact`, one more turn.
 *
 * Asserted:
 * 1. after each `/compact` the session's process is replaced (sessiond holds
 *    a new pid for it) and the hub said it relaunched it for its compaction;
 * 2. every turn after a relaunch is answered on the conversation it had: the
 *    mock reads each prompt, and the session's turn closes;
 * 3. the session's `.jsonl` holds two compaction boundaries and no uuid twice.
 *
 * In one process, Claude Code 2.1.309's second `/compact` writes every row
 * before the first boundary again (anthropics/claude-code#92089; 19 rows in a
 * probe session of the same steps).
 *
 *   bun scripts/probe-kit/run.ts compact-relaunch
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import type { KitFleet, Spec } from "../kit";

const MARK = "COMPACT-RELAUNCH";
/** What the mock's summary is, for every `/compact`. */
const SUMMARY = "<summary>The probe's conversation so far.</summary>";

/** Whether `request` is Claude Code's summary request of a `/compact`: its instruction, as 2.1.309 words it. */
const summarising = (request: Seen): boolean =>
  request.last.includes(
    "Your task is to create a detailed summary of the conversation so far"
  );

const respond = (request: Seen): Reply => {
  if (summarising(request)) {
    return { everyMs: 5, words: [SUMMARY] };
  }
  if (!request.tools) {
    return { everyMs: 5, words: ["Probe title"] };
  }
  if (request.last.includes(`${MARK}-TOOL`) && !request.afterTool) {
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: { command: "echo probe", description: "Say probe" },
      },
    };
  }
  return { everyMs: 5, words: ["ok"] };
};

/** `words` sent to `id`, read by the mock, and its turn closed. */
const turn = async (fleet: KitFleet, id: string, words: string) => {
  const since = Date.now();
  await fleet.send(id, words);
  await until(
    `"${words}" answered`,
    () =>
      fleet.seen.some(
        (one) =>
          one.at > since &&
          (words.startsWith("/compact")
            ? summarising(one)
            : one.last.includes(words))
      ) && fleet.instance(id)?.turn_open_at === null
        ? true
        : undefined,
    Boolean,
    120_000
  );
};

/** The pid sessiond holds for `id`'s CLI, once it holds one other than `not`. */
const pidOf = async (fleet: KitFleet, id: string, not?: number) =>
  Number(
    await until(
      not === undefined
        ? "sessiond holding the session's CLI"
        : `a new CLI for the session in place of pid ${not}`,
      () => fleet.sessionPid(id),
      (pid) => pid !== undefined && Number(pid) !== not,
      90_000
    )
  );

const spec: Spec = {
  name: "compact-relaunch",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const id = await fleet.spawn("claude", "compact relaunch", fleet.workdir);
    await turn(fleet, id, `${MARK}-TOOL: run a command`);
    await turn(fleet, id, `${MARK} one`);
    const pids = [await pidOf(fleet, id)];
    const hubAt = await fleet.logMark("hub");

    /** `/compact` number `round`: a new process after it, then a turn of each of `after` answered on it. */
    const compactRound = async (round: number, after: string[]) => {
      await turn(fleet, id, "/compact");
      const before = pids.at(-1);
      const next = await pidOf(fleet, id, before);
      pids.push(next);
      check(
        `after /compact ${round}, the session runs in a new Claude Code process`,
        next !== before,
        `pid ${before} → ${next}`
      );
      const said = await until(
        `the hub's word on relaunch ${round}`,
        async () => {
          const lines = (await hubAt.since())
            .split("\n")
            .filter((line) =>
              line.includes(`[hub] compact: relaunching ${id}`)
            );
          return lines.length >= round ? lines : undefined;
        },
        Boolean,
        30_000
      );
      check(
        `the hub relaunched it for its compaction (${round})`,
        said.length >= round,
        said.at(-1) ?? "none"
      );
      await after.reduce(async (prior, n) => {
        await prior;
        const words = `${MARK} ${n}`;
        await turn(fleet, id, words);
        check(
          `"${words}" is answered after relaunch ${round}`,
          fleet.instance(id)?.status === "running",
          `row ${fleet.instance(id)?.status}`
        );
      }, Promise.resolve());
    };
    await compactRound(1, ["two", "three"]);
    await compactRound(2, ["four"]);

    const [row] = fleet.query<{ session_id: string | null }>(
      "SELECT session_id FROM instances WHERE id = ?",
      id
    );
    const sessionId = row?.session_id ?? "";
    const [path] = await Array.fromAsync(
      new Bun.Glob(`**/projects/*/${sessionId}.jsonl`).scan({
        cwd: fleet.home,
        dot: true,
        absolute: true,
      })
    );
    check("the session's transcript is found", !!path, sessionId);
    const rows = (await readFile(path ?? join(fleet.home, "none"), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map(
        (line) =>
          JSON.parse(line) as { subtype?: string; type?: string; uuid?: string }
      );
    const seen = new Set<string>();
    const twice: string[] = [];
    for (const one of rows) {
      if (!one.uuid) {
        continue;
      }
      if (seen.has(one.uuid)) {
        twice.push(`${one.type}${one.subtype ? `/${one.subtype}` : ""}`);
      } else {
        seen.add(one.uuid);
      }
    }
    const boundaries = rows.filter(
      (one) => one.subtype === "compact_boundary"
    ).length;
    kit.note(
      `${rows.length} rows, ${seen.size} uuids, ${boundaries} boundaries, pids ${pids.join(" → ")}`
    );
    check(
      "the transcript holds both compactions",
      boundaries === 2,
      `${boundaries} compact_boundary rows`
    );
    check(
      "no uuid is written twice",
      twice.length === 0,
      twice.length === 0 ? "none" : `${twice.length}: ${twice.join(", ")}`
    );
    await fleet.stopSession(id);
  },
};

export default spec;
