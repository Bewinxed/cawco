/**
 * A fleet write marks cold only the Claude sessions whose prompt reads it,
 * and a sync that changes nothing leaves a session's prompt as it was.
 *
 * Before, every managed write on a machine (a skill placed in one delegate's
 * workspace, a memory document placed in one project's checkout) marked every
 * Claude session there cold: the lead of another project took
 * `prompt changed: skill review-attempt` for each new workspace, which
 * refuses its keep-alive and has the hub move it to another account at its
 * next wake (server.ts `replaceAtWake`), whose first request rewrites its
 * whole context (caw-cost.md). Now a write names the folder whose sessions
 * read it (agent prompt-writes.ts `PromptReaders`), and the agent and the
 * hub mark only the sessions at or under it.
 *
 * On a scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) with two projects, A and B, each a git checkout, a Claude
 * session in each:
 *
 * (a) The lead in A takes a turn.
 * (b) A memory document scoped to B, and a skill bound to B, are placed in
 *     B's checkout: B's session is cold with `prompt changed: …`, the lead in
 *     A is not.
 * (c) The same fleet sent again (memory and skill unchanged) writes nothing:
 *     the lead in A is still not cold.
 * (d) The lead's next turn sends the prompt its first did: the same system
 *     prompt and tools to the byte, and its first turn's messages as the
 *     leading messages (cache breakpoints aside), so its cached prefix holds.
 *
 *   bun scripts/probe-kit/run.ts prompt-cache-scope
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import { MACHINE, type Seen, until } from "../../scratch-fleet";
import type { KitFleet, Spec } from "../kit";

const RUN = crypto.randomUUID().slice(0, 8);
const SKILL = `probe-scope-${RUN}`;
const FIRST = `PROBE-CACHE-FIRST-${RUN}`;
const SECOND = `PROBE-CACHE-SECOND-${RUN}`;
const DOC = "projects/b.md";

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

const spec: Spec = {
  name: "prompt-cache-scope",
  run: async (kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));

    // The skill's source, served packed as the hub fetches a URL.
    const source = join(fleet.sandbox, "skill-source");
    const archive = join(fleet.sandbox, `${SKILL}.tar.gz`);
    await mkdir(join(source, SKILL), { recursive: true });
    await writeFile(
      join(source, SKILL, "SKILL.md"),
      `---\nname: ${SKILL}\ndescription: A skill bound to project B.\n---\n\nNothing to do.\n`
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
    const cold = (id: string) =>
      fleet.query<{ cache_cold: string | null }>(
        "SELECT cache_cold FROM instances WHERE id = ?",
        id
      )[0]?.cache_cold ?? null;
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

      const checkout = async (name: string) => {
        const dir = join(fleet.sandbox, `scope-${name}`);
        await gitFolder(fleet, dir);
        const project = await fleet.api<{ id: string }>("/api/projects", {
          name: `Scope ${name.toUpperCase()}`,
          machineId: MACHINE,
          cwd: dir,
        });
        return { dir, id: project.id };
      };
      const a = await checkout("a");
      const b = await checkout("b");
      const lead = await fleet.spawn("claude", "Lead in A", a.dir, {
        projectId: a.id,
      });
      const other = await fleet.spawn("claude", "Session in B", b.dir, {
        projectId: b.id,
      });

      // (a) The lead's first turn.
      const first = await turn(lead, FIRST);
      check(
        "(a) the lead in A took a turn and is not cold",
        cold(lead) === null,
        `cache_cold ${cold(lead)}`
      );

      // (b) B's own files placed in B's checkout.
      await hub("PUT", "/api/fleet/memory/docs", {
        path: DOC,
        content: `# B\n\nFor project B only, ${RUN}.\n`,
        scope: { projectIds: [b.id] },
      });
      await hub("PUT", `/api/fleet/skills/${SKILL}`, {
        source: `http://127.0.0.1:${server.port}/${SKILL}.tar.gz`,
        projectId: b.id,
      });
      const placedDoc = projectClaudeDir(b.dir, "rules", "cawco", DOC);
      const placedSkill = projectClaudeDir(b.dir, "skills", SKILL, "SKILL.md");
      const placed = await until(
        "B's document and skill placed in its checkout",
        async () =>
          (await Bun.file(placedDoc).exists()) &&
          (await Bun.file(placedSkill).exists()),
        Boolean,
        180_000
      ).catch(() => false);
      const otherCold = await until(
        "B's session cold",
        async () => cold(other),
        (value) => value !== null,
        60_000
      ).catch(() => cold(other));
      check(
        "(b) B's document and skill are placed in B's checkout, and B's session is cold for it",
        placed && (otherCold ?? "").includes("prompt changed"),
        `placed ${placed}; B's cache_cold ${otherCold}`
      );
      check(
        "(b) the lead in A, whose folder holds neither, is not cold",
        cold(lead) === null,
        `cache_cold ${cold(lead)}`
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
        "(d) after its next turn the lead is still not cold",
        cold(lead) === null,
        `cache_cold ${cold(lead)}`
      );
    } finally {
      await server.stop(true);
    }
  },
};

export default spec;
