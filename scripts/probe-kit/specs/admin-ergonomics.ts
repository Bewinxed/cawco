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
 *   bun scripts/probe-kit/run.ts admin-ergonomics
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";
import { docOf, type On, pageFrame, screenBox } from "./ink";

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

/** The session is never asked to call anything: every tool goes through the REST door. */
const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

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

  /** One tool call through the hub's REST door, as the session: its status and its words. */
  const call = async (name: string, args: object): Promise<string> => {
    const response = await fetch(
      `${fleet.base}/api/delegation/call/${session}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${credential}`,
        },
        body: JSON.stringify({ name, arguments: args }),
      }
    );
    return `${response.status} ${await response.text()}`;
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
  ): Promise<{ ask?: Ask; said: string }> => {
    const said = call(tool, args);
    const ask = await askOf(tool, seen);
    if (!ask) {
      return { said: await said };
    }
    seen.add(ask.requestId);
    await answer(ask, allow);
    return { ask, said: await said };
  };
  const status = async (waitingOnly = false): Promise<Status[]> => {
    const said = await call(
      "artifact_list",
      waitingOnly ? { waiting: true } : {}
    );
    const json = said.slice(said.indexOf(" ") + 1);
    const result = JSON.parse(json) as { content: { text: string }[] };
    return JSON.parse(result.content[0]?.text ?? "[]") as Status[];
  };

  // ── 1. a preview, pinned ──────────────────────────────────────────────
  const folder = join(fleet.sandbox, "probe-preview");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "index.html"), PREVIEW_HTML);
  const made = await call("artifact_create", {
    kind: "preview",
    name: PREVIEW,
    dir: folder,
  });
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  await open(page, `${base}/session/${session}`, ".artifact-trigger");
  const on = { page } as On;
  const frame = await pageFrame(on);
  await frame.waitForSelector("#p", { timeout: 60_000 });
  await settle(page, 600);
  const before = (await status()).find((one) => one.name === PREVIEW);
  await page.locator(".preview-pane button[aria-keyshortcuts='C']").focus();
  await page.keyboard.press("c");
  await settle(page, 300);
  const box = await screenBox(on, frame, "#p");
  await page.mouse.click(box.x + box.w * 0.3, box.y + box.h / 2);
  const card = page.locator('.pin-card[data-pin-card="1"]');
  await card.waitFor({ timeout: 5000 });
  await card.getByRole("textbox").fill("Bolder, please.");
  await card.getByRole("button", { name: "Reply" }).click();
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
  const saved = (() => {
    const at = second.said.indexOf("{");
    try {
      const result = JSON.parse(second.said.slice(at)) as {
        content: { text: string }[];
      };
      return JSON.parse(result.content[0]?.text ?? "{}") as Record<
        string,
        unknown
      >;
    } catch {
      return {};
    }
  })();
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
};

const spec: Spec = { name: "admin-ergonomics", run };
export default spec;
