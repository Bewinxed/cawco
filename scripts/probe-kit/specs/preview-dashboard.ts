/**
 * The dashboard served as a preview draws its hub's records, the same as
 * the dashboard on its own. A leaf that opened Configure → Accounts through
 * its workspace's preview got the page's skeleton and the band saying it
 * can't reach `/ws/dashboard`: the client dialled no socket in a document
 * the preview proxy served, so no first read (accounts, machines, the
 * board) ran (dashboard client.svelte.ts `ensureConnected`).
 *
 * On a scratch fleet (real hub, agent and sessiond), the fleet's dashboard
 * (the built one, against the fleet's hub) is shown by its port as a
 * session's previews: one at Configure → Accounts, one at the board. Its
 * page's `/ws/dashboard` goes to the preview's origin, which the hub relays
 * to the agent's listener and that to the dashboard's server, whose `/ws`
 * proxy reaches the fleet's hub (vite.config.ts `CAWCO_DEV_HUB_URL`). Read
 * from the preview frames' documents and the hub's answers:
 *
 * 1. Each preview's frame holds a document the preview proxy served (the
 *    overlay's script stands in it), at 1440 and at 390.
 * 2. Configure → Accounts draws the fleet's account ("Probe") in the
 *    Claude group, at 1440 and at 390.
 * 3. The board draws the session by its title, at 1440.
 * 4. No frame raises the hub band (it can't reach the hub).
 * 5. A decision page whose card shows the Accounts preview: the card's
 *    embed draws the account, and a pick on the page reaches the hub over
 *    the page's doc socket within 15 s.
 *
 *   bun scripts/probe-kit/run.ts preview-dashboard
 */
import type { FrameLocator, Page } from "playwright-core";
import { OVERLAY_PATH } from "../../../packages/core/src/frames";
import { type Reply, until } from "../../scratch-fleet";
import { type Kit, open, type Spec, type View } from "../kit";

/** The artifact panel's frame (PreviewPane), in an artifact's own tab. */
const FRAME = 'iframe[title="Preview"]';
/** A decision card's Preview of a machine artifact (decisions host Preview.svelte). */
const EMBED = 'iframe[data-slot="embed"]';
/** The fleet's account's label (scratch-fleet.ts `fileAccount`). */
const ACCOUNT = "Probe";
/** The session the previews belong to, by the title the board draws. */
const TITLE = "Heron ledger";
/** How long a frame has to draw its records: a cold preview starts its listener first. */
const DRAWN_MS = 60_000;
/** A pick's way to the hub over the page's doc socket (the page's Send bound, 8f252e5d9). */
const PICK_MS = 15_000;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const program = (
  preview: string
) => `root = Decisions("Pick the accounts view", [view])
view = Decision("view", "Which accounts view reads right?", [keep, other], "Drawn live.", [], [], false, null, "behaviour")
keep = Option("keep", "Keep this view", "The accounts as the dashboard draws them.", true, [live], "One more look.")
other = Option("other", "Another view", "A new layout.", false, [], "Another round.")
live = Preview("${preview}", "Accounts, live")`;

/** What a dashboard document shows now: whether the proxy served it, its account rows' words, its body's words, whether the hub band stands open. */
const dashboardReads = async (doc: FrameLocator) => {
  const read = <T>(what: Promise<T>, none: T) =>
    what.catch(() => none) as Promise<T>;
  const served =
    (await read(doc.locator(`script[src^="${OVERLAY_PATH}"]`).count(), 0)) > 0;
  const groups = await read(
    doc.locator('section[data-slot="group"]').allTextContents(),
    [] as string[]
  );
  const body = await read(doc.locator("body").innerText({ timeout: 1000 }), "");
  const band = await read(
    doc.locator('[data-slot="hub-band"][data-open]').count(),
    -1
  );
  return {
    served,
    accounts: groups.map((text) => text.replace(/\s+/gu, " ").trim()),
    titled: body.includes(TITLE),
    band,
  };
};

type Reads = Awaited<ReturnType<typeof dashboardReads>>;

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
  const base = await fleet.dashboard();
  const port = Number(new URL(base).port);
  const session = await fleet.spawn("claude", TITLE, fleet.repo);

  const at = `/api/instances/${session}/artifacts`;
  const accounts = await fleet.api<{ id: string }>(at, {
    kind: "preview",
    does: "try",
    ask: "Try the accounts list",
    name: "accounts",
    port,
    path: "/config/accounts",
  });
  const board = await fleet.api<{ id: string }>(at, {
    kind: "preview",
    does: "try",
    ask: "Try the board",
    name: "board",
    port,
    path: "/",
  });

  /** `id`'s own tab on `page`, its frame's document read once `done` holds, else as it stands. */
  const tabReads = async (
    page: Page,
    id: string,
    done: (now: Reads) => boolean
  ) => {
    await open(page, `${base}/artifact/${id}`, FRAME);
    const doc = page.frameLocator(FRAME).first();
    return until(
      "the preview's records",
      () => dashboardReads(doc),
      done,
      DRAWN_MS
    ).catch(() => dashboardReads(doc));
  };
  const hasAccount = (now: Reads) =>
    now.accounts.some((group) => group.includes(ACCOUNT));

  const views: View[] = ["desk", "phone"];
  for (const view of views) {
    const page = await kit.page(view);
    const now = await tabReads(page, accounts.id, hasAccount);
    kit.check(
      `${view}: 1, 2, 4: Configure → Accounts served as a preview draws the fleet's account "${ACCOUNT}", and no hub band`,
      now.served && hasAccount(now) && now.band === 0,
      JSON.stringify(now)
    );
    await page.context().close();
  }

  const deskBoard = await kit.page("desk");
  const boardNow = await tabReads(deskBoard, board.id, (now) => now.titled);
  kit.check(
    `desk: 1, 3, 4: the board served as a preview draws the session "${TITLE}", and no hub band`,
    boardNow.served && boardNow.titled && boardNow.band === 0,
    JSON.stringify(boardNow)
  );
  await deskBoard.context().close();

  // 5. A decision page whose card shows the Accounts preview.
  const decision = await fleet.api<{ id: string }>(at, {
    kind: "page",
    does: "pick",
    ask: "Pick the accounts view",
    name: "accounts-view",
    program: program(accounts.id),
  });
  const pageTab = await kit.page("desk");
  await open(pageTab, `${base}/artifact/${decision.id}`, FRAME);
  const card = pageTab.frameLocator(FRAME).first();
  const embed = card.frameLocator(EMBED).first();
  const embedNow = await until(
    "the card's embed records",
    () => dashboardReads(embed),
    hasAccount,
    DRAWN_MS
  ).catch(() => dashboardReads(embed));
  await card.locator('[data-option="keep"]').first().click();
  const picked = async () => {
    const read = await fleet.api<{
      state?: Record<string, { options?: string[] }>;
    }>(`${at}/${decision.id}`);
    return read.state?.view?.options ?? [];
  };
  const pickedAt = Date.now();
  const options = await until(
    "the pick on the hub",
    picked,
    (now) => now.includes("keep"),
    PICK_MS
  ).catch(() => picked());
  kit.check(
    "desk: 5: the decision card's embed of Accounts draws the account with no hub band, and the page's pick reaches the hub within 15 s",
    embedNow.served &&
      hasAccount(embedNow) &&
      embedNow.band === 0 &&
      options.includes("keep"),
    JSON.stringify({
      embedNow,
      options,
      pickMs: Date.now() - pickedAt,
    })
  );
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "preview-dashboard",
  run,
};
export default spec;
