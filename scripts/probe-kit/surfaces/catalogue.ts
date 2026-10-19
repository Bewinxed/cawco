/**
 * The surfaces the style snapshot and the surfaces pixel spec read, named as
 * the Tailwind cutover's lanes name them (one lane's `--surfaces=`), each a
 * route and the states it opens.
 *
 * Every root and every action finds its element by what a restyle keeps:
 * a tag, a role, an accessible name, a `data-*` attribute, a kit recipe
 * class (`.kit-pop`, `.kit-hang`, which stay classes). Never by a
 * component's own class: the lanes delete those.
 *
 * A route opens on the built dashboard against the hub tape ("built"), or,
 * for a `/motion/` bench (a built dashboard 404s them), on the dev server
 * against the same tape ("dev").
 */
import type { Locator, Page, WebSocketRoute } from "playwright-core";
import { COMPOSER_FIELD } from "../kit";
import {
  DELEGATE_TITLE,
  type Scene,
  STUDIO_HOST,
  STUDIO_MACHINE,
  type Variant,
} from "./scene";

export type Width = "desk" | "tablet" | "phone";

export interface State {
  /** What opens it, on its route freshly loaded (the walk loads each state's route anew), with the scene's ids. */
  act?: (page: Page, scene: Scene) => Promise<unknown>;
  /**
   * It reads the frame its act leaves, which the page's next frame and
   * timer take down (catch-up/switch: "Catching up…" until Transcript's
   * `hold` runs): the walk reads it with no page time run after the act
   * (walk.ts `actAtRest`). The act pauses the walk's clock itself.
   */
  heldFrame?: true;
  /**
   * It stands on the scene's delegate, which only a host records (a
   * workspace has no user namespaces): read only from a tape whose scene
   * holds one (`split`), and left out, with a NOTE, from any other.
   */
  hostOnly?: true;
  /**
   * The hub state it reads, when not the scene's own: one the scene moves
   * the fleet into after the main recording (scene.ts `VARIANTS`), recorded
   * and played on its own (hub-tape.ts `variants`).
   */
  hub?: Variant;
  /**
   * What the walk's own setting writes into the page, not the dashboard: a
   * capture paints it over (Playwright's `mask`), so the picture holds what
   * the dashboard draws alone. Its styles are still read (style-snapshot).
   */
  mask?: (page: Page) => Locator[];
  name: string;
  /**
   * What is read: a selector, the largest visible match when several match
   * (the open layer over its own trigger). `body` reads the whole page.
   */
  root: string;
  /** A route of its own, opened fresh for this state (the scene's ids filled in). */
  route?: (scene: Scene) => string;
  /** The widths it exists at; every width when left out. */
  widths?: Width[];
}

export interface Surface {
  name: string;
  /** The surface's own route; each state that names none runs on it, in order. */
  route: (scene: Scene) => string;
  serve: "built" | "dev";
  /** Read first: the route as it opens. */
  states: State[];
  /**
   * The tape it reads, when not the scene's: `sheet`, a delegate's sheet
   * (walk.ts `SHEET_TAPE`). Only a host records it (a sheet's stage runs in
   * its workspace's boundary, which needs user namespaces), and on its own
   * (`--record --tape=sheet`), so a failed one is recorded again alone; a
   * run with no such tape leaves the surface out with a NOTE.
   */
  tape?: "sheet";
}

/** An open layer: a dialog, sheet, drawer, menu or popover standing open. */
export const LAYER =
  "[role=dialog][data-state=open], [role=menu][data-state=open], [data-slot$='-content'][data-state=open], .kit-pop[data-state=open], .kit-hang[data-state=open]";

/** Presses the first visible button named `name`. */
const press = (name: string | RegExp) => (page: Page) =>
  page.getByRole("button", { name }).filter({ visible: true }).first().click();

/**
 * A pane head's control by its key (SideSurface `data-head-item`), where the
 * head stands it: pressed in the head when it has room, chosen from More when
 * the head's fit put it there (SideSurface `stands`: by priority, the
 * narrowest form first, whatever has no room in More). `entry` is its name in
 * More. The head stands every control until its first fit, which its
 * ResizeObserver runs in the frames after it is drawn: the control is looked
 * for once the head is there and two frames have passed.
 */
const headControl =
  (key: string, entry: string | RegExp) => async (page: Page) => {
    const item = page.locator(`[data-head-item="${key}"]:not([hidden])`);
    const more = page.locator('[data-slot="more"]').filter({ visible: true });
    await page.locator(`[data-head-item="${key}"]`).first().waitFor({
      state: "attached",
    });
    await page.evaluate(() => window.__ssReader?.frames(2));
    if (await item.count()) {
      await item.getByRole("button").first().click();
      return;
    }
    await more.first().click();
    await page
      .locator('[role="menuitem"], [role="menuitemcheckbox"]')
      .filter({ hasText: entry, visible: true })
      .first()
      .click();
  };

/** Picks the board's first card, then presses the bulk bar's button named `name`. */
const pickThen = (name: RegExp) => async (page: Page) => {
  await page
    .getByRole("checkbox", { name: PICK_TASK })
    .filter({ visible: true })
    .first()
    .click();
  await press(name)(page);
};

/**
 * The composer focused and empty. A pass reads a surface's states on one
 * page, and the draft an earlier state typed stays the session's (it is
 * kept across loads): `@` after it opens no mention, Up in it recalls
 * nothing.
 */
const emptyComposer = async (page: Page) => {
  await page.locator(COMPOSER_FIELD).first().click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
};

/** The phone and tablet's rail: the sheet the navigation button opens. */
const openRail = async (page: Page) => {
  const burger = page.getByRole("button", { name: "Open navigation" });
  if (await burger.isVisible()) {
    await burger.click();
  }
};

const MAIN = "main";
/** The scene's finished session's row in the rail. */
const IDLE_ROW = /Idle: Fix tray chip overflow/;
/** The chips session's tool rows, in the transcript's order: one of each tool's card. */
const TOOL_ROWS = [
  /Todo write/,
  /List the repository/,
  /Read README/,
  /Wrote chip\.css/,
  /Searched/,
];
/** The rail's sort menu. */
const SORT = /Sort sessions/;
/** The phone rail's way into Jump. */
const JUMP_BUTTON = /Jump|Search/;
/** The skills page's way in for a skill from a source. */
const FETCH_SKILL = /Fetch|Add skill|New skill/;
/** The memory page's new-memory control. */
const NEW_MEMORY = /New memory|New/;
/** Caw's seat on the project page. */
const CAW_SEAT = /Caw, lead of/;
/** A board card's pick box. */
const PICK_TASK = /Pick tsk-1/;
/** The bulk bar's two popover triggers, once a card is picked. */
const BULK_DROP = /^Drop$/;
const BULK_LABEL = /^Label$/;
/** The project head's More menu, and its stages picker. */
const PROJECT_MORE = /More for cawco/;
const PICK_STAGES = /Pick stages/;
/** The stages picker's Outreach set (StagesControl `NAMES.outreach`, then its chain). */
const OUTREACH_STAGES = /^Outreach/;
/** A column's way to a new task (NewTaskForm, closed). */
const ADD_TASK = /^Add task$/;
/** The board's Archived rail, folded. */
const ARCHIVED_RAIL = /^Archived, /;
/** A task sheet's Details tab, beside Review. */
const DETAILS_TAB = /^Details$/;
/** The chips transcript's Write row, and its change's open control. */
const WROTE_ROW = /Wrote chip\.css/;
const OPEN_DIFF = /diff|Open|Expand/i;
/** A workflow's run control. */
const RUN_WORKFLOW = /^Run|Launch/;
/** The delegate's card in its parent's transcript: its fold, named for the delegate first. */
const DELEGATE_CARD = new RegExp(`^${DELEGATE_TITLE}`);
/** The spawn sheet's chips, each its popover's trigger (NsPopover's `label`). */
const LOCATION_CHIP = /^Location: /;
const EFFORT_CHIP = /^Effort: /;
const PERMISSION_CHIP = /^Permission mode: /;
const ACCOUNT_CHIP = /^Account: /;
/** The artifact's page in its session's pane. */
const PREVIEW_FRAME = 'iframe[title="Preview"]';
/** A sheet's page: each story in a frame of its own (stage-host/host.ts `frameOf`). */
const SHEET_STORY = "[data-cawco-story]";
/** The pane's Inspect, a sheet's alone, and a prop's row in the inspector it opens (SheetInspector's). */
const INSPECT = "Inspect";
const INSPECTOR_ROW = "aside[aria-label=Inspector] li[data-prop]";
/** The machines popover's trigger, Connect a machine's, and the routing's Fill first card. */
const MACHINES = /machine/;
const ADD_MACHINE = /^Add machine$/;
const FILL_FIRST = /^Fill first/;
/** The project's ⋯ menu. */
const MORE_FOR_CAWCO = /More for cawco/;
/**
 * An ask's Peek on its needs card (NeedsCard's). A session row's own is
 * nowhere in this scene: the page's Home is the phone's (SessionSurface
 * `homePage`), where Peek is off, and a wide rail lists its sessions in the
 * tree, whose rows have none (Sidebar `peek={false}`).
 */
const ASK_PEEK = "[data-needs-card-peek]";
/** The note pasted beside your words in Caw's thread: its DocThumb's open. */
const THREAD_NOTE = "Open phone-notes.txt";

/** The adopted skill's row menu (RowMenu's "More for tray-check"). */
const MORE_FOR_SKILL = /^More for tray-check$/;
/** The fleet memory's row menu (RowMenu's "More for ~/.claude/CLAUDE.md"). */
const MORE_FOR_MEMORY = /^More for .*CLAUDE\.md$/;
/** What runs in a project, which its forget reads first (client.svelte.ts `projectRunning`). */
const PROJECT_RUNNING = "**/api/projects/*/running";
/** {@link PROJECT_RUNNING}'s path. */
const PROJECT_RUNNING_PATH = /^\/api\/projects\/[^/]+\/running$/;
/** An artifact's read, which a task's presented page finds its session by (ArtifactStage `findArtifact`). */
const ARTIFACT_READ = "**/api/artifacts/*";
/** {@link ARTIFACT_READ}'s path. */
const ARTIFACT_READ_PATH = /^\/api\/artifacts\/[^/]+$/;

/**
 * What each page's acts hold back themselves (a route they never answer), by
 * the request's URL: the walk's wait on the tape counts these answered
 * (walk.ts `quiet`), as it does the tape's own holds. Unknown to it, each
 * held a state for the 15 s `quiet` gives a page before reading it.
 */
export const actHolds = new WeakMap<Page, ((url: URL) => boolean)[]>();

/** `pattern`'s requests on `page` never answered, and the walk told so (`actHolds`). */
const neverAnswered = async (
  page: Page,
  pattern: string,
  path: RegExp
): Promise<void> => {
  actHolds.set(page, [
    ...(actHolds.get(page) ?? []),
    (url) => path.test(url.pathname),
  ]);
  await page.route(pattern, () => undefined);
};
/** The decision page the cawco project's session made (its artifact's name). */
const CHIP_DECISION = "chip-decision";
/** A pairing's start (hub-auth.svelte.ts `startPairing`), not its polls. */
const PAIR_START = "**/api/pair";
/** The dashboard's one socket, on the dashboard's own origin. */
const DASHBOARD_SOCKET = /\/ws\/dashboard/;

/**
 * The route loaded again with `hold` routed first: what it holds the hub
 * never answers (the page stands as it does while the hub has not answered
 * yet), or what it refuses never reaches the hub (as when the hub can't be
 * reached just then). The route stays the page's, so such a state comes
 * last in its surface.
 */
const reloadedWith =
  (hold: (page: Page) => Promise<unknown>) => async (page: Page) => {
    await hold(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.kitHydrated === true);
  };

/** Jump: the phone's and tablet's from the rail, the desk's on ⌘K. */
const openJump = async (page: Page) => {
  if (await page.getByRole("button", { name: "Open navigation" }).isVisible()) {
    await openRail(page);
    await press(JUMP_BUTTON)(page);
    return;
  }
  await page.keyboard.press("Control+k");
};

/** The graph workflow's step and branch, by their titles (scene.ts GRAPH). */
const GRAPH_STEP = "Audit the chip row";
const GRAPH_BRANCH = "Overflows?";
/** The memory read's and the skill's tool rows. */
const MEMORY_ROW = /fleet memory/i;
const SKILL_ROW = /tray-check/;
/** The composer's file input (AttachButton's). */
const HIDDEN_FILE = "input[type=file][data-slot=hidden-file]";

/** A graph workflow's node picked on its canvas, by its title. */
const pickNode = (title: string) => (page: Page) =>
  page.getByText(title, { exact: true }).first().click();

/** How much later the rail's older state reads the fleet: past a project's day (older.ts `PROJECT_WINDOW`). */
const LATER = 2 * 24 * 60 * 60 * 1000;
/** A finished thinking row's header (Thinking's), and the plan's ring (PlanRing's "Plan, 1 of 3 done"). */
const REASONING = /^Reasoning/;
const PLAN_RING = /^Plan, /;
/** An API-key provider the scratch machine's OpenCode runs (the providers list's). */
const KEY_PROVIDER = "302.AI";
/** An account's Sign in on a machine (AccountMachines' "Sign in <account> on <machine>"). */
const SIGN_IN_ON = /^Sign in .+ on /;
/**
 * A new account's setup, its API-key provider chosen: choosing one goes on
 * to signing in by itself (AccountSetup `choose`), its key's field there.
 */
const toKeyStep = async (page: Page) => {
  // A search field (role searchbox), found by the words in it.
  await page.getByPlaceholder("Search providers").fill(KEY_PROVIDER);
  await page
    .locator("[data-choice]")
    .filter({ hasText: KEY_PROVIDER })
    .first()
    .click();
  await page.getByRole("textbox", { name: "API key" }).waitFor();
};

/** The keychain dialog's password field and its Unlock (UnlockKeychain's). */
const KEYCHAIN_PASSWORD = /^Login password for /;
const UNLOCK = /^Unlock$/;
/** The machine control a keychain's unlock sends (UnlockKeychain `machineControl(…, "unlockKeychain")`). */
const UNLOCK_CONTROL = (frame: string) => frame.includes('"unlockKeychain"');

/** The offline Mac's menu in the machines list, then its Unlock keychain…: the dialog. */
const openKeychain = async (page: Page) => {
  await press(MACHINES)(page);
  await page
    .locator(LAYER)
    .getByText(STUDIO_HOST, { exact: true })
    .first()
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Unlock keychain…" }).click();
};

/** What a Mac answers its keychain's unlock with (core `AuthState`). */
type UnlockAnswer =
  "authenticated" | "unauthenticated" | "unreadable-credentials";

/** The page's machine list (client.svelte.ts `load<Machine[]>("/api/agents")`), read on connect. */
const AGENTS_READ = "**/api/agents";

/**
 * `rows` with the scene's Mac, `studio`, online, its locked keychain as it
 * is. The scene holds no Mac online (a workspace runs none), and its Unlock
 * goes only to a Mac that is (client `askMachine`), the case the unlock is
 * for: a Mac running, stuck behind its keychain. Offline, the page refuses
 * the unlock itself ("studio isn't connected") and what it shows while the
 * Mac works and once it answers (MachineAuthStatus) never stands.
 */
const studioOnline = (rows: unknown): unknown =>
  Array.isArray(rows)
    ? rows.map((row: { machineId?: unknown } | null) =>
        row?.machineId === STUDIO_MACHINE ? { ...row, status: "online" } : row
      )
    : rows;

/** A hub message with the studio online in what it carries of the machines: a board's `agents`, or a frame's patch of them. */
const withStudioOnline = (message: {
  payload?: { agents?: unknown };
}): unknown =>
  message.payload?.agents
    ? {
        ...message,
        payload: {
          ...message.payload,
          agents: studioOnline(message.payload.agents),
        },
      }
    : message;

/** Each page's answer to the studio's unlock: none, the Mac yet to answer. */
const studioAnswers = new WeakMap<Page, UnlockAnswer | undefined>();

/**
 * The page's machines with the studio online (`studioOnline`), in its read
 * on connect and in every hub message, and its unlock never reaching the
 * hub: answered here as the page's state says (`studioAnswers`), as the hub
 * relays a machine's `control_result`, or not at all. A message the hub
 * sends in parts (core wire.ts) is put together and sent on whole. Routed
 * once a page; the route stays the page's, so these states come last in
 * their surface.
 */
const studioRouted = async (page: Page): Promise<void> => {
  if (studioAnswers.has(page)) {
    return;
  }
  studioAnswers.set(page, undefined);
  await page.route(AGENTS_READ, async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: studioOnline(await response.json()),
    });
  });
  await page.routeWebSocket(DASHBOARD_SOCKET, (ws) => {
    const hub = ws.connectToServer();
    const parts = new Map<string, string>();
    hub.onMessage((frame) => {
      if (typeof frame !== "string") {
        ws.send(frame);
        return;
      }
      const message = JSON.parse(frame) as {
        part?: { id: string; last: boolean };
        payload?: { agents?: unknown };
        text?: string;
      };
      if (!message.part) {
        ws.send(JSON.stringify(withStudioOnline(message)));
        return;
      }
      const text = (parts.get(message.part.id) ?? "") + (message.text ?? "");
      if (!message.part.last) {
        parts.set(message.part.id, text);
        return;
      }
      parts.delete(message.part.id);
      ws.send(JSON.stringify(withStudioOnline(JSON.parse(text))));
    });
    ws.onMessage((frame) => {
      if (!(typeof frame === "string" && UNLOCK_CONTROL(frame))) {
        hub.send(frame);
        return;
      }
      const answer = studioAnswers.get(page);
      if (!answer) {
        return;
      }
      const { requestId } = JSON.parse(frame) as { requestId: string };
      ws.send(
        JSON.stringify({
          verb: "frames",
          machineId: STUDIO_MACHINE,
          requestId,
          payload: {
            kind: "control_result",
            ok: true,
            requestId,
            result: answer,
          },
        })
      );
    });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.kitHydrated === true);
};

/** The studio's keychain unlocked from its menu, its password sent, and `answer` the Mac's (`studioRouted`). */
const unlockStudio = (answer?: UnlockAnswer) => async (page: Page) => {
  await studioRouted(page);
  studioAnswers.set(page, answer);
  await openKeychain(page);
  await page.getByPlaceholder(KEYCHAIN_PASSWORD).fill("probe-password");
  await press(UNLOCK)(page);
};

/**
 * A transcript's row pressed, scrolled to as a person scrolls to it: the
 * transcript draws only the rows near its view (its virtualiser), so a row
 * far above the newest is mounted once the transcript is wheeled up to it.
 */
const pressInTranscript = async (page: Page, name: RegExp) => {
  const box = await page.locator(MAIN).first().boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  }
  for (let turn = 0; turn < TRANSCRIPT_WHEELS; turn += 1) {
    const row = page.getByRole("button", { name }).filter({ visible: true });
    // biome-ignore lint/performance/noAwaitInLoops: one look per wheel
    if ((await row.count()) > 0) {
      await row.first().click();
      return;
    }
    await page.mouse.wheel(0, -TRANSCRIPT_WHEEL_PX);
    await page.waitForTimeout(120);
  }
  throw new Error(`no transcript row named ${name} after scrolling up`);
};
/** How far, and how many times, a transcript is wheeled up looking for a row. */
const TRANSCRIPT_WHEEL_PX = 600;
const TRANSCRIPT_WHEELS = 20;

/** A Jump result's peek in place (Finder's peek slot). */
const FIND_PEEK = "[data-slot=peek-slot]";
/** A session's transcript read (client.svelte.ts `readNewestPage`, its catch-up included). */
const TRANSCRIPT_READ = "**/api/instances/*/transcript*";
/** The spawn sheet's project and machines chips, and its Start once a move is due. */
const PROJECT_CHIP = /^Project: /;
const MACHINES_CHIP = /^Machines: /;
const CAWCO_PROJECT = /^cawco\b/;
const MOVE_AND_START = /^Move & start$/;
/** A row in the Machines chip's popover (MachinesChip's), and a machine's, not its Add. */
const MACHINE_ROW_ANY = "button[data-slot=row]";
const MACHINE_ROW = `${MACHINE_ROW_ANY}:not([data-add])`;

/**
 * In the spawn sheet: the cawco project, on the one online machine that is
 * not the one chosen (the scene's second online machine, which has no
 * checkout of it). The machines carry this host's one hostname, so the row
 * is told by its place: the chosen one unpressed, the other pressed.
 */
const toOtherMachine = async (page: Page) => {
  await press(PROJECT_CHIP)(page);
  await page.getByRole("button", { name: CAWCO_PROJECT }).first().click();
  await press(MACHINES_CHIP)(page);
  // The machines' rows: the siblings of its "Connect a machine…" row (the
  // popover is a presentation layer LAYER does not name, and the project's,
  // still open, lists its rows the same way).
  const rows = page
    .locator(`${MACHINE_ROW_ANY}[data-add]`)
    .filter({ visible: true })
    .first()
    .locator("..")
    .locator(MACHINE_ROW);
  const pressed = await rows.evaluateAll((all) =>
    all.map((row) => ({
      on: row.getAttribute("aria-pressed") === "true",
      online: !(row as HTMLButtonElement).disabled,
    }))
  );
  const current = pressed.findIndex((row) => row.on);
  const other = pressed.findIndex((row, i) => i !== current && row.online);
  if (current === -1 || other === -1) {
    throw new Error(
      `no second online machine to start on (${JSON.stringify(pressed)})`
    );
  }
  await rows.nth(other).click();
  await rows.nth(current).click();
  await page.keyboard.press("Escape");
};

/**
 * Caw's seat, when his panel stands open. A project page opens on him as
 * the person last left him there, else while its board is empty
 * (caw-lead.svelte.ts `arrive`, kept in local storage): a state after the
 * one that opened him, or a project with nothing on its board, finds him
 * open, and a press on his seat would put him away.
 */
const CAW_SEAT_OPEN = '[data-slot="caw-seat"][aria-expanded="true"]';

/** Caw's panel open: his seat pressed, unless he stands open already. */
const openCaw = async (page: Page) => {
  if ((await page.locator(CAW_SEAT_OPEN).count()) === 0) {
    await press(CAW_SEAT)(page);
  }
  await page.locator(CAW_SEAT_OPEN).first().waitFor({ state: "attached" });
};

/**
 * Caw's panel put away where it stands over the page: on a phone it is a
 * bottom sheet (CawFloat's drawer) that takes every press, and Escape puts
 * it away. Beside the page (docked) it covers nothing, and stays.
 */
const cawSheetAway = async (page: Page) => {
  // The sheet is a dialog named by its title, "Caw, lead of <project>".
  const sheet = page.getByRole("dialog", { name: CAW_SEAT });
  if ((await sheet.count()) > 0) {
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "detached" });
  }
};

/** The project's ⋯ menu, then its row named `item`. */
const fromMore = (item: string) => async (page: Page) => {
  await cawSheetAway(page);
  await press(MORE_FOR_CAWCO)(page);
  await page.getByRole("menuitem", { name: item }).click();
};

/** Caw's panel on the project page, then `then` in his thread. */
const inCawThread =
  (then: (page: Page) => Promise<unknown>) => async (page: Page) => {
    await openCaw(page);
    await then(page);
  };

/**
 * The page in the preview asking for a place, as its bridge asks
 * (`cawco/pick-place`, preview/wire.ts `previewPickPlace`): the pane's
 * place picker opens over it.
 */
const askPlace = async (page: Page) => {
  const frame = page.frameLocator(PREVIEW_FRAME);
  await frame.locator("h1").waitFor();
  await frame
    .locator("body")
    .evaluate(() =>
      window.parent.postMessage(
        { jsonrpc: "2.0", method: "cawco/pick-place", id: 1 },
        "*"
      )
    );
};

/**
 * A pin on the preview, as a person drops one: C turns the pane's Comment
 * mode on, and once the page has heard it (its overlay's layer in comment
 * mode, comments.ts `pageInComment`), a tap on the heading writes pin 1 in
 * the page's doc, which the pane's doc hears, and its card opens.
 */
const dropPin = async (page: Page) => {
  await page
    .locator("button[aria-keyshortcuts='C']")
    .filter({ visible: true })
    .first()
    .focus();
  await page.keyboard.press("c");
  const frame = page.frameLocator(PREVIEW_FRAME);
  await frame
    .locator("cawco-overlay .layer.comment")
    .waitFor({ state: "attached" });
  const box = await frame.locator("h1").boundingBox();
  if (!box) {
    throw new Error("the preview's heading has no box");
  }
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2);
};

/**
 * A sheet's inspector open: once its page has drawn a story (and said its
 * stories and props to the pane, `cawco:sheet`), Inspect pressed, and the
 * chosen story's props standing as controls, a row each.
 */
const inspectSheet = async (page: Page) => {
  await page.frameLocator(PREVIEW_FRAME).locator(SHEET_STORY).first().waitFor();
  await headControl("inspect", INSPECT)(page);
  await page.locator(INSPECTOR_ROW).first().waitFor();
};

/** The spawn sheet opened, then each step in turn: every state of the sheet starts from a fresh page. */
const inSheet =
  (...steps: ((page: Page) => Promise<unknown>)[]) =>
  async (page: Page) => {
    await press("Start session")(page);
    for (const step of steps) {
      // biome-ignore lint/performance/noAwaitInLoops: one step of the sheet at a time
      await step(page);
    }
  };

/** The spawn sheet's location popover, then its folder browser walked to `~/code/chip-tray` (the scene's). */
const browseTo = async (page: Page) => {
  await press("Browse")(page);
  for (const folder of ["code", "chip-tray"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one folder deeper at a time
    await page
      .getByRole("button", { name: folder, exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: folder, exact: true })
      .and(page.locator("[aria-current=location]"))
      .waitFor();
  }
};
/**
 * A pane whose tabs name one conversation twice, as a layout this browser
 * kept (workspace.svelte.ts reads `cawco-workspace` as the page loads, and
 * keeps any tree that parses): the tabs' keyed list throws as it is first
 * built, the tabs' boundary holds it, and the strip stands as its failure
 * line (RegionBoundary) while the page works on. Built, not updated: a
 * doubled answer that lands after the page is up (the hub's projects, tried
 * first) throws past every boundary and takes the page with it. (The DEBUG
 * fault the composer's `/` menu was failed by went with main's f5e496c1d.)
 */
const tabsFail = async (page: Page, scene: Scene) => {
  const tab = scene.chips;
  // Two panes, one over the other: the desk's bar hosts the top row's tabs
  // outside every boundary (Shell `barLeaves`), so the doubled strip is the
  // lower pane's, drawn in its pane, and the focused one, so a phone shows it.
  const top = {
    t: "l",
    id: "probe-top",
    tabs: [scene.permission],
    active: scene.permission,
  };
  const doubled = {
    t: "l",
    id: "probe-doubled",
    tabs: [tab, tab],
    active: tab,
  };
  const root = {
    t: "b",
    id: "probe-split",
    dir: "v",
    sizes: [50, 50],
    kids: [top, doubled],
  };
  await reloadedWith((p) =>
    p.evaluate(
      (kept) => localStorage.setItem("cawco-workspace", JSON.stringify(kept)),
      { v: 1, root, focusedLeaf: doubled.id, ctx: {} }
    )
  )(page);
  await page
    .locator("[data-region-failed]")
    .first()
    .waitFor({ state: "attached" });
};

/** What the transcript says while it catches up (CatchUp's words). */
const CATCHING_UP = "Catching up";

/** The deploy push's permission on its needs card (NeedsCard's Approve). */
const APPROVE_PUSH = /^Approve .+ on Approve the deploy push$/;

/** How long the push's session takes to answer its approval: its tool run and its reply. */
const ANSWER_MS = 3000;
/**
 * How long a suggestion chip may take: the composer's pause after the last
 * keystroke (suggest.svelte.ts SUGGEST_PAUSE_MS, 1.5s) and the hub's own
 * wait on Jev (hub suggest.ts SUGGEST_TIMEOUT_MS, 10s), with room for the
 * answer to draw. A page's default 10s is shorter than the product's own.
 */
const SUGGESTED_MS = 15_000;

/**
 * A tab switched to whose session moved on behind the tab shown: the
 * switch paints the rows it kept, and "Catching up…" stands over them
 * until the catch-up appends, a frame and a timer later (Transcript.svelte
 * `hold`: requestAnimationFrame, then setTimeout 0).
 *
 * The deploy push's session (the route) is put behind the chips session's
 * tab and built there, and the needs panel opened on its permission, the
 * page's time running as any act's does: the panel opens a frame and a task
 * after the press (NeedsCaw `choose`). Then the walk's clock is paused
 * where it stands: Playwright's clock "overrides native global classes and
 * functions related to time", setInterval and requestAnimationFrame among
 * them (https://playwright.dev/docs/clock), so the rebuild scheduler's turn
 * (scheduler.svelte.ts CADENCE, 250ms) cannot come round and the hidden
 * pane builds nothing more. The permission is approved (the answer goes out
 * on the socket in the press's own task): the hub answers with its turn
 * (recorded on the `written` hub), which its rows have not built. Its tab is activated
 * in the page (`click()`, as Enter activates it), the pointer off the page:
 * a tab under the pointer builds its pane (PaneTabs `onpointerenter`). The
 * catch-up's release waits on a frame and a timer the paused clock does not
 * run, so the state reads that frame (`heldFrame`).
 */
const caughtUp = async (page: Page, scene: Scene) => {
  const behind = scene.permission;
  await page.mouse.move(-1, -1);
  await page.goto(new URL(`/session/${scene.chips}`, page.url()).href, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => window.kitHydrated === true);
  // Built behind the shown tab (PaneLeaf mounts the others once the strip
  // is left alone, SessionPane builds a hidden one on its turn), and a turn
  // or two after it.
  await page
    .locator(`[data-pane="${behind}"] [role=log]`)
    .waitFor({ state: "attached" });
  await page.waitForTimeout(1500);
  await page.click("[data-needs-caw]");
  const approve = page
    .getByRole("button", { name: APPROVE_PUSH })
    .filter({ visible: true })
    .first();
  // Every check a press makes (visible, still, enabled, the one the pointer
  // hits), with nothing pressed: the panel open as far as it opens.
  await approve.click({ trial: true });
  // Paused at Date's own (pinned) moment: no page time moves from here.
  await page.clock.pauseAt(await page.evaluate(() => Date.now()));
  await approve.click();
  await page.waitForTimeout(ANSWER_MS);
  await page.keyboard.press("Escape");
  await page.mouse.move(-1, -1);
  await page.evaluate((id) => {
    document
      .querySelector<HTMLElement>(`[data-session-tab="${CSS.escape(id)}"]`)
      ?.click();
  }, behind);
  await page.getByText(CATCHING_UP).first().waitFor();
};

/** A socket's address as the page prints it (HubBand's `<code>`). */
const SOCKET_URL = /^wss?:\/\//;
const BENCHES: [string, string][] = [
  ["button-pending", "/motion/button-pending"],
  ["caw", "/motion/caw"],
  ["caw-notices", "/motion/caw-notices?fixture=full"],
  ["chosen-hover", "/motion/chosen-hover"],
  ["delegate-tray", "/motion/delegate-tray"],
  ["echo", "/motion/echo"],
  ["folder-proof", "/motion/folder-proof?at=1&work=working"],
  ["head-tint", "/motion/head-tint"],
  ["lift", "/motion/lift"],
  ["mac-readiness", "/motion/mac-readiness"],
  ["new-session", "/motion/new-session"],
  ["overlays", "/motion/overlays"],
  ["recall", "/motion/recall"],
  ["seed-tabs", "/motion/seed-tabs"],
  ["session-limit", "/motion/session-limit"],
  ["traffic", "/motion/traffic"],
  ["updates", "/motion/updates"],
  ["usage-limits", "/motion/usage-limits"],
  ["usage-relay", "/motion/usage-relay"],
  ["finder", "/dev/finder"],
];
const CONFIG = [
  "accounts",
  "cli-tools",
  "connections",
  "delegate-types",
  "devices",
  "hooks",
  "mcp",
  "memory",
  "models",
  "phone",
  "previews",
  "rules",
  "skills",
  "spend",
  "subagents",
  "updates",
];

/** A config section's editors: each opens on `new` (its route's own word for a new one), and an account's own pages. */
const EDITORS: Record<string, State[]> = {
  ...Object.fromEntries(
    ["hooks", "mcp", "subagents", "delegate-types"].map((section) => [
      section,
      [
        {
          name: "editor",
          route: () => `/config/${section}/new`,
          root: "body",
        },
        // The scene's own: the hook saved twice (its previous version), the MCP server.
        ...(section === "hooks"
          ? [
              {
                name: "hook",
                route: (s: Scene) => `/config/hooks/${s.hook}`,
                root: "body",
              },
            ]
          : []),
        // A sign-in's return to the dashboard with a code the hub never
        // asked for: its refusal, on the page the provider sends you back to.
        ...(section === "mcp"
          ? [
              {
                name: "oauth-return",
                route: () => "/oauth/mcp?code=probe-code&state=probe-state",
                root: "body",
              },
            ]
          : []),
      ],
    ])
  ),
  skills: [
    { name: "fetch", act: press(FETCH_SKILL), root: "body" },
    {
      // The adopted skill's Remove everywhere: the ask under its row, and
      // the machines it reaches.
      name: "remove-ask",
      act: async (page) => {
        await press(MORE_FOR_SKILL)(page);
        await page.getByRole("menuitem", { name: "Remove everywhere" }).click();
      },
      root: "body",
    },
  ],
  memory: [
    { name: "new", act: press(NEW_MEMORY), root: "body" },
    {
      // A filter nothing matches: the page's own line saying so.
      name: "filtered",
      act: (page) =>
        page
          .getByRole("textbox", { name: "Filter memory files" })
          .fill("no-such-file"),
      root: "body",
    },
    // The fleet's memory in its editor.
    { name: "editor", route: () => "/config/memory/CLAUDE.md", root: "body" },
    {
      // The same, with no machine at all: where it lands, a link to add one.
      name: "editor-no-machine",
      hub: "unregistered",
      route: () => "/config/memory/CLAUDE.md",
      root: "body",
    },
    {
      // The memory's Delete everywhere: the ask under its row.
      name: "delete-ask",
      act: async (page) => {
        await press(MORE_FOR_MEMORY)(page);
        await page.getByRole("menuitem", { name: "Delete everywhere" }).click();
      },
      root: "body",
    },
    {
      // The fleet not read yet: the section's skeleton rows, the hub's
      // answer held back on its tape (scene.ts `HOLDS`).
      name: "reading",
      hub: "reading",
      root: "body",
    },
  ],
  rules: [
    {
      name: "editor",
      route: () => "/config/rules/new",
      root: "body",
    },
    // The scene's rule: what it has caught.
    { name: "rule", route: (s) => `/config/rules/${s.rule}`, root: "body" },
    // `/config` itself: the section list and its first section.
    { name: "index", route: () => "/config", root: "body" },
  ],
  accounts: [
    { name: "new", route: () => "/config/accounts/new", root: "body" },
    {
      name: "account",
      route: (s) => `/config/accounts/${s.account}`,
      root: "body",
    },
    {
      // The second account, signed in on the machine.
      name: "second",
      route: (s) => `/config/accounts/${s.second}`,
      root: "body",
    },
    {
      // A Claude account signed in nowhere: its Sign in on the machine, the
      // link to open and the code to paste.
      name: "sign-in",
      route: (s) => `/config/accounts/${s.spare}`,
      act: press(SIGN_IN_ON),
      root: "body",
    },
    {
      // A GitHub Copilot account signed in nowhere: its Sign in on the
      // machine, the device code's start.
      name: "device-sign-in",
      route: (s) => `/config/accounts/${s.copilot}`,
      act: press(SIGN_IN_ON),
      root: "body",
    },
    {
      name: "routing",
      route: () => "/config/accounts/anthropic/routing",
      root: "body",
    },
    {
      // Fill first chosen: its order of the two accounts.
      name: "fill-first",
      route: () => "/config/accounts/anthropic/routing",
      act: (page) => page.getByRole("radio", { name: FILL_FIRST }).click(),
      root: "body",
    },
    {
      // A new account by API key (a provider the machine's OpenCode runs),
      // on to signing in: the key's field and the machines it goes to.
      name: "key",
      route: () => "/config/accounts/new",
      act: toKeyStep,
      root: "body",
    },
    {
      // Its key sent: the account made and the machine holding the key. It
      // writes, so it reads the hub its writes leave (scene.ts `written`).
      name: "key-sent",
      hub: "written",
      route: () => "/config/accounts/new",
      act: async (page) => {
        await toKeyStep(page);
        await page
          .getByRole("textbox", { name: "API key" })
          .fill("probe-302-key");
        await press("Send key")(page);
        await page.getByText("Key sent").first().waitFor();
      },
      root: "body",
    },
  ],
};

export const SURFACES: Surface[] = [
  {
    name: "home",
    serve: "built",
    route: () => "/",
    states: [
      { name: "rest", root: "body" },
      // The fleet not read yet: the home's first line says so (StatusLine),
      // the hub's answer held back on its tape (scene.ts `HOLDS`).
      { name: "reading", hub: "reading", root: "body" },
      {
        name: "machines",
        widths: ["desk"],
        act: press(/machine/),
        root: LAYER,
      },
      {
        // The offline Mac's menu in the machines list: Unlock keychain…, its dialog.
        name: "keychain",
        widths: ["desk"],
        act: openKeychain,
        root: "body",
      },
      {
        // The machines list's Add machine: Connect a machine, on its
        // one-command tab (the command, and the wait for the machine).
        name: "add-machine",
        widths: ["desk"],
        act: async (page) => {
          await press(MACHINES)(page);
          await press(ADD_MACHINE)(page);
          await page.getByRole("tab", { name: "With one command" }).click();
        },
        root: "body",
      },
      // The studio online and its keychain's unlock sent (`studioRouted`,
      // which stays the page's: these come last on this hub).
      {
        // The Mac yet to answer: the unlock under way (MachineAuthStatus waiting).
        name: "unlocking",
        widths: ["desk"],
        act: unlockStudio(),
        root: "body",
      },
      {
        // Answered unlocked, its logins read: the check.
        name: "unlocked",
        widths: ["desk"],
        act: unlockStudio("authenticated"),
        root: "body",
      },
      {
        // Answered unlocked, its logins still unreadable: the warning.
        name: "unlock-unreadable",
        widths: ["desk"],
        act: unlockStudio("unreadable-credentials"),
        root: "body",
      },
      {
        // The hub's socket open and silent on its tape (scene.ts `HOLDS`):
        // the status line, on the way.
        name: "connecting",
        hub: "silent",
        root: "body",
        // The band names the page's own address (client.svelte.ts
        // `hubSocketUrl`: `location.host`), the walk's server on a port of
        // its run, so two runs printed two pictures.
        mask: (page) => [page.locator("code", { hasText: SOCKET_URL })],
      },
    ],
  },
  {
    name: "rail",
    serve: "built",
    route: () => "/",
    states: [
      {
        name: "rest",
        act: openRail,
        root: "aside:has([data-slot=sidebar-content]), [data-slot=sheet-content][data-state=open]",
      },
      {
        name: "sort",
        act: async (page) => {
          await openRail(page);
          await press(SORT)(page);
        },
        root: LAYER,
      },
      {
        name: "row-menu",
        act: async (page) => {
          await page.keyboard.press("Escape");
          await page
            .getByRole("link", { name: IDLE_ROW })
            .first()
            .click({ button: "right" });
        },
        root: LAYER,
        widths: ["desk"],
      },
      {
        // A session row under the pointer: its hover card.
        name: "row-hover",
        act: (page) =>
          page.getByRole("link", { name: IDLE_ROW }).first().hover(),
        root: "body",
        widths: ["desk"],
      },
      {
        // The same fleet two days on: the project's stopped sessions past
        // its day, beyond its six rows, under "N older". Last (the page's
        // clock stays where it moved).
        name: "older",
        act: async (page) => {
          const at = await page.evaluate(() => Date.now());
          await page.clock.setFixedTime(at + LATER);
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForFunction(() => window.kitHydrated === true);
          await openRail(page);
        },
        root: "aside:has([data-slot=sidebar-content]), [data-slot=sheet-content][data-state=open]",
      },
    ],
  },
  {
    name: "usage-popover",
    serve: "built",
    route: () => "/",
    states: [{ name: "open", act: press(/Show every limit/), root: LAYER }],
  },
  {
    name: "session",
    serve: "built",
    route: (s) => `/session/${s.chips}`,
    states: [
      { name: "rest", root: "body" },
      // Turns still going as the walk reads them (scene.ts `SLOW_MS`), read
      // early: one answering a rule's reply (its row above), one still thinking.
      { name: "live", route: (s) => `/session/${s.todo}`, root: MAIN },
      {
        name: "live-thinking",
        route: (s) => `/session/${s.liveThink}`,
        root: MAIN,
      },
      // A finished turn's thinking, opened: its steps.
      {
        name: "thinking",
        route: (s) => `/session/${s.think}`,
        act: press(REASONING),
        root: MAIN,
      },
      // Compacted: the divider where the summary starts.
      { name: "compacted", route: (s) => `/session/${s.compact}`, root: MAIN },
      // The plan's ring pressed: its steps in the side panel.
      {
        name: "plan",
        route: (s) => `/session/${s.planned}`,
        act: press(PLAN_RING),
        root: "body",
      },
      {
        name: "tools-open",
        act: async (page) => {
          for (const name of TOOL_ROWS) {
            // biome-ignore lint/performance/noAwaitInLoops: one tool row at a time, in the transcript's order
            await pressInTranscript(page, name);
          }
        },
        root: MAIN,
      },
      {
        name: "composer-grown",
        act: async (page) => {
          await page.locator(COMPOSER_FIELD).first().click();
          await page.keyboard.type("Wrap the chip's label at the badge.");
          await page.keyboard.press("Shift+Enter");
          await page.keyboard.type("Keep the count whole.");
          await page.keyboard.press("Shift+Enter");
          await page.keyboard.type("Then measure it on a phone.");
        },
        root: MAIN,
      },
      {
        name: "attach-menu",
        act: press("Attach or draw"),
        root: LAYER,
      },
      {
        // An @ in the composer: the mention menu.
        name: "mention",
        act: async (page) => {
          await emptyComposer(page);
          await page.keyboard.type("@");
        },
        root: "body",
      },
      {
        // Up in an empty composer: the recall wheel over what was sent.
        name: "recall",
        act: async (page) => {
          await emptyComposer(page);
          await page.keyboard.press("ArrowUp");
        },
        root: "body",
      },
      {
        // The Write card's change opened whole.
        name: "diff",
        act: async (page) => {
          await press(WROTE_ROW)(page);
          await press(OPEN_DIFF)(page);
        },
        root: "body",
      },
      {
        name: "session-card",
        act: async (page) => {
          await page.keyboard.press("Escape");
          await page.focus("[data-chosen] [data-session-tab]");
          await page.keyboard.press("ArrowDown");
        },
        root: ".kit-hang[data-state=open]",
      },
      {
        name: "tab-menu",
        act: async (page) => {
          await page.keyboard.press("Escape");
          await page.evaluate(() =>
            document.querySelector("[data-chosen] [role='tab']")?.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "F10",
                shiftKey: true,
                bubbles: true,
              })
            )
          );
        },
        root: LAYER,
      },
      { name: "question", route: (s) => `/session/${s.ask}`, root: MAIN },
      {
        name: "answered",
        route: (s) => `/session/${s.answered}`,
        root: MAIN,
      },
      {
        name: "permission",
        route: (s) => `/session/${s.permission}`,
        root: MAIN,
      },
      {
        // A move nobody said yes to (the tray project to the second online
        // machine): its session's pane is the staged wait, the approval
        // asked in its first step.
        name: "move-ask",
        hub: "moving",
        route: (s) => `/session/${s.moving}`,
        root: MAIN,
      },
      {
        // The delegate it started, reported back: its card opened, its transcript inline.
        name: "delegate",
        route: (s) => `/session/${s.split}`,
        act: press(DELEGATE_CARD),
        root: MAIN,
        hostOnly: true,
      },
      {
        // CawCo's fleet-memory read, its card opened: the memory it read.
        name: "memory-tool",
        route: (s) => `/session/${s.memoryRead}`,
        act: press(MEMORY_ROW),
        root: MAIN,
      },
      {
        // A skill the session ran, its card opened: what it was asked.
        name: "skill-tool",
        route: (s) => `/session/${s.skillRun}`,
        act: press(SKILL_ROW),
        root: MAIN,
      },
      {
        // The workflow run it started: the RunBlock and its steps.
        name: "run-block",
        route: (s) => `/session/${s.runner}`,
        root: MAIN,
      },
      {
        // A note attached in the composer: its chip over the field. Late:
        // the draft, attachments and all, is the session's from then on.
        name: "attached",
        act: (page) =>
          page
            .locator(HIDDEN_FILE)
            .first()
            .setInputFiles({
              name: "chip-notes.txt",
              mimeType: "text/plain",
              buffer: Buffer.from("The badge is cut at 390px.\n"),
            }),
        root: MAIN,
      },
      {
        // ⌘⇧D in the composer: the canvas, standing over the field.
        // Last: the canvas it opens is the session's from then on.
        name: "canvas",
        act: async (page) => {
          await emptyComposer(page);
          await page.keyboard.press("ControlOrMeta+Shift+KeyD");
          await page
            .locator("iframe[title='Canvas']")
            .first()
            .waitFor({ state: "attached" });
        },
        root: "body",
        widths: ["desk"],
      },
      {
        // The hub's socket dropped, and the catch-up read on reconnecting
        // (client.svelte.ts `rereadFollowed`) refused: the rows held where
        // they are, the view not caught up. Last (its routes stay).
        name: "behind",
        act: async (page) => {
          const sockets: WebSocketRoute[] = [];
          await reloadedWith((p) =>
            p.routeWebSocket(DASHBOARD_SOCKET, (ws) => {
              ws.connectToServer();
              sockets.push(ws);
            })
          )(page);
          await page.route(TRANSCRIPT_READ, (route) =>
            route.abort("connectionrefused")
          );
          await sockets.at(-1)?.close();
          await page.locator("[data-slot=behind]").first().waitFor();
        },
        root: MAIN,
      },
    ],
  },
  {
    name: "project",
    serve: "built",
    route: (s) => `/project/${s.project}`,
    states: [
      { name: "rest", root: "body" },
      {
        name: "more-menu",
        act: async (page) => {
          await cawSheetAway(page);
          await press(MORE_FOR_CAWCO)(page);
        },
        root: LAYER,
      },
      // Caw's seat: his thread beside the board.
      { name: "caw", act: openCaw, root: "body" },
      // The note pasted in his thread, opened in the lightbox's document view.
      {
        name: "caw-note",
        act: inCawThread(press(THREAD_NOTE)),
        root: "body",
      },
      // The file he wrote in the folder, opened from his message.
      {
        name: "caw-file",
        act: inCawThread((page) =>
          page
            .locator("[data-folder-chip]")
            .filter({ visible: true })
            .first()
            .click()
        ),
        root: "body",
      },
      // The ⋯ menu's rows: the project's details, Caw's settings, its stages, and the forget it asks.
      { name: "details", act: fromMore("Project details…"), root: "body" },
      { name: "caw-settings", act: fromMore("Caw settings…"), root: "body" },
      { name: "stages", act: fromMore("Pick stages…"), root: "body" },
      { name: "forget", act: fromMore("Forget project…"), root: "body" },
      {
        name: "new",
        route: () => "/project/new",
        root: MAIN,
      },
      {
        // The forget pressed while what runs in the project is still being
        // read: the tray's reading line. Last (its route stays).
        name: "forget-reading",
        act: async (page) => {
          await neverAnswered(page, PROJECT_RUNNING, PROJECT_RUNNING_PATH);
          await fromMore("Forget project…")(page);
        },
        root: "body",
      },
    ],
  },
  {
    name: "board",
    serve: "built",
    route: (s) => `/project/${s.project}`,
    states: [
      { name: "rest", root: MAIN },
      {
        name: "filter",
        act: press("Filter"),
        root: LAYER,
        widths: ["desk"],
      },
      {
        // A task picked: the bulk bar.
        name: "bulk",
        act: (page) =>
          page
            .getByRole("checkbox", { name: PICK_TASK })
            .filter({ visible: true })
            .first()
            .click(),
        root: MAIN,
        widths: ["desk"],
      },
      // A column's Add task pressed: the new task's form, open in its column.
      { name: "new-task", act: press(ADD_TASK), root: MAIN },
      // The Archived rail open, the bulk bar's two popovers, the stages picker.
      { name: "archive", act: press(ARCHIVED_RAIL), root: MAIN },
      {
        name: "drop",
        act: pickThen(BULK_DROP),
        root: LAYER,
        widths: ["desk"],
      },
      {
        name: "label",
        act: pickThen(BULK_LABEL),
        root: LAYER,
        widths: ["desk"],
      },
      {
        name: "stages",
        act: async (page) => {
          await press(PROJECT_MORE)(page);
          await page.getByRole("menuitem", { name: PICK_STAGES }).click();
        },
        root: LAYER,
        widths: ["desk"],
      },
      {
        // A set the tasks don't stand in (Outreach's stages are none of
        // theirs): its ask under it in the picker, naming each task it would
        // strand and where each stands (StagesControl, AskHere, AskItems).
        name: "stages-ask",
        act: async (page) => {
          await press(PROJECT_MORE)(page);
          await page.getByRole("menuitem", { name: PICK_STAGES }).click();
          await page
            .getByRole("button", { name: OUTREACH_STAGES })
            .filter({ visible: true })
            .first()
            .click();
        },
        root: LAYER,
        widths: ["desk"],
      },
    ],
  },
  {
    name: "task",
    serve: "built",
    route: (s) => `/project/${s.project}?task=${s.task}`,
    states: [
      { name: "open", root: "body" },
      {
        // In review: its two attempts, the newest's result (the page it presented, the post, the notes).
        name: "review",
        route: (s) => `/project/${s.project}?task=${s.review}`,
        root: "body",
      },
      {
        // Every part a task's sheet draws: labels, fields, a blocker, to-dos, criteria, notes, an output.
        name: "rich",
        route: (s) => `/project/${s.project}?task=${s.rich}`,
        root: "body",
      },
      {
        // The same task's Details (it opens on Review, since it has an output):
        // its fields, labels, the task it waits on, to-dos, criteria and notes.
        name: "rich-details",
        route: (s) => `/project/${s.project}?task=${s.rich}`,
        act: (page) =>
          page
            .getByRole("tab", { name: DETAILS_TAB })
            .filter({ visible: true })
            .first()
            .click(),
        root: "body",
      },
      {
        // Its one attempt failed.
        name: "failed",
        route: (s) => `/project/${s.project}?task=${s.failed}`,
        root: "body",
      },
      {
        // In review, its page not found yet: the stage's cover. Last (its route stays).
        name: "review-opening",
        route: (s) => `/project/${s.project}?task=${s.review}`,
        act: reloadedWith((page) =>
          neverAnswered(page, ARTIFACT_READ, ARTIFACT_READ_PATH)
        ),
        root: "body",
      },
    ],
  },
  {
    name: "views",
    serve: "built",
    route: (s) => `/project/${s.project}`,
    // Each view is the project's route with its `view` (the view tabs' own
    // hrefs): a made view's tab is `view:<name>` (+page.svelte's `tabs`).
    // Made is what the tasks handed in (the review task's post and notes,
    // ViewMade drawing each output small); Canvas, the tasks' graph (the
    // scene's edges).
    states: [
      "table",
      "pipeline",
      "routines",
      "decisions",
      "view:week",
      "made",
      "canvas",
    ]
      .map((view): State => ({
        name: view.replace("view:", ""),
        route: (s) => `/project/${s.project}?view=${view}`,
        root: MAIN,
      }))
      .concat(
        {
          // The made view on its own page, as a link to it opens it (a bare route).
          name: "week-page",
          route: (s) => `/project/${s.project}/view/week`,
          root: "body",
        },
        {
          // The decision page its session made, still open for picks: the page in its frame.
          name: "decision-page",
          route: (s) =>
            `/project/${s.project}?view=decisions&page=${CHIP_DECISION}`,
          root: MAIN,
        }
      ),
  },
  {
    // Three linked decision pages: the list, one page, and their graph.
    name: "decisions",
    serve: "built",
    route: (s) => `/project/${s.decisions}?view=decisions`,
    states: [
      { name: "rest", root: MAIN },
      {
        name: "page",
        route: (s) => `/project/${s.decisions}?view=decisions&page=pricing`,
        root: MAIN,
      },
      {
        name: "graph",
        route: (s) => `/project/${s.decisions}?view=decisions&mode=graph`,
        root: MAIN,
      },
    ],
  },
  {
    // A project with Caw on and nothing on its board: the starters on the
    // board, then his panel (its lead switch, the starters in its hero).
    name: "caw-on",
    serve: "built",
    route: (s) => `/project/${s.tray}`,
    states: [
      { name: "rest", root: "body" },
      { name: "panel", act: openCaw, root: "body" },
      // No decision page yet: Caw in the view, his starters under him.
      {
        name: "decisions",
        route: (s) => `/project/${s.tray}?view=decisions`,
        root: MAIN,
      },
    ],
  },
  ...CONFIG.map((section): Surface => ({
    name: `config-${section}`,
    serve: "built",
    route: () => `/config/${section}`,
    states: [{ name: "rest", root: "body" }, ...(EDITORS[section] ?? [])],
  })),
  {
    name: "usage",
    serve: "built",
    route: () => "/usage",
    states: [
      { name: "rest", root: "body" },
      // One project's spend.
      {
        name: "project",
        route: (s) => `/usage?project=${s.project}`,
        root: "body",
      },
    ],
  },
  {
    name: "new-session",
    serve: "built",
    route: () => "/",
    // The sheet as a person fills it: where, the folder browsed to and
    // used, each chip's popover, the prompt's `/` menu.
    states: [
      {
        name: "open",
        act: inSheet(),
        root: "[role=dialog][data-state=open]",
      },
      { name: "location", act: inSheet(press(LOCATION_CHIP)), root: "body" },
      {
        name: "browse",
        act: inSheet(press(LOCATION_CHIP), browseTo),
        root: "body",
      },
      {
        name: "used",
        act: inSheet(press(LOCATION_CHIP), browseTo, press("Use this folder")),
        root: "[role=dialog][data-state=open]",
      },
      { name: "effort", act: inSheet(press(EFFORT_CHIP)), root: "body" },
      {
        name: "permission",
        act: inSheet(press(PERMISSION_CHIP)),
        root: "body",
      },
      { name: "account", act: inSheet(press(ACCOUNT_CHIP)), root: "body" },
      {
        // The Machines chip's "Connect a machine…": the pairing panel in the
        // list's place, its install command in the join step's CopyBox. The
        // command stands once the hub lists an address (hub join.ts
        // `joinAddresses`: Tailscale, then each non-internal IPv4), which a
        // host's tape holds and a workspace's (loopback alone) does not.
        name: "machines-pair",
        act: inSheet(
          press(PROJECT_CHIP),
          (page) =>
            page.getByRole("button", { name: CAWCO_PROJECT }).first().click(),
          press(MACHINES_CHIP),
          (page) =>
            page
              .locator(`${MACHINE_ROW_ANY}[data-add]`)
              .filter({ visible: true })
              .first()
              .click()
        ),
        root: "body",
      },
      {
        // The cawco project on the machine with no checkout of it: Move &
        // start, and the move it asks a yes for.
        name: "move",
        act: inSheet(toOtherMachine, press(MOVE_AND_START)),
        root: "[role=dialog][data-state=open]",
      },
      {
        name: "insert",
        act: inSheet(async (page) => {
          await page.getByRole("textbox", { name: "First prompt" }).click();
          await page.keyboard.type("/");
        }),
        root: "body",
      },
    ],
  },
  {
    name: "jump",
    serve: "built",
    route: () => "/",
    states: [
      { name: "open", act: openJump, root: LAYER },
      {
        // A word typed, its results in, then ↓ to a session's row and → on
        // it: its peek in place (Finder: → peeks the active row). All its
        // results: the names come first and the machines' answers after
        // (Finder's `searching` mark stands until they have), and rows
        // that came in after the → moved the list and shut the peek.
        name: "peek",
        act: async (page) => {
          await openJump(page);
          await page.keyboard.type("chip");
          await page
            .locator("[role=option]")
            .filter({ visible: true })
            .first()
            .waitFor();
          await page
            .locator("[data-slot=searching]")
            .first()
            .waitFor({ state: "detached" });
          await page.keyboard.press("ArrowDown");
          await page.keyboard.press("ArrowRight");
          await page.locator(FIND_PEEK).first().waitFor();
        },
        root: LAYER,
      },
    ],
  },
  {
    name: "caw-panel",
    serve: "built",
    route: () => "/",
    states: [
      {
        name: "open",
        act: (page) => page.click("[data-needs-caw]"),
        root: LAYER,
      },
      {
        // An ask's Peek on its card, the panel giving way to the peek sheet:
        // the tail of the session. The desk's alone: under 900px is the
        // drawer layout, which has no Peek (peek.svelte.ts `peekable`).
        name: "peek",
        widths: ["desk"],
        act: async (page) => {
          await page.click("[data-needs-caw]");
          await page
            .locator(ASK_PEEK)
            .filter({ visible: true })
            .first()
            .click();
        },
        root: "body",
      },
    ],
  },
  {
    name: "workflows",
    serve: "built",
    route: () => "/workflows",
    states: [
      { name: "rest", root: "body" },
      {
        name: "editor",
        route: (s) => `/workflows/${s.workflow}`,
        root: "body",
      },
      {
        name: "program",
        route: (s) => `/workflows/${s.workflow}?tab=program`,
        root: "body",
      },
      {
        // Run: the launch dialog, opened and not sent.
        name: "launch",
        route: (s) => `/workflows/${s.workflow}`,
        act: press(RUN_WORKFLOW),
        root: "body",
      },
      // A graph workflow: the canvas, its nodes and edges, the inspector.
      { name: "graph", route: (s) => `/workflows/${s.graph}`, root: "body" },
      // Its step picked: the inspector's prompt and output schema.
      {
        name: "graph-step",
        route: (s) => `/workflows/${s.graph}`,
        act: pickNode(GRAPH_STEP),
        root: "body",
      },
      // Its branch picked: each case's condition.
      {
        name: "graph-branch",
        route: (s) => `/workflows/${s.graph}`,
        act: pickNode(GRAPH_BRANCH),
        root: "body",
      },
      // The finished run in its own pane: its steps.
      { name: "run", route: (s) => `/session/run:${s.run}`, root: "body" },
    ],
  },
  {
    name: "artifact",
    serve: "built",
    route: (s) => `/artifact/${s.artifact}`,
    states: [
      { name: "rest", root: "body" },
      { name: "in-session", route: (s) => `/session/${s.art}`, root: "body" },
      // A pin on the preview, its card open (the desk's pane stands beside the transcript).
      {
        name: "pin",
        route: (s) => `/session/${s.art}`,
        act: dropPin,
        root: "body",
        widths: ["desk"],
      },
      // The pane's Comments panel: its pins' list.
      {
        name: "comments",
        route: (s) => `/session/${s.art}`,
        act: headControl("comments", "Comments"),
        root: "body",
        widths: ["desk"],
      },
      // The page asking for a place: the pane's place picker.
      {
        name: "place-pick",
        route: (s) => `/session/${s.art}`,
        act: askPlace,
        root: "body",
        widths: ["desk"],
      },
    ],
  },
  {
    // A sheet a delegate made, on the sheet's own tape: its inspector open
    // over the chosen story, one control of each kind (scene.ts `CARD`).
    name: "sheet",
    serve: "built",
    tape: "sheet",
    route: (s) => `/artifact/${s.sheet}`,
    states: [{ name: "inspect", act: inspectSheet, root: "body" }],
  },
  {
    // A part of the page that throws while it renders: the tabs, their
    // list failing, stand as their failure line and the rest works on.
    name: "region-failed",
    serve: "built",
    route: (s) => `/session/${s.chips}`,
    states: [{ name: "tabs", act: tabsFail, root: "body" }],
  },
  {
    // A tab switched to with more to draw than it built: "Catching up…"
    // over the rows it kept. Its own surface: the page's turns stay held.
    name: "catch-up",
    serve: "built",
    route: (s) => `/session/${s.permission}`,
    // It answers the push's permission, so it reads the hub writes leave.
    states: [
      {
        name: "switch",
        hub: "written",
        act: caughtUp,
        heldFrame: true,
        root: MAIN,
        widths: ["desk"],
      },
    ],
  },
  {
    name: "not-found",
    serve: "built",
    route: () => "/no-such-page",
    states: [{ name: "rest", root: "body" }],
  },
  {
    // Suggest while typing on: words for the task the session's skill is made
    // for, and its chip. The composer suggests from what the session lists
    // (its init's `slash_commands`), so the skill is in both accounts'
    // config (scene.ts): the rebalance carries the session to the second.
    name: "suggesting",
    serve: "built",
    route: (s) => `/session/${s.skillRun}`,
    states: [
      {
        name: "chip",
        hub: "suggesting",
        act: async (page) => {
          await page.locator(COMPOSER_FIELD).first().click();
          // The task the skill is made for, in words that do not name it (a
          // chip already named in the draft is left off: SuggestionChips `shown`).
          await page.keyboard.type(
            "Check the tray's chip row at a phone's width"
          );
          await page
            .locator("[data-slot=suggest] fieldset button")
            .first()
            .waitFor({ timeout: SUGGESTED_MS });
        },
        root: MAIN,
      },
    ],
  },
  {
    // Every machine offline: where the page says where to start (MachinesEmpty).
    name: "no-machine",
    serve: "built",
    route: () => "/",
    states: [
      { name: "rest", hub: "machineless", root: "body" },
      // No machine at all, every one removed: where the page says to add one.
      { name: "none", hub: "unregistered", root: "body" },
      // A session on the machine that went away: what its pane can still show.
      {
        name: "session",
        hub: "machineless",
        route: (s) => `/session/${s.chips}`,
        root: MAIN,
      },
    ],
  },
  {
    // Paired devices required, and this browser no paired one: the pairing screen.
    name: "pairing",
    serve: "built",
    route: () => "/",
    states: [
      { name: "rest", hub: "pairing", root: "body" },
      {
        // Its pairing asked of a hub it can't reach just then: "Pairing
        // didn't start", and the reason opened whole.
        name: "start-failed",
        hub: "pairing",
        act: async (page) => {
          await reloadedWith((p) =>
            p.route(PAIR_START, (route) => route.abort("connectionrefused"))
          )(page);
          await page.getByTitle("Show the whole error").first().click();
        },
        root: "body",
      },
    ],
  },
  ...BENCHES.map(([name, path]): Surface => ({
    name: `bench-${name}`,
    serve: "dev",
    route: () => path,
    states: [{ name: "rest", root: "body" }],
  })),
];

/** The surfaces `--surfaces=a,b` names (every one when none is named); an unknown name throws. */
export function chosen(arg: string | undefined): Surface[] {
  if (!arg) {
    return SURFACES;
  }
  const names = arg.split(",").filter(Boolean);
  const unknown = names.filter((n) => !SURFACES.some((s) => s.name === n));
  if (unknown.length > 0) {
    throw new Error(
      `no such surface: ${unknown.join(", ")} (have ${SURFACES.map((s) => s.name).join(", ")})`
    );
  }
  return SURFACES.filter((s) => names.includes(s.name));
}
