/**
 * A delegate type's starting set (core `StartingSet`, tsk-331) holds a
 * Claude Code delegate to its skills and MCP servers, with CawCo's own; a
 * type with none starts with everything. On a scratch fleet (real hub,
 * agent, sessiond and Claude Code against the mock model, which keeps every
 * request it answered). Every delegate is host-scope, so the spec runs
 * inside a workspace too.
 *
 * Installed for every session: three skills in the account
 * (`probe-set-alpha`, `-beta`, `-gamma`), a plugin with two
 * (`probe-plug:plug-inside`, `probe-plug:plug-outside`), two fleet MCP
 * servers (`probe-in`, `probe-out`) and one in the account's own config
 * (`probe-user`), each a stdio server with one tool, `ping`.
 *
 * - t1. A type saved through `admin_delegate_types_write` with a set of two
 *   skills (one a plugin's) and one server reads back with that set.
 * - s1. Its delegate's skill listing is exactly those two, CawCo's own
 *   skills and the skill its `delegate` call named; the plugin's other skill
 *   and every other skill are out of it.
 * - s2. Its tools come from `probe-in` and `cawco` alone: no `probe-out`,
 *   no `probe-user`, no Claude in Chrome.
 * - s3. A Skill call to a skill outside the set is refused in the session,
 *   and one to a skill in it is not.
 * - s4. Its row keeps the set it started with; the type changed afterwards,
 *   the session woken from sleep still lists what it started with, and a
 *   delegate started after the change lists the new set.
 * - n1. A delegate of a type with no set lists every skill and takes every
 *   server, the account's own included, and its Skill call to the same
 *   skill runs.
 * - p1–p3 (tsk-338), on pi: four skills in pi's agent dir, the person's own
 *   `mcp.json` server (`probe-user`) and a server his own pi extension
 *   registers (`probe-ext`), beside the two fleet servers. A delegate of a pi
 *   type whose set is two skills and `probe-in` lists exactly those, the
 *   skill its `delegate` call named and CawCo's own skills (p1), is told of
 *   `probe-in` alone of the MCP servers and keeps CawCo's tools (p2); one of
 *   a pi type with no set lists every skill and every server (p3).
 *
 *   bun scripts/probe-kit/run.ts starting-set
 */

import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import type { StartingSet } from "../../../packages/core/src/delegate-types";
import { fetchHub, hubRequest } from "../../../packages/core/src/hub-request";
import { BUNDLED_SKILLS } from "../../../packages/hub/src/bundled-skills";
import { toolWords } from "../../lib/tool-call";
import {
  ACCOUNT,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

export const SKILLS = ["probe-set-alpha", "probe-set-beta", "probe-set-gamma"];
const PLUGIN = "probe-plug";
export const PLUGIN_SKILLS = [
  `${PLUGIN}:plug-inside`,
  `${PLUGIN}:plug-outside`,
];
/** The skill a `delegate` call names for its one delegate. */
const BRIEF_SKILL = "probe-set-beta";
const SET: StartingSet = {
  skills: ["probe-set-alpha", `${PLUGIN}:plug-inside`],
  servers: ["probe-in"],
};
/** The set the type is changed to once its first delegates run (s4). */
const CHANGED: StartingSet = {
  ...SET,
  skills: [...SET.skills, "probe-set-gamma"],
};
export const FLEET_SERVERS = ["probe-in", "probe-out"];
export const USER_SERVER = "probe-user";

const SET_TYPE = "probe-set";
const PLAIN_TYPE = "probe-plain";

/** pi's skills: the account's three and one more, so a set of two leaves two out. */
const PI_SKILLS = [...SKILLS, "probe-set-delta"];
const PI_SET: StartingSet = {
  skills: ["probe-set-alpha", "probe-set-gamma"],
  servers: ["probe-in"],
};
/** The server the person's own pi extension registers. */
const EXT_SERVER = "probe-ext";
const PI_SET_TYPE = "probe-set-pi";
const PI_PLAIN_TYPE = "probe-plain-pi";

/** The skill each delegate's first turn calls, by the tag its brief carries. */
const CALLS: Record<string, string> = {
  "PROBE-SET-OUTSIDE": "probe-set-gamma",
  "PROBE-SET-INSIDE": "probe-set-alpha",
  "PROBE-PLAIN-OUTSIDE": "probe-set-gamma",
};

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** A session's brief that names a call in {@link CALLS} is answered with that skill's call; every other request with "ok". */
const respond = (request: Seen): Reply => {
  // Its brief alone: the hub's later words to it are answered "ok".
  const tag = Object.keys(CALLS).find((each) => request.last.includes(each));
  if (tag && request.tools && !request.afterTool) {
    return {
      everyMs: 5,
      words: ["Loading it."],
      tool: { name: "Skill", input: { skill: CALLS[tag] } },
    };
  }
  return text("ok");
};

/** A stdio MCP server with one tool, `ping`, named by its first argument. */
export const MCP_SERVER = `const name = process.argv[2];
let buffer = "";
const answer = (id, result) =>
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf("\\n")) >= 0) {
    const line = buffer.slice(0, end).trim();
    buffer = buffer.slice(end + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id === undefined) continue;
    if (message.method === "initialize") {
      answer(message.id, {
        protocolVersion: message.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name, version: "1.0.0" },
      });
    } else if (message.method === "tools/list") {
      answer(message.id, {
        tools: [{ name: "ping", description: "Answers pong for " + name, inputSchema: { type: "object", properties: {} } }],
      });
    } else if (message.method === "tools/call") {
      answer(message.id, { content: [{ type: "text", text: "pong" }] });
    } else {
      answer(message.id, {});
    }
  }
});
`;

const skillFile = (name: string, description: string): string =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\nThe body of ${name}.\n`;

/** Writes each file, its folders made. */
const writeAll = async (files: Record<string, string>): Promise<void> => {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, content);
  }
};

/** The account's Claude Code config dir, where its skills, plugins and own MCP servers live. */
const accountDir = (fleet: KitFleet): string =>
  join(fleet.env.HOME as string, ".cawco", "accounts", ACCOUNT, "claude");

/**
 * The account's skills, its plugin (installed by Claude Code itself, from a
 * marketplace in a folder) and its own MCP server.
 */
export const plantAccount = async (
  fleet: KitFleet,
  server: string
): Promise<void> => {
  const account = accountDir(fleet);
  const market = join(fleet.sandbox, "probe-market");
  await writeAll({
    ...Object.fromEntries(
      SKILLS.map((name) => [
        join(account, "skills", name, "SKILL.md"),
        skillFile(name, `The probe's ${name}.`),
      ])
    ),
    [join(market, ".claude-plugin", "marketplace.json")]: JSON.stringify({
      name: "probe-market",
      owner: { name: "probe" },
      plugins: [{ name: PLUGIN, source: `./${PLUGIN}`, description: "probe" }],
    }),
    [join(market, PLUGIN, ".claude-plugin", "plugin.json")]: JSON.stringify({
      name: PLUGIN,
      version: "1.0.0",
      description: "probe",
    }),
    ...Object.fromEntries(
      PLUGIN_SKILLS.map((qualified) => {
        const name = qualified.split(":")[1] as string;
        return [
          join(market, PLUGIN, "skills", name, "SKILL.md"),
          skillFile(name, `The probe plugin's ${name}.`),
        ];
      })
    ),
  });
  const claude = Bun.which("claude");
  if (!claude) {
    throw new Error("no claude on PATH to install the probe's plugin with");
  }
  for (const args of [
    ["plugin", "marketplace", "add", market],
    ["plugin", "install", `${PLUGIN}@probe-market`],
  ]) {
    const run = Bun.spawnSync([claude, ...args], {
      env: { ...process.env, ...fleet.env, CLAUDE_CONFIG_DIR: account },
    });
    if (run.exitCode !== 0) {
      throw new Error(
        `claude ${args.join(" ")}: ${run.stdout.toString()}${run.stderr.toString()}`
      );
    }
  }
  const config = join(account, CLAUDE_JSON_NAME);
  const held = JSON.parse(await readFile(config, "utf8").catch(() => "{}"));
  await writeFile(
    config,
    JSON.stringify({
      ...held,
      mcpServers: {
        ...held.mcpServers,
        [USER_SERVER]: {
          type: "stdio",
          command: process.execPath,
          args: [server, USER_SERVER],
        },
      },
    })
  );
};

/**
 * pi's agent dir: its skills, the person's own `mcp.json` server and his own
 * pi extension, which registers a server of its own.
 */
const plantPi = async (fleet: KitFleet, server: string): Promise<void> => {
  const pi = join(fleet.env.HOME as string, ".pi", "agent");
  const stdio = (name: string) => ({
    command: process.execPath,
    args: [server, name],
    exposure: "deferred",
  });
  await writeAll({
    ...Object.fromEntries(
      PI_SKILLS.map((name) => [
        join(pi, "skills", name, "SKILL.md"),
        skillFile(name, `The probe's ${name}.`),
      ])
    ),
    [join(pi, "mcp.json")]: JSON.stringify({
      mcpServers: { [USER_SERVER]: stdio(USER_SERVER) },
    }),
    [join(pi, "extensions", "probe-ext.ts")]:
      `export default (pi) => pi.registerMcpServer(${JSON.stringify(EXT_SERVER)}, ${JSON.stringify(stdio(EXT_SERVER))});\n`,
  });
};

/** Every string a request's JSON body holds, joined: what its model read, escapes undone. */
export const wordsOf = (body: string): string => {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      out.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  };
  walk(JSON.parse(body));
  return out.join("\n");
};

/** The requests of the session whose brief carries `tag`, with tools: its turns. */
export const turnsOf = (fleet: KitFleet, tag: string): Seen[] =>
  fleet.seen.filter((one) => one.tools && one.all.includes(tag));

/** Waits for `tag`'s session to send its model `count` turns. */
export const awaitTurns = (fleet: KitFleet, tag: string, count = 1) =>
  until(
    `${tag}'s turn reached the model`,
    () => turnsOf(fleet, tag),
    (turns) => turns.length >= count,
    180_000
  );

const LISTING =
  /skills are available for use with the Skill tool:\n([\s\S]*?)(?:<\/system-reminder>|$)/u;
const LISTED = /^- (\S+?)(?::\s|$)/u;

/** The skills the newest listing a turn's words carry names, sorted. */
export const listingOf = (words: string): string[] => {
  const blocks = [...words.matchAll(new RegExp(LISTING, "gu"))];
  const block = blocks.at(-1)?.[1] ?? "";
  return block
    .split("\n")
    .map((line) => LISTED.exec(line.trim())?.[1])
    .filter((name): name is string => Boolean(name))
    .sort();
};

/** The skills pi's newest system prompt lists (`<available_skills>`, pi skills.js `formatSkillsForPrompt`), sorted. */
const piListingOf = (words: string): string[] => {
  const block =
    [
      ...words.matchAll(/<available_skills>([\s\S]*?)<\/available_skills>/gu),
    ].at(-1)?.[1] ?? "";
  return [...block.matchAll(/<name>([^<]+)<\/name>/gu)]
    .map((match) => match[1] as string)
    .sort();
};

/** The MCP servers pi's `mcp_servers` section tells its model of (`- mcp__<server> (tool_search)`), as namespaces, sorted. */
const piServersOf = (words: string): string[] =>
  [
    ...new Set(
      [...words.matchAll(/^- mcp__(\w+) \((?:tool_search|codemode)\)/gmu)].map(
        (match) => match[1] as string
      )
    ),
  ].sort();

/** A server's name as pi namespaces it (pi core/mcp-servers.js `mcpNamespace`). */
const piNamespace = (name: string): string => name.replace(/-/gu, "_");

/** The MCP servers whose tools a turn names (`mcp__<server>__<tool>`), sorted. */
export const serversOf = (
  words: string,
  offered: readonly string[]
): string[] =>
  [
    ...new Set(
      [
        ...`${words}\n${offered.join("\n")}`.matchAll(/mcp__([\w-]+?)__\w/gu),
      ].map((match) => match[1] as string)
    ),
  ].sort();

/** A `delegate` as its tool posts it: the started session's id, or a throw with the hub's words. */
export const delegate = async (
  fleet: KitFleet,
  body: Record<string, unknown> & { parentInstanceId: string }
): Promise<string> => {
  const response = await fetchHub(
    fetch,
    fleet.base,
    hubRequest("POST /api/work-items", { body: body as never })
  );
  const said = await response.text();
  if (!response.ok) {
    throw new Error(`delegate refused: ${response.status} ${said}`);
  }
  return (JSON.parse(said) as { instanceId: string }).instanceId;
};

/** The set a session's row keeps. */
export const rowSet = (fleet: KitFleet, instanceId: string): unknown => {
  const [row] = fleet.query<{ starting_set: string | null }>(
    "SELECT starting_set FROM instances WHERE id = ?",
    instanceId
  );
  return row?.starting_set ? JSON.parse(row.starting_set) : null;
};

export const same = (a: readonly string[], b: readonly string[]): boolean =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/**
 * A scratch fleet answering with `answer`, its machine signed in, with the
 * probe's skills, plugin, pi agent dir and account server installed and both
 * fleet servers synced.
 */
export const setUp = async (
  kit: Kit,
  answer: (request: Seen) => Reply
): Promise<KitFleet> => {
  const fleet = await kit.fleet(answer);
  const server = join(fleet.sandbox, "probe-mcp.mjs");
  await writeFile(server, MCP_SERVER);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await plantAccount(fleet, server);
  await plantPi(fleet, server);
  for (const name of FLEET_SERVERS) {
    await fleet.api(
      hubRequest("PUT /api/fleet/mcp/:name", {
        path: { name },
        body: {
          config: { command: process.execPath, args: [server, name] },
          enabled: true,
        },
      })
    );
  }
  await until(
    "the machine's sync set both fleet servers",
    async () =>
      JSON.parse(
        await readFile(
          join(
            fleet.env.HOME as string,
            ".local",
            "share",
            "cawco",
            "fleet-mcp-set.json"
          ),
          "utf8"
        ).catch(() => "{}")
      ) as { servers?: Record<string, unknown> },
    (set) => FLEET_SERVERS.every((name) => set.servers?.[name]),
    180_000
  );
  return fleet;
};

/** p1–p3: the set on pi, beside a pi type with none. */
const piLegs = async (
  kit: Kit,
  fleet: KitFleet,
  parent: string,
  at: string
): Promise<void> => {
  const answer = await toolWords(
    {
      base: fleet.base,
      id: parent,
      credential: await fleet.sessionCredential(parent),
    },
    "admin_delegate_types_write",
    {
      action: "put",
      name: PI_SET_TYPE,
      description: "A probe's pi type with a starting set",
      harness: "pi",
      model: MODEL.pi,
      startingSet: PI_SET,
      reason: "The starting-set probe's pi type.",
    }
  );
  if (answer.refused) {
    throw new Error(`the pi type was refused: ${answer.text}`);
  }
  await fleet.api(
    hubRequest("PUT /api/delegate-types/:name", {
      path: { name: PI_PLAIN_TYPE },
      body: {
        description: "A probe's pi type with no set",
        harness: "pi",
        model: MODEL.pi,
      },
    })
  );
  await delegate(fleet, {
    parentInstanceId: parent,
    title: "pi set delegate",
    prompt: "PROBE-PI-SET: say ok.",
    type: PI_SET_TYPE,
    skills: [BRIEF_SKILL],
    host: true,
    cwd: at,
  });
  await delegate(fleet, {
    parentInstanceId: parent,
    title: "pi plain delegate",
    prompt: "PROBE-PI-PLAIN: say ok.",
    type: PI_PLAIN_TYPE,
    host: true,
    cwd: at,
  });
  const set = (await awaitTurns(fleet, "PROBE-PI-SET"))[0] as Seen;
  const plain = (await awaitTurns(fleet, "PROBE-PI-PLAIN"))[0] as Seen;
  const setWords = wordsOf(set.body);
  const plainWords = wordsOf(plain.body);
  const listed = piListingOf(setWords);
  const plainListed = piListingOf(plainWords);
  const servers = piServersOf(setWords);
  const plainServers = piServersOf(plainWords);
  const cawcoTools = (tools: readonly string[]) =>
    ["handoff", "set_title"].every((name) => tools.includes(name));
  await writeFile(
    join(fleet.sandbox, "starting-set-pi-listings.json"),
    JSON.stringify(
      {
        set: { skills: listed, servers, tools: set.toolNames },
        plain: {
          skills: plainListed,
          servers: plainServers,
          tools: plain.toolNames,
        },
      },
      null,
      2
    )
  );
  kit.check(
    "p1: a pi delegate of a type whose set is two skills lists exactly those two, the skill its delegate call named, and CawCo's own; neither other skill of pi's",
    same(listed, [...PI_SET.skills, BRIEF_SKILL, ...BUNDLED_SKILLS]),
    `listed ${listed.join(", ")}`
  );
  kit.check(
    "p2: of the MCP servers it is told of probe-in alone: not the fleet's probe-out, the person's own mcp.json probe-user, nor probe-ext his own pi extension registers; CawCo's own tools are its",
    same(servers, [piNamespace("probe-in")]) && cawcoTools(set.toolNames),
    `servers ${servers.join(", ")}; tools ${set.toolNames.join(", ")}`
  );
  kit.check(
    "p3: a pi delegate of a type with no set lists every skill of pi's and is told of every server, the person's own and his extension's included",
    PI_SKILLS.every((name) => plainListed.includes(name)) &&
      same(
        plainServers,
        [...FLEET_SERVERS, USER_SERVER, EXT_SERVER].map(piNamespace)
      ) &&
      cawcoTools(plain.toolNames),
    `listed ${plainListed.length} skills: ${plainListed.join(", ")}; servers ${plainServers.join(", ")}`
  );
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "starting-set",
  run: async (kit: Kit) => {
    const fleet = await setUp(kit, respond);
    const src = join(fleet.sandbox, "set-src");
    await mkdir(src, { recursive: true });
    const at = realpathSync(src);
    // In Full Send, so its admin write runs at once (hub asks.ts).
    const parent = await fleet.spawn("claude", "PROBE-SET-PARENT", at, {
      permissionMode: "fullSend",
    });

    // t1: saved through the admin tool, read back whole.
    const saved = await toolWords(
      {
        base: fleet.base,
        id: parent,
        credential: await fleet.sessionCredential(parent),
      },
      "admin_delegate_types_write",
      {
        action: "put",
        name: SET_TYPE,
        description: "A probe's type with a starting set",
        harness: "claude",
        model: MODEL.claude,
        startingSet: SET,
        reason: "The starting-set probe's type.",
      }
    );
    const types = await fleet.api<{
      types: { name: string; startingSet?: typeof SET }[];
    }>(hubRequest("GET /api/delegate-types"));
    const stored = types.types.find((type) => type.name === SET_TYPE);
    kit.check(
      "t1: a type saved through admin_delegate_types_write with a set of two skills and one server reads back with that set",
      !saved.refused &&
        same(stored?.startingSet?.skills ?? [], SET.skills) &&
        same(stored?.startingSet?.servers ?? [], SET.servers),
      `saved: ${saved.text.slice(0, 200)}; read back ${JSON.stringify(stored?.startingSet)}`
    );
    await fleet.api(
      hubRequest("PUT /api/delegate-types/:name", {
        path: { name: PLAIN_TYPE },
        body: {
          description: "A probe's type with no set",
          harness: "claude",
          model: MODEL.claude,
        },
      })
    );

    const started = {
      outside: await delegate(fleet, {
        parentInstanceId: parent,
        title: "Set delegate calling outside",
        prompt: "PROBE-SET-OUTSIDE: load the skill.",
        type: SET_TYPE,
        skills: [BRIEF_SKILL],
        host: true,
        cwd: at,
      }),
      inside: await delegate(fleet, {
        parentInstanceId: parent,
        title: "Set delegate calling inside",
        prompt: "PROBE-SET-INSIDE: load the skill.",
        type: SET_TYPE,
        host: true,
        cwd: at,
      }),
      plain: await delegate(fleet, {
        parentInstanceId: parent,
        title: "Plain delegate",
        prompt: "PROBE-PLAIN-OUTSIDE: load the skill.",
        type: PLAIN_TYPE,
        host: true,
        cwd: at,
      }),
    };
    const outside = await awaitTurns(fleet, "PROBE-SET-OUTSIDE", 2);
    const inside = await awaitTurns(fleet, "PROBE-SET-INSIDE", 2);
    const plain = await awaitTurns(fleet, "PROBE-PLAIN-OUTSIDE", 2);

    const first = outside[0] as Seen;
    const listed = listingOf(wordsOf(first.body));
    const expected = [...SET.skills, BRIEF_SKILL, ...BUNDLED_SKILLS];
    await writeFile(
      join(fleet.sandbox, "starting-set-listings.json"),
      JSON.stringify(
        {
          set: listed,
          plain: listingOf(wordsOf((plain[0] as Seen).body)),
        },
        null,
        2
      )
    );
    kit.check(
      "s1: a delegate of the set's type lists exactly its two skills, the skill its delegate call named, and CawCo's own; no other skill, the plugin's other one included",
      same(listed, expected),
      `listed ${listed.join(", ")}`
    );
    const servers = serversOf(wordsOf(first.body), first.toolNames);
    kit.check(
      "s2: its tools come from probe-in and cawco alone: no probe-out, no probe-user, no claude-in-chrome",
      same(servers, ["cawco", "probe-in"]),
      `servers ${servers.join(", ")}`
    );
    const refused = outside[1] as Seen;
    const ran = inside[1] as Seen;
    kit.check(
      "s3: its Skill call to probe-set-gamma, outside the set, is refused, and a set delegate's call to probe-set-alpha runs",
      refused.afterTool &&
        refused.toolFailed &&
        ran.afterTool &&
        !ran.toolFailed,
      `outside: failed ${refused.toolFailed}, said ${refused.last.slice(0, 300)}; inside: failed ${ran.toolFailed}, said ${ran.last.slice(0, 200)}`
    );

    const plainFirst = plain[0] as Seen;
    const plainListed = listingOf(wordsOf(plainFirst.body));
    const plainServers = serversOf(
      wordsOf(plainFirst.body),
      plainFirst.toolNames
    );
    const plainCall = plain[1] as Seen;
    kit.check(
      "n1: a delegate of a type with no set lists every skill, the plugin's both, takes every server, the account's own included, and its call to probe-set-gamma runs",
      [...SKILLS, ...PLUGIN_SKILLS].every((name) =>
        plainListed.includes(name)
      ) &&
        [...FLEET_SERVERS, USER_SERVER, "cawco"].every((name) =>
          plainServers.includes(name)
        ) &&
        plainCall.afterTool &&
        !plainCall.toolFailed,
      `listed ${plainListed.length} skills: ${plainListed.join(", ")}; servers ${plainServers.join(", ")}; call failed ${plainCall.toolFailed}`
    );

    await piLegs(kit, fleet, parent, at);

    // s4: the type changes; the running session keeps its set, a new one takes the change.
    const before = rowSet(fleet, started.inside);
    await fleet.api(
      hubRequest("PUT /api/delegate-types/:name", {
        path: { name: SET_TYPE },
        body: {
          description: "A probe's type with a starting set",
          harness: "claude",
          model: MODEL.claude,
          startingSet: CHANGED,
        },
      })
    );
    // Asked again every 15 s: a machine refuses a sleep to one not at rest.
    let askedAt = 0;
    await until(
      "the inside delegate asleep",
      async () => {
        const status = fleet.instance(started.inside)?.status ?? "";
        if (status !== "sleeping" && Date.now() - askedAt > 15_000) {
          askedAt = Date.now();
          await fleet.control(started.inside, "sleep");
        }
        return status;
      },
      (status) => status === "sleeping",
      120_000
    );
    await fleet.send(started.inside, "PROBE-SET-WOKEN: say ok.");
    const woken = await awaitTurns(fleet, "PROBE-SET-WOKEN");
    const wokenWords = wordsOf((woken[0] as Seen).body);
    const after = await delegate(fleet, {
      parentInstanceId: parent,
      title: "Set delegate after the change",
      prompt: "PROBE-SET-AFTER: say ok.",
      type: SET_TYPE,
      host: true,
      cwd: at,
    });
    const later = await awaitTurns(fleet, "PROBE-SET-AFTER");
    const laterListed = listingOf(wordsOf((later[0] as Seen).body));
    kit.check(
      "s4: a set delegate's row keeps the set it started with through a sleep and a wake after its type changed, and lists no new skill; one started after the change lists it",
      JSON.stringify(rowSet(fleet, started.inside)) ===
        JSON.stringify(before) &&
        !wokenWords.includes("probe-set-gamma") &&
        laterListed.includes("probe-set-gamma") &&
        JSON.stringify(rowSet(fleet, after)).includes("probe-set-gamma"),
      `row before ${JSON.stringify(before)}; after ${JSON.stringify(rowSet(fleet, started.inside))}; woken request names probe-set-gamma: ${wokenWords.includes("probe-set-gamma")}; later lists ${laterListed.join(", ")}`
    );
  },
};

export default spec;
