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
 */
import { RESOLVE_PERMISSION } from "../../../packages/core/src/ask-tools";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const WRITE = "mcp__cawco__folder_write";
/** Caw's write of AGENTS.md in the turn the handed page starts, and its answer once it came. */
const agentsWrite: { answer: string; issued: boolean } = {
  issued: false,
  answer: "",
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
    agentsWrite.answer ||= request.last;
    return say;
  }
  if (!request.toolNames.includes(WRITE)) {
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "ToolSearch",
        input: { query: `select:${WRITE}`, max_results: 1 },
      },
    };
  }
  agentsWrite.issued = true;
  return {
    everyMs: 5,
    words: [],
    tool: {
      name: WRITE,
      input: {
        path: "AGENTS.md",
        content: "# Spring move\n\nFinding a flat to rent by spring.\n",
      },
    },
  };
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

interface Pending {
  payload?: { instanceId?: string; toolName?: string };
  requestId?: string;
}

/** A project of its own and its session, which writes the setup page. */
const projectWithSession = async (fleet: KitFleet, name: string) => {
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name,
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
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
    call: (tool: string, input: Record<string, unknown>) =>
      toolWords(as, tool, input),
    stages: () => fleet.api<StagesRead>(`/api/projects/${project.id}/stages`),
    /** The board's Set up: the hub's answer, its status and words. */
    setUp: async () => {
      try {
        await fleet.api(`/api/projects/${project.id}/decisions/setup/send`, {});
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
    () => fleet.api<Pending[]>("/api/pending"),
    (list) => list.some((one) => one.payload?.instanceId === own.session),
    60_000
  );
  const question = parked.find(
    (one) => one.payload?.instanceId === own.session
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
    () => fleet.api<Pending[]>("/api/pending"),
    (list) => !list.some((one) => one.payload?.instanceId === own.session),
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
  const page = await fleet.api<{ artifactId: string | null }>(
    `/api/projects/${own.id}/decisions/setup`
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
    .api<{ instanceId?: string; to: string }>(
      `/api/projects/${ended.id}/decisions/setup/send`,
      {}
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
    () => agentsWrite.answer,
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
  const made6 = await fleet.api<{ id: string }>("/api/projects", {
    prompt: "Keep track of my flat hunt for next spring.",
    promptId: crypto.randomUUID(),
    caw: true,
  });
  const answeredIn = Date.now() - createdAt;
  const atAnswer = await fleet.api<{
    instanceId: string | null;
    starting?: boolean;
  }>(`/api/projects/${made6.id}/caw`);
  const started = await until(
    "Caw's conversation started",
    () =>
      fleet.api<{ instanceId: string | null; starting?: boolean }>(
        `/api/projects/${made6.id}/caw`
      ),
    (view) => view.instanceId !== null && view.starting === false,
    120_000
  ).catch(() => null);
  kit.check(
    "6: New project with Caw answers once the project is made: his view says starting, and his conversation starts after",
    atAnswer.starting === true && started !== null,
    JSON.stringify({ answeredIn, atAnswer, started })
  );
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "setup-send",
  run,
};
export default spec;
