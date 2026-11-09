/**
 * A browser ask reaches the person where they are looking, and Take over
 * shows the page the agent asked about. The owner's case of 2026-11-06:
 * Caw's delegate asked him to take over its browser; nothing reached Caw's
 * session, and Take over, pressed in the delegate's own session, showed an
 * extension's first-run tab with the band reading "No page open". The
 * delegate's page had closed with its work item before it asked, and the
 * take-over brought the browser's first tab forward in its place (agent
 * shield.ts `frontPage`, which fell back to any page).
 *
 * On a scratch fleet (real hub, agent and sessiond; the mock model; the
 * project's browser on the local host), in a project: a top session, its
 * delegate, and that delegate's delegate, each delegate's work item seeded
 * on the hub's rows in a workspace of its own, its door made as the
 * workspace's boundary makes it (gated-pages.ts). A site on loopback is the
 * page's origin.
 *
 * (a) The first delegate, with no page open, calls `browser_ask`: it is
 *     refused in the words naming what to do, and nothing waits on the
 *     person.
 * (b) The delegate two deep opens the site's home page, then its sign-in
 *     page in a tab of its own, and a page on a second origin; it drives
 *     the sign-in page again and calls `browser_ask` on the site's origin:
 *     the ask waits on the person, routed to no agent.
 * (c) The top session's pane, at 1440, draws the ask as a card named by
 *     the delegate that asked, with its reason, and its tab reads that it
 *     needs you.
 * (d) After the ask, a tab opens on the same origin (the asker's own, and
 *     another session's). Take over on the top session's card brings the
 *     page the agent drove and asked about to the front (the shield's
 *     page; not its older home page on the same origin), and
 *     takes the person to the asking delegate's session, where its panel
 *     shows the browser.
 * (e) Handed back, the asker's call answers that it was handed back, on
 *     the site's origin.
 * (f) An ask whose page closed before the person took it: Take over is
 *     refused in the words saying so, and the gate is open to the agents
 *     again.
 * (g) Every session above the asker is told: the top session and the
 *     middle one each hear once that the delegate two deep waits on the
 *     person, once that the person took its browser over, and once that it
 *     was handed back.
 * (h) Take over from the Needs you row in Caw's panel takes the person to
 *     the asking delegate's session, the page it asked about in front.
 * (i) The delegate two deep asks the person to connect one of the fleet's
 *     OAuth MCP servers (a stand-in on loopback): the top session's pane
 *     draws the sign-in card named by the delegate that asked, and the top
 *     session hears it wait, then hears it end once it is declined.
 * (j) Its workspace held (its clone holds work that is nowhere else), its
 *     item ends (turns that do nothing; in the owner's case a finish_item,
 *     the same end) and words sent to it reopen it (the owner's case: its
 *     parent's handoff): the delegate two deep still has the page it had
 *     open, its browser_ask waits on the person, and Take over brings that
 *     page to the front.
 * (k) Its workspace retires as its item ends, its boundary and pages
 *     closing with it; its item is reopened in the same workspace (the rows
 *     a recut leaves, its session woken outside it: only the host cuts a
 *     clone and starts a boundary): the pages it had open again, its
 *     browser_ask waits on the person, and Take over brings the page it had
 *     to the front.
 * (l) Its item ends, the project's browser is put to sleep (the stop the
 *     idle sweep makes), and its item is reopened as in (k): its ask wakes
 *     the browser as its browser tool would, the page it had opens again,
 *     its browser_ask waits on the person, and Take over brings that page
 *     to the front.
 *
 *   bun scripts/probe-kit/run.ts browser-ask-tree
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { RESOLVE_PERMISSION } from "../../../packages/core/src/ask-tools";
import type {
  BrowserKey,
  ListedBrowser,
} from "../../../packages/core/src/browser";
import {
  hubRequest,
  type Sending,
  type ToolArgs,
  type ToolName,
} from "../../../packages/core/src/hub-request";
import { askWords } from "../../../packages/core/src/words/asks";
import { browserAskWords } from "../../../packages/core/src/words/browser";
import { delegateWaitWords } from "../../../packages/core/src/words/delegates";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import { caw } from "../caw-head";
import { doorOf, liveBrowser, servedSite } from "../gated-pages";
import { type Kit, type KitFleet, open, type Spec } from "../kit";
import { oauthProvider } from "../oauth-provider";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const REASON = `Sign in to the probe's site ${crypto.randomUUID().slice(0, 8)}`;
/** What the hub answers a call made with a session process's credential that is no longer its own. */
const STALE_CREDENTIAL = "Invalid session credential";
/** The fleet's OAuth MCP server the delegate asks the person to connect. */
const SERVER = "ProbeSignIn";
/** A work item's states while it runs (work-item-state.ts `LIVE`). */
const LIVE_ITEM: ReadonlySet<string> = new Set(["starting", "running"]);

interface Parked {
  instanceId?: string;
  payload: {
    browserAsk?: { key: string; origin: string };
    connectAsk?: { server: string };
    routedTo?: string;
  };
  requestId?: string;
}

const callAs = async <N extends ToolName, const A>(
  fleet: KitFleet,
  as: string,
  name: N,
  args: Sending<A, ToolArgs<N>>,
  timeoutMs?: number
) =>
  await toolWords(
    {
      base: fleet.base,
      id: as,
      credential: await fleet.sessionCredential(as),
    },
    name,
    args,
    timeoutMs ? { timeoutMs } : {}
  );

/** The page the shield brought to the front, as the browser's dir keeps it (agent shield.ts `shield.json`). */
const shieldPage = async (
  fleet: KitFleet,
  key: BrowserKey
): Promise<string | undefined> => {
  const { browserDir } =
    await import("../../../packages/agent/src/browser/state");
  const before = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = fleet.env.XDG_DATA_HOME as string;
  try {
    const kept = JSON.parse(
      await readFile(join(browserDir(key), "shield.json"), "utf8")
    ) as { targetId?: string };
    return kept.targetId;
  } catch {
    // No take-over kept yet: nothing in front.
    return undefined;
  } finally {
    if (before === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = before;
    }
  }
};

const pending = (fleet: KitFleet) =>
  fleet.api<Parked[]>(hubRequest("GET /api/pending"));

/** The ask `requestId` of the session's, once it waits on the person. */
const parkedOf = (
  fleet: KitFleet,
  instanceId: string,
  requestId?: string
): Promise<Parked | undefined> =>
  until(
    `${instanceId.slice(0, 8)}'s ask waiting on the person`,
    async () =>
      (await pending(fleet)).find(
        (one) =>
          one.instanceId === instanceId &&
          (!requestId || one.requestId === requestId)
      ),
    Boolean,
    60_000
  ).catch(() => undefined);

/** The person's Decline (Not now) of ask `requestId`, as a card sends it. */
const decline = async (
  fleet: KitFleet,
  instanceId: string,
  requestId: string
): Promise<boolean> => {
  await fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "permission.answer",
    machineId: MACHINE,
    sessionId: instanceId,
    payload: {
      instanceId,
      requestId,
      method: RESOLVE_PERMISSION,
      args: [requestId, { behavior: "deny", message: "Not now" }],
    },
  });
  return await until(
    `${requestId.slice(0, 8)} declined`,
    async () =>
      !(await pending(fleet)).some((one) => one.requestId === requestId),
    Boolean,
    60_000
  ).catch(() => false);
};

/** How many of `to`'s sends tell of ask `requestId` under `said` (a delegate-wait notice's line, carried encoded on its tag, or its words). */
const toldOf = (
  fleet: KitFleet,
  to: string,
  requestId: string,
  said: string
): number =>
  fleet.query<{ n: number }>(
    "SELECT count(*) AS n FROM sent_messages WHERE instance_id = ? AND instr(body, ?) > 0 AND (instr(body, ?) > 0 OR instr(body, ?) > 0)",
    to,
    `request=${requestId}`,
    encodeURIComponent(said),
    said
  )[0]?.n ?? 0;

/** The top and middle sessions' counts of the notice, once the top's has come (or 30 s went). */
const toldUp = async (
  fleet: KitFleet,
  tree: { middle: string; top: string },
  requestId: string,
  said: string
): Promise<{ middle: number; top: number }> => {
  await until(
    `the top session told of ${requestId.slice(0, 8)}: ${said.slice(0, 40)}`,
    () => Promise.resolve(toldOf(fleet, tree.top, requestId, said)),
    (n) => n > 0,
    30_000
  ).catch(() => 0);
  return {
    top: toldOf(fleet, tree.top, requestId, said),
    middle: toldOf(fleet, tree.middle, requestId, said),
  };
};

/** (h) Take over from Caw's Needs you: the person lands in the asking session, the asked page in front. */
const legNeedsYou = async (
  { check }: Kit,
  at: {
    asked: string;
    base: string;
    deep: string;
    fleet: KitFleet;
    key: BrowserKey;
    page: Page;
    projectId: string;
    site: string;
    top: string;
    /** The asker's workspace: its door's id. */
    workspace: string;
  }
): Promise<void> => {
  const { fleet, page } = at;
  // Back on the sign-in page: the one it drove last since is the newer tab.
  const door = await doorOf(fleet, at.workspace, at.projectId);
  await door.drive(at.asked);
  door.close();
  const call = callAs(
    fleet,
    at.deep,
    "browser_ask",
    { origin: at.site, reason: `${REASON} from Needs you` },
    900_000
  );
  const parked = await parkedOf(fleet, at.deep);
  await open(page, `${at.base}/session/${at.top}`, '[data-slot="pane"]');
  await caw(page).click();
  const take = page
    .locator('section[aria-labelledby="caw-needs"]')
    .getByRole("button", { name: askWords.takeOver });
  const shown = await take.waitFor({ state: "visible", timeout: 30_000 }).then(
    () => true,
    () => false
  );
  if (shown) {
    await take.click();
  }
  const went = await until(
    "(h) the person taken to the asking delegate's session",
    () => Promise.resolve(new URL(page.url()).pathname),
    (path) => path === `/session/${at.deep}`,
    30_000
  ).catch(() => new URL(page.url()).pathname);
  const front = await until(
    "(h) the shield's page",
    () => shieldPage(fleet, at.key),
    Boolean,
    30_000
  ).catch(() => undefined);
  check(
    "(h) Take over on the Needs you row in Caw's panel takes the person to the asking delegate's session, the page it asked about in front",
    !!parked && shown && went === `/session/${at.deep}` && front === at.asked,
    JSON.stringify({
      parked: parked?.requestId,
      shown,
      went,
      front,
      asked: at.asked,
    })
  );
  await fleet
    .api(
      hubRequest("POST /api/browsers/:key/handback", {
        path: { key: at.key },
        body: { machineId: MACHINE },
      })
    )
    .catch(() => undefined);
  await call.catch(() => undefined);
};

/** (i) A sign-in two deep: drawn on the top session, and told to it as it waits and ends. */
const legConnect = async (
  { check }: Kit,
  at: {
    base: string;
    deep: string;
    fleet: KitFleet;
    page: Page;
    tree: { middle: string; top: string };
  }
): Promise<void> => {
  const { fleet, page } = at;
  const provider = oauthProvider();
  try {
    const saved = await fleet
      .api<{ auth?: { mode?: string } }>(
        hubRequest("PUT /api/fleet/mcp/:name", {
          path: { name: SERVER },
          body: {
            config: {
              type: "http",
              url: `http://127.0.0.1:${provider.port}/mcp`,
            },
            enabled: true,
          },
        })
      )
      .catch((error: unknown) => ({ error: String(error) }));
    const call = callAs(
      fleet,
      at.deep,
      "connect_ask",
      { server: SERVER, reason: `${REASON} with ${SERVER}` },
      900_000
    );
    const parked = await until(
      "(i) the deep delegate's connect ask waiting on the person",
      async () =>
        (await pending(fleet)).find(
          (one) => one.instanceId === at.deep && one.payload.connectAsk
        ),
      Boolean,
      60_000
    ).catch(() => undefined);
    await open(page, `${at.base}/session/${at.tree.top}`, '[data-slot="pane"]');
    const card = page.locator(
      `section[aria-label="${askWords.connectAskFrom("Ask deep")}"]`
    );
    const drawn = await card
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(
        () => true,
        () => false
      );
    const requestId = parked?.requestId ?? "";
    const waits = await toldUp(
      fleet,
      at.tree,
      requestId,
      delegateWaitWords.waitsLine("Ask deep")
    );
    const declined = requestId
      ? await decline(fleet, at.deep, requestId)
      : false;
    const ended = await toldUp(
      fleet,
      at.tree,
      requestId,
      delegateWaitWords.endedLine("Ask deep")
    );
    const answered = await call.then(
      (said) => said.text,
      (error: unknown) => `failed: ${String(error)}`
    );
    check(
      `(i) the delegate two deep asks the person to connect ${SERVER}: the top session's pane draws the sign-in card named by it ("${askWords.connectAskFrom("Ask deep")}"), and the top and middle sessions each hear once that it waits, and once that it ended as the person declined it`,
      !!parked &&
        drawn &&
        waits.top === 1 &&
        waits.middle === 1 &&
        declined &&
        ended.top === 1 &&
        ended.middle === 1,
      JSON.stringify({
        saved,
        parked: parked?.requestId,
        drawn,
        waits,
        declined,
        ended,
        answered: answered.slice(0, 200),
      })
    );
  } finally {
    provider.stop(true);
  }
};

interface Reopening {
  deep: { id: string; workspace: string };
  fleet: KitFleet;
  key: BrowserKey;
  projectId: string;
  site: string;
}

/** The delegate's work item's state now, and when it last ended. */
const itemOf = (
  fleet: KitFleet,
  instanceId: string
): { ended: number | null; state: string } =>
  fleet.query<{ ended: number | null; state: string }>(
    "SELECT state, ended_at AS ended FROM work_items WHERE instance_id = ?",
    instanceId
  )[0] ?? { ended: null, state: "none" };

/** The workspace's state now. */
const workspaceState = (fleet: KitFleet, workspace: string): string =>
  fleet.query<{ state: string }>(
    "SELECT state FROM workspaces WHERE id = ?",
    workspace
  )[0]?.state ?? "none";

/**
 * Words to the delegate give it turns that do nothing, and the hub ends its
 * item on the third (work-items.ts `quietTurn`): an end its parent's
 * `finish_item` or stop would make the same way, here with its process left
 * running.
 */
const quietEnd = async (
  at: Reopening,
  label: string
): Promise<{ ended: number | null; state: string }> => {
  await at.fleet.send(at.deep.id, "Nothing to do yet; end your turn.");
  return await until(
    `${label} the deep delegate's item ended`,
    () => Promise.resolve(itemOf(at.fleet, at.deep.id)),
    (item) => !LIVE_ITEM.has(item.state) && item.ended !== null,
    120_000
  ).catch(() => itemOf(at.fleet, at.deep.id));
};

/**
 * The delegate's item reopened and its session woken in its workspace, as a
 * handoff to it does (work-items.ts `reopen`, `rerun`; a retired one's
 * clone cut again first, `recut`). A workspace's session starts only in a
 * boundary, which only the host starts: here its item's rows are put as
 * the reopen leaves them, and its session wakes outside the workspace and
 * is its item's again once it runs. Its row once awake.
 */
const reopenItem = async (
  at: Reopening,
  label: string
): Promise<{ item: string; session: string }> => {
  const { fleet } = at;
  const item =
    fleet.query<{ id: string }>(
      "SELECT work_item_id AS id FROM instances WHERE id = ?",
      at.deep.id
    )[0]?.id ?? "";
  fleet.write(
    "UPDATE workspaces SET state = 'active' WHERE id = ?",
    at.deep.workspace
  );
  fleet.write(
    "UPDATE work_items SET state = 'running', result = NULL, error = NULL, stopped_by = NULL, ended_at = NULL WHERE id = ?",
    item
  );
  fleet.write(
    "UPDATE instances SET work_item_id = NULL WHERE id = ?",
    at.deep.id
  );
  await fleet.send(
    at.deep.id,
    "Go on: ask the person to sign in on the page you had open."
  );
  const woken = await until(
    `${label} the deep delegate's session awake again`,
    () =>
      Promise.resolve(
        fleet.instance(at.deep.id) ?? { status: "gone", turn_open_at: null }
      ),
    (row) => row.status === "running" && row.turn_open_at === null,
    120_000
  ).catch(() => fleet.instance(at.deep.id));
  fleet.write(
    "UPDATE instances SET work_item_id = ? WHERE id = ?",
    item,
    at.deep.id
  );
  return {
    item: itemOf(fleet, at.deep.id).state,
    session: woken?.status ?? "gone",
  };
};

/**
 * The delegate asks the person about the site's origin, with its process's
 * own credential: whether the ask waits on the person, and the page a Take
 * over of it brings to the front, against the one `pageOf` names.
 */
const askedAgain = async (
  at: Reopening,
  label: string,
  pageOf: () => Promise<string | undefined>
): Promise<{
  answered: string;
  expected?: string;
  front?: string;
  settled: string;
}> => {
  const { fleet } = at;
  // A call made with an earlier process's credential is refused at once,
  // and goes again.
  const asking = until(
    `${label} the delegate's browser_ask taken`,
    () =>
      callAs(
        fleet,
        at.deep.id,
        "browser_ask",
        { origin: at.site, reason: `${REASON} reopened` },
        900_000
      ),
    (said) => !said.text.includes(STALE_CREDENTIAL),
    900_000
  );
  const settled = await Promise.race([
    asking.then((said) => `answered: ${said.text.slice(0, 300)}`),
    parkedOf(fleet, at.deep.id).then((one) =>
      one ? `parked ${one.requestId}` : "neither"
    ),
  ]);
  if (!settled.startsWith("parked")) {
    return { answered: "", settled };
  }
  const expected = await pageOf();
  const before = await shieldPage(fleet, at.key);
  await fleet
    .api(
      hubRequest("POST /api/browsers/:key/takeover", {
        path: { key: at.key },
        body: {
          requestId: settled.slice("parked ".length),
          machineId: MACHINE,
        },
      })
    )
    .catch(() => undefined);
  const front = await until(
    `${label} the shield's page`,
    () => shieldPage(fleet, at.key),
    (page) => !!page && page !== before,
    60_000
  ).catch(() => undefined);
  await fleet
    .api(
      hubRequest("POST /api/browsers/:key/handback", {
        path: { key: at.key },
        body: { machineId: MACHINE },
      })
    )
    .catch(() => undefined);
  const answered = await asking.then(
    (said) => said.text,
    (error: unknown) => `failed: ${String(error)}`
  );
  return { answered: answered.slice(0, 200), expected, front, settled };
};

/** The page of the delegate's door on `url`, as its browser tool lists its own pages. */
const pageOn = async (
  at: Reopening,
  url: string
): Promise<string | undefined> => {
  const door = await doorOf(at.fleet, at.deep.workspace, at.projectId);
  try {
    const { targetInfos } = (await door.send("Target.getTargets", {})) as {
      targetInfos?: { targetId: string; url?: string }[];
    };
    return targetInfos?.find((info) => info.url === url)?.targetId;
  } finally {
    door.close();
  }
};

/**
 * (j) Its workspace held, its item ended and reopened: the delegate's page
 * is still open, and its ask is pinned to it.
 */
const legKept = async ({ check }: Kit, at: Reopening): Promise<void> => {
  const { fleet } = at;
  const door = await doorOf(fleet, at.deep.workspace, at.projectId);
  const kept = await door.open(`${at.site}/kept`);
  door.close();
  // Its clone holds work that is nowhere else, so it is not retired as its
  // item ends (db schema.ts `WorkspaceState`): its boundary stands while its
  // session sleeps.
  fleet.write(
    "UPDATE workspaces SET state = 'held' WHERE id = ?",
    at.deep.workspace
  );
  const ended = await quietEnd(at, "(j)");
  const back = await reopenItem(at, "(j)");
  const asked = await askedAgain(at, "(j)", () => Promise.resolve(kept));
  check(
    "(j) its workspace held, its item ended and reopened, the delegate two deep still has the page it had open: its browser_ask waits on the person, and Take over brings that page to the front",
    !LIVE_ITEM.has(ended.state) &&
      ended.ended !== null &&
      LIVE_ITEM.has(back.item) &&
      asked.settled.startsWith("parked") &&
      asked.front === kept &&
      asked.answered.includes(browserAskWords.handedBack(at.site)),
    JSON.stringify({ kept, ended, back, ...asked })
  );
};

/**
 * (k) Its workspace retired as its item ended, and its item reopened in it
 * again: the pages it had open again, and its ask pinned to the one it
 * drove last.
 */
const legBack = async ({ check }: Kit, at: Reopening): Promise<void> => {
  const { fleet } = at;
  const url = `${at.site}/back`;
  const door = await doorOf(fleet, at.deep.workspace, at.projectId);
  const before = await door.open(url);
  door.close();
  fleet.write(
    "UPDATE workspaces SET state = 'active' WHERE id = ?",
    at.deep.workspace
  );
  fleet.write(
    "UPDATE work_items SET state = 'running', result = NULL, error = NULL, ended_at = NULL WHERE instance_id = ?",
    at.deep.id
  );
  const ended = await quietEnd(at, "(k)");
  // Its clone holds nothing that is nowhere else: its session is put to
  // sleep and it retires, its boundary ending (agent boundary/lifecycle.ts `stopNow`)
  // and its pages closing with it.
  const retired = await until(
    "(k) the deep delegate's workspace retired",
    () => Promise.resolve(workspaceState(fleet, at.deep.workspace)),
    (state) => state === "archived",
    120_000
  ).catch(() => workspaceState(fleet, at.deep.workspace));
  const back = await reopenItem(at, "(k)");
  const asked = await askedAgain(at, "(k)", () => pageOn(at, url));
  check(
    "(k) its workspace retired as its item ended (its boundary ended, its pages closed), its item reopened in the same workspace, the delegate two deep's pages open again: its browser_ask waits on the person, and Take over brings the page it had to the front",
    !LIVE_ITEM.has(ended.state) &&
      retired === "archived" &&
      asked.settled.startsWith("parked") &&
      !!asked.expected &&
      asked.expected !== before &&
      asked.front === asked.expected &&
      asked.answered.includes(browserAskWords.handedBack(at.site)),
    JSON.stringify({
      before,
      ended,
      retired,
      back,
      ...asked,
    })
  );
};

/**
 * (l) Its item ended, the project's browser put to sleep (the idle sweep's
 * stop, as the person's Stop is), and its item reopened: the browser wakes
 * for its ask, the page it had opens again, and its ask is pinned to it.
 */
const legSlept = async ({ check }: Kit, at: Reopening): Promise<void> => {
  const { fleet } = at;
  const url = `${at.site}/slept`;
  const door = await doorOf(fleet, at.deep.workspace, at.projectId);
  const before = await door.open(url);
  door.close();
  // Its boundary stands: what goes with it here is the browser's run alone.
  fleet.write(
    "UPDATE workspaces SET state = 'held' WHERE id = ?",
    at.deep.workspace
  );
  const ended = await quietEnd(at, "(l)");
  await fleet
    .api(
      hubRequest("POST /api/browsers/:key/stop", {
        path: { key: at.key },
        body: { machineId: MACHINE },
      })
    )
    .catch(() => undefined);
  const asleep = await until(
    "(l) the project's browser asleep",
    async () =>
      (await fleet.api<ListedBrowser[]>(hubRequest("GET /api/browsers"))).find(
        (one) => one.key === at.key
      )?.state ?? "none",
    (state) => state === "asleep",
    60_000
  ).catch(() => "not asleep");
  const back = await reopenItem(at, "(l)");
  const asked = await askedAgain(at, "(l)", () => pageOn(at, url));
  check(
    "(l) its item ended, the project's browser put to sleep, and its item reopened: the delegate two deep's ask wakes the browser, the page it had opens again, its browser_ask waits on the person, and Take over brings that page to the front",
    !LIVE_ITEM.has(ended.state) &&
      asleep === "asleep" &&
      LIVE_ITEM.has(back.item) &&
      asked.settled.startsWith("parked") &&
      !!asked.expected &&
      asked.expected !== before &&
      asked.front === asked.expected &&
      asked.answered.includes(browserAskWords.handedBack(at.site)),
    JSON.stringify({ before, ended, asleep, back, ...asked })
  );
};

const run = async (kit: Kit) => {
  const { check } = kit;
  const site = servedSite("Probe sign-in");
  // A second origin: another port.
  const other = servedSite("Probe elsewhere");
  try {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent", [], { DOCKER_HOST: "unix:///nonexistent" });
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const project = await fleet.api<{ id: string }>(
      hubRequest("POST /api/projects", {
        body: {
          name: "Ask tree",
          machineId: MACHINE,
          cwd: fleet.repo,
          caw: false,
        },
      })
    );
    const key: BrowserKey = `project:${project.id}`;
    const top = await fleet.spawn("claude", "Ask top", fleet.repo, {
      projectId: project.id,
    });
    /** A delegate of `parent` titled `title`, in a workspace of its own seeded on the hub's rows. */
    const seeded = async (
      parent: string,
      title: string
    ): Promise<{ id: string; workspace: string }> => {
      const child = await fleet.spawn("claude", title, fleet.repo, {
        projectId: project.id,
      });
      const now = Date.now();
      const workspace = crypto.randomUUID();
      const item = crypto.randomUUID();
      // Its clone, a worktree of the fleet's repository on a branch of its
      // own, as a delegate's workspace is cut.
      const path = join(fleet.sandbox, `ws-${workspace.slice(0, 8)}`);
      const branch = `ws/${workspace.slice(0, 8)}`;
      await Bun.$`git -C ${fleet.repo} worktree add -q -b ${branch} ${path}`.quiet();
      fleet.write(
        "INSERT INTO workspaces (id, machine_id, repo_root, path, branch, state, created_by_instance_id, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
        workspace,
        MACHINE,
        fleet.repo,
        path,
        branch,
        parent,
        now
      );
      fleet.write(
        "INSERT INTO work_items (id, workspace_id, parent_instance_id, instance_id, brief, title, harness, state, project_id, created_at) VALUES (?, ?, ?, ?, ?, ?, 'claude', 'running', ?, ?)",
        item,
        workspace,
        parent,
        child,
        "Do your part.",
        title,
        project.id,
        now
      );
      fleet.write(
        "UPDATE instances SET parent_instance_id = ?, work_item_id = ? WHERE id = ?",
        parent,
        item,
        child
      );
      await fleet.api(
        hubRequest("PATCH /api/instances/:id", {
          path: { id: child },
          body: { title },
        })
      );
      return { id: child, workspace };
    };
    const first = await seeded(top, "Ask middle");
    const deep = await seeded(first.id, "Ask deep");

    const browser = await liveBrowser(fleet, key, MACHINE);
    check(
      `the project's browser is live on the local host (${browser?.state}, ${browser?.host})`,
      browser?.state === "live",
      JSON.stringify(browser)
    );
    if (browser?.state !== "live") {
      return;
    }

    // (a) No page open: refused, and nothing waits on the person.
    const refused = await callAs(fleet, first.id, "browser_ask", {
      origin: site.origin,
      reason: REASON,
    });
    const middleParked = (await pending(fleet)).some(
      (one) => one.instanceId === first.id
    );
    check(
      "(a) a delegate with no page open on the origin calls browser_ask: refused in the words naming what to do, and nothing waits on the person",
      refused.refused &&
        refused.text.includes(browserAskWords.noPage(site.origin)) &&
        !middleParked,
      `${refused.status} ${refused.text.slice(0, 400)}; parked for it: ${middleParked}`
    );

    // (b) Two deep, with its page open and driven, it asks.
    const door = await doorOf(fleet, deep.workspace, project.id);
    // Its first page on the site, then the sign-in it went on to in a tab of
    // its own: the one it drives and asks about.
    const home = await door.open(`${site.origin}/home`);
    const asked = await door.open(`${site.origin}/sign-in`);
    await door.open(`${other.origin}/other`);
    await door.drive(asked);
    door.close();
    const call = callAs(
      fleet,
      deep.id,
      "browser_ask",
      { origin: site.origin, reason: REASON },
      900_000
    );
    const parked = await until(
      "(b) the deep delegate's browser ask waiting on the person",
      async () =>
        (await pending(fleet)).find(
          (one) => one.instanceId === deep.id && one.payload.browserAsk
        ),
      Boolean,
      60_000
    ).catch(() => undefined);
    const elsewhereParked = (await pending(fleet)).filter(
      (one) => one.instanceId === top || one.instanceId === first.id
    ).length;
    check(
      "(b) the delegate two deep, its page open and driven, calls browser_ask: the ask waits on the person, routed to no agent, and none is parked on the sessions above it",
      !!parked &&
        parked.payload.routedTo === undefined &&
        elsewhereParked === 0,
      JSON.stringify({ parked, elsewhereParked })
    );
    if (!parked?.requestId) {
      return;
    }
    const tree = { top, middle: first.id };
    const waitsTold = await toldUp(
      fleet,
      tree,
      parked.requestId,
      delegateWaitWords.waitsLine("Ask deep")
    );

    // (c) The top session's pane draws it, named by its asker; its tab needs you.
    const base = await fleet.dashboard();
    const page = await kit.page("desk");
    await open(page, `${base}/session/${top}`, '[data-slot="pane"]');
    const card = page.locator(
      `section[data-slot="hitl"][aria-label="${askWords.browserAskFrom("Ask deep")}"]`
    );
    const drawn = await card
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(
        () => true,
        () => false
      );
    const reasonShown = drawn
      ? ((await card.locator('[data-slot="lede"]').textContent()) ?? "")
      : "";
    const needs = await page
      .locator(`[data-slot="tab"][data-needs]:has(a[href="/session/${top}"])`)
      .count();
    check(
      `(c) the top session's pane at 1440 draws the ask two deep as a card named by its asker ("${askWords.browserAskFrom("Ask deep")}"), with its reason, and its tab reads that it needs you`,
      drawn && reasonShown.includes(REASON) && needs === 1,
      JSON.stringify({
        drawn,
        reasonShown,
        needs,
        cards: await page
          .locator('section[data-slot="hitl"]')
          .evaluateAll((all) =>
            all.map((one) => one.getAttribute("aria-label"))
          ),
      })
    );

    // (d) Tabs open after the ask; Take over shows the asked page.
    const again = await doorOf(fleet, deep.workspace, project.id);
    const newer = await again.open(`${site.origin}/later`);
    again.close();
    const neighbour = await doorOf(fleet, crypto.randomUUID(), project.id).then(
      async (theirs) => {
        const id = await theirs.open(`${site.origin}/theirs`);
        theirs.close();
        return id;
      }
    );
    if (drawn) {
      await card.getByRole("button", { name: askWords.takeOver }).click();
    } else {
      await fleet.api(
        hubRequest("POST /api/browsers/:key/takeover", {
          path: { key },
          body: { requestId: parked.requestId, machineId: MACHINE },
        })
      );
    }
    const front = await until(
      "(d) the shield's page",
      () => shieldPage(fleet, key),
      Boolean,
      60_000
    ).catch(() => undefined);
    const went = await until(
      "(d) the person taken to the asking delegate's session",
      () => Promise.resolve(new URL(page.url()).pathname),
      (path) => path === `/session/${deep.id}`,
      30_000
    ).catch(() => new URL(page.url()).pathname);
    const listed = (
      await fleet.api<{ key: string; origin?: string }[]>(
        hubRequest("GET /api/browsers")
      )
    ).find((one) => one.key === key);
    check(
      "(d) with the asker's older page on the same origin, and a newer tab of its own and another session's opened there after the ask, Take over on the top session's card brings the sign-in page the agent drove and asked about to the front, its band naming the origin, and takes the person to the asking delegate's session",
      front === asked &&
        listed?.origin === site.origin &&
        went === `/session/${deep.id}`,
      JSON.stringify({
        front,
        asked,
        home,
        newer,
        neighbour,
        origin: listed?.origin,
        went,
      })
    );

    // (e) Handed back: the call answers with the origin.
    await fleet
      .api(
        hubRequest("POST /api/browsers/:key/handback", {
          path: { key },
          body: { machineId: MACHINE },
        })
      )
      .catch(() => undefined);
    const answered = await call.then(
      (said) => said.text,
      (error: unknown) => `failed: ${String(error)}`
    );
    check(
      "(e) handed back, the asker's call answers that it was handed back, on the site's origin",
      answered.includes(browserAskWords.handedBack(site.origin)),
      answered.slice(0, 400)
    );
    const tookTold = await toldUp(
      fleet,
      tree,
      parked.requestId,
      delegateWaitWords.tookOverLine("Ask deep")
    );
    const backTold = await toldUp(
      fleet,
      tree,
      parked.requestId,
      delegateWaitWords.handedBack(site.origin)
    );
    check(
      "(g) every session above the asker is told: the top and the middle session each hear once that the delegate two deep waits on the person, once that the person took over its browser, and once that it was handed back",
      [waitsTold, tookTold, backTold].every(
        (told) => told.top === 1 && told.middle === 1
      ),
      JSON.stringify({ waitsTold, tookTold, backTold })
    );

    await legNeedsYou(kit, {
      fleet,
      key,
      deep: deep.id,
      projectId: project.id,
      workspace: deep.workspace,
      top,
      base,
      page,
      asked,
      site: site.origin,
    });

    // (f) The asked page closed before Take over: refused, the gate open again.
    const third = await doorOf(fleet, deep.workspace, project.id);
    await third.drive(asked);
    callAs(
      fleet,
      deep.id,
      "browser_ask",
      { origin: site.origin, reason: `${REASON} again` },
      900_000
    ).catch(() => undefined);
    const second = await until(
      "(f) the second ask waiting on the person",
      async () =>
        (await pending(fleet)).find(
          (one) => one.instanceId === deep.id && one.payload.browserAsk
        ),
      Boolean,
      60_000
    ).catch(() => undefined);
    await third.send("Target.closeTarget", { targetId: asked });
    third.close();
    const take = await fleet
      .api<unknown>(
        hubRequest("POST /api/browsers/:key/takeover", {
          path: { key },
          body: { requestId: second?.requestId, machineId: MACHINE },
        })
      )
      .then(
        () => "taken",
        (error: unknown) =>
          error instanceof Error ? error.message : String(error)
      );
    const reopened = await doorOf(fleet, deep.workspace, project.id).then(
      (back) => {
        back.close();
        return true;
      },
      () => false
    );
    check(
      "(f) an ask whose page closed before the person took it: Take over is refused in the words saying so, and the agents' gate is open again",
      take.includes(browserAskWords.pageClosed) && reopened,
      `${take.slice(0, 400)}; gate open: ${reopened}`
    );
    if (second?.requestId) {
      await decline(fleet, deep.id, second.requestId);
    }

    await legConnect(kit, { fleet, tree, deep: deep.id, base, page });
    const reopening: Reopening = {
      fleet,
      deep,
      key,
      projectId: project.id,
      site: site.origin,
    };
    await legKept(kit, reopening);
    await legBack(kit, reopening);
    await legSlept(kit, reopening);
  } finally {
    site.stop();
    other.stop();
  }
};

const spec: Spec = {
  group: "The hub and machines",
  name: "browser-ask-tree",
  run,
};

export default spec;
