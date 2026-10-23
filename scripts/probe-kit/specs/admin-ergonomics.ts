/**
 * A session answers "what is waiting on the owner" with one call, and every
 * admin write's approval says what it changes, why, and what it affects
 * (artifacts/service.ts `status`, core permission-presentation.ts, hub
 * admin-asks.ts and source-facts.ts). The owner asked four times in a day
 * which previews he still had to look at; approved an MCP server's scope
 * change whose card showed its whole command and a project's raw id; read a
 * 27 KB CLAUDE.md back in a session's context; and approved skill installs
 * no one explained.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), every tool called through the hub's REST door as the session
 * its credential is, each approval read off `/api/pending` and answered with
 * the dashboard's own `permission.answer` command:
 *
 * 1. artifact_list answers a preview the session made with its kind, name,
 *    shown, and, after the person pins it in the desk's Comment mode, one
 *    open pin.
 * 2. `waiting: true` holds a decision page with no picks, waiting on the
 *    person, its one choice asked and none made.
 * 3. A second admin_memory_write set: its pending approval carries the
 *    changed lines only (not the document) and a "+N −M" line; approved,
 *    the call answers a hash and the size, and no content.
 * 4. An admin_skills_write install with no reason is refused, and nothing
 *    is parked for the person.
 * 5. An install with a reason: its pending approval reads the reason first
 *    ("why") and the source's age and stars.
 * 6. An MCP server's scope change, every machine to one project: its pending
 *    approval reads the scope before → after with the project's name, where
 *    it loads before → after, and the reason; the unchanged command is not
 *    on it.
 *
 * Full Send approves every approval for its session (the owner,
 * 2026-10-22: "FULL SEND LITERALLY MEANS FULL SEND"; hub admin-asks.ts,
 * agent claude.ts `SessionMode`). Each call below is the mock's, from inside
 * the session, through the harness's own door to CawCo's MCP server:
 *
 * 7. Bypass, unchanged: the session of 3 is in Bypass, and its
 *    admin_memory_write parked an ask for the person.
 * 8. A Claude Code session in Full Send: its admin_memory_write runs at once,
 *    answering a hash; no ask of it is ever on `/api/pending`; the hub's log
 *    records it as approved by Full Send, with its reason.
 * 9. The same session: a Bash call an ask rule in its place's own Claude Code
 *    settings (`permissions.ask`) forces runs, answered "allow" by Full Send.
 * 10. The same session: a question to the person (AskUserQuestion) still
 *    parks on `/api/pending`.
 * 11. The same session: a tool the fleet denies (TodoWrite, core
 *    `OWN_LIST_DENIED`) is still refused, and nothing is asked.
 * 12. An OpenCode session in Full Send: its admin_memory_write runs at once,
 *    no ask parks, and the hub's log records it as approved by Full Send.
 *
 *   bun scripts/probe-kit/run.ts admin-ergonomics
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: one scenario, read in order, one check after another.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import { toolRecord } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, pressAt, type Spec, settle } from "../kit";
import { docOf, type On, pageFrame, screenBox } from "./ink";
import { spawnWords } from "../../../packages/core/src/words/spawn";

const PREVIEW = "probe-preview";
const DECISION = "probe-decision";
const PROJECT = "Ergonomics";
const SKILL_SOURCE = "github:anthropics/skills";
const MCP_NAME = "probe-echo";

const PREVIEW_HTML = `<!doctype html><html><body style="margin:0;font:18px/1.6 system-ui">
<main style="padding:24px"><p id="p" data-insp-path="src/Page.svelte:3:3" style="width:70%">The paragraph the person pins.</p></main>
</body></html>`;

const DECISION_HTML = `<!doctype html><html><body><main>
<article><h2>Which way?</h2>
<div data-cawco-choice="way" role="group" aria-label="Which way?">
<button type="button" data-option="left">Left</button>
<button type="button" data-option="right">Right</button>
</div></article></main></body></html>`;

/** A CLAUDE.md of `lines` lines, line `changed` reading differently when given. */
const memoryText = (lines: number, changed?: number) =>
  Array.from({ length: lines }, (_, i) =>
    i === changed ? `Line ${i + 1}, changed.` : `Line ${i + 1} of the memory.`
  ).join("\n");

/** The reason every Full Send leg's admin write gives. */
const FULL_SEND_REASON =
  "The probe checks that Full Send approves a fleet change.";
/** The command the Full Send place's own Claude Code settings put an ask rule on. */
const ASK_RULE_COMMAND = "echo probe-ask-rule";
/** A Full Send leg's step, named in the person's words. */
const STEP_TAG = /PROBE-FS-[a-z-]+/;

/** The call each Full Send step has the mock make, by the tool's short name. */
const STEP_CALLS: Record<string, { input: object; name: string }> = {
  "PROBE-FS-memory": {
    name: "admin_memory_write",
    input: {
      action: "set",
      content: memoryText(200, 7),
      reason: FULL_SEND_REASON,
    },
  },
  "PROBE-FS-ask-rule": {
    name: "Bash",
    input: { command: ASK_RULE_COMMAND, description: "Probe an ask rule" },
  },
  "PROBE-FS-question": {
    name: "AskUserQuestion",
    input: {
      questions: [
        {
          question: "Which way?",
          header: "Way",
          multiSelect: false,
          options: [
            { label: "Left", description: "The left way." },
            { label: "Right", description: "The right way." },
          ],
        },
      ],
    },
  },
  "PROBE-FS-denied": {
    name: "TodoWrite",
    input: {
      todos: [{ content: "probe", status: "pending", activeForm: "Probing" }],
    },
  },
  "PROBE-FS-memory-opencode": {
    name: "admin_memory_write",
    input: {
      action: "set",
      content: memoryText(200, 9),
      reason: FULL_SEND_REASON,
    },
  },
};

/** A memory write's words, naming the hash the next write takes (hub presenters/fleet-settings.ts `memorySettingsWords`). */
const KEPT_HASH = "the next write's expectedHash takes";

/** One Full Send step as the mock plays it: its call made, then what came back. */
interface Step {
  called: boolean;
  /** The request that carried the call's result. */
  result?: { body: string; failed: boolean };
  searched: boolean;
  tag: string;
}

/** The step under way; undefined before the first. */
let step: Step | undefined;

const words = (said: string): Reply => ({ everyMs: 5, words: [said] });
const calling = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/**
 * The call of `short` as the harness offers it: Claude Code's built-in or
 * MCP name (found with ToolSearch first when deferred), OpenCode's own
 * name or its Code Mode catalog. A fleet-denied tool is called as named,
 * offered or not, as a model that calls it anyway does.
 */
const callOf = (request: Seen, now: Step): Reply => {
  const { name: short, input } = STEP_CALLS[now.tag] ?? {};
  if (!(short && input)) {
    return words(`No step ${now.tag}.`);
  }
  const names = [short, `mcp__cawco__${short}`, `cawco_${short}`];
  const offered = request.toolNames.find((name) => names.includes(name));
  if (offered || now.tag === "PROBE-FS-denied") {
    now.called = true;
    return calling(offered ?? short, input);
  }
  if (!now.searched && request.toolNames.includes("ToolSearch")) {
    now.searched = true;
    const wanted = short.startsWith("admin_") ? `mcp__cawco__${short}` : short;
    return calling("ToolSearch", { query: `select:${wanted}`, max_results: 1 });
  }
  if (request.toolNames.includes("execute")) {
    now.called = true;
    return calling("execute", {
      code: `return await tools.cawco.${short}(${JSON.stringify(input)});`,
    });
  }
  now.called = true;
  return words(`${short} is not offered.`);
};

/**
 * Every tool of legs 1 to 6 goes through the REST door, so the session only
 * says "ok"; a Full Send leg's step (its tag in the person's words) makes
 * its one call and reads what came back.
 */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return words("Probe title");
  }
  const tag = STEP_TAG.exec(request.last)?.[0];
  if (tag && !request.afterTool && step?.tag !== tag) {
    step = { tag, called: false, searched: false };
  }
  const now = step;
  if (!now || now.result) {
    return words("ok");
  }
  if (now.called) {
    if (request.afterTool) {
      now.result = { body: request.body, failed: request.toolFailed };
      return words("done");
    }
    return words("ok");
  }
  return callOf(request, now);
};

interface Ask {
  instanceId: string;
  machineId: string;
  payload: {
    presentation?: {
      changes: { after: string; before: string }[];
      detail?: string;
      fields: { key: string; value: string }[];
      summary: string;
    };
    toolName?: string;
  };
  requestId: string;
}

interface Status {
  id: string;
  kind: string;
  name: string;
  opened: boolean;
  picks?: { asked: number; made: number; unsent: number };
  pins: number;
  shown: boolean;
  waitingOn: string[];
}

const field = (ask: Ask | undefined, key: string) =>
  ask?.payload.presentation?.fields.find((one) => one.key === key)?.value;

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const place = join(fleet.sandbox, "ergonomics-place");
  await mkdir(place, { recursive: true });
  await writeFile(join(place, "README.md"), "The probe's place.\n");
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: PROJECT,
    machineId: MACHINE,
    cwd: place,
    caw: false,
  });
  const session = await fleet.spawn("claude", "Ergonomics", place, {
    projectId: project.id,
  });
  const credential = await Bun.file(
    `/proc/${await fleet.sessionPid(session)}/environ`
  )
    .text()
    .then(
      (environ) =>
        environ
          .split("\0")
          .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
          ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? ""
    );

  const me = { base: fleet.base, id: session, credential };
  /**
   * One tool call through the hub's REST door, as the session, read as a
   * program: the hub's record (core tool-answer.ts), its status first
   * ("200 {…}"), or the refusal's words. A tool that answers words throws.
   */
  const recordCall = (name: string, args: Record<string, unknown>) =>
    toolRecord<unknown>(me, name, args);
  const call = async (
    name: string,
    args: Record<string, unknown>
  ): Promise<string> => {
    const said = await recordCall(name, args);
    return `${said.status} ${said.text}`;
  };
  const pending = () => fleet.api<Ask[]>("/api/pending");
  const askOf = (tool: string, answered: Set<string>) =>
    until(
      `an ask of ${tool}`,
      async () =>
        (await pending()).find(
          (one) =>
            one.payload.toolName === `mcp__cawco__${tool}` &&
            !answered.has(one.requestId)
        ),
      Boolean,
      60_000
    ).catch(() => undefined);
  const answer = (ask: Ask, allow: boolean) =>
    fleet.post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "permission.answer",
      machineId: ask.machineId,
      sessionId: ask.instanceId,
      payload: {
        requestId: ask.requestId,
        args: [
          ask.requestId,
          allow
            ? { behavior: "allow", updatedInput: {} }
            : { behavior: "deny", message: "Probe: read only." },
        ],
      },
    });
  const seen = new Set<string>();
  /** An admin write: parked, its pending ask read, answered; the ask and what the call said. */
  const administer = async (
    tool: string,
    args: object,
    allow: boolean
  ): Promise<{ ask?: Ask; record?: unknown; said: string }> => {
    const asked = recordCall(tool, args as Record<string, unknown>);
    const ask = await askOf(tool, seen);
    if (ask) {
      seen.add(ask.requestId);
      await answer(ask, allow);
    }
    const said = await asked;
    return {
      ask,
      said: `${said.status} ${said.text}`,
      ...(said.refused ? {} : { record: said.record }),
    };
  };
  const status = async (waitingOnly = false): Promise<Status[]> => {
    const said = await toolRecord<Status[]>(
      me,
      "artifact_list",
      waitingOnly ? { waiting: true } : {}
    );
    if (said.refused) {
      throw new Error(`artifact_list refused: ${said.text}`);
    }
    return said.record;
  };

  // ── 1. a preview, pinned ──────────────────────────────────────────────
  const folder = join(fleet.sandbox, "probe-preview");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "index.html"), PREVIEW_HTML);
  const made = await call("artifact_create", {
    kind: "preview",
    does: "try",
    ask: "Try this page and say whether it works",
    name: PREVIEW,
    dir: folder,
  });
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  await open(page, `${base}/session/${session}`, "[data-artifact-trigger]");
  const on = { page } as On;
  const frame = await pageFrame(on);
  await frame.waitForSelector("#p", { timeout: 60_000 });
  await settle(page, 600);
  const before = (await status()).find((one) => one.name === PREVIEW);
  await page
    .locator(
      ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
    )
    .focus();
  await page.keyboard.press("c");
  await settle(page, 300);
  const box = await screenBox(on, frame, "#p");
  await pressAt(frame, { x: box.x + box.w * 0.3, y: box.y + box.h / 2 });
  // The press opens the comment's composer; Comment writes the pin with its words.
  const composer = page.locator('[data-slot="pin-composer"]');
  await composer.waitFor({ timeout: 5000 });
  await composer.getByRole("combobox").fill("Bolder, please.");
  await composer.getByRole("button", { name: "Comment", exact: true }).click();
  await until(
    "the pin's words in the doc",
    () => docOf(frame),
    (now) =>
      Object.values(now.pins).some(
        (pin) => (pin.thread as unknown[] | undefined)?.length === 1
      ),
    5000
  );
  await page.keyboard.press("Escape");
  const pinned = await until(
    "artifact_list's pin count",
    async () => (await status()).find((one) => one.name === PREVIEW),
    (row) => row?.pins === 1,
    10_000
  ).catch(async () => (await status()).find((one) => one.name === PREVIEW));
  kit.check(
    "1: artifact_list answers the preview the session made, shown, and one open pin once the person pins it",
    made.startsWith("200") &&
      before?.kind === "preview" &&
      before.pins === 0 &&
      pinned?.kind === "preview" &&
      pinned.shown &&
      pinned.pins === 1,
    `made ${made.slice(0, 160)}; before ${JSON.stringify(before)}; after ${JSON.stringify(pinned)}`
  );

  // ── 2. a decision page with no picks waits on the person ─────────────
  await call("artifact_create", {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: DECISION,
    html: DECISION_HTML,
  });
  const waiting = await status(true);
  const decision = waiting.find((one) => one.name === DECISION);
  kit.check(
    "2: waiting: true holds the decision page with no picks, waiting on the person",
    decision?.kind === "page" &&
      decision.picks?.asked === 1 &&
      decision.picks.made === 0 &&
      decision.waitingOn.includes("person"),
    JSON.stringify(waiting)
  );

  // ── 3. a memory set answers a hash, never the content ────────────────
  const reason = "The probe checks what a memory write's approval carries.";
  const first = await administer(
    "admin_memory_write",
    { action: "set", content: memoryText(200), reason },
    true
  );
  const second = await administer(
    "admin_memory_write",
    { action: "set", content: memoryText(200, 99), reason },
    true
  );
  const shownChange = second.ask?.payload.presentation?.changes[0];
  const saved = (second.record ?? {}) as Record<string, unknown>;
  kit.check(
    "3: a memory set's approval carries the changed lines only and +1 −1; approved, it answers a hash and the size, no content",
    first.said.startsWith("200") &&
      (second.ask?.payload.presentation?.detail ?? "").includes("+1 −1") &&
      // Each line keeps its own line ending.
      (shownChange?.after.trimEnd().split("\n").length ?? 999) <= 7 &&
      (shownChange?.after ?? "").includes("Line 100, changed.") &&
      typeof saved.hash === "string" &&
      saved.lines === 200 &&
      typeof saved.bytes === "number" &&
      !("content" in saved) &&
      !second.said.includes("of the memory."),
    `detail ${second.ask?.payload.presentation?.detail}; shown after ${shownChange?.after.trimEnd().split("\n").length} lines; answered ${second.said.slice(0, 300)}`
  );

  // ── 4. an install without a reason is refused, nothing parked ────────
  const before4 = (await pending()).length;
  const unexplained = await call("admin_skills_write", {
    action: "install",
    name: "probe-skill",
    source: SKILL_SOURCE,
  });
  await Bun.sleep(1000);
  const after4 = await pending();
  kit.check(
    "4: an install without a reason is refused, and nothing is parked for the person",
    unexplained.includes("needs a `reason`") &&
      after4.length === before4 &&
      !after4.some(
        (one) => one.payload.toolName === "mcp__cawco__admin_skills_write"
      ),
    unexplained.slice(0, 300)
  );

  // ── 5. with a reason: the reason and the source's age on the card ────
  const why = "The probe needs a skill install to read its approval.";
  const install = await administer(
    "admin_skills_write",
    {
      action: "install",
      name: "probe-skill",
      source: SKILL_SOURCE,
      reason: why,
    },
    false
  );
  const fields5 = install.ask?.payload.presentation?.fields ?? [];
  kit.check(
    "5: an install's approval reads the reason first, then the source's age and stars",
    fields5[0]?.key === "why" &&
      fields5[0].value === why &&
      (field(install.ask, "age") ?? "").startsWith("Created ") &&
      field(install.ask, "stars") !== undefined &&
      // The summary names the source; it is not said twice.
      field(install.ask, "from") === undefined &&
      (install.ask?.payload.presentation?.summary ?? "").includes(SKILL_SOURCE),
    JSON.stringify(install.ask?.payload.presentation)
  );

  // ── 6. an MCP server's scope change, every machine → one project ─────
  const config = { command: "echo", args: ["probe"] };
  await administer(
    "admin_mcp_servers_write",
    { action: "put", name: MCP_NAME, config, reason },
    true
  );
  const scoping = "Only this project's sessions use the probe's server.";
  const scoped = await administer(
    "admin_mcp_servers_write",
    {
      action: "put",
      name: MCP_NAME,
      config,
      projectId: project.id,
      reason: scoping,
    },
    false
  );
  const shown6 = scoped.ask?.payload.presentation;
  kit.check(
    "6: a scope change's approval reads the scope before → after by the project's name, where it loads, and the reason; not the unchanged command",
    field(scoped.ask, "why") === scoping &&
      field(scoped.ask, "scope") ===
        `every machine → ${PROJECT} project only` &&
      field(scoped.ask, "loads in") ===
        `sessions in ${PROJECT} (was: every session)` &&
      field(scoped.ask, "command") === undefined &&
      !JSON.stringify(shown6?.fields ?? []).includes(project.id) &&
      shown6?.summary === `Change MCP server ${MCP_NAME}`,
    JSON.stringify(shown6)
  );

  // ── 7. Bypass still asks ─────────────────────────────────────────────
  const modeOf = (id: string) =>
    fleet.query<{ permission_mode: string | null }>(
      "SELECT permission_mode FROM instances WHERE id = ?",
      id
    )[0]?.permission_mode;
  kit.check(
    "7: in Bypass, admin_memory_write parks an ask for the person",
    modeOf(session) === "bypassPermissions" &&
      first.ask?.payload.toolName === "mcp__cawco__admin_memory_write",
    `mode ${modeOf(session)}; ask ${first.ask?.requestId ?? "none"}`
  );

  // ── 8–12. Full Send ──────────────────────────────────────────────────
  /**
   * A step played out: the person's words naming it, then what came back,
   * with what the hub and the agent logged meanwhile. An ask put to the
   * person is logged as it parks: an admin write's by the hub ("asks the
   * person to approve"), a harness's by the agent ("permission asked", with
   * "[full send: answered]" only when Full Send answered it instead).
   */
  const play = async (instanceId: string, tag: string) => {
    const hubMark = await fleet.logMark("hub");
    const agentMark = await fleet.logMark("agent");
    await fleet.send(instanceId, `Run step ${tag}.`);
    const result = await until(
      `step ${tag} answered`,
      () => (step?.tag === tag ? step.result : undefined),
      Boolean,
      120_000
    ).catch(() => undefined);
    const hub = (await hubMark.since()).split("\n");
    const agent = (await agentMark.since()).split("\n");
    return {
      result,
      /** What came back, from the step's tag on: the call's result as its request carried it. */
      cameBack: result ? result.body.slice(result.body.lastIndexOf(tag)) : "",
      /** Asks put to the person while it ran. */
      asked: [
        ...hub.filter((line) =>
          line.includes(`[admin-asks] ${instanceId} asks the person`)
        ),
        ...agent.filter(
          (line) =>
            line.includes("[claude] permission asked:") &&
            !line.includes("[full send: answered]")
        ),
      ],
      approved: hub.find(
        (line) =>
          line.includes(`[admin-asks] ${instanceId} asks to run`) &&
          line.includes(`approved by Full Send: ${FULL_SEND_REASON}`)
      ),
      answered: agent.find((line) => line.includes("[full send: answered]")),
    };
  };
  /** Whether `instanceId` has nothing on `/api/pending`. */
  const nothingPending = async (instanceId: string) =>
    !(await pending()).some((ask) => ask.instanceId === instanceId);

  const fullSendPlace = join(fleet.sandbox, "full-send-place");
  await mkdir(projectClaudeDir(fullSendPlace), { recursive: true });
  await writeFile(
    projectClaudeDir(fullSendPlace, "settings.json"),
    JSON.stringify({
      permissions: { ask: [`Bash(${ASK_RULE_COMMAND})`] },
    })
  );
  const sent = await fleet.spawn("claude", spawnWords.modes.fullSend, fullSendPlace, {
    permissionMode: "fullSend",
  });

  const memory = await play(sent, "PROBE-FS-memory");
  kit.check(
    "8: Claude Code in Full Send: admin_memory_write runs at once, no ask parks, and the hub's log records it approved by Full Send",
    modeOf(sent) === "fullSend" &&
      memory.result?.failed === false &&
      memory.cameBack.includes(KEPT_HASH) &&
      memory.asked.length === 0 &&
      (await nothingPending(sent)) &&
      memory.approved !== undefined,
    `mode ${modeOf(sent)}; failed ${memory.result?.failed}; asked ${JSON.stringify(memory.asked)}; log: ${memory.approved ?? "none"}`
  );

  // In bypass an `echo` asks nothing: an ask of it is the rule's. The CLI
  // does not name the rule on the ask (no `matchedAskRule`, 2.1.302).
  const rule = await play(sent, "PROBE-FS-ask-rule");
  kit.check(
    "9: Claude Code in Full Send: a Bash call its permissions.ask rule forces is answered allow and runs",
    rule.result?.failed === false &&
      rule.cameBack.includes("probe-ask-rule") &&
      rule.asked.length === 0 &&
      (rule.answered ?? "").includes("permission asked: Bash"),
    `failed ${rule.result?.failed}; asked ${JSON.stringify(rule.asked)}; log: ${rule.answered ?? "none"}`
  );

  const questionRun = play(sent, "PROBE-FS-question");
  const question = await until(
    "the question on /api/pending",
    async () =>
      (await pending()).find(
        (ask) =>
          ask.instanceId === sent && ask.payload.toolName === "AskUserQuestion"
      ),
    Boolean,
    120_000
  ).catch(() => undefined);
  if (question) {
    await answer(question, false);
  }
  const asked10 = await questionRun;
  kit.check(
    "10: Claude Code in Full Send: a question to the person still parks on /api/pending",
    question !== undefined,
    `${question ? `asked ${question.requestId}` : "no question parked"}; log: ${JSON.stringify(asked10.asked)}`
  );

  const denied = await play(sent, "PROBE-FS-denied");
  kit.check(
    "11: Claude Code in Full Send: a fleet-denied tool (TodoWrite) is still refused, and nothing is asked",
    denied.result?.failed === true &&
      denied.asked.length === 0 &&
      denied.answered === undefined &&
      (await nothingPending(sent)),
    `failed ${denied.result?.failed}; asked ${JSON.stringify(denied.asked)}; came back ${denied.cameBack.slice(-300)}`
  );

  const opencode = await fleet.spawn("opencode", "Full Send OpenCode", place, {
    permissionMode: "fullSend",
  });
  const written = await play(opencode, "PROBE-FS-memory-opencode");
  kit.check(
    "12: OpenCode in Full Send: admin_memory_write runs at once, no ask parks, and the hub's log records it approved by Full Send",
    modeOf(opencode) === "fullSend" &&
      written.result?.failed === false &&
      written.cameBack.includes(KEPT_HASH) &&
      written.asked.length === 0 &&
      (await nothingPending(opencode)) &&
      written.approved !== undefined,
    `mode ${modeOf(opencode)}; failed ${written.result?.failed}; asked ${JSON.stringify(written.asked)}; log: ${written.approved ?? "none"}`
  );
};

const spec: Spec = { name: "admin-ergonomics", run };
export default spec;
