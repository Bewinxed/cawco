/**
 * A machine's id follows its hostname (core machine-id.ts), so a renamed
 * machine re-joins under a new id. Its agent names the id it last
 * registered as (agent config `registeredAs`), and the hub moves what it
 * held for that id to the new one (hub server.ts `takeFormerId`, db
 * `rekeyMachine`). A machine the person removes for good keeps the rules
 * scoped to it, read as orphaned (`GET /api/rules`, what `admin_rules_read`
 * lists).
 *
 * A scratch fleet's hub, sessiond and agent. A rule is scoped to the agent's
 * machine; the mock model says the rule's phrase only when asked to.
 *
 * (a) A session on the machine says the phrase: the rule fires on it.
 * (b) The agent starts again under a new machine id, its HOME and sessiond
 *     as they were: the hub lists the new id and not the old, the session
 *     and the rule's scope name the new id, and the session saying the
 *     phrase again fires the rule again.
 * (c) The machine is removed for good: the rule stands, its scope as it
 *     was, and the rules read marks it orphaned with the machine's name and
 *     when it went.
 *
 *   bun scripts/probe-kit/run.ts machine-rekey
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { MACHINE, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const PHRASE = "rekey probe phrase";
/** What makes the mock say {@link PHRASE}; anything else it answers `ok`. */
const ASK = "SAY-THE-PHRASE";
const REPLY = "The rekey probe's rule fired.";
const RENAMED = "scratch-fleet-renamed";
/** A turn's wait: room for a session's start on a host many fleets share. */
const TURN_MS = 300_000;

interface RuleRead {
  id: string;
  orphaned?: {
    machineId: string;
    name: string | null;
    removedAt: number | null;
  };
  scope: { machineId?: string };
}
interface AgentRead {
  hostname: string;
  machineId: string;
  status: string;
}

/** A person's message to a session on `machineId`, through the dashboard, as `fleet.send` sends one. */
const sendOn = (
  fleet: KitFleet,
  machineId: string,
  instanceId: string,
  text: string
) =>
  fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "send",
    machineId,
    sessionId: instanceId,
    payload: {
      instanceId,
      message: {
        type: "user",
        uuid: crypto.randomUUID(),
        message: { role: "user", content: text },
        parent_tool_use_id: null,
        origin: { kind: "human" },
      },
    },
  });

async function run(kit: Kit): Promise<void> {
  const fleet = await kit.fleet((request) => ({
    everyMs: 5,
    words: [request.last.includes(ASK) ? PHRASE : "ok"],
  }));
  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const rule = await fleet.api<{ id: string }>("/api/rules", {
      name: "Rekey probe rule",
      enabled: true,
      pattern: PHRASE,
      matchKind: "phrase",
      caseSensitive: false,
      wholeWord: false,
      watch: "text",
      reply: REPLY,
      timing: "turn",
      repeat: true,
      scope: { machineId: MACHINE },
    });
    const session = await fleet.spawn("claude", "Rekey probe");
    const fires = async () =>
      (
        await fleet.api<{
          activity: { instanceId: string; totalFires: number }[];
        }>(`/api/rules/${rule.id}/activity`)
      ).activity.find((one) => one.instanceId === session)?.totalFires ?? 0;
    const rules = async () =>
      (await fleet.api<{ rules: RuleRead[] }>("/api/rules")).rules;
    const agents = () => fleet.api<AgentRead[]>("/api/agents");
    /** How many requests the model has had whose words hold `words`. */
    const heard = (words: string) =>
      fleet.seen.filter((one) => one.last.includes(words)).length;
    /**
     * `words` sent on `machineId`: the model answers them, then the rule's
     * count on the session as it stands once it reaches `count`, or after
     * the wait, with what there was to see.
     */
    const sayAndCount = async (
      machineId: string,
      words: string,
      count: number
    ) => {
      await sendOn(fleet, machineId, session, words);
      await until(
        `the model asked "${words}"`,
        () => (heard(words) > 0 ? true : undefined),
        Boolean,
        TURN_MS
      ).catch(() => undefined);
      const fired = await until(
        `the rule fired ${count} time(s)`,
        fires,
        (n) => n >= count,
        TURN_MS
      ).catch(fires);
      return {
        fired,
        seen: `fires on session ${session}: ${fired}; the model heard "${words}" ${heard(words)} time(s); the session ${JSON.stringify(fleet.instance(session))}`,
      };
    };
    /** The session took the rule's reply and answered it: its turn is over. */
    const answered = async (count: number) => {
      await until(
        `the session reads the rule's reply ${count === 1 ? "once" : `${count} times`}`,
        () => (heard(REPLY) >= count ? true : undefined),
        Boolean,
        TURN_MS
      );
      await until(
        "the session's turn over",
        () => fleet.instance(session),
        (now) => now.turn_open_at === null,
        TURN_MS
      );
    };

    // (a) The rule fires on the machine it is scoped to.
    const first = await sayAndCount(MACHINE, `${ASK} once`, 1);
    kit.check(
      "a: a rule scoped to the agent's machine applies",
      first.fired === 1,
      first.seen
    );
    await answered(1);
    const before = await agents();
    const hostname =
      before.find((one) => one.machineId === MACHINE)?.hostname ?? "";

    // (b) The agent comes back under a new id.
    await fleet.rejoinAs(RENAMED);
    const after = await agents();
    const [row] = fleet.query<{ machine_id: string }>(
      "SELECT machine_id FROM instances WHERE id = ?",
      session
    );
    const scoped = (await rules()).find((one) => one.id === rule.id);
    kit.check(
      "b: the machine is listed under its new id alone, and its session and its rule's scope name it",
      after.some((one) => one.machineId === RENAMED) &&
        !after.some((one) => one.machineId === MACHINE) &&
        row?.machine_id === RENAMED &&
        scoped?.scope.machineId === RENAMED &&
        scoped.orphaned === undefined,
      `machines ${after.map((one) => `${one.machineId} ${one.status}`).join(", ")}; session on ${row?.machine_id}; rule scope ${JSON.stringify(scoped?.scope)}`
    );
    const second = await sayAndCount(RENAMED, `${ASK} again`, 2);
    kit.check(
      "b: the rule still applies to the machine under its new id",
      second.fired === 2,
      second.seen
    );
    await answered(2);

    // (c) The machine is removed for good.
    await fleet.stop("agent");
    const removedFrom = Date.now();
    const removal = await until(
      "the machine removed once its agent is away",
      async () => {
        const read = await readWithin(30_000, async (signal) => {
          const response = await fetch(
            `${fleet.base}/api/agents/${encodeURIComponent(RENAMED)}`,
            { method: "DELETE", signal }
          );
          return response.ok ? await response.text() : undefined;
        });
        switch (read.kind) {
          case "answered":
            return read.value;
          case "unanswered":
            throw new Error(
              `the hub did not answer the removal within ${read.after} ms`
            );
          default: {
            const unhandled: never = read;
            throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
          }
        }
      },
      Boolean
    );
    const orphan = (await rules()).find((one) => one.id === rule.id);
    kit.check(
      "c: the removed machine's rule stands, its scope as it was, read as orphaned with its name and when it went",
      orphan?.scope.machineId === RENAMED &&
        orphan.orphaned?.machineId === RENAMED &&
        orphan.orphaned.name === hostname &&
        hostname !== "" &&
        (orphan.orphaned.removedAt ?? 0) >= removedFrom &&
        (orphan.orphaned.removedAt ?? 0) <= Date.now(),
      `removal ${removal}; rule ${JSON.stringify(orphan && { scope: orphan.scope, orphaned: orphan.orphaned })}; the machine was ${hostname}`
    );
  } finally {
    await writeFile(
      join(kit.out, "hub.log"),
      await fleet.logs("hub").catch((error: Error) => error.message)
    );
  }
}

export default { name: "machine-rekey", run } satisfies Spec;
