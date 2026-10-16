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
 * mock model) with two accounts of one organization, A and B, one Claude
 * session, the lead, on A in a project's checkout. Once it is there, B is
 * put first in order: placement now puts a session it re-places on B, so a
 * wake that finds the lead cold moves it (`replaceAtWake`).
 *
 * (a) The lead takes a turn and is not cold.
 * (b) A user-layer skill is written to the machine (`~/.claude/skills`):
 *     the lead is still not cold.
 * (c) The same fleet sent again writes nothing: the lead is still not cold.
 * (d) The lead put to sleep, its next turn wakes it (`wakeForSend`, where a
 *     cold session is re-placed). That turn sends the prompt its first did: the same system
 *     prompt and tools to the byte, its first turn's messages leading (cache
 *     breakpoints aside), and the mock's cache reads it; still not cold, and
 *     still on A: that wake moved it nowhere.
 * (e) Keep-alive on, its last request an hour less ten minutes ago: a ping
 *     that reads its cache leaves the lead warm.
 * (f) The next ping misses (the mock reports it rewrote its prompt): the
 *     lead is cold, `ping read 0%`, and no further ping goes to it.
 * (g) Keep-alive off and put to sleep, its next wake, cold as measured,
 *     re-places it: it moves to B, so (d)'s
 *     staying on A is the warm lead's, not a move that could not happen.
 *
 *   bun scripts/probe-kit/run.ts prompt-cache-scope
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import {
  ACCOUNT,
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { KitFleet, Spec } from "../kit";
import { B, furnishAccount } from "./account-move";

const RUN = crypto.randomUUID().slice(0, 8);
const SKILL = `probe-user-skill-${RUN}`;
const FIRST = `PROBE-CACHE-FIRST-${RUN}`;
const SECOND = `PROBE-CACHE-SECOND-${RUN}`;
const THIRD = `PROBE-CACHE-THIRD-${RUN}`;
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
    const accountOf = (id: string) =>
      fleet.query<{ account_id: string | null }>(
        "SELECT account_id FROM instances WHERE id = ?",
        id
      )[0]?.account_id ?? null;
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
    /**
     * The lead put to sleep, its process ended: the next send wakes it
     * (server.ts `wakeForSend`), which is where a session found cold is
     * re-placed (`replaceAtWake`).
     */
    const asleep = async (id: string): Promise<string | undefined> => {
      await fleet.control(id, "sleep");
      return await until(
        "the lead asleep",
        async () => fleet.instance(id)?.status,
        (status) => status === "sleeping",
        120_000
      ).catch(() => fleet.instance(id)?.status);
    };
    /** The lead's last request moved back so its next ping is due now. */
    const dueNow = (id: string) =>
      fleet.write(
        "UPDATE instances SET last_request_at = ? WHERE id = ?",
        Date.now() - DUE_AGO_MS,
        id
      );

    try {
      await furnishAccount(fleet.home, B);
      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("hub");
      await fleet.hubUp();
      fleet.fileAccount();
      fleet.write(
        "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', 'Probe B', 'green', 1, 0, ?)",
        B,
        Date.now()
      );
      fleet.launch("agent");
      await fleet.agentUp();
      await fleet.accountSignedIn();
      await until(
        "account B signed in",
        () =>
          fleet.query<{ state: string }>(
            "SELECT state FROM account_signins WHERE account_id = ?",
            B
          )[0],
        (row) => row?.state === "signed-in",
        120_000
      );
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

      // (a) The lead's first turn, on A.
      const first = await turn(lead, FIRST);
      const home = accountOf(lead);
      check(
        "(a) the lead took a turn on A and is not cold",
        home === ACCOUNT && cold(lead) === null,
        `account ${home}; cache_cold ${cold(lead)}`
      );
      // B first in order from here: a re-placed session goes to B.
      fleet.write('UPDATE accounts SET "order" = 2 WHERE id = ?', ACCOUNT);
      fleet.write('UPDATE accounts SET "order" = 0 WHERE id = ?', B);

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

      // (d) Asleep, then woken by its next turn: that turn keeps its prompt's
      // prefix, and the wake leaves it where it is.
      const sleptD = await asleep(lead);
      check(
        "(d) the lead is asleep before its next turn wakes it",
        sleptD === "sleeping",
        `status ${sleptD}`
      );
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
      // A move owed at a wake lands at its turn's end: give it the time (g)'s takes.
      await Bun.sleep(20_000);
      check(
        "(d) that wake, after the user-layer skill write, left the lead on A",
        accountOf(lead) === ACCOUNT,
        `account ${accountOf(lead)}`
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

      // (g) A wake that finds it cold, as measured, re-places it on B.
      // Keep-alive off first: the hub keeps a session it keeps warm awake.
      await hub("PATCH", `/api/instances/${lead}`, { keepAlive: false });
      const sleptG = await asleep(lead);
      check(
        "(g) the cold lead is asleep before its next turn wakes it",
        sleptG === "sleeping",
        `status ${sleptG}`
      );
      await turn(lead, THIRD);
      const movedTo = await until(
        "the cold lead re-placed on B",
        async () => accountOf(lead) ?? undefined,
        (one) => one === B,
        120_000
      ).catch(() => accountOf(lead));
      check(
        "(g) its next wake, cold as measured, moves it to B",
        movedTo === B,
        `account ${movedTo}`
      );
    } finally {
      await server.stop(true);
    }
  },
};

export default spec;
