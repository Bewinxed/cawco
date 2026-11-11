/**
 * A project's starting set (core `StartingSet`, tsk-336): a session the
 * person starts in the project begins with it, and a delegate takes its
 * type's set when the type has one, otherwise its project's, otherwise
 * everything; a project template's starter skills join any set in its
 * project, and a session continued from a delegate keeps its type's denied
 * tools and its set. On a scratch fleet (real hub, agent, sessiond and
 * Claude Code against the mock model, which keeps every request it
 * answered), with the skills, plugin and servers of `starting-set`
 * installed. Every delegate is host-scope, so the spec runs inside a
 * workspace too.
 *
 * Project Set is made from the code template (starter skill
 * `review-attempt`); project Plain names no set.
 *
 * - p1. Its set, saved through `project_settings`' `set_starting_set`, reads
 *   back through the tool and is the project's `starting-set.md`.
 * - p2. A session the person starts in Set lists exactly its set's skills,
 *   CawCo's own and the template's starter skill, and its tools come from
 *   its set's server and `cawco` alone.
 * - p3. A delegate of a type with its own set takes the type's set (and the
 *   starter skill); a delegate of a type with none takes the project's.
 * - p4. In Plain, a session the person starts and a delegate of a type with
 *   no set list every skill and take every server, and their rows keep no
 *   set: as before any set.
 * - p5. A session continued from the set type's delegate is that type still:
 *   its row names the type and keeps the delegate's set, its tools leave out
 *   the type's denied `Write`, and it lists the delegate's set.
 * - p6. A type of Set's own (`delegates/probe-proj-own.md`) naming a
 *   `starting_set` reads back with it through `list_delegate_types`, and a
 *   delegate of it lists exactly that set, CawCo's own and the template's
 *   starter skill, its tools from that set's server and `cawco` alone.
 * - p7. A type file whose `starting_set` is malformed, or names a blank
 *   skill, is refused when a session writes it, with a sentence naming
 *   what to fix.
 *
 *   bun scripts/probe-kit/run.ts project-starting-set
 */

import { existsSync, realpathSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { StartingSet } from "../../../packages/core/src/delegate-types";
import { fetchHub, hubRequest } from "../../../packages/core/src/hub-request";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import { delegateTypesWords } from "../../../packages/core/src/words/delegate-types";
import { projectSettingsWords } from "../../../packages/core/src/words/project-settings";
import {
  BUNDLED_SKILLS,
  TEMPLATE_SKILLS,
} from "../../../packages/hub/src/bundled-skills";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, MODEL, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import {
  awaitTurns,
  delegate,
  FLEET_SERVERS,
  listingOf,
  PLUGIN_SKILLS,
  rowSet,
  SKILLS,
  same,
  serversOf,
  setUp,
  USER_SERVER,
  wordsOf,
} from "./starting-set";

/** The project's set: one skill of the account's, one of the plugin's, one fleet server. */
const PROJECT_SET: StartingSet = {
  skills: ["probe-set-beta", "probe-plug:plug-outside"],
  servers: ["probe-out"],
};
/** The type's set, which wins over the project's. */
const TYPE_SET: StartingSet = {
  skills: ["probe-set-alpha"],
  servers: ["probe-in"],
};
const STARTERS = TEMPLATE_SKILLS.code;
const DENIED = "Write";

/** The set Set's own type file names: a skill of the account's, one of the plugin's, one fleet server. */
const OWN_SET: StartingSet = {
  skills: ["probe-set-gamma", "probe-plug:plug-inside"],
  servers: ["probe-in"],
};
const OWN_TYPE = "probe-proj-own";

/** A project type file with `startingSet` as its front matter writes it: one list inline, one as a block sequence. */
const ownTypeFile = (startingSet: string): string =>
  `---\nharness: claude\nmodel: ${MODEL.claude}\ndescription: A probe's project type with its own starting set\n${startingSet}---\nSay ok.\n`;

const SET_TYPE = "probe-proj-set";
const PLAIN_TYPE = "probe-proj-plain";

/** What a session of `set` lists: its skills, CawCo's own and the template's starter skills. */
const listsOf = (set: StartingSet): string[] => [
  ...new Set([...set.skills, ...BUNDLED_SKILLS, ...STARTERS]),
];

/** The first turn of the session whose words carry `tag`: what it lists, the servers its tools come from, its tool names. */
const firstTurn = async (fleet: KitFleet, tag: string) => {
  const [first] = await awaitTurns(fleet, tag);
  const seen = first as Seen;
  const words = wordsOf(seen.body);
  return {
    listed: listingOf(words),
    servers: serversOf(words, seen.toolNames),
    tools: seen.toolNames,
  };
};

/** A session the person starts in `projectId`, and its first turn, sent `tag`. */
const personStarts = async (
  fleet: KitFleet,
  tag: string,
  cwd: string,
  projectId: string,
  mode?: string
) => {
  const id = await fleet.spawn("claude", tag, cwd, {
    projectId,
    ...(mode ? { permissionMode: mode } : {}),
  });
  await fleet.send(id, `${tag}: say ok.`);
  return { id, ...(await firstTurn(fleet, tag)) };
};

/** A project at `cwd` on the fleet's machine, with no conversation. */
const project = async (
  fleet: KitFleet,
  name: string,
  cwd: string
): Promise<string> => {
  const made = await fleet.api<{ id: string }>(
    hubRequest("POST /api/projects", {
      body: { name, machineId: MACHINE, cwd, caw: false },
    })
  );
  return made.id;
};

/** A session's row's type, as the hub's database holds it. */
const rowType = (fleet: KitFleet, instanceId: string): string | null =>
  fleet.query<{ delegate_type: string | null }>(
    "SELECT delegate_type FROM instances WHERE id = ?",
    instanceId
  )[0]?.delegate_type ?? null;

/** `source` continued from its asks, as its own `continue_session` asks it: the new session's id. */
const continueFromAsks = async (
  fleet: KitFleet,
  source: string
): Promise<string> => {
  const response = await fetchHub(
    fetch,
    fleet.base,
    hubRequest("POST /api/instances/:id/continue", {
      path: { id: source },
      body: {
        asksOnly: true,
        askedBy: source,
        target: {
          harness: "claude",
          model: MODEL.claude,
          permissionMode: "bypassPermissions",
        },
      },
    })
  );
  const said = await response.text();
  if (!response.ok) {
    throw new Error(`continue refused: ${response.status} ${said}`);
  }
  const target = (JSON.parse(said) as { targetInstanceId?: string })
    .targetInstanceId;
  if (!target) {
    throw new Error(`continue named no session: ${said}`);
  }
  return target;
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "project-starting-set",
  run: async (kit: Kit) => {
    const fleet = await setUp(kit, () => ({ everyMs: 5, words: ["ok"] }));
    const roots = {
      set: join(fleet.sandbox, "proj-set"),
      plain: join(fleet.sandbox, "proj-plain"),
    };
    await mkdir(roots.set, { recursive: true });
    await mkdir(roots.plain, { recursive: true });
    const at = {
      set: realpathSync(roots.set),
      plain: realpathSync(roots.plain),
    };
    const setProject = await project(fleet, "Set", at.set);
    const plainProject = await project(fleet, "Plain", at.plain);
    await fleet.api(
      hubRequest("POST /api/projects/:id/stages/template", {
        path: { id: setProject },
        body: { template: "code" },
      })
    );
    await until(
      "the code template's starter skills placed in Set's checkout",
      () =>
        STARTERS.every((name) =>
          existsSync(projectClaudeDir(at.set, "skills", name, "SKILL.md"))
        ),
      (placed) => placed,
      180_000
    );
    for (const [name, startingSet] of [
      [SET_TYPE, TYPE_SET],
      [PLAIN_TYPE, undefined],
    ] as const) {
      await fleet.api(
        hubRequest("PUT /api/delegate-types/:name", {
          path: { name },
          body: {
            description: `A probe's type${startingSet ? " with a starting set" : ""}`,
            harness: "claude",
            model: MODEL.claude,
            denyTools: [DENIED],
            ...(startingSet ? { startingSet } : {}),
          },
        })
      );
    }

    // p1: saved through project_settings, read back through it and from the folder.
    // In Full Send, so the tool runs at once (hub asks.ts); it began before the set.
    const parent = await personStarts(
      fleet,
      "PROBE-PROJ-PARENT",
      at.set,
      setProject,
      "fullSend"
    );
    const session = {
      base: fleet.base,
      id: parent.id,
      credential: await fleet.sessionCredential(parent.id),
    };
    const saved = await toolWords(session, "project_settings", {
      changes: [{ kind: "set_starting_set", starting_set: PROJECT_SET }],
      reason: "The project starting-set probe's set.",
    });
    const read = await toolWords(session, "project_settings", {});
    const file = await fleet.api<{ content: string }>(
      hubRequest("GET /api/projects/:id/folder/file", {
        path: { id: setProject },
        query: { path: "starting-set.md" },
      })
    );
    kit.check(
      "p1: a project's set saved through project_settings reads back through it and is the project's starting-set.md",
      !(saved.refused || read.refused) &&
        read.text.includes(projectSettingsWords.startingSetRead(PROJECT_SET)) &&
        file.content.includes(
          'skills: [probe-set-beta, "probe-plug:plug-outside"]'
        ) &&
        file.content.includes("servers: [probe-out]"),
      `saved: ${saved.text.slice(0, 200)}; read: ${read.text
        .split("\n")
        .filter((line) => line.includes("set_starting_set"))
        .join(" ")}; file: ${JSON.stringify(file.content)}`
    );

    // p2: the person's own session in Set.
    const person = await personStarts(
      fleet,
      "PROBE-PROJ-PERSON",
      at.set,
      setProject
    );
    kit.check(
      "p2: a session the person starts in the project lists exactly its set's skills, CawCo's own and its template's starter skill, and its tools come from its set's server and cawco alone",
      same(person.listed, listsOf(PROJECT_SET)) &&
        same(person.servers, ["cawco", ...PROJECT_SET.servers]),
      `listed ${person.listed.join(", ")}; servers ${person.servers.join(", ")}`
    );

    // p3: a delegate takes its type's set, else its project's.
    const typed = await delegate(fleet, {
      parentInstanceId: parent.id,
      title: "Typed delegate",
      prompt: "PROBE-PROJ-TYPED: say ok.",
      type: SET_TYPE,
      host: true,
      cwd: at.set,
    });
    await delegate(fleet, {
      parentInstanceId: parent.id,
      title: "Delegate of a type with no set",
      prompt: "PROBE-PROJ-UNTYPED: say ok.",
      type: PLAIN_TYPE,
      host: true,
      cwd: at.set,
    });
    const typedTurn = await firstTurn(fleet, "PROBE-PROJ-TYPED");
    const untypedTurn = await firstTurn(fleet, "PROBE-PROJ-UNTYPED");
    kit.check(
      "p3: a delegate of a type with its own set takes the type's set, the template's starter skill among it; a delegate of a type with none takes the project's",
      same(typedTurn.listed, listsOf(TYPE_SET)) &&
        same(typedTurn.servers, ["cawco", ...TYPE_SET.servers]) &&
        STARTERS.every((name) => typedTurn.listed.includes(name)) &&
        same(untypedTurn.listed, listsOf(PROJECT_SET)) &&
        same(untypedTurn.servers, ["cawco", ...PROJECT_SET.servers]),
      `typed lists ${typedTurn.listed.join(", ")} from ${typedTurn.servers.join(", ")}; untyped lists ${untypedTurn.listed.join(", ")} from ${untypedTurn.servers.join(", ")}`
    );

    // p4: a project with no set, as before any set.
    const plainPerson = await personStarts(
      fleet,
      "PROBE-PLAIN-PERSON",
      at.plain,
      plainProject
    );
    const plainParent = await personStarts(
      fleet,
      "PROBE-PLAIN-PARENT",
      at.plain,
      plainProject
    );
    const plainDelegate = await delegate(fleet, {
      parentInstanceId: plainParent.id,
      title: "Plain project's delegate",
      prompt: "PROBE-PLAIN-DELEGATE: say ok.",
      type: PLAIN_TYPE,
      host: true,
      cwd: at.plain,
    });
    const plainTurn = await firstTurn(fleet, "PROBE-PLAIN-DELEGATE");
    const everything = (turn: { listed: string[]; servers: string[] }) =>
      [...SKILLS, ...PLUGIN_SKILLS].every((name) =>
        turn.listed.includes(name)
      ) &&
      [...FLEET_SERVERS, USER_SERVER, "cawco"].every((name) =>
        turn.servers.includes(name)
      );
    kit.check(
      "p4: in a project with no set, a session the person starts and a delegate of a type with no set list every skill and take every server, and their rows keep no set",
      everything(plainPerson) &&
        everything(plainTurn) &&
        rowSet(fleet, plainPerson.id) === null &&
        rowSet(fleet, plainDelegate) === null,
      `person lists ${plainPerson.listed.length} skills from ${plainPerson.servers.join(", ")}; delegate lists ${plainTurn.listed.length} skills from ${plainTurn.servers.join(", ")}; rows ${JSON.stringify(rowSet(fleet, plainPerson.id))}, ${JSON.stringify(rowSet(fleet, plainDelegate))}`
    );

    // p5: the typed delegate continued.
    // Read before it goes on: the continuation folds its row into the new one.
    const began = rowSet(fleet, typed);
    const before = fleet.seen.length;
    const target = await continueFromAsks(fleet, typed);
    // Its turns alone: no person's session's words are in them.
    const [opening] = await until(
      "the continued session's first turn reached the model",
      () =>
        fleet.seen
          .slice(before)
          .filter(
            (one) =>
              one.tools &&
              !["PROBE-PROJ-PARENT", "PROBE-PROJ-PERSON", "PROBE-PLAIN"].some(
                (tag) => one.all.includes(tag)
              )
          ),
      (turns) => turns.length > 0,
      180_000
    );
    const goneOn = opening as Seen;
    const goneOnListed = listingOf(wordsOf(goneOn.body));
    kit.check(
      "p5: a session continued from a delegate of a type with a set is that type still: its row names the type and keeps the delegate's set, its tools leave out the type's denied Write, and it lists the delegate's set",
      rowType(fleet, target) === SET_TYPE &&
        began !== null &&
        JSON.stringify(rowSet(fleet, target)) === JSON.stringify(began) &&
        !typedTurn.tools.includes(DENIED) &&
        !goneOn.toolNames.includes(DENIED) &&
        plainPerson.tools.includes(DENIED) &&
        same(goneOnListed, listsOf(TYPE_SET)),
      `row type ${rowType(fleet, target)}; set ${JSON.stringify(rowSet(fleet, target))} (the delegate's ${JSON.stringify(began)}); ${DENIED} offered to the delegate ${typedTurn.tools.includes(DENIED)}, to the continued session ${goneOn.toolNames.includes(DENIED)}, to a session of no type ${plainPerson.tools.includes(DENIED)}; lists ${goneOnListed.join(", ")}`
    );

    // p6: a type of Set's own names a set: it reads back, and its delegate takes it.
    await fleet.api(
      hubRequest("PUT /api/projects/:id/folder/file", {
        path: { id: setProject },
        body: {
          path: `delegates/${OWN_TYPE}.md`,
          content: ownTypeFile(
            'starting_set:\n  skills: [probe-set-gamma, "probe-plug:plug-inside"]\n  servers:\n    - probe-in\n'
          ),
        },
      })
    );
    const catalog = await toolWords(session, "list_delegate_types", {});
    const ownLine = catalog.text
      .split("\n")
      .find((line) => line.includes(OWN_TYPE));
    await delegate(fleet, {
      parentInstanceId: parent.id,
      title: "Delegate of a project type with a set",
      prompt: "PROBE-PROJ-OWN: say ok.",
      type: OWN_TYPE,
      host: true,
      cwd: at.set,
    });
    const ownTurn = await firstTurn(fleet, "PROBE-PROJ-OWN");
    kit.check(
      "p6: a project type file naming a starting set reads back with it through list_delegate_types, and a delegate of it lists exactly that set, CawCo's own and its template's starter skill, its tools from that set's server and cawco alone",
      !catalog.refused &&
        ownLine !== undefined &&
        OWN_SET.skills.every((name) => ownLine.includes(name)) &&
        OWN_SET.servers.every((name) => ownLine.includes(name)) &&
        same(ownTurn.listed, listsOf(OWN_SET)) &&
        same(ownTurn.servers, ["cawco", ...OWN_SET.servers]),
      `listed as: ${ownLine}; delegate lists ${ownTurn.listed.join(", ")}; servers ${ownTurn.servers.join(", ")}`
    );

    // p7: a malformed set and a blank name, each refused as a session writes the file.
    const refusals = await Promise.all(
      [
        "starting_set: [probe-set-gamma]\n",
        'starting_set:\n  skills: [probe-set-gamma, " "]\n',
      ].map((startingSet, index) =>
        toolWords(session, "folder_write", {
          path: `delegates/probe-proj-bad-${index}.md`,
          content: ownTypeFile(startingSet),
        })
      )
    );
    const [malformed, blank] = refusals;
    kit.check(
      "p7: a project type file with a malformed starting set, or one naming a blank skill, is refused when written, with a sentence saying what to fix",
      malformed.refused &&
        malformed.text.includes(delegateTypesWords.problemStartingSetForm) &&
        blank.refused &&
        blank.text.includes(delegateTypesWords.problemStartingSetBlank),
      `malformed: ${malformed.text}; blank: ${blank.text}`
    );
  },
};

export default spec;
