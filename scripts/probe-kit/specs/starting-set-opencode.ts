/**
 * A delegate type's starting set (core `StartingSet`, tsk-337) holds an
 * OpenCode delegate to its skills and MCP servers, with CawCo's own; a type
 * with none starts with everything. On a scratch fleet (real hub, agent,
 * sessiond and the machine's OpenCode against the mock model, which keeps
 * every request it answered). Every delegate is host-scope, so the spec runs
 * inside a workspace too.
 *
 * CawCo runs one OpenCode release (core `OPENCODE_VERSION`), found as the
 * `opencode2` binary that only 2.x installs; a machine with 1.x alone, or
 * another 2.x, starts no OpenCode session (agent tools.ts `toolGate`). So
 * the set is written in that release's own rules: the session's permission
 * set (`PATCH /session/:id`), which narrows its skill listing, its tools and
 * its servers' instructions (agent opencode-session.ts `skillAllowlist`,
 * `mcpOutside`).
 *
 * Installed for every session: three skills in OpenCode's config dir
 * (`probe-set-alpha`, `-beta`, `-gamma`, `-delta`), two fleet MCP servers (`probe-in`,
 * `probe-out`) and one in the machine's own OpenCode config (`probe-user`),
 * each a stdio server with one tool, `ping`.
 *
 * - v1. The agent's version gate finds OpenCode as `opencode2` at
 *   `OPENCODE_VERSION`: the release whose rules the set is written in.
 * - t1. A type on OpenCode saved with a set of two skills and one server
 *   reads back with that set (it was refused before).
 * - o1. Its delegate's skill listing (`<available_skills>`) is exactly those
 *   two, the skill its `delegate` call named, and those of CawCo's own the
 *   machine has; no other skill, OpenCode's own built-in ones included.
 * - o2. Its tools come from `probe-in` and `cawco` alone: no `probe-out`, no
 *   `probe-user`.
 * - o3. Its skill call to a skill outside the set is refused, and a set
 *   delegate's call to one in it loads it.
 * - n1. A delegate of a type with no set lists every skill, OpenCode's own
 *   included, takes every server, the machine's own included, and its call to
 *   the same skill loads it.
 *
 *   bun scripts/probe-kit/run.ts starting-set-opencode
 */

import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OPENCODE_SPEC } from "../../../packages/agent/src/harnesses/opencode-client";
import { toolGate } from "../../../packages/agent/src/tools";
import type { StartingSet } from "../../../packages/core/src/delegate-types";
import { fetchHub, hubRequest } from "../../../packages/core/src/hub-request";
import { OPENCODE_VERSION } from "../../../packages/core/src/tools";
import { BUNDLED_SKILLS } from "../../../packages/hub/src/bundled-skills";
import { MODEL, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const SKILLS = [
  "probe-set-alpha",
  "probe-set-beta",
  "probe-set-gamma",
  "probe-set-delta",
];
/** OpenCode's own skills, which every 2.0.29 session has (its plugin/skill.ts). */
const BUILT_IN_SKILLS = ["opencode", "report"];
/** The skill a `delegate` call names for its one delegate. */
const BRIEF_SKILL = "probe-set-beta";
const SET: StartingSet = {
  skills: ["probe-set-alpha", "probe-set-delta"],
  servers: ["probe-in"],
};
const FLEET_SERVERS = ["probe-in", "probe-out"];
const USER_SERVER = "probe-user";

const SET_TYPE = "probe-oc-set";
const PLAIN_TYPE = "probe-oc-plain";

/** The skill each delegate's first turn calls, by the tag its brief carries. */
const CALLS: Record<string, string> = {
  "PROBE-OC-SET-OUTSIDE": "probe-set-gamma",
  "PROBE-OC-SET-INSIDE": "probe-set-alpha",
  "PROBE-OC-PLAIN-OUTSIDE": "probe-set-gamma",
};

/** What a skill's body says, so a loaded skill is read in the tool's answer. */
const bodyOf = (name: string): string => `The body of ${name}.`;

/** A session's brief that names a call in {@link CALLS} is answered with that skill's call; every other request with "ok". */
const respond = (request: Seen): Reply => {
  const tag = Object.keys(CALLS).find((each) => request.last.includes(each));
  if (tag && request.tools && !request.afterTool) {
    return {
      everyMs: 5,
      words: ["Loading it."],
      tool: { name: "skill", input: { id: CALLS[tag] } },
    };
  }
  return { everyMs: 5, words: ["ok"] };
};

/** A stdio MCP server with one tool, `ping`, whose description names the server (its first argument). */
const MCP_SERVER = `const name = process.argv[2];
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
        tools: [{ name: "ping", description: "Answers pong for PROBE-SERVER-" + name, inputSchema: { type: "object", properties: {} } }],
      });
    } else if (message.method === "tools/call") {
      answer(message.id, { content: [{ type: "text", text: "pong" }] });
    } else {
      answer(message.id, {});
    }
  }
});
`;

/** OpenCode's config dir under the fleet's HOME. */
const configDir = (fleet: KitFleet): string =>
  join(fleet.env.HOME as string, ".config", "opencode");

/** The skills, in OpenCode's config dir, and the machine's own MCP server, in its config. */
const plant = async (fleet: KitFleet, server: string): Promise<void> => {
  const dir = configDir(fleet);
  for (const name of SKILLS) {
    await mkdir(join(dir, "skills", name), { recursive: true });
    await writeFile(
      join(dir, "skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: The probe's ${name}.\n---\n\n${bodyOf(name)}\n`
    );
  }
  const path = join(dir, "opencode.json");
  const held = JSON.parse(await readFile(path, "utf8")) as {
    mcp?: { servers?: Record<string, unknown> };
  };
  await writeFile(
    path,
    JSON.stringify({
      ...held,
      mcp: {
        ...held.mcp,
        servers: {
          ...held.mcp?.servers,
          [USER_SERVER]: {
            type: "local",
            command: [process.execPath, server, USER_SERVER],
          },
        },
      },
    })
  );
};

/** The requests of the session whose brief carries `tag`, with tools: its turns. */
const turnsOf = (fleet: KitFleet, tag: string): Seen[] =>
  fleet.seen.filter((one) => one.tools && one.all.includes(tag));

/** Waits for `tag`'s session to send its model `count` turns. */
const awaitTurns = (fleet: KitFleet, tag: string, count = 1) =>
  until(
    `${tag}'s turn reached the model`,
    () => turnsOf(fleet, tag),
    (turns) => turns.length >= count,
    240_000
  );

/** Every string a request's JSON body holds, joined: what its model read, escapes undone. */
const wordsOf = (body: string): string => {
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

/** The skill ids the newest `<available_skills>` block a turn's words carry names, sorted. */
const listingOf = (words: string): string[] => {
  const blocks = [
    ...words.matchAll(/<available_skills>([\s\S]*?)<\/available_skills>/gu),
  ];
  const block = blocks.at(-1)?.[1] ?? "";
  return [...block.matchAll(/<id>([^<]+)<\/id>/gu)]
    .map((match) => match[1] as string)
    .sort();
};

/** A CawCo tool as Code Mode's catalog names a server's tools: `<server>.<tool>`. */
const CAWCO_TOOL = /\bcawco\.[a-z_]+/u;

/** The probe's MCP servers whose tools a turn's words describe, sorted, CawCo's own when its tools are there. */
const serversOf = (words: string, offered: readonly string[]): string[] => [
  ...[
    ...new Set(
      [...words.matchAll(/PROBE-SERVER-([\w-]+)/gu)].map((m) => m[1] as string)
    ),
  ].sort(),
  ...(CAWCO_TOOL.test(`${words}\n${offered.join("\n")}`) ? ["cawco"] : []),
];

/** A `delegate` as its tool posts it: the started session's id, or a throw with the hub's words. */
const delegate = async (
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

/** OpenCode's refusal of a skill its session's rules deny, as its tool's answer reads (2.0.29 tool/plugin/skill.ts). */
const REFUSAL = /Permission denied: skill|Unable to load skill [\w-]+/u;

/** How `tag`'s call to `skill` was answered, read off the turn that carries its answer: loaded (the skill's body), or OpenCode's refusal in its words. */
const callAnswer = async (
  fleet: KitFleet,
  tag: string,
  skill: string
): Promise<{ loaded: boolean; said: string }> => {
  const answered = (said: string): boolean =>
    said.includes(bodyOf(skill)) || REFUSAL.test(said);
  const turns = await until(
    `${tag}'s call to ${skill} answered`,
    () => turnsOf(fleet, tag).map((turn) => wordsOf(turn.body)),
    (all) => all.some(answered),
    240_000
  );
  const words = turns.find(answered) ?? "";
  return words.includes(bodyOf(skill))
    ? { loaded: true, said: bodyOf(skill) }
    : { loaded: false, said: REFUSAL.exec(words)?.[0] ?? "" };
};

const same = (a: readonly string[], b: readonly string[]): boolean =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "starting-set-opencode",
  run: async (kit: Kit) => {
    // v1: the release the agent runs, as its own gate finds it.
    const gate = await toolGate(OPENCODE_SPEC);
    kit.check(
      "v1: the agent's version gate finds OpenCode 2 as opencode2 at the one release CawCo runs",
      !gate.refused &&
        gate.version === OPENCODE_VERSION &&
        Boolean(gate.path?.endsWith("opencode2")),
      JSON.stringify(gate)
    );

    const fleet = await kit.fleet(respond);
    const src = join(fleet.sandbox, "oc-set-src");
    await mkdir(src, { recursive: true });
    const server = join(fleet.sandbox, "probe-mcp.mjs");
    await writeFile(server, MCP_SERVER);
    await plant(fleet, server);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
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
    const at = realpathSync(src);
    const parent = await fleet.spawn("opencode", "PROBE-OC-PARENT", at, {
      permissionMode: "fullSend",
    });

    // t1: saved on OpenCode, read back whole.
    const put = await fetchHub(
      fetch,
      fleet.base,
      hubRequest("PUT /api/delegate-types/:name", {
        path: { name: SET_TYPE },
        body: {
          description: "A probe's OpenCode type with a starting set",
          harness: "opencode",
          model: MODEL.opencode,
          startingSet: SET,
        },
      })
    );
    const putSaid = await put.text();
    const types = await fleet.api<{
      types: { name: string; startingSet?: StartingSet }[];
    }>(hubRequest("GET /api/delegate-types"));
    const stored = types.types.find((type) => type.name === SET_TYPE);
    kit.check(
      "t1: a type on OpenCode saved with a set of two skills and one server reads back with that set",
      put.ok &&
        same(stored?.startingSet?.skills ?? [], SET.skills) &&
        same(stored?.startingSet?.servers ?? [], SET.servers),
      `saved ${put.status} ${putSaid.slice(0, 200)}; read back ${JSON.stringify(stored?.startingSet)}`
    );
    await fleet.api(
      hubRequest("PUT /api/delegate-types/:name", {
        path: { name: PLAIN_TYPE },
        body: {
          description: "A probe's OpenCode type with no set",
          harness: "opencode",
          model: MODEL.opencode,
        },
      })
    );

    for (const [title, prompt, type, skills] of [
      [
        "Set delegate calling outside",
        "PROBE-OC-SET-OUTSIDE",
        SET_TYPE,
        [BRIEF_SKILL],
      ],
      ["Set delegate calling inside", "PROBE-OC-SET-INSIDE", SET_TYPE, []],
      ["Plain delegate", "PROBE-OC-PLAIN-OUTSIDE", PLAIN_TYPE, []],
    ] as const) {
      await delegate(fleet, {
        parentInstanceId: parent,
        title,
        prompt: `${prompt}: load the skill.`,
        type,
        ...(skills.length > 0 ? { skills: [...skills] } : {}),
        host: true,
        cwd: at,
      });
    }
    const outside = await awaitTurns(fleet, "PROBE-OC-SET-OUTSIDE");
    const plain = await awaitTurns(fleet, "PROBE-OC-PLAIN-OUTSIDE");

    const first = outside[0] as Seen;
    const firstWords = wordsOf(first.body);
    const listed = listingOf(firstWords);
    const plainFirst = plain[0] as Seen;
    const plainWords = wordsOf(plainFirst.body);
    const plainListed = listingOf(plainWords);
    // CawCo's own skills as this machine has them: those a session with no set lists.
    const ownHere = BUNDLED_SKILLS.filter((name) => plainListed.includes(name));
    const expected = [...new Set([...SET.skills, BRIEF_SKILL, ...ownHere])];
    await writeFile(
      join(fleet.sandbox, "starting-set-opencode-listings.json"),
      JSON.stringify(
        {
          set: listed,
          setServers: serversOf(firstWords, first.toolNames),
          plain: plainListed,
          plainServers: serversOf(plainWords, plainFirst.toolNames),
        },
        null,
        2
      )
    );
    kit.check(
      "o1: an OpenCode delegate of the set's type lists exactly its two skills, the skill its delegate call named, and CawCo's own; no other skill, OpenCode's built-in ones included",
      same(listed, expected),
      `listed ${listed.join(", ")}`
    );
    const servers = serversOf(firstWords, first.toolNames);
    kit.check(
      "o2: its tools come from probe-in and cawco alone: no probe-out, no probe-user",
      same(servers, ["cawco", "probe-in"]),
      `servers ${servers.join(", ")}`
    );
    const refused = await callAnswer(
      fleet,
      "PROBE-OC-SET-OUTSIDE",
      "probe-set-gamma"
    );
    const ran = await callAnswer(
      fleet,
      "PROBE-OC-SET-INSIDE",
      "probe-set-alpha"
    );
    kit.check(
      "o3: its skill call to probe-set-gamma, outside the set, is refused, and a set delegate's call to probe-set-alpha loads it",
      !refused.loaded && refused.said !== "" && ran.loaded,
      `outside answered ${JSON.stringify(refused)}; inside answered ${JSON.stringify(ran)}`
    );

    const plainServers = serversOf(plainWords, plainFirst.toolNames);
    const plainCall = await callAnswer(
      fleet,
      "PROBE-OC-PLAIN-OUTSIDE",
      "probe-set-gamma"
    );
    kit.check(
      "n1: an OpenCode delegate of a type with no set lists every skill, OpenCode's own included, takes every server, the machine's own included, and its call to probe-set-gamma loads it",
      [...SKILLS, ...BUILT_IN_SKILLS].every((name) =>
        plainListed.includes(name)
      ) &&
        [...FLEET_SERVERS, USER_SERVER, "cawco"].every((name) =>
          plainServers.includes(name)
        ) &&
        plainCall.loaded,
      `listed ${plainListed.length} skills: ${plainListed.join(", ")}; servers ${plainServers.join(", ")}; call answered ${JSON.stringify(plainCall)}`
    );
  },
};

export default spec;
