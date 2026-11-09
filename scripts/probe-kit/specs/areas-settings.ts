/**
 * An area's settings reach its projects (core areas.ts, hub areas.ts), on an
 * in-process hub over a scratch database, through the hub's own routes and
 * the readers that act on each setting:
 *
 * - a. One area with an account (moving at its limit), a monthly budget
 *   that pauses, a Caw mode, a decides.md handing Scope to the advisor and
 *   a delegate type in its folder; a memory document, a connection and a
 *   rule scoped to it; a skill, an MCP server, a hook and a harness
 *   setting bound to it. Two projects in it, the second with an account of
 *   its own.
 * - b. Every reader answers each project the area's value with source
 *   `area`, and the second project its own account with source `project`:
 *   the settings in effect on `GET /api/projects` (account, at its limit,
 *   Caw mode, budget, rule at the budget, and the cap the caps read),
 *   placement (placement.ts `place`, `runningAccounts`), Who decides
 *   (`GET …/decides`), the delegate type catalog (`GET …/delegate-types`),
 *   the memory document a session there launches with (core
 *   `sessionTakes`), the connection its sessions are granted
 *   (`namesForProject`), the rule's scope (core `ruleInScope`), and the
 *   fleet rows a machine holding the project is sent as that project's
 *   (project-placements.ts `projectRowsFor`), none of them every machine's
 *   (`unbound`). A project outside the area takes none of them.
 * - c. Moved out (`PUT /api/projects/:id/area` null), the first project
 *   falls back to the fleet's on every reader, and the move says so; put
 *   back, it takes them again.
 * - d. Forgotten and restored, the first project is in its area still.
 * - e. The area deleted: both projects are in none, nothing of them is
 *   deleted, the answer says what falls back ("1 project falls back to the
 *   fleet's account", the second keeping its own) and what went with it
 *   (its rule, the fleet rows bound to it, the memory document scoped to it
 *   alone, rather than that one reaching every project), and every reader
 *   answers the fleet's, the second project its own account.
 * - f. Undo never widens: a memory document scoped to the area alone, and a
 *   hook bound to it, each deleted while the area stood, are refused their
 *   Undo once the area went, in core's words, and stay gone; so are a
 *   document scoped to a project alone and a skill and an MCP server bound
 *   to it, once that project is forgotten. A skill bound to it that was
 *   not deleted goes with its forget and comes back with its restore.
 *
 *   bun scripts/probe-kit/run.ts areas-settings
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type HubRequest,
  hubInit,
  hubRequest,
} from "../../../packages/core/src/hub-request";
import type { hubInProcess as inProcess } from "../../../packages/hub/scripts/hub-in-process";
import type { Kit, Spec } from "../kit";

const MACHINE = "probe-areas-machine";

interface Answer {
  json: unknown;
  status: number;
  text: string;
}

type Hub = Awaited<ReturnType<typeof inProcess>>;

interface Rig {
  call: (request: HubRequest) => Promise<Answer>;
  db: Hub["db"];
  kit: Kit;
}

/** What the probe made: the area, its two projects, one outside, and the fleet's rows. */
interface Made {
  accountArea: string;
  accountOwn: string;
  area: string;
  connection: string;
  first: string;
  /** The hook bound to the area, by its id. */
  hook: string;
  outside: string;
  rule: string;
  second: string;
}

interface Sourced {
  from: string;
  value: unknown;
}

/** One project as every reader answers it now. */
interface Read {
  account: Sourced;
  accountAtLimit: Sourced;
  areaId: string | null;
  cap: { from: string; onCap: string; onCapFrom: string; usd: number } | null;
  cawMode: Sourced;
  connection: boolean;
  decides: { from: string; member: string };
  inEffectCap: Sourced;
  memory: boolean;
  onCap: Sourced;
  placed: { accountId: string | null; why: string };
  /** The fleet rows bound to the area that a machine holding the project is sent as its own, and whether any reaches every machine. */
  rows: {
    everyMachine: boolean;
    hook: boolean;
    mcp: boolean;
    settings: boolean;
    skill: boolean;
  };
  rule: boolean;
  running: string[] | null;
  type: string | null;
}

const idOf = (answer: Answer): string =>
  (answer.json as { id?: string } | undefined)?.id ?? "";

const SCOPE_KIND = "scope";
const TYPE = "probe-client-writer";
const DOC = "probe-area-voice.md";
const SKILL = "probe-area-skill";
const MCP = "probe-area-server";
const SETTINGS = "probe-area-settings";

/** The area, its settings and folder, two projects in it, one outside, and its scoped rows. */
const made = async (rig: Rig): Promise<Made> => {
  const { call, db, kit } = rig;
  db.upsertAgent({
    machineId: MACHINE,
    hostname: `${MACHINE}.local`,
    os: "linux",
    auth: "unknown",
  });
  const accountArea = idOf(
    await call(
      hubRequest("POST /api/accounts", {
        body: {
          provider: "anthropic",
          kind: "subscription",
          label: "Probe client account",
        },
      })
    )
  );
  const accountOwn = idOf(
    await call(
      hubRequest("POST /api/accounts", {
        body: {
          provider: "anthropic",
          kind: "subscription",
          label: "Probe own account",
        },
      })
    )
  );
  const created = await call(
    hubRequest("POST /api/areas", { body: { name: "Probe client" } })
  );
  const area = idOf(created);
  const set = await call(
    hubRequest("PATCH /api/areas/:id", {
      path: { id: area },
      body: {
        account: accountArea,
        accountAtLimit: "move",
        cawMode: "plan",
        cap: { usd: 25, period: "month" },
        onCap: "pause",
      },
    })
  );
  const decides = await call(
    hubRequest("PUT /api/areas/:id/folder/file", {
      path: { id: area },
      body: {
        path: "decides.md",
        content: "---\nScope: advisor\n---\n",
      },
    })
  );
  const type = await call(
    hubRequest("PUT /api/areas/:id/folder/file", {
      path: { id: area },
      body: {
        path: `delegates/${TYPE}.md`,
        content:
          "---\nharness: claude\nmodel: claude-opus-5-5\n---\nDrafts in the client's voice.\n",
      },
    })
  );
  const [first, second, outside] = [
    "Probe first",
    "Probe second",
    "Probe outside",
  ].map((name) => {
    const id = crypto.randomUUID();
    db.createProject({ id, name, remote: null });
    return id;
  });
  const own = await call(
    hubRequest("PATCH /api/projects/:id", {
      path: { id: second },
      body: {
        account: accountOwn,
      },
    })
  );
  const placed = [
    await call(
      hubRequest("PUT /api/projects/:id/area", {
        path: { id: first },
        body: { areaId: area },
      })
    ),
    await call(
      hubRequest("PUT /api/projects/:id/area", {
        path: { id: second },
        body: { areaId: area },
      })
    ),
  ];
  const doc = await call(
    hubRequest("PUT /api/fleet/memory/docs", {
      body: {
        path: DOC,
        content: "Write in the client's voice.",
        scope: { role: "leaf", areaIds: [area] },
      },
    })
  );
  const connection = "probe-client-drive";
  const granted = await call(
    hubRequest("POST /api/connections", {
      body: {
        name: connection,
        service: "drive",
        account: "client@example.com",
        transport: "http",
        url: "https://example.com/mcp",
        auth: "bearer",
        areas: [area],
      },
    })
  );
  const rule = await call(
    hubRequest("POST /api/rules", {
      body: {
        name: "Probe area rule",
        enabled: true,
        pattern: "probe phrase",
        matchKind: "phrase",
        caseSensitive: false,
        wholeWord: false,
        watch: "text",
        reply: "The area's rule fired.",
        timing: "turn",
        repeat: true,
        scope: { areaId: area },
      },
    })
  );
  // The fleet rows bound to it: a skill and a server as their fetch and
  // probe would store them (no source or server is reached here), a hook
  // and a harness setting through their routes.
  db.putSkill({
    name: SKILL,
    source: "probe:area",
    areaId: area,
    files: [
      {
        path: "SKILL.md",
        contentBase64: Buffer.from(
          "---\nname: probe-area-skill\ndescription: The client's voice.\n---\n"
        ).toString("base64"),
        executable: false,
      },
    ],
  });
  db.putMcpServer({ name: MCP, config: { command: "true" }, areaId: area });
  const hook = crypto.randomUUID();
  const hooked = await call(
    hubRequest("PUT /api/fleet/hooks/:id", {
      path: { id: hook },
      body: {
        name: "Probe area hook",
        enabled: true,
        event: "Stop",
        handler: { type: "command", command: "true" },
        scope: "project",
        areaId: area,
      },
    })
  );
  const settings = await call(
    hubRequest("PUT /api/fleet/claude-settings/:name", {
      path: { name: SETTINGS },
      body: {
        settings: { cleanupPeriodDays: 30 },
        areaId: area,
      },
    })
  );
  const all = [
    created,
    set,
    decides,
    type,
    own,
    ...placed,
    doc,
    granted,
    rule,
    hooked,
    settings,
  ];
  kit.check(
    "a. made: an area with an account, a budget, a Caw mode, a decides.md and a delegate type; two projects in it, one with its own account; a document, a connection and a rule scoped to it; a skill, a server, a hook and a harness setting bound to it",
    all.every((one) => one.status === 200) && !!(first && second && outside),
    JSON.stringify(all.map((one) => `${one.status} ${one.text.slice(0, 160)}`))
  );
  return {
    accountArea,
    accountOwn,
    area,
    connection,
    first: first ?? "",
    hook,
    outside: outside ?? "",
    rule: idOf(rule),
    second: second ?? "",
  };
};

/** Every reader's answer for one project now. */
const read = async (rig: Rig, m: Made, projectId: string): Promise<Read> => {
  const { call, db } = rig;
  const { place, projectAccountOf, runningAccounts } =
    await import("../../../packages/hub/src/placement");
  const { defaultRouting } =
    await import("../../../packages/core/src/accounts");
  const { ruleInScope } = await import("../../../packages/core/src/rules");
  const { sessionTakes } = await import("../../../packages/core/src/fleet");
  const listed = (
    (await call(hubRequest("GET /api/projects"))).json as {
      id: string;
      areaId: string | null;
      cap: Read["cap"];
      inEffect: Record<string, Sourced>;
    }[]
  ).find((one) => one.id === projectId);
  const project = db.project(projectId);
  if (!(listed && project)) {
    throw new Error(`no project ${projectId}`);
  }
  // Placement as a spawn in the project asks it (spawns.ts `spawnAsks`):
  // the account in effect, the area named when it is the area's.
  const accounts = db.accounts.list();
  const now = Date.now();
  const placed = place({
    accounts,
    bench: [],
    kind: "yours",
    machineId: MACHINE,
    now,
    readings: [],
    routing: defaultRouting("anthropic"),
    signins: accounts.map((one) => ({
      accountId: one.id,
      checkedAt: now,
      machineId: MACHINE,
      movedAt: null,
      movedFrom: null,
      reason: null,
      refusalReach: null,
      state: "signed-in" as const,
    })),
    ...projectAccountOf(project, (id) => db.areas.get(id)?.name ?? null),
  });
  const { decides } = (
    await call(
      hubRequest("GET /api/projects/:id/decides", { path: { id: projectId } })
    )
  ).json as {
    decides: {
      from: Partial<Record<string, string>>;
      routes: Partial<Record<string, string>>;
    };
  };
  const { types } = (
    await call(
      hubRequest("GET /api/projects/:id/delegate-types", {
        path: { id: projectId },
      })
    )
  ).json as { types: { name: string; source: string }[] };
  const doc = db.listFleetMemoryDocs().find((one) => one.path === DOC);
  // What a machine holding the project is sent of it, and of every machine.
  const { projectRowsFor, unbound } =
    await import("../../../packages/hub/src/project-placements");
  const config = db.fleetConfig();
  const sent = projectRowsFor(
    config,
    new Set([projectId]),
    [],
    MACHINE,
    (id) => db.project(id)?.areaId ?? null
  )[projectId];
  const its = <T extends { projectId?: string }>(
    rows: readonly T[] | undefined,
    named: (row: T) => boolean
  ): boolean =>
    (rows ?? []).some((row) => named(row) && row.projectId === projectId);
  const rule = db.getRule(m.rule);
  const facts = { projectId, areaId: project.areaId };
  return {
    areaId: listed.areaId,
    account: listed.inEffect.account,
    accountAtLimit: listed.inEffect.accountAtLimit,
    cawMode: listed.inEffect.cawMode,
    inEffectCap: listed.inEffect.cap,
    onCap: listed.inEffect.onCap,
    cap: listed.cap
      ? {
          usd: listed.cap.usd,
          from: listed.cap.from,
          onCap: listed.cap.onCap,
          onCapFrom: listed.cap.onCapFrom,
        }
      : null,
    placed: placed.ok
      ? { accountId: placed.accountId, why: placed.why }
      : { accountId: null, why: placed.refusal },
    running: runningAccounts(project, project.inEffect.account.value),
    decides: {
      member: decides.routes[SCOPE_KIND] ?? "",
      from: decides.from[SCOPE_KIND] ?? "",
    },
    type: types.find((one) => one.name === TYPE)?.source ?? null,
    rows: {
      skill: its(sent?.skills, (row) => row.name === SKILL),
      mcp: its(sent?.mcp, (row) => row.name === MCP),
      hook: its(sent?.hooks, (row) => row.id === m.hook),
      settings: its(sent?.harnessConfig, (row) => row.name === SETTINGS),
      everyMachine:
        unbound(config.skills).some((row) => row.name === SKILL) ||
        unbound(config.mcp).some((row) => row.name === MCP) ||
        unbound(config.hooks).some((row) => row.id === m.hook) ||
        unbound(config.harnessConfig).some((row) => row.name === SETTINGS),
    },
    memory: sessionTakes(doc?.scope, {
      ...facts,
      role: "leaf",
      delegateType: null,
      model: null,
    }),
    connection: db.connections
      .namesForProject(projectId)
      .includes(m.connection),
    rule: rule
      ? ruleInScope(rule.scope, {
          ...facts,
          machineId: MACHINE,
          harness: "claude",
          model: null,
          role: "leaf",
          delegateType: null,
        })
      : false,
  };
};

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** What a project in the area reads: every setting its area's, the account its own when `own` names one. */
const inArea = (got: Read, m: Made, own: string | null): boolean => {
  const accountFrom = own ? "project" : "area";
  return (
    got.areaId === m.area &&
    same(got.account, { value: own ?? m.accountArea, from: accountFrom }) &&
    same(got.accountAtLimit, {
      value: own ? "wait" : "move",
      from: accountFrom,
    }) &&
    same(got.cawMode, { value: "plan", from: "area" }) &&
    same(got.inEffectCap, {
      value: { usd: 25, period: "month" },
      from: "area",
    }) &&
    same(got.onCap, { value: "pause", from: "area" }) &&
    same(got.cap, {
      usd: 25,
      from: "area",
      onCap: "pause",
      onCapFrom: "area",
    }) &&
    got.placed.accountId === (own ?? m.accountArea) &&
    (own
      ? got.placed.why === "This project's sessions start on Probe own account."
      : got.placed.why.includes("its area Probe client's account")) &&
    // At its limit the area's account moves: no pin; its own waits there.
    same(got.running, own ? [own] : null) &&
    same(got.decides, { member: "advisor", from: "area" }) &&
    got.type === "area" &&
    got.memory &&
    got.connection &&
    got.rule &&
    same(got.rows, {
      skill: true,
      mcp: true,
      hook: true,
      settings: true,
      everyMachine: false,
    })
  );
};

/** What a project in no area reads: the fleet's everywhere, its account its own when `own` names one. */
const onFleet = (got: Read, own: string | null): boolean =>
  got.areaId === null &&
  same(got.account, { value: own, from: own ? "project" : "fleet" }) &&
  same(got.accountAtLimit, {
    value: "wait",
    from: own ? "project" : "fleet",
  }) &&
  same(got.cawMode, { value: null, from: "fleet" }) &&
  same(got.inEffectCap, { value: null, from: "fleet" }) &&
  same(got.onCap, { value: "both", from: "fleet" }) &&
  got.cap === null &&
  (own ? got.placed.accountId === own : true) &&
  same(got.decides, { member: "you", from: "fleet" }) &&
  got.type === null &&
  !got.memory &&
  !got.connection &&
  !got.rule &&
  same(got.rows, {
    skill: false,
    mcp: false,
    hook: false,
    settings: false,
    everyMachine: false,
  });

const readersLeg = async (rig: Rig, m: Made): Promise<void> => {
  const first = await read(rig, m, m.first);
  const second = await read(rig, m, m.second);
  const outside = await read(rig, m, m.outside);
  rig.kit.check(
    "b. the first project reads every setting from its area on every reader",
    inArea(first, m, null),
    JSON.stringify(first)
  );
  rig.kit.check(
    "b. the second reads its own account (source project) and the rest from its area",
    inArea(second, m, m.accountOwn),
    JSON.stringify(second)
  );
  rig.kit.check(
    "b. a project outside the area takes none of it: the fleet's on every reader",
    onFleet(outside, null),
    JSON.stringify(outside)
  );
};

const moveLeg = async (rig: Rig, m: Made): Promise<void> => {
  const out = await rig.call(
    hubRequest("PUT /api/projects/:id/area", {
      path: { id: m.first },
      body: {
        areaId: null,
      },
    })
  );
  const said = (out.json as { said?: string[] } | undefined)?.said ?? [];
  const after = await read(rig, m, m.first);
  rig.kit.check(
    "c. moved out, the first project falls back to the fleet's on every reader, and the move says so",
    out.status === 200 &&
      said.includes("It falls back to the fleet's account") &&
      said.includes("It falls back to the fleet's budget") &&
      said.includes("It falls back to the fleet's Who decides") &&
      said.includes("It falls back to the fleet's delegate types") &&
      onFleet(after, null),
    JSON.stringify({ status: out.status, said, after })
  );
  const back = await rig.call(
    hubRequest("PUT /api/projects/:id/area", {
      path: { id: m.first },
      body: {
        areaId: m.area,
      },
    })
  );
  const again = await read(rig, m, m.first);
  rig.kit.check(
    "c. put back, it takes the area's again",
    back.status === 200 &&
      ((back.json as { said?: string[] } | undefined)?.said ?? []).includes(
        "It takes the area Probe client's account"
      ) &&
      inArea(again, m, null),
    JSON.stringify({ status: back.status, text: back.text, again })
  );
};

const forgetLeg = async (rig: Rig, m: Made): Promise<void> => {
  const forgot = await rig.call(
    hubRequest("DELETE /api/projects/:id", { path: { id: m.first } })
  );
  const gone = rig.db.project(m.first);
  const listed = (
    (await rig.call(hubRequest("GET /api/projects/forgotten"))).json as
      { id: string; forgottenAt: number }[] | undefined
  )?.find((one) => one.id === m.first);
  const restored = await rig.call(
    hubRequest("POST /api/projects/:id/restore", {
      path: { id: m.first },
      body: {
        forgottenAt: listed?.forgottenAt,
      },
    })
  );
  const back = await read(rig, m, m.first);
  rig.kit.check(
    "d. forgotten and restored, the first project is in its area still, every reader its area's",
    forgot.status === 200 &&
      gone === undefined &&
      restored.status === 200 &&
      inArea(back, m, null),
    JSON.stringify({
      forgot: forgot.status,
      restored: `${restored.status} ${restored.text.slice(0, 200)}`,
      back,
    })
  );
};

/** What each Undo of `f` answers, and whether what it names is back. */
interface Undone {
  back: boolean;
  status: number;
  text: string;
}

/** Undo trash entry `id`, and whether `back` finds what it named after. */
const undo = async (
  rig: Rig,
  id: number,
  back: () => boolean
): Promise<Undone> => {
  const answer = await rig.call(
    hubRequest("POST /api/trash/:id/restore", { path: { id } })
  );
  return { status: answer.status, text: answer.text, back: back() };
};

/** The trash entry a delete's answer names for its Undo. */
const restoreOf = (answer: Answer): number =>
  (answer.json as { restore?: number } | undefined)?.restore ?? -1;

/** f, before the area goes: a document scoped to it alone, one to the outside project alone and its hook, each deleted. */
/** The outside project's skills and server: two deleted before it is forgotten, one kept. */
const OUTSIDE = {
  skill: "probe-outside-skill",
  server: "probe-outside-server",
  kept: "probe-outside-kept",
};

/** A skill's one file, as a fetch would store it. */
const skillFiles = (name: string) => [
  {
    path: "SKILL.md",
    contentBase64: Buffer.from(
      `---\nname: ${name}\ndescription: The outside project's.\n---\n`
    ).toString("base64"),
    executable: false,
  },
];

const trashLeg = async (
  rig: Rig,
  m: Made
): Promise<{
  areaDoc: number;
  hook: number;
  projectDoc: number;
  server: number;
  skill: number;
}> => {
  const { call, db } = rig;
  for (const name of [OUTSIDE.skill, OUTSIDE.kept]) {
    db.putSkill({
      name,
      source: "probe:outside",
      projectId: m.outside,
      files: skillFiles(name),
    });
  }
  db.putMcpServer({
    name: OUTSIDE.server,
    config: { command: "true" },
    projectId: m.outside,
  });
  const skill = restoreOf(
    await call(
      hubRequest("DELETE /api/fleet/skills/:name", {
        path: { name: OUTSIDE.skill },
      })
    )
  );
  const server = restoreOf(
    await call(
      hubRequest("DELETE /api/fleet/mcp/:name", {
        path: { name: OUTSIDE.server },
      })
    )
  );
  const docs = {
    "probe-area-only.md": { role: "leaf", areaIds: [m.area] },
    "probe-project-only.md": { role: "leaf", projectIds: [m.outside] },
  } as const;
  const trashed: number[] = [];
  for (const [path, scope] of Object.entries(docs)) {
    await call(
      hubRequest("PUT /api/fleet/memory/docs", {
        body: {
          path,
          content: "Only where it is scoped.",
          scope,
        },
      })
    );
    trashed.push(
      restoreOf(
        await call(
          hubRequest("DELETE /api/fleet/memory/docs", { body: { path } })
        )
      )
    );
  }
  const hook = restoreOf(
    await call(
      hubRequest("DELETE /api/fleet/hooks/:id", { path: { id: m.hook } })
    )
  );
  const [areaDoc = -1, projectDoc = -1] = trashed;
  rig.kit.check(
    "f. a document scoped to the area alone, one to a project alone, the area's hook, and a skill and a server bound to that project are in the trash",
    [areaDoc, projectDoc, hook, skill, server].every((one) => one > 0),
    JSON.stringify({ areaDoc, projectDoc, hook, skill, server })
  );
  return { areaDoc, hook, projectDoc, server, skill };
};

/** f, once the area went: each Undo refused in core's words, and nothing comes back; the project's document once its project is forgotten. */
const undoLeg = async (
  rig: Rig,
  m: Made,
  trashed: Awaited<ReturnType<typeof trashLeg>>
): Promise<void> => {
  const { areaWords } = await import("../../../packages/core/src/words/areas");
  const docThere = (path: string) => () =>
    rig.db.listFleetMemoryDocs().some((one) => one.path === path);
  const refused = (one: Undone) =>
    one.status === 409 && one.text === areaWords.undoUnbound && !one.back;
  const areaDoc = await undo(
    rig,
    trashed.areaDoc,
    docThere("probe-area-only.md")
  );
  const hook = await undo(
    rig,
    trashed.hook,
    () => rig.db.getFleetHook(m.hook) !== undefined
  );
  rig.kit.check(
    "f. the area gone, its document's and its hook's Undo are refused, and neither comes back to reach every project",
    refused(areaDoc) && refused(hook),
    JSON.stringify({ areaDoc, hook })
  );
  const forgot = await rig.call(
    hubRequest("DELETE /api/projects/:id", { path: { id: m.outside } })
  );
  const projectDoc = await undo(
    rig,
    trashed.projectDoc,
    docThere("probe-project-only.md")
  );
  const skillThere = (name: string) => () =>
    rig.db.listSkills().some((one) => one.name === name);
  const skill = await undo(rig, trashed.skill, skillThere(OUTSIDE.skill));
  const server = await undo(
    rig,
    trashed.server,
    () => rig.db.getMcpServer(OUTSIDE.server) !== undefined
  );
  const keptGone = !skillThere(OUTSIDE.kept)();
  rig.kit.check(
    "f. its project forgotten, a document scoped to it alone, a skill and a server bound to it are refused their Undo and stay gone; its kept skill went with it",
    forgot.status === 200 &&
      refused(projectDoc) &&
      refused(skill) &&
      refused(server) &&
      keptGone,
    JSON.stringify({
      forgot: forgot.status,
      projectDoc,
      skill,
      server,
      keptGone,
    })
  );
  const listed = (
    (await rig.call(hubRequest("GET /api/projects/forgotten"))).json as
      { id: string; forgottenAt: number }[] | undefined
  )?.find((one) => one.id === m.outside);
  const restored = await rig.call(
    hubRequest("POST /api/projects/:id/restore", {
      path: { id: m.outside },
      body: {
        forgottenAt: listed?.forgottenAt,
      },
    })
  );
  const kept = rig.db.listSkills().find((one) => one.name === OUTSIDE.kept);
  rig.kit.check(
    "f. the project restored, its kept skill is back, bound to it",
    restored.status === 200 && kept?.projectId === m.outside,
    JSON.stringify({ restored: restored.status, kept })
  );
};

const deleteLeg = async (rig: Rig, m: Made): Promise<void> => {
  const deleted = await rig.call(
    hubRequest("DELETE /api/areas/:id", { path: { id: m.area } })
  );
  const answer = deleted.json as
    { projects?: string[]; said?: string[] } | undefined;
  const said = answer?.said ?? [];
  const first = await read(rig, m, m.first);
  const second = await read(rig, m, m.second);
  const { areas } = (await rig.call(hubRequest("GET /api/areas"))).json as {
    areas: unknown[];
  };
  rig.kit.check(
    "e. the area deleted: its projects ungrouped and kept, and the answer says what falls back",
    deleted.status === 200 &&
      areas.length === 0 &&
      same([...(answer?.projects ?? [])].sort(), [m.first, m.second].sort()) &&
      rig.db.project(m.first) !== undefined &&
      rig.db.project(m.second) !== undefined &&
      said.includes(
        "Probe client is deleted; its 2 projects are in no area now."
      ) &&
      said.includes("1 project falls back to the fleet's account") &&
      said.includes("2 projects fall back to the fleet's budget") &&
      said.includes("2 projects fall back to the fleet's Who decides") &&
      said.includes("1 rule scoped to it went with it.") &&
      said.includes(
        "1 skill, 1 MCP server, 1 harness setting bound to it went with it."
      ) &&
      said.includes("1 memory document scoped to it alone went with it."),
    JSON.stringify({ status: deleted.status, text: deleted.text })
  );
  rig.kit.check(
    "e. every reader answers the fleet's; the second keeps its own account",
    onFleet(first, null) && onFleet(second, m.accountOwn),
    JSON.stringify({ first, second })
  );
};

export default {
  group: "The hub and machines",
  name: "areas-settings",
  ownProcess:
    "its in-process hub (hub-in-process.ts) reads CAWCO_DB_PATH and HOME once, as the hub's modules load",
  run: async (kit: Kit) => {
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "areas-settings-")
    );
    try {
      const { hubInProcess } =
        await import("../../../packages/hub/scripts/hub-in-process");
      const { db, hub } = await hubInProcess(
        join(scratch, "hub", "hub.db"),
        join(scratch, "home")
      );
      const rig: Rig = {
        call: async (request) => {
          const response = await hub.handle(
            new Request(`http://127.0.0.1${request.path}`, hubInit(request))
          );
          const text = await response.text();
          let json: unknown;
          try {
            json = JSON.parse(text);
          } catch {
            // Words, not JSON: a refusal.
          }
          return { status: response.status, text, json };
        },
        db,
        kit,
      };
      const m = await made(rig);
      await readersLeg(rig, m);
      await moveLeg(rig, m);
      await forgetLeg(rig, m);
      const trashed = await trashLeg(rig, m);
      await deleteLeg(rig, m);
      await undoLeg(rig, m, trashed);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  },
} satisfies Spec;
