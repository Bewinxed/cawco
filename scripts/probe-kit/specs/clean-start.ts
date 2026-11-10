/**
 * A session started clean (core `SpawnPayload.clean`) sends its model none
 * of the instruction context, and one started without it still sends it all.
 * On a scratch fleet (real hub, agent and sessiond; each harness against the
 * mock model, which keeps every request it answered). Every delegate here is
 * host-scope, so no workspace boundary is cut and the spec runs inside a
 * workspace too.
 *
 * Every instruction source a harness reads holds a canary of its own:
 * Claude Code's account CLAUDE.md, a skill, an agent, a settings hook that
 * adds context, its auto memory's MEMORY.md, and the folder's CLAUDE.md; pi's
 * own AGENTS.md, APPEND_SYSTEM.md and skill, and the folder's AGENTS.md;
 * CawCo's role memory documents (one for a person's session, one for a
 * leaf); a delegate type whose skill's body holds one. CawCo's own words
 * are read by their text: its MCP server's instructions (core
 * `REFERENCE_GUIDANCE`) and the person's presence line (core
 * `presenceLine`).
 *
 * - n1–n4. A New-session start (the dashboard's spawn frame) on Claude Code
 *   and on pi, with and without clean: the request that carries the
 *   person's message holds every canary of its harness and CawCo's words
 *   without clean, and none of them clean; the clean one is still offered
 *   CawCo's tools; each row says whether it started clean.
 * - d1–d4. A host-scope delegate on Claude Code and on pi, of a type with a
 *   skill, with and without `clean`: the same, the type's skill's body
 *   among the canaries (a clean delegate drops its type's skills).
 * - r1. A clean New-session start on OpenCode is refused in core
 *   `harnessWords.openCodeNotClean`, and no row is made.
 * - r2. A clean delegate on OpenCode is refused the same, and one naming
 *   skills is refused in `harnessWords.cleanWith("skills")`.
 *
 *   bun scripts/probe-kit/run.ts clean-start
 */

import { realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import type { HarnessKind } from "../../../packages/core/src/harness/kinds";
import { presenceLine } from "../../../packages/core/src/injected";
import { REFERENCE_GUIDANCE } from "../../../packages/core/src/references";
import { harnessWords } from "../../../packages/core/src/words/harness";
import {
  ACCOUNT,
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { hubAt, said as saidOf } from "../hub";
import { delegateStarted, type Kit, type KitFleet, type Spec } from "../kit";

/**
 * The skill a delegate type loads, in each harness's own skills folder. Its
 * name is Claude Code's canary for its skills: with as many skills as a
 * fleet's account holds, its listing names each skill without its
 * description.
 */
const SKILL = "probe-canary-skill";

/** Each instruction source's canary: only that source can put it in a request. */
const CANARY = {
  userClaudeMd: "PROBE-CANARY-USER-CLAUDE-MD",
  projectClaudeMd: "PROBE-CANARY-PROJECT-CLAUDE-MD",
  userSkill: SKILL,
  userAgent: "PROBE-CANARY-USER-AGENT",
  autoMemory: "PROBE-CANARY-AUTO-MEMORY",
  hook: "PROBE-CANARY-SETTINGS-HOOK",
  projectAgentsMd: "PROBE-CANARY-PROJECT-AGENTS-MD",
  piAgentsMd: "PROBE-CANARY-PI-AGENTS-MD",
  piAppend: "PROBE-CANARY-PI-APPEND-SYSTEM",
  piSkill: "PROBE-CANARY-PI-SKILL",
  memoryDoc: "PROBE-CANARY-MEMORY-DOC",
  typeSkillBody: "PROBE-CANARY-TYPE-SKILL-BODY",
} as const;
type Source = keyof typeof CANARY;

/** CawCo's own words in a session's context, by what puts them there. */
const CAWCO_WORDS = {
  serverInstructions: REFERENCE_GUIDANCE,
  presence: presenceLine({ kind: "on" }),
} as const;
type CawcoSource = keyof typeof CAWCO_WORDS;

/**
 * The sources each harness reads without clean ({@link CANARY}). Claude
 * Code's agents are not among them: it lists them in its Agent tool, which a
 * CawCo session is not offered up front, so they reach no request either
 * way; a clean session's are still read for ({@link EVERY_SOURCE}).
 */
const READS: Record<"claude" | "pi", Source[]> = {
  claude: [
    "userClaudeMd",
    "projectClaudeMd",
    "userSkill",
    "autoMemory",
    "hook",
    "memoryDoc",
  ],
  pi: ["projectAgentsMd", "piAgentsMd", "piAppend", "piSkill", "memoryDoc"],
};

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** Every session's answer: a word, whatever it was asked. */
const respond = (_request: Seen): Reply => text("ok");

/** A skill's SKILL.md, its description and body given. */
const skillFile = (description: string, body: string): string =>
  `---\nname: ${SKILL}\ndescription: ${description}\n---\n\n${body}\n`;

/**
 * Claude Code's folder name for a project's sessions and auto memory under
 * its config dir: the path with every character but a letter or digit made
 * `-`.
 */
const claudeProjectDir = (cwd: string): string =>
  cwd.replace(/[^a-zA-Z0-9]/gu, "-");

/** Plants every canary where its harness reads it, `src` being the folder sessions start in. */
const plant = async (fleet: KitFleet, src: string): Promise<void> => {
  const home = fleet.env.HOME as string;
  const account = join(home, ".cawco", "accounts", ACCOUNT, "claude");
  const pi = join(home, ".pi", "agent");
  const files: Record<string, string> = {
    [join(account, "CLAUDE.md")]: `${CANARY.userClaudeMd}\n`,
    [join(account, "skills", SKILL, "SKILL.md")]: skillFile(
      "A probe's skill",
      CANARY.typeSkillBody
    ),
    [join(account, "agents", "probe-agent.md")]:
      `---\nname: probe-agent\ndescription: ${CANARY.userAgent} helper\n---\n\nYou help.\n`,
    [join(account, "settings.json")]: JSON.stringify({
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: "command",
                command: `echo '${JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: CANARY.hook } })}'`,
              },
            ],
          },
        ],
      },
    }),
    [join(account, "projects", claudeProjectDir(src), "memory", "MEMORY.md")]:
      `${CANARY.autoMemory}\n`,
    [join(src, "CLAUDE.md")]: `${CANARY.projectClaudeMd}\n`,
    [join(src, "AGENTS.md")]: `${CANARY.projectAgentsMd}\n`,
    [join(pi, "AGENTS.md")]: `${CANARY.piAgentsMd}\n`,
    [join(pi, "APPEND_SYSTEM.md")]: `${CANARY.piAppend}\n`,
    [join(pi, "skills", SKILL, "SKILL.md")]: skillFile(
      `${CANARY.piSkill} use it for probes`,
      CANARY.typeSkillBody
    ),
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, content);
  }
};

/** The requests of the session whose messages carry `tag`, joined: everything its model was sent. */
const sentFor = (fleet: KitFleet, tag: string): string =>
  fleet.seen
    .filter((one) => one.tools && one.all.includes(tag))
    .map((one) => one.body)
    .join("\n");

/** Waits for `tag`'s session to send its model a turn, and answers what it sent. */
const turnOf = async (fleet: KitFleet, tag: string): Promise<string> => {
  await until(
    `${tag}'s turn reached the model`,
    () => fleet.seen.find((one) => one.tools && one.all.includes(tag)),
    Boolean,
    180_000
  );
  return sentFor(fleet, tag);
};

/** What of `sources` and CawCo's `words` a request carries, and what it lacks. */
const read = (
  sent: string,
  sources: readonly Source[],
  words: readonly CawcoSource[]
): { has: string[]; lacks: string[] } => {
  const all = [
    ...sources.map((source) => [source, CANARY[source]] as const),
    ...words.map((word) => [word, CAWCO_WORDS[word]] as const),
  ];
  return {
    has: all.filter(([, said]) => sent.includes(said)).map(([name]) => name),
    lacks: all.filter(([, said]) => !sent.includes(said)).map(([name]) => name),
  };
};

/** Every source and every word: what a clean session's requests hold none of. */
const EVERY_SOURCE = Object.keys(CANARY) as Source[];
const EVERY_WORD = Object.keys(CAWCO_WORDS) as CawcoSource[];

/** Whether session `instanceId`'s row says it started clean. */
const rowClean = (fleet: KitFleet, instanceId: string): boolean | undefined => {
  const [row] = fleet.query<{ clean: number }>(
    "SELECT clean FROM instances WHERE id = ?",
    instanceId
  );
  return row ? row.clean === 1 : undefined;
};

/**
 * One session with its context and one clean, on `harness`: the first's
 * requests carry `expected` and `words`, the clean one's none of anything,
 * and each row says how it started.
 */
const compare = (
  kit: Kit,
  fleet: KitFleet,
  legs: { full: string; clean: string },
  what: string,
  expected: readonly Source[],
  words: readonly CawcoSource[],
  rows: { full: string; clean: string },
  sent: { full: string; clean: string },
  tags: { full: string; clean: string }
): void => {
  const full = read(sent.full, expected, words);
  kit.check(
    `${legs.full}: ${what} started with its context sends its model every instruction source it reads (${[...expected, ...words].join(", ")})`,
    full.lacks.length === 0,
    `lacks ${full.lacks.join(", ") || "none"}; ${sent.full.length} chars sent`
  );
  const clean = read(sent.clean, EVERY_SOURCE, EVERY_WORD);
  kit.check(
    `${legs.clean}: ${what} started clean sends its model none of them, nor CawCo's server instructions or presence line`,
    sent.clean.length > 0 && clean.has.length === 0,
    `holds ${clean.has.join(", ") || "none"}; ${sent.clean.length} chars sent`
  );
  const offered = fleet.seen
    .filter((one) => one.tools && one.all.includes(tags.clean))
    .flatMap((one) => one.toolNames);
  kit.check(
    `${legs.clean}: it is still offered CawCo's tools, handoff among them`,
    offered.some((name) => name.endsWith("handoff")),
    `offered ${[...new Set(offered)].join(", ")}`
  );
  kit.check(
    `${legs.clean}: its row says it started clean, and the other's says it did not`,
    rowClean(fleet, rows.clean) === true &&
      rowClean(fleet, rows.full) === false,
    `clean ${rowClean(fleet, rows.clean)}; full ${rowClean(fleet, rows.full)}`
  );
};

/** A spawn on the dashboard's socket, as the New session form sends one: the hub's refusal in its words, or undefined when none came within 20 s. */
const spawnRefusal = async (
  fleet: KitFleet,
  payload: object
): Promise<{ instanceId: string; words: string | undefined }> => {
  const socket = new WebSocket(
    `${fleet.base.replace("http", "ws")}/ws/dashboard`
  );
  await new Promise<void>((done, fail) => {
    socket.onopen = () => done();
    socket.onerror = () => fail(new Error("the dashboard socket did not open"));
  });
  const instanceId = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const words = readWithin(
    20_000,
    () =>
      new Promise<string | undefined>((resolve) => {
        socket.addEventListener("message", (event) => {
          const heard = JSON.parse(String(event.data)) as {
            payload?: { kind?: string; message?: string };
            requestId?: string;
          };
          if (
            heard.requestId === requestId &&
            heard.payload?.kind === "error"
          ) {
            resolve(heard.payload.message);
          }
        });
      })
  );
  socket.send(
    JSON.stringify({
      verb: "spawn",
      machineId: MACHINE,
      instanceId,
      requestId,
      payload: { instanceId, ...payload },
    })
  );
  const said = await words;
  socket.close();
  return {
    instanceId,
    words: said.kind === "answered" ? said.value : undefined,
  };
};

/** A `delegate` as its tool posts it: the hub's status and words. */
const delegate = async (
  fleet: KitFleet,
  body: Record<string, unknown> & { parentInstanceId: string }
) => {
  const response = await hubAt(fleet.base).api["work-items"].post(
    body as never
  );
  return saidOf(response);
};

/** The delegate type each harness's delegates run as: its skill is {@link SKILL}. */
const typeFor = (harness: "claude" | "pi"): string =>
  `probe-skilled-${harness}`;

/** n1–n4: a New-session start on `harness`, with and without clean. */
const newSessions = async (
  kit: Kit,
  fleet: KitFleet,
  src: string,
  harness: "claude" | "pi",
  legs: { full: string; clean: string }
): Promise<string> => {
  const tags = {
    full: `PROBE-CLEAN-START-${harness.toUpperCase()}-FULL`,
    clean: `PROBE-CLEAN-START-${harness.toUpperCase()}-CLEAN`,
  };
  const full = await fleet.spawn(harness, tags.full, src);
  const clean = await fleet.spawn(harness, tags.clean, src, { clean: true });
  await fleet.send(full, `${tags.full}: say ok.`);
  await fleet.send(clean, `${tags.clean}: say ok.`);
  compare(
    kit,
    fleet,
    legs,
    `a New-session start on ${harness}`,
    READS[harness],
    harness === "claude" ? ["serverInstructions", "presence"] : ["presence"],
    { full, clean },
    {
      full: await turnOf(fleet, tags.full),
      clean: await turnOf(fleet, tags.clean),
    },
    tags
  );
  return full;
};

/** d1–d4: a host-scope delegate of a skilled type on `harness`, with and without `clean`. */
const delegates = async (
  kit: Kit,
  fleet: KitFleet,
  src: string,
  parent: string,
  harness: "claude" | "pi",
  legs: { full: string; clean: string }
): Promise<void> => {
  const tags = {
    full: `PROBE-CLEAN-DELEGATE-${harness.toUpperCase()}-FULL`,
    clean: `PROBE-CLEAN-DELEGATE-${harness.toUpperCase()}-CLEAN`,
  };
  const started: Record<"full" | "clean", { instanceId?: string }> = {
    full: {},
    clean: {},
  };
  for (const leg of ["full", "clean"] as const) {
    const answer = await delegate(fleet, {
      parentInstanceId: parent,
      title: `${harness} ${leg} delegate`,
      prompt: `${tags[leg]}: say ok.`,
      type: typeFor(harness),
      host: true,
      cwd: src,
      ...(leg === "clean" ? { clean: true } : {}),
    });
    if (answer.refused || answer.status !== 200) {
      throw new Error(
        `${legs[leg]}: the ${leg} delegate on ${harness} was refused: ${answer.status} ${answer.text}`
      );
    }
    started[leg] = delegateStarted(answer.json);
  }
  compare(
    kit,
    fleet,
    legs,
    `a host-scope delegate on ${harness} of a type with a skill`,
    [...READS[harness], "typeSkillBody"],
    harness === "claude" ? ["serverInstructions"] : [],
    {
      full: started.full.instanceId ?? "",
      clean: started.clean.instanceId ?? "",
    },
    {
      full: await turnOf(fleet, tags.full),
      clean: await turnOf(fleet, tags.clean),
    },
    tags
  );
};

/** r1–r2: what can't start clean is refused, and nothing of it is made. */
const refusals = async (
  kit: Kit,
  fleet: KitFleet,
  src: string,
  parent: string
): Promise<void> => {
  const started = await spawnRefusal(fleet, {
    cwd: src,
    harness: "opencode" satisfies HarnessKind,
    model: MODEL.opencode,
    permissionMode: "bypassPermissions",
    title: "Clean on OpenCode",
    clean: true,
  });
  kit.check(
    "r1: a clean New-session start on OpenCode is refused in words saying why, and no session is made",
    started.words === harnessWords.openCodeNotClean &&
      fleet.instance(started.instanceId) === undefined,
    `said ${started.words ?? "nothing"}; row ${JSON.stringify(fleet.instance(started.instanceId) ?? null)}`
  );
  const onOpencode = await delegate(fleet, {
    parentInstanceId: parent,
    title: "Clean delegate on OpenCode",
    prompt: "Say ok.",
    harness: "opencode",
    model: MODEL.opencode,
    host: true,
    cwd: src,
    clean: true,
  });
  const withSkills = await delegate(fleet, {
    parentInstanceId: parent,
    title: "Clean delegate with skills",
    prompt: "Say ok.",
    skills: [SKILL],
    host: true,
    cwd: src,
    clean: true,
  });
  kit.check(
    "r2: a clean delegate on OpenCode, and one naming skills, are each refused in words saying why",
    onOpencode.status === 400 &&
      onOpencode.text.includes(harnessWords.openCodeNotClean) &&
      withSkills.status === 400 &&
      withSkills.text.includes(harnessWords.cleanWith("skills")),
    `OpenCode: ${onOpencode.status} ${onOpencode.text}; skills: ${withSkills.status} ${withSkills.text}`
  );
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "clean-start",
  run: async (kit: Kit) => {
    const fleet = await kit.fleet(respond);
    const src = join(fleet.sandbox, "clean-src");
    await mkdir(src, { recursive: true });
    await plant(fleet, realpathSync(src));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    // CawCo's role memory documents: a person's session's, and a leaf's.
    for (const role of ["orchestrator", "leaf"] as const) {
      await fleet.api((hub) =>
        hub.api.fleet.memory.docs.put({
          path: `roles/probe-${role}.md`,
          content: `${CANARY.memoryDoc}\n`,
          scope: { role },
        })
      );
    }
    for (const harness of ["claude", "pi"] as const) {
      await fleet.api((hub) =>
        hub.api["delegate-types"]({ name: typeFor(harness) }).put({
          description: `A probe's type on ${harness}, with a skill`,
          harness,
          model: MODEL[harness],
          skills: [SKILL],
        })
      );
    }
    const at = realpathSync(src);
    const parent = await newSessions(kit, fleet, at, "claude", {
      full: "n1",
      clean: "n2",
    });
    await newSessions(kit, fleet, at, "pi", { full: "n3", clean: "n4" });
    await delegates(kit, fleet, at, parent, "claude", {
      full: "d1",
      clean: "d2",
    });
    await delegates(kit, fleet, at, parent, "pi", { full: "d3", clean: "d4" });
    await refusals(kit, fleet, at, parent);
  },
};

export default spec;
