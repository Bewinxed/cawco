/**
 * A session's cache is cold only when a request measured a miss; no write
 * to the fleet's files predicts one.
 *
 * Before, every managed write (a user-layer skill, a workspace's placed
 * skill) marked Claude sessions cold, which refused their keep-alive and had
 * the hub move them at their next wake (server.ts `replaceAtWake`), whose
 * first request rewrote the whole context. Claude Code delivers those
 * changes as appended attachments with the prefix unchanged (caw-cost.md:
 * a skill listing re-sent at 19:07:26, the next request read 605,881). Now
 * cold is what a request's usage says: a keep-alive that read under 90% of
 * its prompt from the cache (agent session.ts `#observeCacheFrame`, hub
 * keep-alive.ts `keepAliveResult`, core `cacheHit`).
 *
 * The mock model reports cache usage as this spec's own cache answers it:
 * a session's first request writes its prompt; every later one reads it,
 * except a keep-alive the spec has set to miss.
 *
 * On a scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model), one Claude session, the lead, in a project's checkout:
 *
 * (a) The lead takes a turn and is not cold.
 * (b) A user-layer skill is written to the machine (`~/.claude/skills`):
 *     the lead is still not cold.
 * (c) The same fleet sent again writes nothing: the lead is still not cold.
 * (d) The lead's next turn sends the prompt its first did: the same system
 *     prompt and tools to the byte, its first turn's messages leading (cache
 *     breakpoints aside), and the mock's cache reads it; still not cold.
 * (e) Keep-alive on, its last request an hour less ten minutes ago: a ping
 *     that reads its cache leaves the lead warm.
 * (f) The next ping misses (the mock reports it rewrote its prompt): the
 *     lead is cold, `ping read 0%`, and no further ping goes to it.
 *
 *   bun scripts/probe-kit/run.ts prompt-cache-scope
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { KitFleet, Spec } from "../kit";

const RUN = crypto.randomUUID().slice(0, 8);
const SKILL = `probe-user-skill-${RUN}`;
const FIRST = `PROBE-CACHE-FIRST-${RUN}`;
const SECOND = `PROBE-CACHE-SECOND-${RUN}`;
const KEEP_ALIVE = /Keep-alive [0-9a-f]{4}:/;
/** Fifty minutes back: a 1h cache's ping is due ten minutes before it ends. */
const DUE_AGO_MS = 51 * 60_000;

/** Whether the next keep-alive misses its cache. */
let pingMisses = false;
/** The pings the mock answered, hit or miss. */
const pings: ("hit" | "miss")[] = [];
/** Whether the session's first request has written its prompt. */
let written = false;

/** A request's prompt in tokens, as near as its body's length says. */
const promptTokens = (request: Seen): number =>
  Math.max(1000, Math.round(request.body.length / 4));

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Probe title"] };
  }
  const size = promptTokens(request);
  const hit = { read: size - 50, write: 50 };
  if (KEEP_ALIVE.test(request.last)) {
    pings.push(pingMisses ? "miss" : "hit");
    return {
      everyMs: 5,
      words: ["ok"],
      cache: pingMisses ? { read: 0, write: size } : hit,
    };
  }
  const cache = written ? hit : { read: 0, write: size };
  written = true;
  return { everyMs: 5, words: ["ok"], cache };
};

interface Prompt {
  messages: unknown[];
  system: unknown;
  tools: unknown;
}

/** A request's body without its cache breakpoints, which move to the newest message each turn. */
const withoutBreakpoints = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(withoutBreakpoints);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "cache_control")
        .map(([key, inner]) => [key, withoutBreakpoints(inner)])
    );
  }
  return value;
};

const promptOf = (request: Seen): Prompt => {
  const body = JSON.parse(request.body) as Prompt;
  return {
    system: withoutBreakpoints(body.system),
    tools: withoutBreakpoints(body.tools),
    messages: withoutBreakpoints(body.messages) as unknown[],
  };
};

/** A folder holding a git repository with one commit. */
const gitFolder = async (fleet: KitFleet, dir: string): Promise<void> => {
  await mkdir(dir, { recursive: true });
  await Bun.$`sh -c ${"git init -q -b main && echo scope > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(dir)
    .env({ ...process.env, HOME: fleet.env.HOME as string })
    .quiet();
};

interface KeepAliveRow {
  cache_cold: string | null;
  keep_alive: number;
  keep_alive_sent: number;
}

const spec: Spec = {
  name: "prompt-cache-scope",
  run: async (kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);

    // The skill's source, served packed as the hub fetches a URL.
    const source = join(fleet.sandbox, "skill-source");
    const archive = join(fleet.sandbox, `${SKILL}.tar.gz`);
    await mkdir(join(source, SKILL), { recursive: true });
    await writeFile(
      join(source, SKILL, "SKILL.md"),
      `---\nname: ${SKILL}\ndescription: A user-layer skill every session lists.\n---\n\nNothing to do.\n`
    );
    await rm(archive, { force: true });
    await Bun.$`tar -czf ${archive} -C ${source} ${SKILL}`.quiet();
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response(Bun.file(archive)),
    });

    const hub = async <T>(method: string, path: string, body?: unknown) => {
      const response = await fetch(`${fleet.base}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${method} ${path}: ${response.status} ${text}`);
      }
      return (text ? JSON.parse(text) : undefined) as T;
    };
    const keepAlive = (id: string) =>
      fleet.query<KeepAliveRow>(
        "SELECT cache_cold, keep_alive, keep_alive_sent FROM instances WHERE id = ?",
        id
      )[0];
    const cold = (id: string) => keepAlive(id)?.cache_cold ?? null;
    const fleetReport = () =>
      fleet.query<{ fleet: string | null }>(
        "SELECT fleet FROM agents WHERE machine_id = ?",
        MACHINE
      )[0]?.fleet ?? "";
    /** The lead's turn that `mark` started: its request, once its turn has ended. */
    const turn = async (id: string, mark: string): Promise<Seen> => {
      await fleet.send(id, mark);
      const request = await until(
        `the request of ${mark}`,
        async () =>
          fleet.seen.findLast(
            (one) => one.tools && one.last.includes(mark) && !one.afterTool
          ),
        Boolean,
        120_000
      );
      await until(
        `${mark}'s turn ended`,
        async () => fleet.instance(id)?.turn_open_at ?? null,
        (open) => open === null,
        120_000
      );
      return request as Seen;
    };
    /** The lead's last request moved back so its next ping is due now. */
    const dueNow = (id: string) =>
      fleet.write(
        "UPDATE instances SET last_request_at = ? WHERE id = ?",
        Date.now() - DUE_AGO_MS,
        id
      );

    try {
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
      const dir = join(fleet.sandbox, "scope-lead");
      await gitFolder(fleet, dir);
      const project = await fleet.api<{ id: string }>("/api/projects", {
        name: "Scope",
        machineId: MACHINE,
        cwd: dir,
      });
      const lead = await fleet.spawn("claude", "Lead", dir, {
        projectId: project.id,
      });

      // (a) The lead's first turn.
      const first = await turn(lead, FIRST);
      check(
        "(a) the lead took a turn and is not cold",
        cold(lead) === null,
        `cache_cold ${cold(lead)}`
      );

      // (b) A user-layer skill, which every Claude session on the machine lists.
      await hub("PUT", `/api/fleet/skills/${SKILL}`, {
        source: `http://127.0.0.1:${server.port}/${SKILL}.tar.gz`,
      });
      const userSkill = join(
        fleet.home,
        CLAUDE_DIR_NAME,
        "skills",
        SKILL,
        "SKILL.md"
      );
      const placed = await until(
        "the user-layer skill on the machine",
        async () => await Bun.file(userSkill).exists(),
        Boolean,
        180_000
      ).catch(() => false);
      // Long enough for any invalidation to have reached the hub's row.
      await Bun.sleep(3000);
      check(
        "(b) a user-layer skill written to the machine leaves the lead not cold",
        placed && cold(lead) === null,
        `placed ${placed}; cache_cold ${cold(lead)}`
      );

      // (c) The same fleet again: nothing to write.
      const before = fleetReport();
      await hub("PATCH", `/api/fleet/skills/${SKILL}`, { enabled: true });
      await until(
        "the machine's report of the unchanged sync",
        async () => fleetReport(),
        (report) => report !== before,
        120_000
      ).catch(() => undefined);
      check(
        "(c) a sync that changes nothing leaves the lead not cold",
        cold(lead) === null,
        `cache_cold ${cold(lead)}`
      );

      // (d) The lead's next turn keeps its prompt's prefix.
      const second = await turn(lead, SECOND);
      const was = promptOf(first);
      const now = promptOf(second);
      const sameSystem =
        JSON.stringify(was.system) === JSON.stringify(now.system);
      const sameTools = JSON.stringify(was.tools) === JSON.stringify(now.tools);
      const leading = now.messages.slice(0, was.messages.length);
      const sameMessages =
        now.messages.length > was.messages.length &&
        JSON.stringify(leading) === JSON.stringify(was.messages);
      check(
        "(d) the lead's next turn sends the same system prompt and tools, and its first turn's messages first",
        sameSystem && sameTools && sameMessages,
        `system ${sameSystem}, tools ${sameTools}, messages ${sameMessages} (${was.messages.length} then ${now.messages.length})`
      );
      check(
        "(d) after that turn, which read its cache, the lead is still not cold",
        cold(lead) === null,
        `cache_cold ${cold(lead)}`
      );

      // (e) Keep-alive on, a ping due: it reads its cache.
      await hub("PATCH", `/api/instances/${lead}`, { keepAlive: true });
      dueNow(lead);
      const firstPing = await until(
        "the first ping answered",
        async () => keepAlive(lead),
        (row) => (row?.keep_alive_sent ?? 0) >= 1,
        180_000
      ).catch(() => keepAlive(lead));
      check(
        "(e) a ping that reads its cache leaves the lead warm",
        pings[0] === "hit" &&
          firstPing?.keep_alive_sent === 1 &&
          firstPing.cache_cold === null,
        `pings ${pings.join(",")}; ${JSON.stringify(firstPing)}`
      );

      // (f) The next ping misses: measured cold, and no ping after it.
      pingMisses = true;
      dueNow(lead);
      const missed = await until(
        "the lead cold after a missed ping",
        async () => keepAlive(lead),
        (row) => (row?.cache_cold ?? null) !== null,
        180_000
      ).catch(() => keepAlive(lead));
      const reason = missed?.cache_cold
        ? (JSON.parse(missed.cache_cold) as { reason: string }).reason
        : "";
      check(
        "(f) a ping that missed its cache leaves the lead cold, as measured",
        pings[1] === "miss" && reason === "ping read 0%",
        `pings ${pings.join(",")}; cache_cold ${missed?.cache_cold}`
      );
      dueNow(lead);
      await Bun.sleep(45_000);
      check(
        "(f) no ping goes to the lead once it is cold",
        pings.length === 2,
        `pings ${pings.join(",")}`
      );
    } finally {
      await server.stop(true);
    }
  },
};

export default spec;
