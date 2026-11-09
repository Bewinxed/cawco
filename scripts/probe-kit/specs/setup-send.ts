/**
 * Set up on a project's setup page (the project-setup skill's `setup`, a
 * `Setup` in its program), on a scratch fleet: pressing Set up sets the
 * project up from the Setup as drawn, every time, whether or not anything
 * was sent from the page before. Set up is the board's draft bar
 * (SetupBoard, setup-draft.svelte.ts `send`): the hub's decisions send for
 * page `setup` (decisions.ts `send`), the artifact's Send
 * (artifacts/service.ts `send`, `sendOwes`), then setup.ts
 * `applySetupPicks`. The session that writes the page is a project session
 * whose tools the probe calls through the hub's tool door, as Caw calls
 * them.
 *
 * 1. A page holding its Setup alone (shape `own`), left as Caw drew it,
 *    after a question Caw put through `ask` was answered: Set up is taken
 *    and the session hears the page's responses. (Nightly 6583: refused
 *    409, "Nothing new to send: every pick here has gone to the session":
 *    the Setup is in the program, not the picks, so a page left as drawn
 *    held none.)
 * 2. Its stages.md, written from the drawn stages as the skill's step 6
 *    writes it after the Send: `/stages` answers `source: "file"` with
 *    those stages, so the board leaves the draft.
 * 3. Caw draws the page again after that Send (`artifact_update`'s
 *    statements): Set up is taken again.
 * 4. A second project's Setup drawn from the social template, left as
 *    drawn: Set up applies that template itself, so `/stages` answers
 *    `source: "file"` with social's stages before anyone writes a file.
 * 5. A third such page whose writer has ended (stopped) before Set up: the
 *    same Send applies it (`/stages` from file with social's stages), the
 *    project's Caw hears it in the writer's place, and his conversation's
 *    write of AGENTS.md is approved by it (caw.ts `setupSent`). (Before:
 *    an ended writer's Send went to Caw as a note alone, applying nothing
 *    of the Setup and approving nothing.)
 * 6. New project's create (`POST /api/projects` with the person's words and
 *    `caw: true`) answers once the project is made, Caw's start carrying
 *    on: his view says `starting` as it answers, and his conversation
 *    starts after. (Nightly 6583: the answer waited on his session's start
 *    on its machine, about 14 s.)
 * 7. That project's page at 1440, opened as the create answers: Caw's
 *    panel shows his conversation from the first (no view of his start of
 *    its own: CawLead `startingId`), the person's words its first row, nothing above them (the project-setup skill
 *    CawCo loads at his spawn leaves no row, live or read again after a
 *    reload), and never a session nothing has been said in (nightly 6688: "Nothing has been said here yet · Ask Claude Code
 *    about this folder"). Then his seat changes places, the head's going and coming
 *    back while the one over the board lands and leaves within the head's
 *    --dur-panel (Routines, then Board and Routines again 60ms apart): the
 *    head's seat still opens and closes his panel, drawn with it at every
 *    press. (Nightly 6688: the seat's `aria-expanded` changed and no panel
 *    drew at 1440, its one anchor cleared by the seat that left.)
 * 8. A project's setup page opens in no panel, by any show (hub
 *    artifacts/service.ts `boardOf`): Caw's `artifact_create` answers that
 *    the board draws it; the person's show answers the project whose board
 *    draws it; its Needs-you row leads to its first open card on the
 *    page (`routines`; a card named lands there, set up or not, since
 *    ca09ff0626); and the
 *    session's own page at 1440 (his panel's Open as tab) draws no
 *    preview. (Nightly 6757: his panel opened as a tab showed the setup
 *    page in Preview, its old Reminders rows with a minus and a Remove.)
 *    Then the page at the board's "Open the setup page" link (its `routines`
 *    card), at 1440 and 390: every stage drawn as the board's column
 *    (DraftColumn), none of the old rows nor its list of delegate types.
 */
import { join } from "node:path";
import type { Page } from "playwright-core";
import { setupPageAt } from "../../../packages/core/src/artifact-needs";
import { RESOLVE_PERMISSION } from "../../../packages/core/src/ask-tools";
import type {
  Sending,
  ToolArgs,
  ToolName,
} from "../../../packages/core/src/hub-request";
import { artifactToolWords } from "../../../packages/core/src/words/artifact-tools";
import { hubFailureWords } from "../../../packages/core/src/words/hub-failure";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { ToolAnswer, toolReply } from "../../tool-calls";
import { payloadOf } from "../hub";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

const WRITE = "mcp__cawco__folder_write";
/** Caw's write of AGENTS.md in the turn the handed page starts, and its answer once it came (at once or from the background). */
const agentsWrite: { answer: ToolAnswer; issued: boolean } = {
  issued: false,
  answer: new ToolAnswer(),
};

/**
 * Every request: a word; the probe calls the writer's tools itself. Caw,
 * told a page is his (leg 5), writes AGENTS.md in that turn, as the
 * project-setup skill's step 6 does: the approval lasts the turn.
 */
const respond = (request: Seen): Reply => {
  const say: Reply = { everyMs: 5, words: ["ok"] };
  if (!(request.tools && HANDED.test(request.all))) {
    return say;
  }
  if (agentsWrite.issued) {
    agentsWrite.answer.read(request);
    return say;
  }
  const reply = toolReply(request, WRITE, {
    path: "AGENTS.md",
    content: "# Spring move\n\nFinding a flat to rent by spring.\n",
  });
  if (reply.tool?.name === WRITE) {
    agentsWrite.issued = true;
  }
  return reply;
};

/** A project's setup page as the project-setup skill opens it: its Setup alone. */
const setupOnly = (shape: string) => `root = Decisions("Spring move", [setup])
setup = Setup("Spring move", "Find a flat to rent by spring and book viewings.", [found, call, done], [], "${shape}")
found = Stage("Found", "todo", "inbox", "cyan")
call = Stage("Your call", "you")
done = Stage("Done", "done", "done", "green")`;

/** The drawn stages' names as stages.md names them. */
const DRAWN = ["found", "your-call", "done"];

/** stages.md from the drawn stages, as the skill's step 6 writes it. */
const STAGES_MD = `---
found      todo
your-call  you
done       done
moves
  * → *    you
views
  board    by stage
---
`;

/** The social template's stages (hub stages.ts `TEMPLATE_TEXT.social`). */
const SOCIAL = [
  "idea",
  "draft",
  "review",
  "scheduled",
  "posted",
  "measured",
  "dropped",
];

const NOTICE = /The page "setup" has new responses/u;
/** What Caw hears of a page whose session ended (decisions.ts `send`). */
const HANDED =
  /done picking on the decision page “Spring move”[\s\S]*so this page is yours/u;

interface StagesRead {
  source: string;
  stages: { name: string }[];
}
/** A project of its own and its session, which writes the setup page. */
const projectWithSession = async (fleet: KitFleet, name: string) => {
  const project = await fleet.api((hub) =>
    hub.api.projects.post({
      name,
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    })
  );
  const session = await fleet.spawn("claude", name, fleet.repo, {
    projectId: project.id,
  });
  const as = {
    base: fleet.base,
    id: session,
    credential: await fleet.sessionCredential(session),
  };
  return {
    id: project.id,
    session,
    call: <N extends ToolName, const A>(
      tool: N,
      input: Sending<A, ToolArgs<N>>
    ) => toolWords(as, tool, input),
    stages: () =>
      fleet.api((hub) => hub.api.projects({ id: project.id }).stages.get()),
    /** The board's Set up: the hub's answer, its status and words. */
    setUp: async () => {
      try {
        await fleet.api((hub) =>
          hub.api
            .projects({ id: project.id })
            .decisions({ name: "setup" })
            .send.post({})
        );
        return "200";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
  };
};

const named = (read: StagesRead) => read.stages.map((one) => one.name).join();

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

  // 1. A Setup-only page, a question answered, then Set up.
  const own = await projectWithSession(fleet, "Spring move");
  const before = await own.stages();
  const made = await own.call("artifact_create", {
    kind: "page",
    name: "setup",
    does: "pick",
    title: "Probe pick artifact",
    ask: "Set up Spring move",
    program: setupOnly("own"),
  });
  const asked = await own.call("ask", {
    questions: [
      {
        question: "Which city is the flat in?",
        header: "City",
        multiSelect: false,
        options: [
          { label: "Lisbon", description: "Draft for Lisbon's listings." },
          { label: "Porto", description: "Draft for Porto's listings." },
        ],
      },
    ],
    blocks: false,
    meanwhile: "Drafting for Lisbon",
  });
  const parked = await until(
    "the question parked for the person",
    () => fleet.api((hub) => hub.api.pending.get()),
    (list) => list.some((one) => payloadOf(one).instanceId === own.session),
    60_000
  );
  const question = parked.find(
    (one) => payloadOf(one).instanceId === own.session
  );
  await fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "permission.answer",
    machineId: MACHINE,
    sessionId: own.session,
    payload: {
      instanceId: own.session,
      requestId: question?.requestId,
      method: RESOLVE_PERMISSION,
      args: [
        question?.requestId,
        {
          behavior: "allow",
          updatedInput: {
            ...(question?.payload as { input?: object } | undefined)?.input,
            answers: { "Which city is the flat in?": "Lisbon" },
          },
        },
      ],
    },
  });
  const answered = await until(
    "the answer off the person's list",
    () => fleet.api((hub) => hub.api.pending.get()),
    (list) => !list.some((one) => payloadOf(one).instanceId === own.session),
    60_000
  ).then(
    () => true,
    () => false
  );
  const first = await own.setUp();
  const heard = await until(
    "the session hearing the page's responses",
    () => fleet.seen.some((one) => NOTICE.test(one.all)),
    Boolean,
    60_000
  ).catch(() => false);
  kit.check(
    "1: on a Setup-only page left as drawn, after a question was answered, Set up is taken and the session hears the page",
    before.source === "none" &&
      !made.refused &&
      !asked.refused &&
      answered &&
      first === "200" &&
      heard,
    JSON.stringify({
      before: before.source,
      made: made.text.slice(0, 200),
      asked: asked.text.slice(0, 200),
      answered,
      setUp: first.slice(0, 300),
      heard,
    })
  );

  // 2. stages.md written from the drawn stages, as the skill writes it after the Send.
  const wrote = await own.call("folder_write", {
    path: "stages.md",
    content: STAGES_MD,
  });
  const after = await own.stages();
  kit.check(
    "2: once its stages.md is written from the drawn stages, /stages answers source file with them",
    !wrote.refused && after.source === "file" && named(after) === DRAWN.join(),
    `wrote: ${wrote.text.slice(0, 200)}; stages: ${after.source} ${named(after)}`
  );

  // 3. Caw draws the page again after that Send; Set up again.
  const page = await fleet.api((hub) =>
    hub.api.projects({ id: own.id }).decisions({ name: "setup" }).get()
  );
  const redrawn = await own.call("artifact_update", {
    id: page.artifactId ?? "",
    statements:
      'setup = Setup("Spring move", "Find a flat in Lisbon by spring and book viewings.", [found, call, done], [], "own")',
  });
  const again = await own.setUp();
  kit.check(
    "3: after Caw draws the page again since a Send, Set up is taken again",
    !redrawn.refused && again === "200",
    `redrawn: ${redrawn.text.slice(0, 200)}; Set up: ${again.slice(0, 300)}`
  );

  // 4. A Setup drawn from the social template, left as drawn.
  const social = await projectWithSession(fleet, "Spring posts");
  const socialMade = await social.call("artifact_create", {
    kind: "page",
    name: "setup",
    does: "pick",
    title: "Probe pick artifact",
    ask: "Set up Spring posts",
    program: setupOnly("social"),
  });
  const socialSetUp = await social.setUp();
  const applied = await social.stages();
  kit.check(
    "4: a Setup drawn from the social template, left as drawn: Set up applies it, /stages answers source file with its stages",
    !socialMade.refused &&
      socialSetUp === "200" &&
      applied.source === "file" &&
      named(applied) === SOCIAL.join(),
    `made: ${socialMade.text.slice(0, 200)}; Set up: ${socialSetUp.slice(0, 300)}; stages: ${applied.source} ${named(applied)}`
  );

  // 5. The writer ended before Set up.
  const ended = await projectWithSession(fleet, "Spring flat");
  const endedMade = await ended.call("artifact_create", {
    kind: "page",
    name: "setup",
    does: "pick",
    title: "Probe pick artifact",
    ask: "Set up Spring move",
    program: setupOnly("social"),
  });
  fleet.stopSession(ended.session);
  const stopped = await until(
    "the writer stopped",
    () => fleet.instance(ended.session),
    (row) => row?.status === "stopped",
    60_000
  ).then(
    (row) => row?.status ?? "none",
    () => "not stopped"
  );
  const handed = await fleet
    .api((hub) =>
      hub.api
        .projects({ id: ended.id })
        .decisions({ name: "setup" })
        .send.post({})
    )
    .catch((error: unknown) => ({
      to: error instanceof Error ? error.message : String(error),
      instanceId: undefined,
    }));
  const endedStages = await ended.stages();
  const cawHeard = await until(
    "Caw hearing the page is his",
    () => fleet.seen.some((one) => HANDED.test(one.all)),
    Boolean,
    120_000
  ).catch(() => false);
  const agents = await until(
    "Caw's write of AGENTS.md answered",
    () => agentsWrite.answer.answered?.text,
    Boolean,
    120_000
  ).catch(() => "no answer");
  kit.check(
    "5: with its writer ended, Set up applies the Setup as drawn, the project's Caw hears it, and his write of AGENTS.md stands approved by it",
    !endedMade.refused &&
      stopped === "stopped" &&
      handed.to === "caw" &&
      handed.instanceId !== ended.session &&
      endedStages.source === "file" &&
      named(endedStages) === SOCIAL.join() &&
      cawHeard &&
      agents.includes("Committed AGENTS.md"),
    JSON.stringify({
      made: endedMade.text.slice(0, 120),
      stopped,
      setUp: handed,
      stages: `${endedStages.source} ${named(endedStages)}`,
      cawHeard,
      agents: agents.slice(-300),
    })
  );

  // 6. New project with Caw: the answer before his start ends.
  const createdAt = Date.now();
  const made6 = await fleet.api((hub) =>
    hub.api.projects.post({
      prompt: "Keep track of my flat hunt for next spring.",
      promptId: crypto.randomUUID(),
      caw: true,
    })
  );
  const answeredIn = Date.now() - createdAt;
  const atAnswer = await fleet.api((hub) =>
    hub.api.projects({ id: made6.id }).caw.get()
  );
  const started = await until(
    "Caw's conversation started",
    () => fleet.api((hub) => hub.api.projects({ id: made6.id }).caw.get()),
    (view) => view.instanceId !== null && view.starting === false,
    120_000
  ).catch(() => null);
  kit.check(
    "6: New project with Caw answers once the project is made: his view says starting, and his conversation starts after",
    atAnswer.starting === true && started !== null,
    JSON.stringify({ answeredIn, atAnswer, started })
  );

  await panelAtDesk(kit, fleet);
  await setupInNoPanel(kit, fleet);
  await setupAtCard(kit, fleet);
};

/** Leg 8's setup page: a Setup with a type that runs a stage, and a `routines` card beside it. */
const OFFICE = `root = Decisions("Private office", [setup, routines])
setup = Setup("Private office", "Find a private office to rent near the station and sign by March.", [inbox, scouting, drafting, call, won, dropped], [writer], "own")
inbox = Stage("Inbox", "todo", "inbox", "cyan")
scouting = Stage("Scouting", "active", "search", "cyan")
drafting = Stage("Drafting", "active", "pen", "amber", {runs: "writer"}, "Runs the writer")
call = Stage("Your call", "you")
won = Stage("Won", "done", "done", "green")
dropped = Stage("Dropped", "dropped")
writer = Delegate("writer", "Writer", "Drafts enquiries to landlords in your voice.", "Claude Code · Opus")
routines = Decision("routines", "Which routines does it keep?", [scan, none], "New listings come in through the week.", [], [], false, null, "behaviour")
scan = Option("scan", "A weekly listings scan", "Every Monday, new offices near the station.", true, [], "One run a week.")
none = Option("none", "No routines", "You bring the listings.", false, [], "Listings wait on you.")`;
/** Leg 8's stages, in the board's order. */
const OFFICE_STAGES = [
  "Inbox",
  "Scouting",
  "Drafting",
  "Your call",
  "Won",
  "Dropped",
];
/** The old setup rows' parts (decisions/host/setup's Reminders rows, gone): a row's minus, its Remove, its name field, a type's row. */
const OLD_ROWS =
  '[data-part="remove"], [data-part="remove-now"], [data-slot="setup-stage-name"], [data-slot="setup-delegate"]';

/**
 * Leg 8: a project's setup page made and shown, read for where it opens,
 * then drawn at the board's link to it at 1440 and 390.
 */
const setupInNoPanel = async (kit: Kit, fleet: KitFleet) => {
  const office = await projectWithSession(fleet, "Private office");
  const made = await office.call("artifact_create", {
    kind: "page",
    name: "setup",
    does: "pick",
    title: "Probe pick artifact",
    ask: "Set up Private office",
    program: OFFICE,
  });
  const row = await fleet.api((hub) =>
    hub.api.projects({ id: office.id }).decisions({ name: "setup" }).get()
  );
  const id = row.artifactId ?? "";
  const shown = await fleet
    .api((hub) =>
      hub.api
        .instances({ id: office.session })
        .artifacts({ artifact: id })
        .show.post({})
    )
    .catch((error: unknown) => ({
      opened: false,
      href: error instanceof Error ? error.message : String(error),
    }));
  const needs = await fleet.api((hub) => hub.api["artifact-needs"].get());
  const rows = needs.needs.filter((one) => one.artifactId === id);
  kit.check(
    "8: a project's setup page opens in no panel: Caw's create answers that the board draws it, the person's show lands on the project's board, its Needs-you row leads to its first open card on the project's page",
    !made.refused &&
      made.text.includes(artifactToolWords.onBoard) &&
      shown.opened === false &&
      shown.href === `/project/${office.id}` &&
      // Its first open card named (routines), it lands at that card on the
      // page, set up or not (core setupLanding, ca09ff0626).
      rows.every((one) => one.href === setupPageAt(office.id, "routines")),
    JSON.stringify({ made: made.text.slice(0, 300), shown, needs: rows })
  );

  // His panel opened as a tab: the session's own page draws no preview.
  const base = await fleet.dashboard();
  const tab = await kit.page("desk");
  await open(tab, `${base}/session/${office.session}`, '[data-slot="pane"]');
  await tab.waitForTimeout(3000);
  const panes = await tab.locator('[data-slot="preview-pane"]').count();
  kit.check(
    "8: the setup page's session opened as a tab at 1440 draws no preview",
    panes === 0,
    JSON.stringify({ panes })
  );

  // The board's "Open the setup page": at its first card beyond the draft.
  for (const view of ["desk", "phone"] as const) {
    const page = await kit.page(view);
    await open(
      page,
      `${base}/project/${office.id}?view=decisions&page=setup#routines`,
      '[data-slot="decisions"] iframe'
    );
    const frame = page.locator('[data-slot="decisions"] iframe').contentFrame();
    await frame
      .locator('[data-slot="draft-column"]')
      .first()
      .waitFor({ timeout: 60_000 })
      .catch(() => undefined);
    const columns = await frame
      .locator('[data-slot="draft-column"]')
      .evaluateAll((all) =>
        all.map((one) => {
          const name = one.querySelector("input")?.value ?? "";
          const words = (one as HTMLElement).innerText
            .replace(/\s+/gu, " ")
            .trim();
          return words ? `${name} · ${words}` : name;
        })
      );
    const old = await frame.locator(OLD_ROWS).count();
    await page.screenshot({ path: join(kit.out, `setup-page-${view}.png`) });
    console.log(`… the setup page at ${view}: ${JSON.stringify(columns)}`);
    kit.check(
      `8: the setup page at ${view === "desk" ? 1440 : 390} draws every stage as the board's column, none of the old rows`,
      columns.length === OFFICE_STAGES.length &&
        OFFICE_STAGES.every((name, at) => columns[at]?.startsWith(name)) &&
        old === 0,
      JSON.stringify({ columns, old })
    );
  }
};

/** The decision page's frame (PageFrame), served at `/__cawco/page/<id>/`. */
const PAGE_FRAME = /\/__cawco\/page\//u;

/** Where the setup page's `routines` card (its one card since f1342594ee dropped `place`) stands in its frame's viewport, px; null before the frame draws it. */
const routinesCardAt = async (page: Page) => {
  const frame = page.frame({ url: PAGE_FRAME });
  if (!frame) {
    return null;
  }
  try {
    return await frame.evaluate(() => {
      const el = document.querySelector("#decision-routines");
      if (!el) {
        return null;
      }
      const box = el.getBoundingClientRect();
      return {
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        height: innerHeight,
      };
    });
  } catch {
    return null;
  }
};

/**
 * Leg 9: a set-up project's setup page (its stages.md written before the
 * page is made) lands on its Decisions tab, never the board, which draws
 * no setup-page card once the project is set up (live, 6764: Caw's chip of
 * a card on it led to the board, with nothing to answer). Caw's create
 * answers that the Decisions tab draws it; a card chip's show (`card`, as
 * reference-open.svelte.ts `openReference` sends it) lands at that card,
 * and so does its Needs-you row, at its first card not picked (`routines`,
 * its one card since f1342594ee dropped `place`). The show's body in its
 * shape before 5646cadda, `{ card }`, is refused with a 422 naming `card`
 * (r487: the hub dropped it and answered the page's top). Then that
 * landing at 1440 and 390: the Decisions tab draws the page with the card
 * in view.
 */
const setupAtCard = async (kit: Kit, fleet: KitFleet) => {
  const office = await projectWithSession(fleet, "Private office");
  const wrote = await office.call("folder_write", {
    path: "stages.md",
    content: STAGES_MD,
  });
  const stages = await office.stages();
  const made = await office.call("artifact_create", {
    kind: "page",
    name: "setup",
    does: "pick",
    title: "Probe pick artifact",
    ask: "Set up Private office",
    program: OFFICE,
  });
  const row = await fleet.api((hub) =>
    hub.api.projects({ id: office.id }).decisions({ name: "setup" }).get()
  );
  const id = row.artifactId ?? "";
  const shown = await fleet
    .api((hub) =>
      hub.api
        .instances({ id: office.session })
        .artifacts({ artifact: id })
        .show.post({ at: { card: "routines" } })
    )
    .catch((error: unknown) => ({
      opened: false,
      href: error instanceof Error ? error.message : String(error),
    }));
  const atCard = setupPageAt(office.id, "routines");
  // The shape before 5646cadda, `{ card }`: refused with a 422 naming the
  // field (hub unknown-fields.ts), never answered as a show of the page's
  // top, as r487 was.
  // A variable, not a literal: TypeScript refuses an extra property only on
  // a fresh object literal, so this goes through Eden as the old caller sent
  // it. `at: undefined` is what JSON leaves out.
  const oldBody = { card: "routines", at: undefined };
  const oldShape = await fleet
    .api((hub) =>
      hub.api
        .instances({ id: office.session })
        .artifacts({ artifact: id })
        .show.post(oldBody)
    )
    .then(
      (answer) => `answered ${JSON.stringify(answer)}`,
      (error: unknown) =>
        error instanceof Error ? error.message : String(error)
    );
  kit.check(
    "9: the show refuses the card in the old shape with a 422 naming `card`, and takes it as `at: { card }`",
    oldShape.includes(": 422 ") &&
      oldShape.endsWith(hubFailureWords.unknownFields("body", ["card"])) &&
      "href" in shown &&
      shown.href === atCard,
    JSON.stringify({ oldShape, shown })
  );
  const needs = await fleet.api((hub) => hub.api["artifact-needs"].get());
  const rows = needs.needs.filter((one) => one.artifactId === id);
  kit.check(
    "9: a set-up project's setup page lands on its Decisions tab: Caw's create says so, a card chip's show lands at that card, and so does its Needs-you row",
    !wrote.refused &&
      stages.source === "file" &&
      !made.refused &&
      made.text.includes(artifactToolWords.onDecisions) &&
      shown.opened === false &&
      shown.href === atCard &&
      rows.length > 0 &&
      rows.every((one) => one.href === atCard),
    JSON.stringify({
      stages: stages.source,
      made: made.text.slice(0, 300),
      shown,
      needs: rows,
    })
  );

  const base = await fleet.dashboard();
  for (const view of ["desk", "phone"] as const) {
    const page = await kit.page(view);
    await open(
      page,
      `${base}${"href" in shown ? shown.href : atCard}`,
      '[data-slot="decisions"] iframe'
    );
    const card = await until(
      "the routines card in view",
      () => routinesCardAt(page),
      (at) => at !== null && at.top >= 0 && at.top < at.height,
      30_000
    ).catch(() => null);
    const tab = await page
      .locator('[data-slot="decisions"]')
      .count()
      .catch(() => 0);
    await page.screenshot({ path: join(kit.out, `setup-card-${view}.png`) });
    kit.check(
      `9: the landing at ${view === "desk" ? 1440 : 390} draws the setup page in Decisions with its routines card in view`,
      tab > 0 && card !== null,
      JSON.stringify({ url: page.url(), tab, card })
    );
  }
};

/** What leg 7 sends as the person's words. */
const WORDS7 = "Plan the garden for the summer, bed by bed.";
/** A session's empty transcript (SessionPane `blank`), with its ask of its own agent. */
const NOTHING_SAID = /Nothing has been said|about this folder/u;
/** The words of the panel's first row of the person's, under its speaker line ("You", its time). */
const FIRST_SAID = /^You\n[^\n]*\n+([^\n]+)/mu;

/**
 * Leg 7: a project made with Caw, its page at 1440 opened as the create
 * answers, read for what his panel draws as he starts, then for his seat
 * opening it after the seat changed places.
 */
const panelAtDesk = async (kit: Kit, fleet: KitFleet) => {
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  // Every text his panel's well draws, from the page's first frame.
  await page.addInitScript(() => {
    const drawn = new Set<string>();
    (window as unknown as { __cawWell: Set<string> }).__cawWell = drawn;
    new MutationObserver(() => {
      const well = document.querySelector(
        '[data-caw-panel] [data-slot="well"]'
      );
      const text = (well as HTMLElement | null)?.innerText.trim();
      if (text) {
        drawn.add(text.replace(/\s+/gu, " ").slice(0, 200));
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const made = await fleet.api((hub) =>
    hub.api.projects.post({
      prompt: WORDS7,
      promptId: crypto.randomUUID(),
      caw: true,
    })
  );
  await open(page, `${base}/project/${made.id}`, '[data-slot="caw-seat"]');
  const panel = page.locator("[data-caw-panel]");
  // A project just made opens on his panel (CawLead `arrive`, its board empty).
  const words = await until(
    "his panel showing the person's words",
    async () => {
      try {
        return await panel.innerText({ timeout: 1000 });
      } catch {
        return "";
      }
    },
    (text) => text.includes(WORDS7),
    120_000
  ).catch(() => "never");
  const wells = await page.evaluate(() => [
    ...(window as unknown as { __cawWell: Set<string> }).__cawWell,
  ]);
  kit.check(
    "7: his panel at 1440 shows his conversation from the first, the person's words its first row, never a session nothing has been said in",
    words !== "never" &&
      FIRST_SAID.exec(words)?.[1]?.trim() === WORDS7 &&
      !wells.some((text) => NOTHING_SAID.test(text)),
    JSON.stringify({ wells: wells.slice(0, 12), words: words.slice(0, 300) })
  );

  // Nothing above the person's words: the skill CawCo loaded at his spawn
  // (`/project-setup`, sent quietly) leaves no row, as his conversation is
  // drawn live and as it is read again whole from the hub after a reload.
  const firstRows = () =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '[data-caw-panel] [data-slot="listing"] [data-item]'
        ),
      ]
        .map((row) => row.innerText.replace(/\s+/gu, " ").trim())
        .filter(Boolean)
        .slice(0, 3)
    );
  const heads = (rows: string[]) =>
    rows[0]?.startsWith("You") === true && rows[0].includes(WORDS7);
  const live = await firstRows();
  await page.reload({ waitUntil: "domcontentloaded" });
  const reread = await until(
    "his conversation read again after a reload",
    firstRows,
    (rows) => rows.some((row) => row.includes(WORDS7)),
    60_000
  ).catch(() => [] as string[]);
  kit.check(
    "7: the person's words are the first row of Caw's conversation, nothing above them, live and read again after a reload",
    heads(live) && heads(reread),
    JSON.stringify({ live, reread })
  );

  // His start over (his turn ended), the board stands him at 80; Routines
  // seats him in the head.
  await page
    .locator('[data-slot="caw-80"] [data-slot="caw-seat"]')
    .waitFor({ timeout: 120_000 });
  const tab = (name: string) =>
    page
      .locator('[data-slot="strip"]')
      .getByRole("tab", { name, exact: true })
      .first();
  await tab("Routines").click();
  const head = page.locator('[data-slot="seat"] [data-slot="caw-seat"]');
  await head.waitFor({ timeout: 10_000 });
  await page
    .locator('[data-slot="caw-80"]')
    .waitFor({ state: "detached", timeout: 10_000 });
  // Board, then Routines again inside the head's --dur-panel: the head's
  // seat slides out and is called back as it went, the 80 lands and leaves.
  const raced = await page.evaluate(async () => {
    // The strip's tabs on screen, not the inert copies it measures with.
    const tabOf = (name: string) =>
      [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
        (one) =>
          one.checkVisibility() &&
          !one.closest('[inert], [aria-hidden="true"]') &&
          one.querySelector('[data-slot="text"]')?.textContent?.trim() === name
      );
    const board = tabOf("Board");
    const routines = tabOf("Routines");
    board?.click();
    await new Promise((done) => setTimeout(done, 60));
    // The 80 stood, and the head's seat was still on its way out.
    const crossed =
      document.querySelector('[data-slot="caw-80"]') !== null &&
      document.querySelector('[data-slot="seat"]') !== null;
    routines?.click();
    await new Promise((done) => setTimeout(done, 1000));
    return { tabs: Boolean(board && routines), crossed };
  });
  /** The seat's `aria-expanded`, and whether his docked panel is drawn. */
  const state = async () => ({
    expanded: await head.getAttribute("aria-expanded"),
    drawn: (await page.locator("[data-caw-dock]").count()) > 0,
  });
  const presses = [await state()];
  for (let press = 0; press < 2; press += 1) {
    await head.click();
    await page.waitForTimeout(800);
    presses.push(await state());
  }
  kit.check(
    "7: after his seat changed places, the head's seat at 1440 opens and closes his panel, drawn with it at every press",
    raced.tabs &&
      raced.crossed &&
      new Set(presses.map((one) => one.expanded)).size === 2 &&
      presses.every((one) => one.drawn === (one.expanded === "true")),
    JSON.stringify({ raced, presses })
  );
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "setup-send",
  run,
};
export default spec;
