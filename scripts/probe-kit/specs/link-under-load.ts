/**
 * A machine's link to the hub stays up while it makes workspaces and their
 * items finish under load, and a link that does drop loses no request (agent
 * daemon.ts, the link's deadline; core wire.ts, the outbox's lanes and stall
 * clock; hub work-items.ts `handIn`, server.ts `resendHeld`; agent
 * request-record.ts). On a scratch fleet (real hub, two machines' agents and
 * sessionds; Claude Code against the mock model). This spec delegates, so
 * its fleet cuts workspaces: it runs on the host, outside every boundary.
 *
 * The load is the one that dropped obelisk's link on 2026-10-19: a conductor
 * delegating lanes at once, each with 14 inputs, about 48 MiB of
 * incompressible files a lane. Half the lanes run on the parent's own
 * machine, where its agent copies their inputs itself; half on a second
 * machine, whose inputs are read on the parent's machine and written on
 * its own, so both machines' links carry well over 15 s of sending. The
 * second machine reaches the hub through the kit's relay (relay.ts), which
 * cuts its link once its first lane's inputs are in, and lets it back 3 s
 * later.
 *
 * - Every delegate call is answered with its workspace, each well inside
 *   the caller's 30 s, the cut lanes' too.
 * - Every lane reads its 14 inputs and calls finish_item; every item is done.
 * - The parent's machine never drops its link: no "hub link silent", no
 *   close for falling behind, one register all run.
 * - The cut machine comes back, and the requests held for it go again under
 *   their own ids; none fails as the machine away ("whether it ran is not
 *   known", "Completion is unknown").
 * - The hub's reads of the machines meet their deadlines under the load:
 *   no "did not answer within", no "didn't answer within".
 * - No request through the second machine's link is cut for waiting on the
 *   hub (relay.ts `idleCuts`): the relay stood in for that link with Bun's
 *   10 s idle timeout, and every run ended "Bun.serve() timed out a request
 *   after 10 seconds" (r60 to r77).
 *
 *   bun scripts/probe-kit/run.ts link-under-load
 */
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  delay,
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";
import { relay } from "../relay";

const TAG = "PROBE-LINK-LOAD";
const FINISH = "mcp__cawco__finish_item";
/** The second machine, which reaches the hub through the relay. */
const OTHER = "link-load-other";
/** Lanes delegated at once. Our choice: a conductor's burst, as on obelisk. */
const LANES = 16;
/** Inputs per lane, as each of obelisk's lanes was handed. */
const INPUTS = 14;
/** Bytes per input: 14 of them come to about 48 MiB, under the 64 MiB a delegation carries. */
const INPUT_BYTES = Math.floor((48 * 1024 * 1024) / INPUTS / 4) * 3;
/** How long the second machine's link stays cut. */
const CUT_MS = 3000;
/** How each lane's brief names it, and nothing else does. */
const LANE = new RegExp(`${TAG} lane-(\\d+): count your inputs`, "u");
/** What a dropped link leaves in an agent's log. */
const DROPS = ["hub link silent", "fell behind", "not reading"];
/** What a request failed for its machine being away says (hub server.ts `MACHINE_DISCONNECTED`), then and before. */
const AWAY = ["whether it ran is not known", "Completion is unknown"];
/** What a hub's read that missed its deadline says. */
const LATE = ["did not answer within", "didn't answer within"];
/** What the hub says as it sends held requests again (server.ts `resendHeld`). */
const RESENT = "request(s) held for it sent again under their own ids";

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** Where each lane is: 0 counts its inputs, 1 finishes, 2 has called finish_item. */
const stages = new Map<string, number>();
/** finish_item calls each lane made. */
const finishes = new Map<string, number>();
/** How often a lane calls finish_item while it answers an error. Ours: a model tries again, not forever. */
const FINISH_TRIES = 5;

/** A lane's finish_item call. */
const finish = (lane: string): Reply => {
  finishes.set(lane, (finishes.get(lane) ?? 0) + 1);
  const headline = `Lane ${lane} counted its inputs.`;
  return useTool(FINISH, {
    headline,
    summary: `${headline}\n\n\`ls "$TMPDIR/inputs" | wc -l\` listed them.`,
  });
};

/**
 * A lane counts its inputs, loads finish_item and calls it, and calls it
 * again while it answers an error, as a model does; the parent and every
 * later turn answer "ok".
 */
const respond = (request: Seen): Reply => {
  const lane = request.tools ? LANE.exec(request.all)?.[1] : undefined;
  if (lane === undefined) {
    return text("ok");
  }
  const stage = stages.get(lane) ?? 0;
  if (stage === 0) {
    stages.set(lane, 1);
    return useTool("Bash", {
      command: 'ls "$TMPDIR/inputs" | wc -l',
      description: "Count the inputs",
    });
  }
  if (stage === 1) {
    if (!request.toolNames.includes(FINISH)) {
      return request.toolNames.includes("ToolSearch")
        ? useTool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 })
        : text(`${FINISH} is not offered`);
    }
    stages.set(lane, 2);
    return finish(lane);
  }
  if (
    request.afterTool &&
    request.toolFailed &&
    (finishes.get(lane) ?? 0) < FINISH_TRIES
  ) {
    return finish(lane);
  }
  return text("ok");
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;
type Other = Awaited<ReturnType<Fleet["launchMachine"]>>;

/**
 * The fleet up with its second machine behind the relay, a repository in a
 * project with a place on each machine, and its parent session running.
 */
const setUp = async (kit: Kit) => {
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
  const between = relay(fleet.base);
  const other = await fleet.launchMachine(OTHER, {
    CAWCO_HUB_URL: `${between.url.replace("http", "ws")}/ws`,
  });
  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`sh -c ${"git init -q -b main && echo load > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Link under load",
    machineId: MACHINE,
    cwd: src,
  });
  await fleet.api(`/api/projects/${project.id}/places`, {
    machineId: OTHER,
    path: src,
  });
  const parent = await fleet.spawn("claude", "Parent", src, {
    projectId: project.id,
  });
  return { fleet, between, other, parent, src };
};

/** Each lane's inputs: random bytes as base64 text, which no deflate shrinks. */
const writeInputs = async (dir: string): Promise<string[][]> => {
  await mkdir(dir, { recursive: true });
  const lanes: string[][] = [];
  for (let lane = 0; lane < LANES; lane += 1) {
    const paths: string[] = [];
    for (let input = 0; input < INPUTS; input += 1) {
      const path = join(dir, `lane-${lane}-input-${input}.txt`);
      await writeFile(path, randomBytes(INPUT_BYTES).toString("base64"));
      paths.push(path);
    }
    lanes.push(paths);
  }
  return lanes;
};

const count = (log: string, needle: string): number =>
  log.split(needle).length - 1;

/** The lines of `log` that say any of `needles`. */
const saying = (log: string, needles: string[]): string[] =>
  log.split("\n").filter((line) => needles.some((one) => line.includes(one)));

/**
 * Cuts the second machine's link once its first lane's inputs are in, while
 * the rest are on their way, and lets it back {@link CUT_MS} later. Answers
 * whether it cut.
 */
const cutMidLoad = async (
  between: ReturnType<typeof relay>,
  other: Other
): Promise<boolean> => {
  const inputsIn = await until(
    "the second machine's first lane's inputs are in",
    async () => (await other.logs()).includes("input(s) written") || undefined,
    Boolean,
    300_000
  ).catch(() => undefined);
  if (!inputsIn) {
    return false;
  }
  between.cut();
  await delay(CUT_MS);
  between.release();
  return true;
};

const spec: Spec = {
  group: "Speed",
  name: "link-under-load",
  host: "it delegates, so its fleet cuts workspaces",
  run: async (kit: Kit) => {
    const { check } = kit;
    const { fleet, between, other, parent, src } = await setUp(kit);
    const before = {
      agent: await fleet.logMark("agent"),
      hub: await fleet.logMark("hub"),
      other: await other.logMark(),
    };
    const inputs = await writeInputs(join(fleet.sandbox, "parent-files"));

    const startedAt = Date.now();
    const calls = Promise.allSettled(
      inputs.map((paths, lane) =>
        fleet
          .api<{ workItemId: string }>("/api/work-items", {
            parentInstanceId: parent,
            title: `Link load ${lane}`,
            prompt: `${TAG} lane-${lane}: count your inputs, then finish.`,
            harness: "claude",
            model: "claude-haiku-4-5",
            cwd: src,
            lands: "none",
            inputs: paths,
            ...(lane % 2 === 1 ? { machineId: OTHER } : {}),
          })
          .then((started) => ({
            started,
            seconds: Math.round((Date.now() - startedAt) / 1000),
          }))
      )
    );
    const cut = await cutMidLoad(between, other);
    const answered = await calls;
    check(
      "the second machine's link is cut while its lanes' inputs are on their way",
      cut
    );
    const refused = answered.flatMap((call, lane) =>
      call.status === "rejected" ? [`lane ${lane}: ${String(call.reason)}`] : []
    );
    const slowest = Math.max(
      0,
      ...answered.flatMap((call) =>
        call.status === "fulfilled" ? [call.value.seconds] : []
      )
    );
    check(
      `all ${LANES} delegate calls, each with ${INPUTS} inputs, are answered with a workspace`,
      refused.length === 0,
      `${LANES - refused.length} of ${LANES} answered, the last after ${slowest} s; ${refused.join(" | ").slice(0, 1200)}`
    );

    const items = (): {
      result: string | null;
      state: string;
      title: string;
    }[] =>
      fleet.query(
        "SELECT state, result, title FROM work_items WHERE parent_instance_id = ?",
        parent
      );
    const ended = await until(
      "every lane's item ended",
      () => {
        const rows = items();
        return rows.length === LANES &&
          rows.every((row) =>
            ["done", "failed", "cancelled"].includes(row.state)
          )
          ? rows
          : undefined;
      },
      Boolean,
      600_000
    ).catch(() => undefined);
    const rows = ended ?? items();
    const notDone = rows.flatMap((row) =>
      row.state === "done"
        ? []
        : [`${row.title}: ${row.state} ${(row.result ?? "").slice(0, 200)}`]
    );
    check(
      `every lane's item is done (${LANES} delegated)`,
      rows.length === LANES && notDone.length === 0,
      `${rows.length - notDone.length} of ${LANES} done; ${notDone.join(" | ").slice(0, 1200)}`
    );
    const listed = new Set(
      fleet.seen
        .filter(
          (one) =>
            one.afterTool &&
            LANE.test(one.all) &&
            new RegExp(`\\b${INPUTS}\\b`, "u").test(one.last)
        )
        .map((one) => LANE.exec(one.all)?.[1])
    );
    check(
      `every lane's Bash listed its ${INPUTS} inputs`,
      listed.size === LANES,
      `${listed.size} of ${LANES} lanes listed ${INPUTS} inputs`
    );

    const agentLog = await before.agent.since();
    const hubLog = await before.hub.since();
    const otherLog = await before.other.since();
    const drops = saying(agentLog, DROPS);
    check(
      "the parent's machine never drops its link to the hub",
      drops.length === 0 && count(agentLog, "registered with") === 0,
      `${count(agentLog, "registered with")} register(s); ${drops.slice(0, 5).join(" | ")}`
    );
    check(
      "the cut machine registers again, and the requests held for it go again under their own ids",
      count(otherLog, "registered with") >= 1 && hubLog.includes(RESENT),
      `${count(otherLog, "registered with")} register(s); ${saying(hubLog, [RESENT]).join(" | ") || "nothing sent again"}`
    );
    const away = [...saying(hubLog, AWAY), ...saying(agentLog, AWAY)];
    check(
      "no request fails for its machine being away",
      away.length === 0,
      away.slice(0, 5).join(" | ")
    );
    const late = saying(hubLog, LATE);
    check(
      "every read of the machines meets its deadline under the load",
      late.length === 0,
      late.slice(0, 5).join(" | ")
    );
    check(
      "no request through the second machine's link is cut for waiting on the hub: the relay, standing in for that link, has no idle timeout of its own",
      between.idleCuts.length === 0,
      between.idleCuts
        .map(
          (one) =>
            `${one.method} ${one.path} left after ${Math.round(one.idleMs / 1000)} s with nothing passing`
        )
        .join(" | ")
        .slice(0, 1200)
    );
    between.stop();
  },
};

export default spec;
