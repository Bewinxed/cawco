/**
 * The surfaces the style snapshot and the surfaces pixel spec read, named as
 * the Tailwind cutover's lanes name them (one lane's `--surfaces=`), each a
 * route and the states it opens.
 *
 * Every root and every action finds its element by what a restyle keeps:
 * a tag, a role, an accessible name, a `data-*` attribute. Never by a
 * class: a class is a style.
 *
 * A route opens on the built dashboard against the hub tape ("built"), or,
 * for a `/motion/` bench (a built dashboard 404s them), on the dev server
 * against the same tape ("dev").
 */
import type { Locator, Page, WebSocketRoute } from "playwright-core";
import { accountsWords } from "../../../packages/core/src/words/accounts";
import { MACHINE } from "../../scratch-fleet";
import type { CapturePage } from "../decision-embeds";
import { COMPOSER_FIELD } from "../kit";
import { exactly, startsWith } from "../words";
import {
  ANSWERED_PIN,
  commentPins,
  DELEGATE_TITLE,
  MEDIA_PAGE,
  PIN_ANSWER,
  type Scene,
  STUDIO_HOST,
  STUDIO_MACHINE,
  type Variant,
} from "./scene";

export type Width = "desk" | "tablet" | "phone";

/**
 * What only a state draws, held once its page stands and before anything is
 * read or captured (ready.ts): the walk fails the state with its name when
 * it does not hold, so no read or picture stands under a state's name that
 * shows another screen. The pass's theme is held on every state beside it.
 */
export interface Ready {
  /** What stands nowhere visible: the state this one would be mistaken for. */
  not?: string;
  /** The page's path and query, where the state is a route of its own. */
  path?: RegExp;
  /** Its words, where the element alone does not tell this state from its neighbours. */
  says?: RegExp;
  /** What stands visible in the viewport on this state alone (its first match, or the first saying `says`). */
  shows: string;
}

export interface State {
  /** What opens it, on its route freshly loaded (the walk loads each state's route anew), with the scene's ids. */
  act?: (page: Page, scene: Scene) => Promise<unknown>;
  /**
   * The error the state exists to cause, as the dashboard reports it (a
   * region's failure line stands over the throw it caught): said as
   * `expected:`, never failing the run, where any other error does
   * (capture.ts).
   */
  expects?: { error: RegExp };
  /**
   * It reads the frame its act leaves, which the page's next frame and
   * timer take down (catch-up/switch: "Catching up…" until Transcript's
   * `hold` runs): the walk reads it with no page time run after the act
   * (walk.ts `actAtRest`). The act pauses the walk's clock itself.
   */
  heldFrame?: true;
  /**
   * It stands on what only a host's recording holds, and is left out, with
   * a NOTE saying which, from a tape that holds none (walk.ts `lacks`):
   * `delegate`, the scene's delegate (a workspace has no user namespaces to
   * make its workspace in; the scene's `split`); `join`, an address the
   * hub lists for another machine to join it at (a workspace's machine has
   * loopback alone; the scene's `joinable`, "" then).
   */
  hostOnly?: "delegate" | "join";
  /**
   * The hub state it reads, when not the scene's own: one the scene moves
   * the fleet into after the main recording (scene.ts `VARIANTS`), recorded
   * and played on its own (hub-tape.ts `variants`).
   */
  hub?: Variant;
  /**
   * What the state is about where it stands past the fold: the walk reads
   * every scroller at its start (walk.ts `toTheStart`), then scrolls this
   * into view (the nearest edge), so the picture holds it.
   */
  inView?: string;
  /**
   * What the walk's own setting writes into the page, not the dashboard: a
   * capture paints it over (Playwright's `mask`), so the picture holds what
   * the dashboard draws alone. Its styles are still read (style-snapshot).
   */
  mask?: (page: Page) => Locator[];
  name: string;
  /** What only this state draws (`Ready`, with the scene's ids where it names one): the walk holds it before every read and capture. */
  ready: Ready | ((scene: Scene) => Ready);
  /**
   * What puts back what its act took from the fleet, once the state is read
   * (or has failed): a recording's fleet is live and every later state's,
   * and the hub trashes a deleted item at once (config deletes.ts), so a
   * delete left standing failed the passes and surfaces read after it
   * (config-skills/removed took `tray-check` from New Session's `/` menu).
   * On a tape it asks what the recording asked.
   */
  restore?: (page: Page) => Promise<unknown>;
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
  "[role=dialog][data-state=open], [role=menu][data-state=open], [data-slot$='-content'][data-state=open]";
/** A workflow branch's case compared with a value: the value's JSON field. */
const COMPARE_FIELD =
  "[data-slot=when] [data-slot=when] textarea, [data-slot=when] [data-slot=when] input";
/** A menu standing open: a dropdown's or a context menu's content. */
const OPEN_MENU = "[role=menu][data-state=open]";
/** A dialog standing open: a sheet, a drawer, a modal. */
const OPEN_DIALOG = "[role=dialog][data-state=open]";
/** A popover standing open. */
const OPEN_POPOVER = "[data-slot=popover-content][data-state=open]";
/** The home: the rail's on a desk, the page's under the drawer's width. */
const HOME = 'section[aria-label="Home"]';
/** The machines popover (MachinesButton's glass card), and a machine's unlock tile in it. */
const MACHINES_POPOVER = `${OPEN_POPOVER}[aria-label="Machines"]`;
const UNLOCK_TILE = `${MACHINES_POPOVER} section[data-slot=unlock]`;
/** The rail: the desk's aside, or the sheet it is under the drawer's width. */
const RAIL =
  "aside:has([data-slot=sidebar-content]), [data-slot=sheet-content][data-state=open]";
const RAIL_SHOWN = "aside[data-slot=rail], [data-rail-sheet][data-state=open]";
/**
 * A project's "N older" row in the rail, its stopped sessions folded under
 * it: the one branch item that is a fold (a session's row is a `div`).
 */
const OLDER_ROW = "button[data-branch-item][aria-expanded]";
/** The rail's sheet, under the drawer's width. */
const RAIL_SHEET = "[data-rail-sheet][data-state=open]";
/** A project's board (its columns), and Caw's composer in his panel. */
const BOARD = "[data-slot=board]";
const CAW_COMPOSER = '[aria-label="Message Caw"]';
/** The words a state is told by, where its element is not enough (each state's `says`). */
const SIGN_IN_UNFINISHED = /^Sign-in didn't finish/;
const START_SIGN_IN = startsWith(accountsWords.device.start);
const GROWN_DRAFT =
  /Wrap the chip's label at the badge\.\s*Keep the count whole\.\s*Then measure it on a phone\./;
const CATCHING_UP_LINE = /^Catching up…$/;
/** A preview drawn in its frame, the pane's Comments rail, and the page's where-to-start (MachinesEmpty's title). */
const PREVIEW_READY = "iframe[data-ready=true]";
const PIN_LIST = 'aside[data-slot=comment-rail][aria-label="Comments"]';
/** A row of the Comments rail: the comment, one press. */
const PIN_ROW = "button[data-slot=pin-row]";
/** The rail as the well's foot sheet (a phone, a pane under 640px), which stands aside for a thread; a thread, by its pin's number. */
const PIN_POP = "[data-slot=comment-rail][data-layout=sheet]";
const pinCard = (n: number) => `[data-slot=pin-card][data-pin-card="${n}"]`;
/** A thread placed: beside its pill (end, start or below it), or the foot sheet. */
const PIN_CARD_PLACED =
  "[data-slot=pin-card]:is([data-sheet], [data-side=end], [data-side=start], [data-side=below])";
/** The comment's composer, at the element (or the foot sheet), before anything is written. */
const COMPOSER_PLACED =
  "[data-slot=pin-composer]:is([data-sheet], [data-side=end], [data-side=start], [data-side=below])";
/** The card's notice for a pin whose element is gone, and its line while the next tap places it. */
const GONE_SAYS = /^Its element is gone from the page/;
const PLACING_SAYS = /^Tap the page where it goes/;
const TAB_RESOLVED = /^Resolved/;
/** The panel's empty lines, each tab's. */
const NO_OPEN = /^No open comments/;
const NO_RESOLVED = /^Nothing resolved yet/;
/** The pane's Comment mode, as its compact mode menu names it. */
const COMMENT_MODE = /^Comment/;
/** The pane's artifact doc socket on the hub. */
const ARTIFACT_DOC_SOCKET = /\/ws\/artifact\//;
const MACHINES_EMPTY = "h1[data-slot=title]";
/** Jump's popover (its glass card), the needs panel's, and an ask's peek sheet. */
const JUMP = `${OPEN_POPOVER}[aria-label="Jump to"]`;
const NEEDS_PANEL = `${OPEN_POPOVER}[aria-label="Needs you"]`;
const PEEK_SHEET = "[data-peek-sheet][data-state=open]";
/** A graph step's settings in the inspector: its harness, one chosen (a single ToggleGroup's item is a radio). */
const STEP_SETTINGS =
  "fieldset:has(> legend) [data-slot=toggle-group-item][data-state=on]";
/** A workflow page's tab, chosen. */
const workflowTab = (value: string) =>
  `[role=tablist][aria-label="Workflow views"] [role=tab][data-value=${value}][aria-selected=true]`;
/** A New session chip's popover standing open (NsPopover's), and one by its chip. */
const NS_POP = "[data-ns-pop][data-state=open]";
const nsPop = (chip: string) => `${NS_POP}#session-${chip}-popover`;
/** A project view's pane (`data-view` its view), and a decision page open in it. */
const VIEW_PANE = "[data-slot=pane][aria-busy=false]";
const DECISION_PAGE = `${VIEW_PANE}[data-view=decisions-page] [data-slot=decisions][data-mode=page] [data-slot=page-head]`;
/** A task's sheet (the side card on a desk, the page on a phone), by its id. */
const taskSheet = (id: string) => `section[aria-label="Task ${id}"]`;
/** The board's bulk bar, once a card is picked. */
const BULK_BAR = '[role=toolbar][aria-label="Selected tasks"]';

/** The tab chosen in its strip: the conversation `id` is the one on screen. */
const chosenTab = (id: string) =>
  `a[role=tab][aria-selected=true][href="/session/${id}"]`;
/** `what` on the page whose chosen tab is `id`'s, and that also holds `also`. */
const on = (id: string, what: string, also?: string) =>
  `body:has(${chosenTab(id)})${also ? `:has(${also})` : ""} ${what}`;
/** A turn under way: the composer's Stop. */
const STOP_AGENT = '[aria-label="Stop the agent"]';
/** An ask in the conversation: a question or a permission (Prompt.svelte). */
const HITL = "section[data-slot=hitl]";
/** A tool row opened (ToolGroup's). */
const OPEN_TOOL_ROW = "button[data-slot=trow][aria-expanded=true]";
/** A workflow run's block in its session's transcript (RunBlock). */
const RUN_BLOCK = "[data-run-block]";
/** A move's staged wait in its session's pane (MoveWait), its approval asked. */
const MOVE_WAIT = "[data-slot=wait] [data-slot=move-wait-card]";

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
/** The shell's top bar (Shell `data-slot="top"`), its glass group in it. */
const TOP_BAR = 'header[data-slot="top"]';
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
/** Svelte's keyed each meeting a key twice, as the dashboard reports it. */
const EACH_KEY_DUPLICATE = /each_key_duplicate/;
/**
 * Recent unfolded, unless it stands open already: the page keeps it as the
 * person left it (an earlier state of the pass opened it).
 */
const recentOpen = async (page: Page) => {
  const disclosure = page
    .locator("[data-slot=recent] [data-slot=disclosure]")
    .filter({ visible: true })
    .first();
  if ((await disclosure.getAttribute("aria-expanded")) !== "true") {
    await disclosure.click();
  }
  await page
    .locator("[data-slot=home-recent-session-tree] li")
    .first()
    .waitFor();
};

/** Add machine's window (connect/), and its title before an install starts. */
const CONNECT_WINDOW = "[data-connect-window][data-state=open]";
const ADD_MACHINE_TITLE = /^Add machine$/;
/** The stored transcript's title, as its row says it. */
const STORED_TITLE = /Sketch the tray's empty state/;
/** The usage page's project filter, opened. */
const usageProjects = async (page: Page) => {
  await page
    .locator('[data-slot=select-trigger][aria-label="Project"]')
    .filter({ visible: true })
    .first()
    .click();
  await page
    .locator("[data-slot=select-content][data-state=open] [role=option]")
    .first()
    .waitFor();
};

/** How many projects the many-projects fleet holds beside the scene's own. */
const MORE_PROJECTS = 40;
/** The first of them, which the open list stands in view (the rest run past it). */
const FIRST_MORE_PROJECT = /^Project 1$/;

/**
 * The fleet's projects read with {@link MORE_PROJECTS} more, each the
 * scene's first project under a name and id of its own and placed nowhere:
 * a fleet whose project lists run past their room.
 */
const manyProjects = (page: Page) =>
  page.route(PROJECTS_READ, async (route) => {
    const response = await route.fetch();
    const projects = (await response.json()) as Record<string, unknown>[];
    const first = projects[0] ?? {};
    await route.fulfill({
      response,
      json: [
        ...projects,
        ...Array.from({ length: MORE_PROJECTS }, (_, i) => ({
          ...first,
          id: `probe-project-${i + 1}`,
          name: `Project ${i + 1}`,
          places: [],
        })),
      ],
    });
  });

/** The Full Send ask's yes (PermissionSection's). */
const SWITCH_FULL_SEND = /^Switch to Full Send$/;
/** The permission mode the scene's sessions run on. */
const SCENE_MODE = "bypassPermissions";
/** A refused send's way back: its row's Choose a mode (MessageRow). */
const CHOOSE_A_MODE = /^Choose a mode$/;
/** No machine at all, where a page needs one (config NoMachines' title). */
const NO_MACHINES = /No machines yet/;
/** A model's combobox (ModelCombobox's "Model"). */
const MODEL_CHIP = /^Model/;
/** The workflows page's New workflow, its two kinds, and a project menu's upstream row (core upstream-guard.ts `title`). */
const NEW_WORKFLOW = /^New workflow$/;
const NEW_WORKFLOW_KINDS = /New graph[\s\S]*New program/;
const UPSTREAM = /^Other people's repositories/;
/** An artifact shown in its session's panel (artifact-api.ts `showArtifact`). */
const ARTIFACT_SHOW = /\/api\/instances\/[^/]+\/artifacts\/[^/]+\/show$/;
/** A component canvas's map (artifact-api.ts `fetchCanvasMap`), and the scene's Card's (core `CanvasMap`). */
const CANVAS_MAP_READ = /\/artifacts\/[^/]+\/map$/;
const thumbOf = (states: ("drawn" | "failed" | "unseen")[]) => ({
  w: 380,
  h: 190,
  frames: states.map((state, i) => ({
    x: (i % 2) * 200,
    y: Math.floor(i / 2) * 100,
    w: 180,
    h: 90,
    state,
  })),
});
const CARD_MAP = {
  center: {
    at: null,
    drawn: 3,
    file: "src/Card.svelte",
    name: "Card",
    states: 4,
    statesFiles: ["src/Card.stories.ts"],
    thumb: thumbOf(["drawn", "drawn", "failed", "unseen"]),
  },
  usedIn: [
    {
      at: "src/App.svelte:12",
      drawn: 0,
      file: "src/App.svelte",
      name: "App",
      states: 0,
      statesFiles: [],
      thumb: null,
    },
  ],
  madeOf: [
    {
      at: "src/Card.svelte:8",
      drawn: 2,
      file: "src/Badge.svelte",
      name: "Badge",
      states: 2,
      statesFiles: ["src/Badge.stories.ts"],
      thumb: thumbOf(["drawn", "drawn"]),
    },
  ],
};
/** A run's read (workflows.ts `getRun`), and the question it is parked on in run-ask (core `WorkflowAsk`). */
const RUN_READ = /\/api\/workflow-runs\/[^/]+$/;
const RUN_ASK = {
  allowOther: true,
  answeredBy: "operator",
  options: [
    { label: "Wrap", description: "Two lines, then cut" },
    { label: "Truncate", description: "One line, the count kept whole" },
  ],
  parkedAt: "2026-10-01T09:00:00.000Z",
  question: "Which wrap does the chip row take?",
  stepId: "ask-wrap",
};
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
/**
 * The chips transcript's Write row, and its change's open control (DiffView's
 * "Expand diff (full view)", named by its title). `/diff|Open|Expand/i` stood
 * for it, and on a phone the first visible button that matched was the
 * bar's "Open navigation": session/diff read the rail's sheet.
 */
const WROTE_ROW = /Wrote chip\.css/;
const OPEN_DIFF = /^Expand diff \(full view\)$/;
/** The diff opened whole (DiffModal's dialog, named for its file). */
const DIFF_DIALOG = '[role=dialog][data-state=open][aria-label^="Diff: "]';
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
const FILL_FIRST = (() => {
  const strategy = accountsWords.strategies.find(
    (one) => one.id === "fill-first"
  );
  if (!strategy) {
    throw new Error("accountsWords.strategies has no fill-first strategy");
  }
  return startsWith(strategy.label);
})();
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
/** A toast standing (svelte-sonner's), and its Undo (configureWords.undo). */
const TOAST = "[data-sonner-toast]";
const UNDO = /^Undo$/;

/**
 * A config row deleted from its row menu: it goes at once, Undo in the
 * toast (deletes.ts, JOURNEY.md Flow 5: "an undo affordance after the fact
 * rather than a confirm dialog before it"). The toast closes itself after
 * its duration of page time, which the walk runs on past the act, so the
 * act ends on it, as a person's pointer reaching for Undo does: svelte-sonner
 * holds a toast's timer while the pointer is over it (Toast.svelte's
 * `expanded`), and an act that ends on a move keeps its pointer.
 */
const deletedFrom = (more: RegExp, item: string) => async (page: Page) => {
  await press(more)(page);
  await page.getByRole("menuitem", { name: item }).click();
  const toast = page
    .locator(TOAST)
    .filter({ has: page.getByRole("button", { name: UNDO }) })
    .first();
  await toast.hover();
};
/**
 * A delete's Undo pressed in its toast, and `row` back in its list: the hub
 * puts the item back from its trash (config undo.ts), so what the delete took
 * stands again for every state read after it (State `restore`).
 */
const undoDelete = (row: string) => async (page: Page) => {
  await page
    .locator(TOAST)
    .filter({ has: page.getByRole("button", { name: UNDO }) })
    .first()
    .getByRole("button", { name: UNDO })
    .click();
  await page.locator(row).first().waitFor();
};
/** What runs in a project, which its forget reads first (client.svelte.ts `projectRunning`). */
const PROJECT_RUNNING = "**/api/projects/*/running";
/** {@link PROJECT_RUNNING}'s path. */
const PROJECT_RUNNING_PATH = /^\/api\/projects\/[^/]+\/running$/;
/** The fleet's projects, which the page's first read waits on with its machines and sessions (client.svelte.ts `refresh`). */
const PROJECTS_READ = "**/api/projects";
/** The fleet's hooks, which a hook's editor waits on (config store `hooks`), and its path. */
const HOOKS_READ = "**/api/fleet/hooks";
const HOOKS_READ_PATH = /^\/api\/fleet\/hooks$/;
/** {@link PROJECTS_READ}'s path. */
const PROJECTS_READ_PATH = /^\/api\/projects$/;
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

/** A decision host page opened on `page` (decision-embeds.ts `openCapturePage`, loaded when a state runs). */
const hostPage =
  (name: CapturePage, options?: { bridge?: boolean }) =>
  async (page: Page): Promise<void> => {
    const { openCapturePage } = await import("../decision-embeds");
    await openCapturePage(page, name, options);
  };
/** A host page's card, by its decision's id (Decision.svelte `id="decision-<id>"`). */
const HOST_CARD = (id: string) => `#decision-${id}`;
/** The host page's count of what is picked, in its foot. */
const HOST_METER = "[data-slot=decision-page] [data-slot=meter]";
/** Send picks, its work done: its check up (kit pending-content `tick`). */
const HOST_SENT = "[data-send] [data-slot=tick][data-on=true]";
/** A note's field, not the twin it measures its height on (motion/autosize.svelte.ts: `aria-hidden`). */
const NOTE_FIELD = "textarea:not([aria-hidden])";
/** A preview origin's ping (Preview.svelte), which a wait never hears answered. */
const PING_PATH = /^\/__cawco\/ping$/;
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
 * The page reloaded with every hub message it is sent run through `patch`
 * first (a message the hub sends in parts put together and sent whole):
 * a state the scene's hub never stood in, drawn from the hub's own message
 * with what that state changes in it. The route stays the page's, so such a
 * state comes last in its surface.
 */
const hubPatched =
  (
    patch: (message: HubMessage) => HubMessage,
    answer?: (frame: string) => unknown
  ) =>
  async (page: Page) => {
    await page.routeWebSocket(DASHBOARD_SOCKET, (ws) => {
      const hub = ws.connectToServer();
      const parts = new Map<string, string>();
      hub.onMessage((frame) => {
        if (typeof frame !== "string") {
          ws.send(frame);
          return;
        }
        const message = JSON.parse(frame) as HubMessage & {
          part?: { id: string; last: boolean };
          text?: string;
        };
        if (!message.part) {
          ws.send(JSON.stringify(patch(message)));
          return;
        }
        const text = (parts.get(message.part.id) ?? "") + (message.text ?? "");
        if (!message.part.last) {
          parts.set(message.part.id, text);
          return;
        }
        parts.delete(message.part.id);
        ws.send(JSON.stringify(patch(JSON.parse(text) as HubMessage)));
      });
      // What the page asks that `answer` answers in the hub's place; the
      // rest goes to the hub.
      ws.onMessage((frame) => {
        const answered = typeof frame === "string" ? answer?.(frame) : null;
        if (answered) {
          ws.send(JSON.stringify(answered));
          return;
        }
        hub.send(frame);
      });
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.kitHydrated === true);
  };

/**
 * A machine's answer to the page's control `method` (client.svelte.ts
 * `askMachine`), as the hub relays a machine's `control_result`.
 */
const machineAnswer =
  (method: string, result: unknown) =>
  (frame: string): unknown => {
    const asked = JSON.parse(frame) as {
      machineId?: string;
      payload?: { method?: string };
      requestId?: string;
      verb?: string;
    };
    if (!(asked.verb === "control" && asked.payload?.method === method)) {
      return null;
    }
    return {
      verb: "frames",
      machineId: asked.machineId,
      requestId: asked.requestId,
      payload: {
        kind: "control_result",
        ok: true,
        requestId: asked.requestId,
        result,
      },
    };
  };

/**
 * A transcript stored on the machine that no hub row lists (core
 * `NeutralSessionInfo`): Recent's stored row (SessionRow with its info,
 * StoredSessionMenu). The scene's machine lists only its rows' own.
 */
const STORED_SESSION = {
  createdAt: Date.parse("2026-10-12T10:00:00.000Z"),
  cwd: "/home/probe/code/chip-tray",
  firstTitle: "Sketch the tray's empty state",
  harness: "claude",
  lastModified: Date.parse("2026-10-12T11:30:00.000Z"),
  sessionId: "probe-stored-session",
};

/** A hub message, as far as a patch reads it. */
interface HubMessage {
  payload?: { kind?: string; moves?: Record<string, unknown>[] };
}

/** Every move job a message carries (the `instances` frame's, a `moves` frame's), each as `job` makes it. */
const movesAs =
  (job: (was: Record<string, unknown>) => Record<string, unknown>) =>
  (message: HubMessage): HubMessage =>
    Array.isArray(message.payload?.moves)
      ? {
          ...message,
          payload: {
            ...message.payload,
            moves: message.payload.moves.map(job),
          },
        }
      : message;

/**
 * `id`'s last words to it refused because its machine doesn't take the
 * mode it runs on (the scene's sessions run on Bypass permissions), as the
 * hub records such a send (core transcript-rules.ts: `state: "failed"`,
 * `sendModeAsk` naming the refused mode): its row asks for another
 * (MessageRow's Choose a mode). The scene's machine takes every mode.
 */
const modeRefused = (id: string) => (page: Page) =>
  page.route(TRANSCRIPT_READ, async (route) => {
    if (!route.request().url().includes(id)) {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const read = (await response.json()) as {
      blocks?: { metadata?: object; type?: string }[];
    };
    const blocks = read.blocks ?? [];
    const last = blocks.findLastIndex((block) => block.type === "user");
    await route.fulfill({
      response,
      json: {
        ...read,
        blocks: blocks.map((block, i) =>
          i === last
            ? {
                ...block,
                state: "failed",
                metadata: {
                  ...block.metadata,
                  sendModeAsk: {
                    harness: "claude",
                    machineId: MACHINE,
                    refused: SCENE_MODE,
                  },
                },
              }
            : block
        ),
      },
    });
  });

/** The parked move cloning, two fifths of its bytes in (MoveWait's progress bar). */
const MOVE_CLONING = movesAs((job) => {
  const total = Number(job.bytes) || 340 * 1024 * 1024;
  return {
    ...job,
    stage: "clone",
    progress: { bytes: Math.floor(total * 0.4), total },
  };
});
/** The parked move failed at its clone, git's last line its detail. */
const MOVE_FAILED = movesAs((job) => ({
  ...job,
  stage: "failed",
  error: {
    stage: "clone",
    message: "The clone stopped before it finished",
    detail: "fatal: early EOF",
  },
}));

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
 * The side split come to rest after a resize: the side card's box the same
 * over three of the browser's frames (it slides to its new share).
 */
const splitSettled = (page: Page) =>
  page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const card = document.querySelector("[data-slot=side-card]");
        const boxes: string[] = [];
        const read = () => {
          const r = card?.getBoundingClientRect();
          boxes.push(r ? `${r.x},${r.width}` : "");
          if (boxes.length < 3) {
            requestAnimationFrame(read);
            return;
          }
          resolve(new Set(boxes).size === 1);
        };
        requestAnimationFrame(read);
      })
  );

/**
 * The side's divider dragged as a person drags it to the side's floor
 * (side/floor.ts `SIDE_FLOOR_PX`, 320px), and no further: past it the side
 * collapses (Split.svelte, both panes `collapsible`). Then the split at rest.
 */
const SIDE_FLOOR = 320;
const sideToFloor = async (page: Page) => {
  const handle = page
    .locator("[data-slot=side-split] [role=separator]")
    .first();
  const split = await page
    .locator("[data-slot=side-split]")
    .first()
    .boundingBox();
  const grip = await handle.boundingBox();
  if (!(split && grip)) {
    throw new Error("the side split or its divider has no box");
  }
  const y = grip.y + grip.height / 2;
  await page.mouse.move(grip.x + grip.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(split.x + split.width - SIDE_FLOOR - 2, y, {
    steps: 8,
  });
  await page.mouse.up();
  await splitSettled(page);
};

/** The place picker (PlacePick's form). */
const PLACE_PICK = "form[data-slot=place-pick]";
const PLACE_TRIGGER = `${PLACE_PICK} [data-slot=select-trigger]`;

/**
 * The place picker's machines open, from the keyboard (its trigger stands
 * under the pane's pin room, which a pointer meets first), the first one
 * highlighted.
 */
const machinesOpen = async (page: Page) => {
  await askPlace(page);
  const trigger = page.locator(PLACE_TRIGGER).first();
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await page
    .locator("[data-slot=select-content][data-state=open] [role=option]")
    .first()
    .waitFor();
};
/** A context menu's submenu standing open, the Pause until… row and its ends, and a session menu's Account. */
const SUB_MENU = "[data-slot=context-menu-sub-content][data-state=open]";
const PAUSE_UNTIL = /^Pause until/;
const PAUSE_ENDS = /\d/;
const ACCOUNT_ITEM = /^Account/;

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
 * Caw's panel put away, wherever it stands, which the project remembers
 * shut (caw-lead.svelte.ts `open`): on a phone his bottom sheet, which takes
 * every press, by Escape (`cawSheetAway`); beside the page, his seat pressed.
 */
const cawAway = async (page: Page) => {
  await cawSheetAway(page);
  if ((await page.locator(CAW_SEAT_OPEN).count()) > 0) {
    await press(CAW_SEAT)(page);
  }
  await page
    .locator('[data-slot="caw-seat"][aria-expanded="false"]')
    .first()
    .waitFor({ state: "attached" });
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

/** A thread's read (client.svelte.ts `readThread`), and an LFS offer's (`readLfsOffer`). */
const THREAD_READ = /\/api\/projects\/[^/]+\/threads\/[^/]+$/;
const LFS_OFFER = "probe-lfs-offer";
const LFS_OFFER_READ = new RegExp(`/api/lfs-offers/${LFS_OFFER}$`);

/**
 * Every thread read with the hub's note of a folder made a repository, its
 * large files left out (place-repo.ts `noteMade`), after its last message;
 * and the offer it carries read open, a row per pattern (core
 * `LfsOfferState`).
 */
const withLfsOffer = async (page: Page) => {
  await page.route(THREAD_READ, async (route) => {
    const response = await route.fetch();
    const read = (await response.json()) as {
      messages: { createdAt: number; threadId: string }[];
    };
    const last = read.messages.at(-1);
    await route.fulfill({
      response,
      json: {
        ...read,
        messages: [
          ...read.messages,
          {
            id: "probe-repo-made",
            threadId: last?.threadId ?? "",
            createdAt: (last?.createdAt ?? 0) + 60_000,
            author: "event",
            noteTitle: "Made chip-tray a git repository",
            body: "~/code/chip-tray was a plain folder, so CawCo made it a git repository to cut workspaces from.",
            event: {
              kind: "repo",
              root: "~/code/chip-tray",
              machineId: STUDIO_MACHINE,
              commit: "4f2a9c1e7b3d",
              lfsOffer: LFS_OFFER,
            },
          },
        ],
      },
    });
  });
  await page.route(LFS_OFFER_READ, (route) =>
    route.fulfill({
      status: 200,
      json: {
        answer: "open",
        commit: null,
        id: LFS_OFFER,
        root: "~/code/chip-tray",
        rows: [
          {
            bytes: 184 * 1024 * 1024,
            count: 2,
            paths: ["assets/tray-demo.mov", "assets/tray-demo-390.mov"],
            pattern: "*.mov",
          },
        ],
      },
    })
  );
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
 * A comment's composer on the preview, as a person opens one: C turns the
 * pane's Comment mode on, and once the page has heard it (its overlay's
 * layer in comment mode, comments.ts `pageInComment`), a tap on the heading
 * opens the composer beside its hollow pill, writing nothing yet.
 */
const composeOn = async (page: Page) => {
  const segment = page
    .locator("button[aria-keyshortcuts='C']")
    .filter({ visible: true });
  if ((await segment.count()) > 0) {
    await segment.first().focus();
    await page.keyboard.press("c");
  } else {
    // A phone's head stands the mode as one menu (`Mode: Interact`): Comment chosen from it.
    await page
      .locator('button[aria-label^="Mode:"]')
      .filter({ visible: true })
      .first()
      .click();
    await page
      .getByRole("menuitemradio", { name: COMMENT_MODE })
      .filter({ visible: true })
      .first()
      .click();
  }
  const frame = page.frameLocator(PREVIEW_FRAME);
  await frame
    .locator("cawco-overlay .layer.comment")
    .waitFor({ state: "attached" });
  const box = await frame.locator("h1").boundingBox();
  if (!box) {
    throw new Error("the preview's heading has no box");
  }
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2);
  await page
    .locator(COMPOSER_PLACED)
    .filter({ visible: true })
    .first()
    .waitFor();
};

/**
 * A comment on the preview, written: its composer (`composeOn`), words,
 * Comment; then its pill pressed, and its thread opens beside it.
 */
const dropPin = async (page: Page) => {
  await composeOn(page);
  const composer = page
    .locator("[data-slot=pin-composer]")
    .filter({ visible: true })
    .first();
  await composer.getByRole("combobox").fill("Make this heading a bit bigger");
  await composer.getByRole("button", { name: "Comment", exact: true }).click();
  await composer.waitFor({ state: "detached" });
  const frame = page.frameLocator(PREVIEW_FRAME);
  const pill = await frame
    .locator('svg[data-cawco-pins] g[data-pin="1"] [data-face]')
    .boundingBox();
  if (!pill) {
    throw new Error("pin 1's pill has no box");
  }
  await page.mouse.click(pill.x + pill.width / 2, pill.y + pill.height / 2);
  // Its thread stands clear of its pill: beside it where the well allows,
  // else the foot sheet (DESIGN.md, A thread beside its pin). Placed once
  // the page has said where the pill stands (its overlay's `cawco:pin-at`,
  // its box with it).
  const card = page
    .locator(`${PIN_CARD_PLACED}[aria-label="Comment 1"]`)
    .filter({ visible: true })
    .first();
  await card.waitFor();
  const placed = await card.boundingBox();
  if (
    placed &&
    placed.x < pill.x + pill.width &&
    pill.x < placed.x + placed.width &&
    placed.y < pill.y + pill.height &&
    pill.y < placed.y + placed.height
  ) {
    throw new Error(
      `pin 1's thread ${JSON.stringify(placed)} stands over its pill ${JSON.stringify(pill)}`
    );
  }
};

/**
 * The preview's pins `seeds` as its overlay writes them, in the page's own
 * doc, which the hub (or the tape, by the hub's rules, hub-tape.ts) carries
 * to the pane's; and no others ({} clears them all): a comment an earlier
 * state wrote (the "pin" state's), or a pass before this one seeded, stays
 * in the doc across its loads, under the same number. The agent's entries
 * stay as the doc holds them, whatever the seed: a page that writes or
 * drops one is refused whole (core comments.ts `pinsProblem`: "The agent's
 * replies are written by comment_reply, not by the page"). Whether pin 1
 * holds the agent's answer, after.
 */
const writePins = async (
  page: Page,
  seeds: Record<string, object>
): Promise<boolean> => {
  await page.frameLocator(PREVIEW_FRAME).locator("h1").waitFor();
  const handle = await page.locator(PREVIEW_FRAME).first().elementHandle();
  const inner = await handle?.contentFrame();
  if (!inner) {
    throw new Error("the preview's frame has no document");
  }
  await inner.waitForFunction(
    () =>
      !!(window as unknown as { cawcoArtifact?: { doc?: unknown } })
        .cawcoArtifact?.doc
  );
  return await inner.evaluate(
    ({ seeds: wanted, answered }) => {
      interface Entry {
        by: string;
      }
      const { doc } = (
        window as unknown as {
          cawcoArtifact: {
            doc: {
              getMap: (n: string) => {
                delete: (k: string) => void;
                get: (k: string) => { thread?: Entry[] } | undefined;
                keys: () => IterableIterator<string>;
                set: (k: string, v: object) => void;
              };
              transact: (f: () => void) => void;
            };
          };
        }
      ).cawcoArtifact;
      const pins = doc.getMap("pins");
      const agents = (id: string) =>
        (pins.get(id)?.thread ?? []).filter((entry) => entry.by === "agent");
      doc.transact(() => {
        for (const key of [...pins.keys()]) {
          if (!(key in wanted)) {
            pins.delete(key);
          }
        }
        for (const [id, seed] of Object.entries(wanted)) {
          const { thread } = seed as { thread: Entry[] };
          pins.set(id, { ...seed, thread: [...thread, ...agents(id)] });
        }
      });
      return agents(answered).length > 0;
    },
    { seeds, answered: ANSWERED_PIN }
  );
};

/**
 * The Comments' pins seeded (scene.ts `commentPins`), and pin 1 answered as
 * its session answers one, by comment_reply's route, where the doc holds no
 * answer (a pass before this one, on a live fleet, cleared it): once pin 1's
 * row stands in the open rail, the hub has the page's write and the route
 * finds the pin, so its first answer is the one a tape keeps. The session
 * is the pane's, as the state's route names it.
 */
const seedPins = async (page: Page) => {
  if (await writePins(page, commentPins())) {
    return;
  }
  await page
    .locator(`${PIN_LIST} ${PIN_ROW}[data-pin-row="1"]`)
    .first()
    .waitFor();
  const session = new URL(page.url()).pathname.split("/")[2] ?? "";
  const path = `/api/instances/${session}/artifacts/comments/${ANSWERED_PIN}/reply`;
  const said = await page.evaluate(
    async ({ url, text }) =>
      (
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        })
      ).status,
    { url: path, text: PIN_ANSWER }
  );
  if (said >= 300) {
    throw new Error(`pin 1 was not answered: the hub said ${said} to ${path}`);
  }
};

/** The page's pins cleared (`writePins`, none): what a state that reads no pin, or makes pin 1, starts from. */
const clearPins = (page: Page) => writePins(page, {});

/**
 * The Comments rail open (its open state is kept across the walk's loads,
 * so pressed only when it is shut). Open is a rail in the page, whatever
 * its width: one coming in beside the page grows from none, and a press
 * then would shut it.
 */
const panelUp = async (page: Page) => {
  const open = await page
    .locator(PIN_LIST)
    .first()
    .waitFor({ state: "attached", timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  if (!open) {
    await headControl("comments", "Comments")(page);
  }
  await page.locator(PIN_LIST).filter({ visible: true }).first().waitFor();
};

/** The Comments rail open, its pins seeded and drawn, on its Open tab. */
const commentsOpen = async (page: Page) => {
  await panelUp(page);
  await seedPins(page);
  await page.locator(`${PIN_LIST} ${PIN_ROW}[data-moved]`).first().waitFor();
};

/** The panel's tab named `name` chosen. */
const pinsTab = (name: "Open" | "Resolved") => (page: Page) =>
  page
    .locator(`${PIN_LIST} [role=tab]`)
    .filter({ hasText: name })
    .first()
    .click();

/**
 * Pin `n`'s row pressed: its thread opens (beside its pill, or as the foot
 * sheet). Pressed once one rail stands, settled: a pane that crosses 640px
 * (Expand) trades the foot sheet for the rail beside the page, the one
 * going out as the other comes in. What the rail did while it waited is
 * said when it never settles.
 */
const openRow = (n: number) => async (page: Page) => {
  const seen = await page.evaluate(async (railSel) => {
    const frame = () =>
      new Promise<void>((done) => requestAnimationFrame(() => done()));
    const layouts: string[] = [];
    let steady = 0;
    for (let k = 0; k < 240 && steady < 6; k += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one frame after another
      await frame();
      const now = [...document.querySelectorAll(railSel)]
        .map((one) => one.getAttribute("data-layout") ?? "?")
        .join("+");
      if (layouts.at(-1) !== now) {
        layouts.push(now);
      }
      steady = now.split("+").length === 1 && now !== "" ? steady + 1 : 0;
    }
    return { settled: steady >= 6, layouts };
  }, PIN_LIST);
  if (!seen.settled) {
    throw new Error(
      `the rail never stood alone for six frames: ${seen.layouts.join(" → ")}`
    );
  }
  await page.locator(`${PIN_LIST} ${PIN_ROW}[data-pin-row="${n}"]`).click();
};

/** The open card's Close. */
const closePinCard = (page: Page) =>
  page
    .locator("[data-slot=pin-card]")
    .getByRole("button", { name: "Close", exact: true })
    .click();

/**
 * The pane expanded over the split: its head's Expand, pressed where it
 * stands or chosen from More, only while the split is not expanded (Expand
 * is a toggle, kept per page across the walk's loads: pressed on a split
 * already expanded, it would give the split back). Then the slide ends, so
 * what follows reads the pane at its width: a pane that crosses 640px
 * trades the rail's foot sheet for the rail beside the page as it goes.
 */
const expandPane = async (page: Page) => {
  await page.evaluate(() => window.__ssReader?.frames(2));
  if ((await page.locator("[data-split-expanded]").count()) === 0) {
    await headControl("expand", "Expand")(page);
  }
  await page.locator("[data-split-expanded]").first().waitFor();
  await page.waitForFunction(
    () => !document.querySelector("[data-split-sliding]")
  );
  await page.evaluate(() => window.__ssReader?.frames(2));
};

/** Every state of the rail starts from its seeded pins, then runs `steps`. */
const inComments =
  (...steps: ((page: Page) => Promise<unknown>)[]) =>
  async (page: Page) => {
    await commentsOpen(page);
    for (const step of steps) {
      // biome-ignore lint/performance/noAwaitInLoops: one step of the panel at a time
      await step(page);
    }
  };

/**
 * The pane's doc socket held (`hold`: open and never answered, so the rail
 * reads and then draws its skeleton) or refused before it ever synced
 * (`refuse`: the hub's own 4404 and its reason, so the rail says it
 * couldn't read the comments), the page loaded again under it and the rail
 * opened. The route stays on the page, so these states stand last on their
 * surface (each surface walks its own page), refuse after hold (the later
 * route answers first).
 */
const docSocket = (mode: "hold" | "refuse") => async (page: Page) => {
  await page.routeWebSocket(ARTIFACT_DOC_SOCKET, (ws) => {
    if (mode === "refuse") {
      ws.close({ code: 4404, reason: "No such artifact on this hub." });
    }
  });
  await page.reload();
  await page.locator(PREVIEW_FRAME).first().waitFor();
  await panelUp(page);
};

/**
 * The preview's Comment mode on, as a person turns it on: C, with the
 * pane's mode control focused, until the page has heard it (its overlay's
 * layer in comment mode, comments.ts `pageInComment`).
 */
const commentMode = async (page: Page) => {
  const frame = page.frameLocator(PREVIEW_FRAME);
  await frame.locator("h1").waitFor();
  const heard = frame.locator("cawco-overlay .layer.comment");
  if ((await heard.count()) > 0) {
    return;
  }
  await paneKey(page, "c");
  await heard.waitFor({ state: "attached" });
};

/**
 * A key pressed in the preview's pane, as its shortcuts hear it (PreviewPane
 * `paneKey`: only from inside the pane): the mode control focused where the
 * head stands it, else the head's artifact name.
 */
const paneKey = async (page: Page, key: string) => {
  const mode = page
    .locator("[aria-keyshortcuts='C']")
    .filter({ visible: true });
  const inPane =
    (await mode.count()) > 0
      ? mode.first()
      : page
          .locator("[data-artifact-trigger]")
          .filter({ visible: true })
          .first();
  await inPane.focus();
  await page.keyboard.press(key);
};

/**
 * One comment on the preview's `target`: its composer opened by a press,
 * its words written and Enter: the pin stands with its words, the composer
 * gone.
 */
const pinWith = async (page: Page, target: string, words: string) => {
  await commentMode(page);
  const box = await page
    .frameLocator(PREVIEW_FRAME)
    .locator(target)
    .boundingBox();
  if (!box) {
    throw new Error(`the preview's ${target} has no box`);
  }
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2);
  const composer = page
    .locator("[data-slot=pin-composer]")
    .filter({ visible: true })
    .first();
  const field = composer.getByRole("combobox");
  await field.fill(words);
  await field.press("Enter");
  await composer.waitFor({ state: "detached" });
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
/**
 * The `/motion/` and `/dev/` benches, each read as it opens. Each draws in
 * the reader's theme, which the walk's page sets as any page's
 * (`cawco-theme`): a bench that set its own from a `?theme=` it was never
 * given drew light under every dark pass. `/motion/seed-tabs` is none: it
 * draws nothing and sends a preview on to a session (its `?ids=`).
 */
/** A bench's own page inside the shell's content (its `main`, under the shell's). */
const BENCH_MAIN = "main#main-content main";
/** Each bench: its name, its route, and what only it draws. */
const BENCHES: [string, string, string][] = [
  ["button-pending", "/motion/button-pending", "button[data-case=label-cycle]"],
  ["caw", "/motion/caw", `${BENCH_MAIN} [data-slot=stage]`],
  [
    "caw-notices",
    "/motion/caw-notices?fixture=full",
    `${BENCH_MAIN} [data-slot=controls]`,
  ],
  ["chosen-hover", "/motion/chosen-hover", "[data-bench]"],
  ["delegate-tray", "/motion/delegate-tray", "[data-delegate-tray]"],
  ["echo", "/motion/echo", `${BENCH_MAIN} li[data-row]`],
  [
    "folder-proof",
    "/motion/folder-proof?at=1&work=working",
    "[data-folder-proof]",
  ],
  ["head-tint", "/motion/head-tint", "[data-head-tint]"],
  ["lift", "/motion/lift", `${BENCH_MAIN} section[data-case]`],
  [
    "mac-readiness",
    "/motion/mac-readiness",
    'nav[aria-label="Readiness state"]',
  ],
  ["new-session", "/motion/new-session", `${BENCH_MAIN} h1`],
  ["overlays", "/motion/overlays", `${BENCH_MAIN} [data-slot=openers]`],
  ["recall", "/motion/recall", "main#main-content form[data-slot=cin]"],
  [
    "session-limit",
    "/motion/session-limit",
    "[data-session-limit-bench] [data-case]",
  ],
  ["traffic", "/motion/traffic", "main#main-content header h1"],
  ["updates", "/motion/updates", "[data-slot=updates-page-card]"],
  ["usage-limits", "/motion/usage-limits", "[data-usage-bench] > *"],
  [
    "usage-relay",
    "/motion/usage-relay",
    'nav[aria-label="Usage popover bench"]',
  ],
  ["finder", "/dev/finder", 'main ol[aria-label="Sent"]'],
  ["artifact-head", "/motion/artifact-head", "[data-bench-pane]"],
  ["breath-floor", "/motion/breath-floor", "[data-breather=catch-up]"],
  ["pointer-hit", "/motion/pointer-hit", "[data-probe-hit]"],
  [
    "prompt-head",
    "/motion/prompt-head",
    "main#main-content section[data-slot=hitl]",
  ],
  ["side-head", "/motion/side-head", "[data-card]"],
  ["signin-problem", "/motion/signin-problem", "[data-bench]"],
  ["step-ink", "/motion/step-ink", "[data-ink]"],
];
/**
 * The overlays bench's layers, each opened from its own opener
 * (`data-open`) and standing open: what each kit overlay draws open (its
 * content, its overlay, its parts).
 */
const OVERLAYS: [string, string][] = [
  ["sheet", "[data-slot=sheet-content][data-state=open]"],
  ["dialog", OPEN_DIALOG],
  ["alert-dialog", "[role=alertdialog][data-state=open]"],
  ["drawer", "[data-slot=drawer-content][data-state=open]"],
  ["dropdown-menu", OPEN_MENU],
  ["popover", OPEN_POPOVER],
  ["select", "[data-slot=select-content][data-state=open] [role=option]"],
  ["context-menu", OPEN_MENU],
];
/** A bench's states past its rest, by the bench's name. */
const BENCH_STATES: Record<string, State[]> = {
  overlays: OVERLAYS.map(([layer, open]): State => ({
    name: layer,
    act: (page) =>
      page
        .locator(`[data-open="${layer}"]`)
        .first()
        .click(layer === "context-menu" ? { button: "right" } : {}),
    root: "body",
    ready: { shows: open },
  })),
};

/** The session's Files: the bar's on a desk, the rail's Files row on a phone (its drawer). */
const openFiles = async (page: Page) => {
  const bar = page.locator("[data-files-control]").filter({ visible: true });
  if ((await bar.count()) > 0) {
    await bar.first().click();
    return;
  }
  await openRail(page);
  await page.locator("[data-sidebar-files]").first().click();
};
/** The config sections, each with its page's title (SectionFrame's `h1`, sections.ts `label`). */
const CONFIG: [string, string][] = [
  ["accounts", "Accounts"],
  ["cli-tools", "Command-line tools"],
  ["connections", "Connections"],
  ["delegate-types", "Delegate types"],
  ["devices", "Devices"],
  ["hooks", "Hooks"],
  ["mcp", "MCP servers"],
  ["memory", "Memory files"],
  ["models", "Models CawCo uses"],
  ["phone", "Phone"],
  ["previews", "Previews"],
  ["rules", "Rules"],
  ["browsers", "Browsers"],
  ["skills", "Skills & plugins"],
  ["spend", "Spend"],
  ["subagents", "Subagents"],
  ["updates", "Updates"],
];
/** A config section's page title, and a section's rows while the fleet is still being read. */
const SECTION_TITLE = "h1[data-slot=title]";
const SKELETON = "[data-slot=skeleton]";
/** An editor's own field, by its accessible name. */
const field = (name: string) => `[aria-label="${name}"]`;
/** The page at exactly `path`. */
const at = (path: string) =>
  new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

/** Each `new` editor's own field, by section. */
const NEW_FIELD: Record<string, string> = {
  hooks: field("Hook name"),
  mcp: field("Server name"),
  subagents: field("new-subagent definition"),
  "delegate-types": field("Delegate type name"),
};

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
          ready: {
            shows: NEW_FIELD[section] as string,
            path: at(`/config/${section}/new`),
          },
        },
        // The scene's own: the hook saved twice (its previous version), the MCP server.
        ...(section === "hooks"
          ? [
              {
                name: "hook",
                route: (s: Scene) => `/config/hooks/${s.hook}`,
                root: "body",
                ready: (s: Scene) => ({
                  shows: `${field("Hook name")}, [data-delete]`,
                  path: at(`/config/hooks/${s.hook}`),
                }),
              },
            ]
          : []),
        // The scene's hook while the hooks are still read: the editor's
        // skeleton (EditorRoute). Last (its route stays).
        ...(section === "hooks"
          ? [
              {
                name: "editor-reading",
                route: (s: Scene) => `/config/hooks/${s.hook}`,
                act: reloadedWith((page) =>
                  neverAnswered(page, HOOKS_READ, HOOKS_READ_PATH)
                ),
                root: "body",
                ready: { shows: `main ${SKELETON}`, not: field("Hook name") },
              },
            ]
          : []),
        // A new delegate type's model: its combobox open, the models to search.
        ...(section === "delegate-types"
          ? [
              {
                name: "model",
                route: () => "/config/delegate-types/new",
                act: (page: Page) =>
                  page
                    .getByRole("combobox", { name: MODEL_CHIP })
                    .filter({ visible: true })
                    .first()
                    .click(),
                root: "body",
                ready: { shows: "[data-slot=command-input]" },
              },
            ]
          : []),
        // A new server that runs remote: its transport and its headers' rows.

        ...(section === "mcp"
          ? [
              {
                name: "editor-remote",
                route: () => "/config/mcp/new",
                act: (page: Page) =>
                  page
                    .locator("[data-slot=toggle-group-item][data-value=remote]")
                    .first()
                    .click(),
                root: "body",
                ready: {
                  shows: "fieldset:has(> legend) input[aria-label$=' name']",
                },
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
                ready: {
                  shows: "[data-slot=empty]",
                  says: SIGN_IN_UNFINISHED,
                },
              },
            ]
          : []),
      ],
    ])
  ),
  skills: [
    {
      name: "fetch",
      act: press(FETCH_SKILL),
      root: "body",
      ready: {
        shows: `${OPEN_POPOVER} [data-slot=input], ${OPEN_DIALOG} [data-slot=input]`,
      },
    },
    {
      // The adopted skill's Remove everywhere: gone from the list at once,
      // Undo in its toast (no ask: deletes.ts).
      name: "removed",
      act: deletedFrom(MORE_FOR_SKILL, "Remove everywhere"),
      restore: undoDelete('[aria-label="More for tray-check"]'),
      root: "body",
      ready: {
        shows: TOAST,
        says: /tray-check[\s\S]*Undo/,
        not: '[aria-label="More for tray-check"]',
      },
    },
  ],
  memory: [
    {
      name: "new",
      act: press(NEW_MEMORY),
      root: "body",
      ready: {
        shows: `${OPEN_POPOVER} [data-slot=field-field], ${OPEN_DIALOG} [data-slot=field-field]`,
      },
    },
    {
      // A filter nothing matches: the page's own line saying so.
      name: "filtered",
      act: (page) =>
        page
          .getByRole("textbox", { name: "Filter memory files" })
          .fill("no-such-file"),
      root: "body",
      // The kit's EmptyState, its title naming the filter.
      ready: {
        shows: "[data-slot=empty] [data-slot=empty-title]",
        says: /no-such-file/,
      },
    },
    // The fleet's memory in its editor.
    {
      name: "editor",
      route: () => "/config/memory/CLAUDE.md",
      root: "body",
      ready: {
        shows:
          '[aria-label^="File: "][aria-label$="/CLAUDE.md"], [data-slot=crepe-host]',
        path: at("/config/memory/CLAUDE.md"),
      },
    },
    {
      // The same, with no machine at all: where it lands, a link to add one.
      name: "editor-no-machine",
      hub: "unregistered",
      route: () => "/config/memory/CLAUDE.md",
      root: "body",
      // On a phone the editor's sections stack, and where it lands is the last, past the fold.
      inView: "[data-slot=empty]",
      // The shared kit EmptyState (NoMachines), its title saying it.
      ready: {
        shows: "[data-slot=empty]",
        says: NO_MACHINES,
        path: at("/config/memory/CLAUDE.md"),
      },
    },
    {
      // The memory's Delete everywhere: its row gone at once, Undo in its
      // toast (no ask: deletes.ts).
      name: "deleted",
      act: deletedFrom(MORE_FOR_MEMORY, "Delete everywhere"),
      restore: undoDelete('[aria-label$="CLAUDE.md"][aria-label^="More for"]'),
      root: "body",
      ready: {
        shows: TOAST,
        says: /CLAUDE\.md[\s\S]*Undo/,
        not: '[aria-label$="CLAUDE.md"][aria-label^="More for"]',
      },
    },
    {
      // The fleet not read yet: the section's skeleton rows, the hub's
      // answer held back on its tape (scene.ts `HOLDS`).
      name: "reading",
      hub: "reading",
      root: "body",
      ready: { shows: SKELETON },
    },
  ],
  rules: [
    {
      name: "editor",
      route: () => "/config/rules/new",
      root: "body",
      ready: { shows: field("Rule name"), path: at("/config/rules/new") },
    },
    // The scene's rule: what it has caught.
    {
      name: "rule",
      route: (s) => `/config/rules/${s.rule}`,
      root: "body",
      ready: (s) => ({
        shows: field("Rule name"),
        path: at(`/config/rules/${s.rule}`),
      }),
    },
  ],
  accounts: [
    {
      name: "new",
      route: () => "/config/accounts/new",
      root: "body",
      ready: {
        shows: "ol[aria-label=Steps] li[aria-current=step]",
        says: /^Provider$/,
      },
    },
    {
      name: "account",
      route: (s) => `/config/accounts/${s.account}`,
      root: "body",
      ready: (s) => ({
        shows: field("Nickname"),
        path: at(`/config/accounts/${s.account}`),
      }),
    },
    {
      // The second account, signed in on the machine.
      name: "second",
      route: (s) => `/config/accounts/${s.second}`,
      root: "body",
      ready: (s) => ({
        shows: field("Nickname"),
        path: at(`/config/accounts/${s.second}`),
      }),
    },
    {
      // A Claude account signed in nowhere: its Sign in on the machine, the
      // link to open and the code to paste.
      name: "sign-in",
      route: (s) => `/config/accounts/${s.spare}`,
      act: press(SIGN_IN_ON),
      root: "body",
      ready: { shows: field("Code from the sign-in page") },
    },
    {
      // A GitHub Copilot account signed in nowhere: its Sign in on the
      // machine, the device code's start (its popover and Start sign-in).
      name: "device-sign-in",
      route: (s) => `/config/accounts/${s.copilot}`,
      act: press(SIGN_IN_ON),
      root: "body",
      ready: (s) => ({
        shows: `${NS_POP}[id^="signin-"] button`,
        says: START_SIGN_IN,
        path: at(`/config/accounts/${s.copilot}`),
      }),
    },
    {
      name: "routing",
      route: () => "/config/accounts/anthropic/routing",
      root: "body",
      ready: {
        shows: "[role=radio][aria-checked=true]",
        not: '[aria-label$="Arrow keys move it."]',
        path: at("/config/accounts/anthropic/routing"),
      },
    },
    {
      // Fill first chosen: its order of the two accounts.
      name: "fill-first",
      route: () => "/config/accounts/anthropic/routing",
      act: (page) => page.getByRole("radio", { name: FILL_FIRST }).click(),
      root: "body",
      ready: { shows: '[aria-label$="place 1 of 3. Arrow keys move it."]' },
    },
    {
      // A new account by API key (a provider the machine's OpenCode runs),
      // on to signing in: the key's field and the machines it goes to.
      name: "key",
      route: () => "/config/accounts/new",
      act: toKeyStep,
      root: "body",
      ready: { shows: field("API key") },
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
          .getByRole("textbox", { name: accountsWords.key.label })
          .fill("probe-302-key");
        await press(accountsWords.key.send)(page);
        await page.getByText(accountsWords.key.sent).first().waitFor();
      },
      root: "body",
      ready: { shows: "span", says: exactly(accountsWords.key.sent) },
    },
  ],
};

export const SURFACES: Surface[] = [
  {
    name: "home",
    serve: "built",
    route: () => "/",
    states: [
      {
        name: "rest",
        root: "body",
        ready: { shows: HOME, not: `${HOME} [role=status]` },
      },
      {
        // Recent unfolded: the sessions and the stored ones, newest first.
        name: "recent",
        act: async (page) => {
          await recentOpen(page);
        },
        root: "body",
        inView: "[data-slot=home-recent-session-tree]",
        ready: { shows: "[data-slot=home-recent-session-tree] li" },
      },
      // The fleet not read yet: the home's first line says so (StatusLine,
      // until the home's reads are in: home-state.svelte.ts `ready`). The
      // hub's own `reading` holds `/api/fleet` (scene.ts `HOLDS`), which only
      // Configure reads: the home's first read (client.svelte.ts `refresh`:
      // machines, sessions and projects together) went through, and the
      // line never stood. Its projects held as well, the home stays reading.
      // Alone on this hub in its surface, so the hold stays with no other state.
      {
        name: "reading",
        hub: "reading",
        act: reloadedWith((page) =>
          neverAnswered(page, PROJECTS_READ, PROJECTS_READ_PATH)
        ),
        root: "body",
        ready: {
          shows: `${HOME} [role=status]`,
          says: /^Reading the fleet…$/,
        },
      },
      {
        name: "machines",
        widths: ["desk"],
        act: press(/machine/),
        root: LAYER,
        ready: { shows: MACHINES_POPOVER, not: UNLOCK_TILE },
      },
      {
        // The offline Mac's menu in the machines list: Unlock keychain…, its dialog.
        name: "keychain",
        widths: ["desk"],
        act: openKeychain,
        root: "body",
        ready: { shows: `${UNLOCK_TILE} input[aria-label^="Login password"]` },
      },
      {
        // The offline Mac's menu, its Pause until… opened: each end beside its clock.
        name: "machine-pause",
        widths: ["desk"],
        act: async (page) => {
          await press(MACHINES)(page);
          await page
            .locator(LAYER)
            .getByText(STUDIO_HOST, { exact: true })
            .first()
            .click({ button: "right" });
          await page.getByRole("menuitem", { name: PAUSE_UNTIL }).click();
        },
        root: "body",
        ready: { shows: SUB_MENU, says: PAUSE_ENDS },
      },
      {
        // The machines list's Add machine: its window on Route, then on
        // Reach by a command (the hub's addresses, one per kind, and the line).
        name: "add-machine",
        widths: ["desk"],
        act: async (page) => {
          await press(MACHINES)(page);
          await press(ADD_MACHINE)(page);
          await page
            .locator(`${CONNECT_WINDOW} button[data-route=command]`)
            .click();
        },
        root: "body",
        ready: {
          shows: `${CONNECT_WINDOW}[data-step=reach] #connect-reaches`,
          says: /^It reaches the hub at$/,
        },
      },
      // The studio online and its keychain's unlock sent (`studioRouted`,
      // which stays the page's: these come last on this hub).
      {
        // The Mac yet to answer: the unlock under way (MachineAuthStatus waiting).
        name: "unlocking",
        widths: ["desk"],
        act: unlockStudio(),
        root: "body",
        ready: {
          shows: `${UNLOCK_TILE} [data-slot=title]`,
          says: /^Unlocking /,
        },
      },
      {
        // Answered unlocked, its logins read: the check.
        name: "unlocked",
        widths: ["desk"],
        act: unlockStudio("authenticated"),
        root: "body",
        ready: {
          shows: `${UNLOCK_TILE} [role=status]:has([data-tone=ok])`,
          says: / is unlocked/,
        },
      },
      {
        // Answered unlocked, its logins still unreadable: the warning.
        name: "unlock-unreadable",
        widths: ["desk"],
        act: unlockStudio("unreadable-credentials"),
        root: "body",
        ready: {
          shows: `${UNLOCK_TILE} [role=status]:has([data-tone=caution])`,
          says: / cannot read its logins/,
        },
      },
      {
        // Recent unfolded with a transcript stored on the machine that no
        // row lists: its stored row among the sessions. Last on this hub (its
        // route stays).
        name: "recent-stored",
        act: async (page) => {
          await hubPatched(
            (message) => message,
            machineAnswer("listSessions", [STORED_SESSION])
          )(page);
          await recentOpen(page);
        },
        root: "body",
        inView: "[data-slot=home-recent-session-tree]",
        ready: {
          shows: "[data-slot=home-recent-session-tree] li",
          says: STORED_TITLE,
        },
      },
      {
        // The hub's socket open and silent on its tape (scene.ts `HOLDS`):
        // the status line, on the way.
        name: "connecting",
        hub: "silent",
        root: "body",
        ready: { shows: "[data-slot=hub-band]" },
        // The band names the page's own address (client.svelte.ts
        // `hubSocketUrl`: `location.host`), the walk's server on a port of
        // its run, so two runs printed two pictures.
        mask: (page) => [page.locator("code", { hasText: SOCKET_URL })],
      },
    ],
  },
  {
    // The top bar alone, its glass group included (Shell's
    // `data-slot="top"`): on a phone's home, and over a conversation's tabs
    // (hosting them on a desk, floating over them on a phone). The bar
    // glass's own compare against the base reads it at both widths.
    name: "top-bar",
    serve: "built",
    route: () => "/",
    states: [
      {
        // The home is the page under the drawer's width alone: `/` goes on
        // to `/session` (routes/(app)/+page.server.ts), which a desk opens
        // on the workspace's conversation (top-bar/session's).
        name: "home",
        widths: ["phone"],
        root: TOP_BAR,
        ready: { shows: `body:has(${HOME}) ${TOP_BAR}`, path: /^\/session$/ },
      },
      {
        name: "session",
        widths: ["desk", "phone"],
        route: (s) => `/session/${s.todo}`,
        root: TOP_BAR,
        ready: { shows: TOP_BAR, path: /^\/session\// },
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
        root: RAIL,
        ready: { shows: RAIL_SHOWN, not: OPEN_MENU },
      },
      {
        name: "sort",
        act: async (page) => {
          await openRail(page);
          await press(SORT)(page);
        },
        root: LAYER,
        ready: {
          shows: `${OPEN_MENU}[data-slot=dropdown-menu-content]`,
          says: /Last activity/,
        },
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
        ready: { shows: `${OPEN_MENU}[data-slot=context-menu-content]` },
      },
      {
        // A session row under the pointer: its hover card.
        name: "row-hover",
        act: (page) =>
          page.getByRole("link", { name: IDLE_ROW }).first().hover(),
        root: "body",
        widths: ["desk"],
        ready: { shows: "[data-nest-host]:has([data-session-hover-tone])" },
      },
      {
        // The row's menu, its Account opened: the accounts it can run on.
        name: "row-account",
        act: async (page) => {
          await page
            .getByRole("link", { name: IDLE_ROW })
            .first()
            .click({ button: "right" });
          await page.getByRole("menuitem", { name: ACCOUNT_ITEM }).click();
        },
        root: "body",
        widths: ["desk"],
        ready: { shows: `${SUB_MENU} [role=menuitemradio]` },
      },
      {
        // The same fleet two days on: the project's stopped sessions past
        // its day, beyond its six rows, under "N older". Last (the page's
        // clock stays where it moved).
        name: "older",
        act: async (page) => {
          const now = await page.evaluate(() => Date.now());
          await page.clock.setFixedTime(now + LATER);
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForFunction(() => window.kitHydrated === true);
          await openRail(page);
        },
        root: RAIL,
        // Below the fold at the desk, under the project's six rows.
        inView: OLDER_ROW,
        ready: { shows: OLDER_ROW, says: /older$/ },
      },
    ],
  },
  {
    name: "usage-popover",
    serve: "built",
    route: () => "/",
    states: [
      {
        name: "open",
        act: press(/Show every limit/),
        root: LAYER,
        // The rail's popover on a desk, a bottom sheet on a phone.
        ready: {
          shows: `body:has([data-strip-hit][aria-expanded=true]) :is(${OPEN_POPOVER}, [data-slot=drawer-content][data-state=open])`,
        },
      },
    ],
  },
  {
    name: "session",
    serve: "built",
    route: (s) => `/session/${s.chips}`,
    states: [
      {
        name: "rest",
        root: "body",
        ready: (s) => ({
          shows: on(s.chips, `${MAIN} [role=log]`),
          not: `${LAYER}, [data-slot=trow][aria-expanded=true]`,
        }),
      },
      // Turns still going as the walk reads them (scene.ts `SLOW_MS`), read
      // early: one answering a rule's reply (its row above), one still thinking.
      {
        name: "live",
        route: (s) => `/session/${s.todo}`,
        root: MAIN,
        ready: (s) => ({ shows: on(s.todo, STOP_AGENT) }),
      },
      {
        name: "live-thinking",
        route: (s) => `/session/${s.liveThink}`,
        root: MAIN,
        ready: (s) => ({ shows: on(s.liveThink, STOP_AGENT) }),
      },
      // A finished turn's thinking, opened: its steps.
      {
        name: "thinking",
        route: (s) => `/session/${s.think}`,
        act: press(REASONING),
        root: MAIN,
        ready: (s) => ({
          shows: on(
            s.think,
            "[data-slot=thinking-steps-content][data-state=open]"
          ),
        }),
      },
      // Compacted: the divider where the summary starts.
      {
        name: "compacted",
        route: (s) => `/session/${s.compact}`,
        root: MAIN,
        ready: (s) => ({
          shows: on(s.compact, '[aria-label="Compacted, show the summary"]'),
        }),
      },
      // The plan's ring pressed: its steps in the side panel.
      {
        name: "plan",
        route: (s) => `/session/${s.planned}`,
        act: press(PLAN_RING),
        root: "body",
        ready: (s) => ({
          shows: on(
            s.planned,
            "ul[data-slot=rows] li[data-status]",
            "[data-slot=plan-ring][aria-pressed=true]"
          ),
        }),
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
        ready: (s) => ({
          shows: on(s.chips, "button[data-slot=trow][aria-expanded=true]"),
        }),
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
        ready: (s) => ({
          // Its three lines in the field: the composer grown to hold them
          // (`data-grown` is the ask's, not the draft's).
          shows: on(s.chips, "form[data-slot=cin]"),
          says: GROWN_DRAFT,
        }),
      },
      {
        // The menu itself: LAYER's largest open `-content` stood for it, a
        // 28px strip of the composer, while the menu was shut.
        name: "attach-menu",
        act: press("Attach or draw"),
        root: OPEN_MENU,
        ready: { shows: OPEN_MENU, says: /Files and photos[\s\S]*Draw/ },
      },
      {
        // An @ in the composer: the mention menu.
        name: "mention",
        act: async (page) => {
          await emptyComposer(page);
          await page.keyboard.type("@");
        },
        root: "body",
        ready: {
          shows:
            '[role=listbox][aria-label="Name a session, thread or machine"] [role=option]',
        },
      },
      {
        // Up in an empty composer: the recall wheel over what was sent.
        name: "recall",
        act: async (page) => {
          await emptyComposer(page);
          await page.keyboard.press("ArrowUp");
        },
        root: "body",
        ready: {
          shows:
            '[role=listbox][aria-label="What you sent here"] [role=option][aria-selected=true]',
        },
      },
      {
        // The Write card's change opened whole.
        name: "diff",
        act: async (page) => {
          await press(WROTE_ROW)(page);
          await press(OPEN_DIFF)(page);
        },
        root: "body",
        ready: { shows: DIFF_DIALOG, says: /chip\.css/, not: RAIL_SHEET },
      },
      {
        name: "session-card",
        act: async (page) => {
          await page.keyboard.press("Escape");
          await page.focus("[data-chosen] [data-session-tab]");
          await page.keyboard.press("ArrowDown");
        },
        root: "[data-session-details-popover][data-state=open]",
        ready: {
          shows: '[aria-label="Session details"][data-state=open]',
        },
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
        ready: { shows: `${OPEN_MENU}[data-tab-menu]` },
      },
      {
        name: "question",
        route: (s) => `/session/${s.ask}`,
        root: MAIN,
        ready: (s) => ({
          shows: on(
            s.ask,
            `${HITL}[data-prompt-shown][aria-label^="Question"]`
          ),
        }),
      },
      {
        name: "answered",
        route: (s) => `/session/${s.answered}`,
        root: MAIN,
        ready: (s) => ({
          shows: on(s.answered, `${HITL}[data-frame][aria-label^="Question"]`),
          not: `${HITL}[data-prompt-shown]`,
        }),
      },
      {
        name: "permission",
        route: (s) => `/session/${s.permission}`,
        root: MAIN,
        ready: (s) => ({
          shows: on(
            s.permission,
            `${HITL}[data-prompt-shown][aria-label^="Permission request"]`
          ),
        }),
      },
      {
        // A move nobody said yes to (the tray project to the second online
        // machine): its session's pane is the staged wait, the approval
        // asked in its first step.
        name: "move-ask",
        hub: "moving",
        route: (s) => `/session/${s.moving}`,
        root: MAIN,
        ready: (s) => ({ shows: on(s.moving, MOVE_WAIT) }),
      },
      {
        // The same move said yes to and cloning: its bytes so far.
        name: "move-cloning",
        hub: "moving",
        route: (s) => `/session/${s.moving}`,
        act: hubPatched(MOVE_CLONING),
        root: MAIN,
        ready: (s) => ({
          shows: on(s.moving, "[data-slot=wait] [data-slot=progress]"),
        }),
      },
      {
        // The same move failed at its clone: what stopped it.
        name: "move-failed",
        hub: "moving",
        route: (s) => `/session/${s.moving}`,
        act: hubPatched(MOVE_FAILED),
        root: MAIN,
        ready: (s) => ({
          shows: on(s.moving, "[data-slot=wait] [data-slot=alert-title]"),
        }),
      },
      {
        // A / in the composer: the skills and commands the session lists.
        name: "slash",
        act: async (page) => {
          await emptyComposer(page);
          await page.keyboard.type("/");
        },
        root: "body",
        ready: {
          shows: "#composer-menu [data-slot=command-item]",
        },
      },
      {
        // The delegate it started, reported back: its card opened, its transcript inline.
        name: "delegate",
        route: (s) => `/session/${s.split}`,
        act: press(DELEGATE_CARD),
        root: MAIN,
        hostOnly: "delegate",
        ready: (s) => ({
          shows: on(s.split, "button[aria-expanded=true]"),
          says: DELEGATE_CARD,
        }),
      },
      {
        // CawCo's fleet-memory read, its card opened: the memory it read.
        name: "memory-tool",
        route: (s) => `/session/${s.memoryRead}`,
        act: press(MEMORY_ROW),
        root: MAIN,
        ready: (s) => ({
          shows: on(s.memoryRead, OPEN_TOOL_ROW),
          says: MEMORY_ROW,
        }),
      },
      {
        // A skill the session ran, its card opened: what it was asked.
        name: "skill-tool",
        route: (s) => `/session/${s.skillRun}`,
        act: press(SKILL_ROW),
        root: MAIN,
        ready: (s) => ({
          shows: on(s.skillRun, OPEN_TOOL_ROW),
          says: SKILL_ROW,
        }),
      },
      {
        // The workflow run it started: the RunBlock and its steps.
        name: "run-block",
        route: (s) => `/session/${s.runner}`,
        root: MAIN,
        ready: (s) => ({ shows: on(s.runner, RUN_BLOCK) }),
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
        // Its chip in the composer's attachments, over the field: the chip's
        // body opens the text (AttachmentChips, one pill for every kind).
        ready: (s) => ({
          shows: on(
            s.chips,
            '[data-slot=composer] [data-atts] button[aria-label="Open chip-notes.txt"]'
          ),
        }),
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
        ready: { shows: "iframe[title='Canvas']" },
      },
      {
        // Its last send refused, its machine not taking its mode: the row's
        // Choose a mode pressed, the session's own picker open (ModePick).
        // Before the last (its routes stay).
        name: "mode-ask",
        act: async (page, scene) => {
          await reloadedWith(modeRefused(scene.chips))(page);
          await pressInTranscript(page, CHOOSE_A_MODE);
        },
        root: "body",
        ready: { shows: `${NS_POP} [data-perm]` },
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
        ready: (s) => ({ shows: on(s.chips, "[data-slot=behind]") }),
      },
    ],
  },
  {
    name: "project",
    serve: "built",
    route: (s) => `/project/${s.project}`,
    states: [
      {
        name: "rest",
        root: "body",
        ready: { shows: BOARD, not: CAW_SEAT_OPEN },
      },
      {
        name: "more-menu",
        act: async (page) => {
          await cawSheetAway(page);
          await press(MORE_FOR_CAWCO)(page);
        },
        root: LAYER,
        ready: {
          shows: OPEN_MENU,
          says: /Project details…[\s\S]*Forget project…/,
        },
      },
      {
        // The ⋯ menu's upstream choice opened: whose repositories its
        // sessions may post to.
        name: "upstream",
        act: async (page) => {
          await cawSheetAway(page);
          await press(MORE_FOR_CAWCO)(page);
          await page.getByRole("menuitem", { name: UPSTREAM }).click();
        },
        root: "body",
        widths: ["desk"],
        ready: {
          shows: "[data-slot=dropdown-menu-sub-content][data-state=open]",
        },
      },
      // Caw's seat: his thread beside the board.
      {
        name: "caw",
        act: openCaw,
        root: "body",
        ready: { shows: `body:has(${CAW_SEAT_OPEN}) ${CAW_COMPOSER}` },
      },
      // The note pasted in his thread, opened in the lightbox's document view.
      {
        name: "caw-note",
        act: inCawThread(press(THREAD_NOTE)),
        root: "body",
        ready: {
          shows: `${OPEN_DIALOG}:has([data-slot=doc-body])`,
          says: /phone-notes\.txt/,
        },
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
        // Beside the board on a desk (a side card), the page on a phone.
        ready: { shows: '[data-folder-file="notes/tray-brief.md"]' },
      },
      // The ⋯ menu's rows: the project's details, Caw's settings, its stages, and the forget it asks.
      {
        name: "details",
        act: fromMore("Project details…"),
        root: "body",
        ready: { shows: 'section[aria-label="Project details"]' },
      },
      {
        name: "caw-settings",
        act: fromMore("Caw settings…"),
        root: "body",
        ready: { shows: "[data-slot=caw-panel] [role=switch]" },
      },
      {
        name: "stages",
        act: fromMore("Pick stages…"),
        root: "body",
        ready: {
          shows: "[data-slot=lead]",
          says: /^This project has no stages of its own yet$/,
        },
      },
      {
        name: "forget",
        act: fromMore("Forget project…"),
        root: "body",
        ready: { shows: "section[data-stop-tray] [data-stop-confirm]" },
      },
      {
        name: "new",
        route: () => "/project/new",
        root: MAIN,
        ready: {
          shows: '[data-placeholder^="A repo, a launch, a brand"]',
          path: /^\/project\/new$/,
        },
      },
      {
        // A folder the project placed made a repository, its large files
        // left out: Caw's note, Git LFS offered under it (LfsOfferActions).
        // The scene placed none, so its thread is read with the note the hub
        // files then (place-repo.ts `noteMade`), and the offer as the hub
        // answers it. Before the last (its routes stay).
        name: "caw-lfs",
        act: async (page) => {
          await reloadedWith(withLfsOffer)(page);
          await openCaw(page);
        },
        root: "body",
        inView: "[data-lfs-pattern]",
        ready: { shows: "[data-lfs-pattern]" },
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
        ready: { shows: "p[role=status]", says: /^Reading what runs in / },
      },
    ],
  },
  {
    name: "board",
    serve: "built",
    route: (s) => `/project/${s.project}`,
    states: [
      {
        name: "rest",
        root: MAIN,
        ready: { shows: BOARD, not: `${BULK_BAR}, ${OPEN_POPOVER}` },
      },
      {
        name: "filter",
        act: press("Filter"),
        root: LAYER,
        widths: ["desk"],
        ready: { shows: `${OPEN_POPOVER} input[aria-label="Find a task"]` },
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
        ready: { shows: BULK_BAR, not: OPEN_POPOVER },
      },
      // A column's Add task pressed: the new task's form, open in its column.
      {
        name: "new-task",
        act: press(ADD_TASK),
        root: MAIN,
        ready: { shows: `${BOARD} input[aria-label="Task title"]` },
      },
      // The Archived rail open, the bulk bar's two popovers, the stages picker.
      {
        name: "archive",
        act: press(ARCHIVED_RAIL),
        root: MAIN,
        ready: { shows: "[data-rail-open] [data-slot=rail-close]" },
      },
      {
        name: "drop",
        act: pickThen(BULK_DROP),
        root: LAYER,
        widths: ["desk"],
        ready: { shows: `${OPEN_POPOVER} form[data-slot=drop]` },
      },
      {
        name: "label",
        act: pickThen(BULK_LABEL),
        root: LAYER,
        widths: ["desk"],
        ready: { shows: `${OPEN_POPOVER} input[aria-label="Label to add"]` },
      },
      {
        name: "stages",
        act: async (page) => {
          await press(PROJECT_MORE)(page);
          await page.getByRole("menuitem", { name: PICK_STAGES }).click();
        },
        root: LAYER,
        widths: ["desk"],
        ready: {
          shows: `${OPEN_POPOVER} [data-slot=lead]`,
          says: /^This project has no stages of its own yet$/,
          not: "section[data-ask]",
        },
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
        ready: {
          shows: `${OPEN_POPOVER} section[data-ask=outreach] [data-item]`,
        },
      },
    ],
  },
  {
    name: "task",
    serve: "built",
    route: (s) => `/project/${s.project}?task=${s.task}`,
    states: [
      {
        name: "open",
        root: "body",
        ready: (s) => ({ shows: taskSheet(s.task) }),
      },
      {
        // In review: its two attempts, the newest's result (the page it presented, the post, the notes).
        name: "review",
        route: (s) => `/project/${s.project}?task=${s.review}`,
        root: "body",
        ready: (s) => ({
          shows: `${taskSheet(s.review)} [data-slot=stage] iframe[data-ready=true]`,
        }),
      },
      {
        // Every part a task's sheet draws: labels, fields, a blocker, to-dos, criteria, notes, an output.
        name: "rich",
        route: (s) => `/project/${s.project}?task=${s.rich}`,
        root: "body",
        ready: (s) => ({
          shows: `${taskSheet(s.rich)} section[aria-label^="Review "]`,
        }),
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
        ready: (s) => ({
          shows: `${taskSheet(s.rich)} [role=tablist][aria-label="Review or details"] [role=tab][aria-selected=true]`,
          says: DETAILS_TAB,
        }),
      },
      {
        // Its one attempt failed.
        name: "failed",
        route: (s) => `/project/${s.project}?task=${s.failed}`,
        root: "body",
        ready: (s) => ({ shows: `${taskSheet(s.failed)} [data-fail=true]` }),
      },
      {
        // In review, its page not found yet: the stage's cover. Last (its route stays).
        name: "review-opening",
        route: (s) => `/project/${s.project}?task=${s.review}`,
        act: reloadedWith((page) =>
          neverAnswered(page, ARTIFACT_READ, ARTIFACT_READ_PATH)
        ),
        root: "body",
        ready: (s) => ({
          shows: `${taskSheet(s.review)} [data-slot=stage] [data-slot=cover]`,
          not: `${taskSheet(s.review)} [data-slot=stage] iframe[data-ready=true]`,
        }),
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
    // Each view's pane names it (`data-view`), and what only it draws stands in it.
    states: (
      [
        ["table", "table[data-slot=table]"],
        ["pipeline", "[data-slot=view-pipeline-label]"],
        ["routines", "section[data-block=routines]"],
        ["decisions", "[data-slot=decisions][data-mode=list] [data-slot=grid]"],
        ["view:week", "[data-slot=view-frame]"],
        ["made", 'ul[aria-label="Made"] li[data-slot=tile]'],
        ["canvas", "section[data-slot=view-canvas][data-settled=true]"],
      ] as const
    )
      .map(([view, draws]): State => ({
        name: view.replace("view:", ""),
        route: (s) => `/project/${s.project}?view=${view}`,
        root: MAIN,
        ready: { shows: `${VIEW_PANE}[data-view="${view}"] ${draws}` },
      }))
      .concat(
        {
          // The made view on its own page, as a link to it opens it (a bare route).
          name: "week-page",
          route: (s) => `/project/${s.project}/view/week`,
          root: "body",
          ready: {
            shows: "[data-slot=view-frame]",
            path: /^\/project\/[^/]+\/view\/week$/,
          },
        },
        {
          // The decision page its session made, still open for picks: the page in its frame.
          name: "decision-page",
          route: (s) =>
            `/project/${s.project}?view=decisions&page=${CHIP_DECISION}`,
          root: MAIN,
          ready: { shows: DECISION_PAGE },
        }
      ),
  },
  {
    // Three linked decision pages: the list, one page, and their graph.
    name: "decisions",
    serve: "built",
    route: (s) => `/project/${s.decisions}?view=decisions`,
    states: [
      {
        name: "rest",
        root: MAIN,
        ready: {
          shows: `${VIEW_PANE}[data-view=decisions] [data-slot=decisions][data-mode=list] [data-slot=grid]`,
        },
      },
      {
        name: "page",
        route: (s) => `/project/${s.decisions}?view=decisions&page=pricing`,
        root: MAIN,
        ready: { shows: DECISION_PAGE, path: /[?&]page=pricing\b/ },
      },
      // Its pages still open for picks, each its program drawn in its frame
      // by the decision host (decision-host.ts); the media page's card
      // draws every media part of the library (scene.ts `mediaProgram`).
      ...["landing", "onboarding", MEDIA_PAGE].map((name): State => ({
        name,
        route: (s) => `/project/${s.decisions}?view=decisions&page=${name}`,
        root: MAIN,
        ready: {
          shows: `${DECISION_PAGE.replace(" [data-slot=page-head]", "")} iframe`,
          path: new RegExp(`[?&]page=${name}\\b`),
        },
      })),
      {
        name: "graph",
        route: (s) => `/project/${s.decisions}?view=decisions&mode=graph`,
        root: MAIN,
        ready: {
          shows: `${VIEW_PANE}[data-view=decisions-graph] [data-slot=decisions][data-mode=graph]`,
        },
      },
    ],
  },
  {
    // A decision page as its host draws it (decisions/host), opened as
    // CawCo shows it but served from this tree with no hub
    // (decision-embeds.ts `openCapturePage`): the hub tape holds no program
    // page and none of the host's files. The decisions project's three
    // programs as the scratch fleet publishes them (decisions-preview
    // seed.ts) with the picks the hub holds for them, then a pick, its
    // Continue, a note, a send, the page offline, every media piece but a
    // canvas, Preview's wait and pieces whose artifacts are gone. Each state
    // opens its page from a route the tape loads.
    name: "decision-host",
    serve: "built",
    route: () => "/usage",
    states: [
      {
        // 5 of 12 decided, each on its line; the rest open.
        name: "landing",
        act: hostPage("landing"),
        root: "body",
        ready: { shows: HOST_METER, says: /\b5 of 12 picked\b/ },
      },
      {
        // In a Section, each card after the one before.
        name: "onboarding",
        act: hostPage("onboarding"),
        root: "body",
        ready: { shows: HOST_METER, says: /\b2 of 5 picked\b/ },
      },
      {
        // All but one decided, one with a diagram, notes and a dial's values held.
        name: "pricing",
        act: hostPage("pricing"),
        root: "body",
        ready: { shows: HOST_METER, says: /\b5 of 6 picked\b/ },
      },
      {
        // An option pressed: chosen, its card's Continue the one coral act.
        name: "pick",
        act: async (page) => {
          await hostPage("landing")(page);
          await page
            .locator(`${HOST_CARD("under-hero")} [data-option]`)
            .first()
            .click();
        },
        root: "body",
        inView: `${HOST_CARD("under-hero")} [data-continue]`,
        ready: { shows: `${HOST_CARD("under-hero")} [data-continue]` },
      },
      {
        // Continue pressed: the card folded to its decided line, the next one working.
        name: "continue",
        act: async (page) => {
          await hostPage("landing")(page);
          const card = HOST_CARD("under-hero");
          await page.locator(`${card} [data-option]`).first().click();
          await page.locator(`${card} [data-continue]`).click();
          await page.locator(`${card}[data-decided]`).waitFor();
        },
        root: "body",
        inView: HOST_CARD("under-hero"),
        ready: {
          shows: `${HOST_CARD("under-hero")}[data-decided] [data-slot=decided]`,
        },
      },
      {
        // A card's note opened and written in.
        name: "note",
        act: async (page) => {
          await hostPage("landing")(page);
          const note = `${HOST_CARD("under-hero")} [data-slot=note]`;
          await page.locator(`${note} button`).first().click();
          await page
            .locator(`${note} ${NOTE_FIELD}`)
            .fill("Short of a phone's width");
        },
        root: "body",
        inView: `${HOST_CARD("under-hero")} [data-slot=note] ${NOTE_FIELD}`,
        ready: {
          shows: `${HOST_CARD("under-hero")} [data-slot=note] ${NOTE_FIELD}`,
        },
      },
      {
        // Send pressed: its check up, read before it leaves (--dur-hold).
        name: "sent",
        act: async (page) => {
          await hostPage("landing")(page);
          await page.locator("[data-send]").click();
          await page.locator(HOST_SENT).waitFor();
        },
        heldFrame: true,
        root: "body",
        ready: { shows: HOST_SENT },
      },
      {
        // Opened where CawCo doesn't show it: the offline notice, nothing pressable.
        name: "offline",
        act: hostPage("landing", { bridge: false }),
        root: "body",
        ready: {
          shows: "[data-slot=decision-page] [data-slot=alert][role=alert]",
        },
      },
      {
        // A picture and a diagram in the first card's wells.
        name: "media",
        act: hostPage("media"),
        root: "body",
        ready: { shows: `${HOST_CARD("stack")} [data-slot=diagram] svg` },
      },
      {
        // Dials in a well under the card they tune.
        name: "dials",
        act: hostPage("media"),
        root: "body",
        inView: `${HOST_CARD("host")} [data-slot=dials]`,
        ready: {
          shows: `${HOST_CARD("host")} [data-slot=dials] .dialkit-root`,
        },
      },
      {
        // A page embedded in an option, live in its frame.
        name: "embed",
        act: hostPage("media"),
        root: "body",
        inView: `${HOST_CARD("host")} [data-slot=option-media] iframe[data-slot=embed]`,
        ready: {
          shows: `${HOST_CARD("host")} [data-slot=option-media] iframe[data-slot=embed]`,
        },
      },
      {
        // A Gantt chart too wide for the well at its words' floor: it scrolls sideways.
        name: "wide-diagram",
        act: hostPage("media"),
        root: "body",
        inView: `${HOST_CARD("plan")} [data-slot=diagram]`,
        ready: { shows: `${HOST_CARD("plan")} [data-slot=diagram] svg` },
      },
      {
        // A dev server's preview past --dur-wait-grace with no answer: Caw and "Opening…".
        name: "wait",
        act: async (page) => {
          const { SILENT_ORIGIN } = await import("../decision-embeds");
          await neverAnswered(page, `${SILENT_ORIGIN}/**`, PING_PATH);
          await hostPage("wait")(page);
        },
        root: "body",
        inView: "[data-slot=media] p[role=status]",
        ready: {
          shows: "[data-slot=media] p[role=status]",
          says: /^Opening the preview launch-site…$/,
        },
      },
      {
        // A picture, a canvas and a preview the hub no longer holds, each said in words.
        name: "gone",
        act: hostPage("gone"),
        root: "body",
        ready: { shows: "[data-slot=media-gone]" },
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
      {
        // His panel put away: an empty board opens on him by itself
        // (caw-lead.svelte.ts `arrive`), so as it opened, rest drew the
        // panel's own picture at the desk.
        name: "rest",
        act: cawAway,
        root: "body",
        ready: {
          shows: '[data-slot="caw-seat"][aria-expanded="false"]',
          not: CAW_SEAT_OPEN,
        },
      },
      {
        name: "panel",
        act: openCaw,
        root: "body",
        ready: { shows: CAW_SEAT_OPEN },
      },
      // No decision page yet: Caw in the view, his starters under him.
      {
        name: "decisions",
        route: (s) => `/project/${s.tray}?view=decisions`,
        root: MAIN,
        ready: {
          shows: `${VIEW_PANE}[data-view=decisions] [data-slot=empty] [data-slot=caw-seat]`,
        },
      },
    ],
  },
  {
    // `/config` itself: under the drawer's width the section list is the
    // page (config/+page.ts); wider, it is Rules' page (a 307 to
    // /config/rules), which config-rules/rest reads.
    name: "config",
    serve: "built",
    route: () => "/config",
    states: [
      {
        // Opened again, as a phone that has been here before opens it: on
        // its first visit the server has no `cawco-narrow` from it yet (the
        // Shell keeps it once it has drawn, prefs.ts), and a probe's
        // Chromium says no `sec-ch-ua-mobile`, so the server took it for
        // wide and sent it on to Rules.
        name: "index",
        act: async (page) => {
          await page.goto(new URL("/config", page.url()).href, {
            waitUntil: "domcontentloaded",
          });
          await page.waitForFunction(() => window.kitHydrated === true);
        },
        root: "body",
        widths: ["tablet", "phone"],
        ready: { shows: "[data-slot=list]", path: /^\/config$/ },
      },
    ],
  },
  ...CONFIG.map(([section, title]): Surface => ({
    name: `config-${section}`,
    serve: "built",
    route: () => `/config/${section}`,
    states: [
      {
        name: "rest",
        root: "body",
        ready: {
          shows: SECTION_TITLE,
          says: new RegExp(`^${title.replace("&", "\\&")}$`),
          not: SKELETON,
          path: at(`/config/${section}`),
        },
      },
      ...(EDITORS[section] ?? []),
    ],
  })),
  {
    name: "usage",
    serve: "built",
    route: () => "/usage",
    states: [
      {
        name: "rest",
        root: "body",
        ready: {
          shows: "main h1",
          says: /^Usage$/,
          not: "[data-project-spend-row]",
          path: at("/usage"),
        },
      },
      // One project's spend.
      {
        name: "project",
        route: (s) => `/usage?project=${s.project}`,
        root: "body",
        ready: { shows: "[data-project-spend-row]" },
      },
      {
        // Its project filter open.
        name: "project-pick",
        act: (page) => usageProjects(page),
        root: "body",
        ready: {
          shows: "[data-slot=select-content][data-state=open] [role=option]",
        },
      },
      // A fleet of many projects: the filter's list as long as the fleet's.
      // Last (its route stays).
      {
        name: "project-pick-many",
        act: async (page) => {
          await reloadedWith(manyProjects)(page);
          await usageProjects(page);
        },
        root: "body",
        ready: {
          shows: "[data-slot=select-content][data-state=open] [role=option]",
          says: FIRST_MORE_PROJECT,
        },
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
        ready: {
          shows: `${OPEN_DIALOG} [aria-label="First prompt"]`,
          not: NS_POP,
        },
      },
      {
        name: "location",
        act: inSheet(press(LOCATION_CHIP)),
        root: "body",
        ready: { shows: `${nsPop("location")} [aria-label="Location source"]` },
      },
      {
        name: "browse",
        act: inSheet(press(LOCATION_CHIP), browseTo),
        root: "body",
        ready: {
          shows: `${nsPop("location")} [data-slot=crumb][aria-current=location]`,
          says: /^chip-tray$/,
        },
      },
      {
        name: "used",
        act: inSheet(press(LOCATION_CHIP), browseTo, press("Use this folder")),
        root: "[role=dialog][data-state=open]",
        ready: {
          shows: `${OPEN_DIALOG} [aria-label$="/code/chip-tray"][aria-label^="Location: "]`,
          not: NS_POP,
        },
      },
      {
        name: "effort",
        act: inSheet(press(EFFORT_CHIP)),
        root: "body",
        ready: { shows: `${nsPop("effort")} [data-slot=track]` },
      },
      {
        name: "permission",
        act: inSheet(press(PERMISSION_CHIP)),
        root: "body",
        ready: { shows: `${nsPop("permission")} [data-perm=fullSend]` },
      },
      {
        // Full Send chosen: its warning over Start.
        name: "full-send",
        act: inSheet(
          press(PERMISSION_CHIP),
          (page) =>
            page
              .locator(`${nsPop("permission")} [data-perm=fullSend]`)
              .first()
              .click(),
          press(SWITCH_FULL_SEND)
        ),
        root: "[role=dialog][data-state=open]",
        ready: {
          shows: `${OPEN_DIALOG} [data-slot=start-notice] [data-slot=alert-title]`,
        },
      },
      {
        name: "account",
        act: inSheet(press(ACCOUNT_CHIP)),
        root: "body",
        ready: { shows: `${NS_POP} [data-account-option=auto]` },
      },
      {
        // The Machines chip's "Connect a machine…": the pairing panel in the
        // list's place, its install command in the join step's CopyBox. The
        // command stands once the hub lists an address (hub join.ts
        // `joinAddresses`: Tailscale, then each non-internal IPv4), which a
        // host's tape holds and a workspace's (loopback alone) does not.
        name: "machines-pair",
        hostOnly: "join",
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
        ready: { shows: `${nsPop("machines")} code`, says: /install\.sh/ },
      },
      {
        // The cawco project on the machine with no checkout of it: Move &
        // start, and the move it asks a yes for.
        name: "move",
        act: inSheet(toOtherMachine, press(MOVE_AND_START)),
        root: "[role=dialog][data-state=open]",
        ready: {
          shows: `${OPEN_DIALOG} [data-slot=tray]`,
          says: /^CawCo saves the folder/,
        },
      },
      {
        name: "insert",
        act: inSheet(async (page) => {
          await page.getByRole("textbox", { name: "First prompt" }).click();
          await page.keyboard.type("/");
        }),
        root: "body",
        ready: {
          shows: `${NS_POP} [data-slot=trigger-menu-label]`,
          says: /^\/tray-check$/,
        },
      },
      {
        // The `/` menu's skill chosen: its chip on the prompt's line
        // (PromptEditor's reference chip, `data-chip`).
        name: "chip",
        act: inSheet(async (page) => {
          // The prompt's draft is kept across the sheet's openings: emptied first.
          await page.getByRole("textbox", { name: "First prompt" }).click();
          await page.keyboard.press("ControlOrMeta+a");
          await page.keyboard.press("Delete");
          await page.keyboard.type("/");
          await page
            .locator(`${NS_POP} [data-slot=trigger-menu-label]`)
            .first()
            .waitFor();
          await page.keyboard.press("Enter");
        }),
        root: "[role=dialog][data-state=open]",
        ready: {
          shows: `${OPEN_DIALOG} [data-chip]`,
          says: /tray-check/,
          not: NS_POP,
        },
      },
      {
        // Another harness the machine runs, picked on the model's rail: an
        // enabled rail item chosen, the models swapped to its list.
        name: "harness",
        act: inSheet((page) =>
          page
            .locator(
              `${OPEN_DIALOG} [data-slot=rail] [role=radio][aria-checked=false]:enabled`
            )
            .first()
            .click()
        ),
        root: "[role=dialog][data-state=open]",
        ready: {
          shows: `${OPEN_DIALOG} [data-slot=rail] [role=radio][aria-checked=true]:enabled`,
          not: `${OPEN_DIALOG} [data-slot=rail] [role=radio][aria-checked=true][data-rail-item=claude]`,
        },
      },
    ],
  },
  {
    name: "jump",
    serve: "built",
    route: () => "/",
    states: [
      {
        name: "open",
        act: openJump,
        root: LAYER,
        ready: { shows: JUMP, not: `${JUMP} ${FIND_PEEK}` },
      },
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
        ready: { shows: `${JUMP} ${FIND_PEEK}` },
      },
      {
        // Nothing typed, → on its first stop: the asks waiting for you, their
        // sort a segmented control (Finder's `waitingList`).
        name: "waiting",
        act: async (page) => {
          await openJump(page);
          await page
            .locator(`${JUMP} [role=option]`)
            .filter({ visible: true })
            .first()
            .waitFor();
          await page.keyboard.press("ArrowRight");
        },
        root: LAYER,
        ready: {
          shows: `${JUMP} [role=radiogroup][aria-label=Sort] [role=radio][aria-checked=true]`,
        },
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
        ready: { shows: NEEDS_PANEL, not: PEEK_SHEET },
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
        ready: { shows: PEEK_SHEET },
      },
    ],
  },
  {
    name: "workflows",
    serve: "built",
    route: () => "/workflows",
    states: [
      {
        name: "rest",
        root: "body",
        ready: { shows: "h1", says: /^Workflows$/, path: at("/workflows") },
      },
      {
        // New workflow: its menu, a graph or a program, each made on its press.
        name: "new",
        act: press(NEW_WORKFLOW),
        root: LAYER,
        ready: { shows: OPEN_MENU, says: NEW_WORKFLOW_KINDS },
      },
      {
        // The scene's workflow is a program's (`origin: "code"`): it has no
        // Editor tab, and opens on Program (WorkflowEditor's `tab`).
        name: "editor",
        route: (s) => `/workflows/${s.workflow}`,
        root: "body",
        ready: { shows: workflowTab("program"), not: OPEN_DIALOG },
      },
      {
        // Its Runs. This was `?tab=program`, which opens it on the Program
        // tab it opens on anyway: the same screen as editor's.
        name: "runs",
        route: (s) => `/workflows/${s.workflow}`,
        act: (page) =>
          page
            .getByRole("tab", { name: "Runs" })
            .filter({ visible: true })
            .first()
            .click(),
        root: "body",
        ready: { shows: workflowTab("runs") },
      },
      {
        // Run: the launch form, opened and not sent (a popover under the
        // button on a desk, the bottom sheet on a phone).
        name: "launch",
        route: (s) => `/workflows/${s.workflow}`,
        act: press(RUN_WORKFLOW),
        root: "body",
        ready: {
          shows: `${OPEN_POPOVER} [data-slot=popover-title], [data-slot=drawer-content][data-state=open] [data-slot=drawer-title]`,
          says: /^Run /,
        },
      },
      // A graph workflow: the canvas, its nodes and edges, the inspector.
      {
        name: "graph",
        route: (s) => `/workflows/${s.graph}`,
        root: "body",
        ready: {
          shows: '[aria-label="Fit graph"]',
          not: `[data-slot=when], ${STEP_SETTINGS}`,
        },
      },
      // Its step picked: the inspector's prompt and output schema.
      {
        name: "graph-step",
        route: (s) => `/workflows/${s.graph}`,
        act: pickNode(GRAPH_STEP),
        root: "body",
        // Its settings in the inspector: what it runs on, its harness first
        // (its output schema's fields stand past the fold).
        ready: { shows: STEP_SETTINGS, not: "[data-slot=when]" },
      },
      // Its branch picked: each case's condition.
      {
        name: "graph-branch",
        route: (s) => `/workflows/${s.graph}`,
        act: pickNode(GRAPH_BRANCH),
        root: "body",
        ready: { shows: "[data-slot=when]" },
      },
      // Its case compared with a value: the value's JSON field.
      {
        name: "graph-compare",
        route: (s) => `/workflows/${s.graph}`,
        act: async (page) => {
          await pickNode(GRAPH_BRANCH)(page);
          await page
            .getByRole("combobox", { name: "Operator" })
            .first()
            .selectOption("eq");
        },
        root: "body",
        // On a phone the inspector stands under the graph, the field past the fold.
        inView: COMPARE_FIELD,
        ready: { shows: COMPARE_FIELD },
      },
      // The finished run in its own pane: its steps.
      {
        name: "run",
        route: (s) => `/session/run:${s.run}`,
        root: "body",
        ready: (s) => ({
          shows: on(`run:${s.run}`, '[role=img][aria-label="Passed"]'),
        }),
      },
      {
        // The same run parked on its question to you: the question's card,
        // its options and your own answer. The scene's run finished, so its
        // read is answered waiting, as the hub answers a parked run's. Last
        // (its route stays).
        name: "run-ask",
        route: (s) => `/session/run:${s.run}`,
        act: reloadedWith((page) =>
          page.route(RUN_READ, async (route) => {
            const response = await route.fetch();
            const run = (await response.json()) as Record<string, unknown>;
            await route.fulfill({
              response,
              json: { ...run, status: "waiting", ask: RUN_ASK },
            });
          })
        ),
        root: "body",
        ready: (s) => ({
          shows: on(`run:${s.run}`, "[data-slot=card] [data-slot=card-title]"),
        }),
      },
    ],
  },
  {
    name: "artifact",
    serve: "built",
    route: (s) => `/artifact/${s.artifact}`,
    states: [
      {
        name: "rest",
        root: "body",
        ready: (s) => ({
          shows: PREVIEW_READY,
          path: at(`/artifact/${s.artifact}`),
        }),
      },
      {
        name: "in-session",
        route: (s) => `/session/${s.art}`,
        root: "body",
        ready: (s) => ({ shows: on(s.art, PREVIEW_READY) }),
      },
      // The pane's Comments rail, its pins seeded: a short comment the agent
      // answered (its reply in meta, after the agent's glyph), a 48-word one
      // cut at two lines, and a gone pin's row beside them, its pill recessed.
      {
        name: "comments",
        route: (s) => `/session/${s.art}`,
        act: inComments(),
        root: "body",
        widths: ["desk", "tablet", "phone"],
        ready: (s) => ({
          shows: on(s.art, `${PIN_LIST} ${PIN_ROW}[data-pin-row="2"]`),
        }),
      },
      // The Resolved tab holding its pins, newest first (written at one
      // moment, the highest number leads): 9 at the top, 10 among them gone.
      {
        name: "comments-resolved",
        route: (s) => `/session/${s.art}`,
        act: inComments(pinsTab("Resolved")),
        root: "body",
        widths: ["desk", "tablet", "phone"],
        ready: (s) => ({
          shows: on(s.art, `${PIN_LIST} ${PIN_ROW}[data-pin-row="9"]`),
        }),
      },
      // A row pressed: its thread, beside its pill; on a phone the foot
      // sheet, the rail's sheet standing aside.
      {
        name: "comments-row-card",
        route: (s) => `/session/${s.art}`,
        act: inComments(openRow(1)),
        root: "body",
        widths: ["desk", "tablet", "phone"],
        ready: (s) => ({ shows: on(s.art, pinCard(1)), not: PIN_POP }),
      },
      // Words in its composer: its send glyph, Reply, on.
      {
        name: "comments-reply",
        route: (s) => `/session/${s.art}`,
        act: inComments(openRow(1), (page) =>
          page
            .locator(`${pinCard(1)} [role=combobox]`)
            .filter({ visible: true })
            .first()
            .fill("Make it a step larger still.")
        ),
        root: "body",
        widths: ["desk", "tablet", "phone"],
        ready: (s) => ({
          shows: on(s.art, `${pinCard(1)} button[aria-label="Reply"]:enabled`),
        }),
      },
      // Its Close: the rail back on the tab it stood on (Resolved).
      {
        name: "comments-row-back",
        route: (s) => `/session/${s.art}`,
        act: inComments(pinsTab("Resolved"), openRow(5), closePinCard),
        root: "body",
        widths: ["desk", "tablet", "phone"],
        ready: (s) => ({
          shows: on(s.art, `${PIN_LIST} [role=tab][aria-selected=true]`),
          says: TAB_RESOLVED,
        }),
      },
      // A gone pin's row opens its thread: the loss said once, Pin it somewhere else.
      {
        name: "comments-gone",
        route: (s) => `/session/${s.art}`,
        act: inComments(openRow(3)),
        root: "body",
        widths: ["desk", "tablet", "phone"],
        ready: (s) => ({
          shows: on(s.art, `${pinCard(3)} [data-slot=gone]`),
          says: GONE_SAYS,
        }),
      },
      // Pin it somewhere else pressed: the thread says where to tap, beside Cancel.
      {
        name: "comments-placing",
        route: (s) => `/session/${s.art}`,
        act: inComments(openRow(3), (page) =>
          page
            .locator(pinCard(3))
            .getByRole("button", { name: "Pin it somewhere else" })
            .click()
        ),
        root: "body",
        widths: ["desk", "tablet", "phone"],
        ready: (s) => ({
          shows: on(s.art, `${pinCard(3)} [data-slot=gone]`),
          says: PLACING_SAYS,
        }),
      },
      // The pane expanded: the rail beside the page, a gone pin's thread at
      // the top-right of the page's well.
      {
        name: "comments-beside",
        route: (s) => `/session/${s.art}`,
        act: async (page) => {
          await expandPane(page);
          await inComments(openRow(3))(page);
        },
        root: "body",
        widths: ["desk"],
        ready: (s) => ({
          shows: on(s.art, `${pinCard(3)}:not([data-sheet])`),
        }),
      },
      // A row under the keyboard's focus, the pointer's hover, and a press held.
      {
        name: "comments-row-focus",
        route: (s) => `/session/${s.art}`,
        act: inComments(async (page) => {
          await page
            .locator(`${PIN_LIST} [role=tab][aria-selected=true]`)
            .focus();
          await page.keyboard.press("Tab");
        }),
        root: "body",
        widths: ["desk"],
        ready: (s) => ({ shows: on(s.art, `${PIN_ROW}:focus-visible`) }),
      },
      {
        name: "comments-row-hover",
        route: (s) => `/session/${s.art}`,
        act: inComments((page) =>
          page.locator(`${PIN_LIST} ${PIN_ROW}[data-pin-row="2"]`).hover()
        ),
        root: "body",
        widths: ["desk"],
        ready: (s) => ({
          shows: on(s.art, `${PIN_ROW}[data-pin-row="2"]:hover`),
        }),
      },
      {
        name: "comments-row-press",
        route: (s) => `/session/${s.art}`,
        act: inComments(async (page) => {
          await page
            .locator(`${PIN_LIST} ${PIN_ROW}[data-pin-row="2"]`)
            .hover();
          await page.mouse.down();
        }),
        root: "body",
        widths: ["desk"],
        ready: (s) => ({
          shows: on(s.art, `${PIN_ROW}[data-pin-row="2"]:active`),
        }),
      },
      // A gone pin's row under Resolved, its pill recessed.
      {
        name: "comments-gone-resolved",
        route: (s) => `/session/${s.art}`,
        act: inComments(pinsTab("Resolved")),
        root: "body",
        inView: `${PIN_LIST} ${PIN_ROW}[data-pin-row="10"]`,
        widths: ["desk", "tablet", "phone"],
        ready: (s) => ({
          shows: on(
            s.art,
            `${PIN_LIST} ${PIN_ROW}[data-pin-row="10"][data-moved]`
          ),
        }),
      },
      // A gone pin's row under the pointer, and pressed.
      {
        name: "comments-gone-hover",
        route: (s) => `/session/${s.art}`,
        act: inComments((page) =>
          page.locator(`${PIN_LIST} ${PIN_ROW}[data-pin-row="3"]`).hover()
        ),
        root: "body",
        widths: ["desk"],
        ready: (s) => ({
          shows: on(s.art, `${PIN_ROW}[data-pin-row="3"][data-moved]:hover`),
        }),
      },
      {
        name: "comments-gone-press",
        route: (s) => `/session/${s.art}`,
        act: inComments(async (page) => {
          await page
            .locator(`${PIN_LIST} ${PIN_ROW}[data-pin-row="3"]`)
            .hover();
          await page.mouse.down();
        }),
        root: "body",
        widths: ["desk"],
        ready: (s) => ({
          shows: on(s.art, `${PIN_ROW}[data-pin-row="3"][data-moved]:active`),
        }),
      },
      // Beside the expanded pane's page, at its one width (c-comments-w), a
      // long Resolved list scrolled to its end, its oldest (4) last.
      {
        name: "comments-beside-scrolled",
        route: (s) => `/session/${s.art}`,
        act: async (page) => {
          await expandPane(page);
          await inComments(pinsTab("Resolved"), (page2) =>
            page2.locator(`${PIN_LIST} [data-slot=rows]`).evaluate((el) => {
              el.scrollTop = el.scrollHeight;
            })
          )(page);
        },
        root: "body",
        // The walk reads every scroller at its start: the end is scrolled back into view.
        inView: `${PIN_LIST} ${PIN_ROW}[data-pin-row="4"]`,
        widths: ["desk"],
        ready: (s) => ({
          shows: on(s.art, `${PIN_LIST} ${PIN_ROW}[data-pin-row="4"]`),
        }),
      },
      // Placing tapped through: the next tap on the page pins the gone pin
      // anew, and its thread says no loss.
      {
        name: "comments-placed",
        route: (s) => `/session/${s.art}`,
        act: inComments(
          openRow(3),
          (page) =>
            page
              .locator(pinCard(3))
              .getByRole("button", { name: "Pin it somewhere else" })
              .click(),
          async (page) => {
            const frame = page.frameLocator(PREVIEW_FRAME);
            await frame
              .locator("cawco-overlay .layer.comment")
              .waitFor({ state: "attached" });
            const box = await frame.locator("h1").boundingBox();
            if (!box) {
              throw new Error("the preview's heading has no box");
            }
            // Left of the heading's pills (pressed at 0.3) and clear of the
            // gone pin's thread at the well's top-right.
            await page.mouse.click(
              box.x + box.width * 0.12,
              box.y + box.height / 2
            );
          }
        ),
        root: "body",
        widths: ["desk", "phone"],
        ready: (s) => ({
          shows: on(s.art, `${pinCard(3)}:not(:has([data-slot=gone]))`),
        }),
      },
      // The page asking for a place, with the Comments rail open: the picker
      // takes the well and the rail's sheet stands aside (The Open Page Rule).
      {
        name: "place-pick",
        route: (s) => `/session/${s.art}`,
        act: async (page) => {
          await commentsOpen(page);
          await askPlace(page);
        },
        root: "body",
        widths: ["desk", "phone"],
        ready: (s) => ({
          shows: on(s.art, "form[data-slot=place-pick]"),
          not: PIN_POP,
        }),
      },
      // No pins yet: each tab says so, with how to make one. After every
      // state that reads the scene's pins (scene.ts `seedComments`), each of
      // these clears the page's doc first; the clear stays in it across the
      // pass's loads (the overlay keeps the doc on the device), as on a live
      // fleet it stays on the hub.
      {
        name: "comments-empty",
        route: (s) => `/session/${s.art}`,
        act: async (page) => {
          await clearPins(page);
          await panelUp(page);
        },
        root: "body",
        widths: ["desk", "tablet", "phone"],
        ready: (s) => ({
          shows: on(s.art, `${PIN_LIST} [data-slot=pin-list-empty]`),
          says: NO_OPEN,
        }),
      },
      {
        name: "comments-empty-resolved",
        route: (s) => `/session/${s.art}`,
        act: async (page) => {
          await clearPins(page);
          await panelUp(page);
          await pinsTab("Resolved")(page);
        },
        root: "body",
        widths: ["desk", "tablet", "phone"],
        ready: (s) => ({
          shows: on(s.art, `${PIN_LIST} [data-slot=pin-list-empty]`),
          says: NO_RESOLVED,
        }),
      },
      // A press on the preview in Comment: the composer at the element, beside its hollow pill.
      {
        name: "pin-compose",
        route: (s) => `/session/${s.art}`,
        act: async (page) => {
          await clearPins(page);
          await composeOn(page);
        },
        root: "body",
        widths: ["desk", "phone"],
        ready: (s) => ({ shows: on(s.art, COMPOSER_PLACED) }),
      },
      // A comment written, its thread open beside its pill (the desk's pane stands beside the transcript).
      {
        name: "pin",
        route: (s) => `/session/${s.art}`,
        act: async (page) => {
          await clearPins(page);
          await dropPin(page);
        },
        root: "body",
        widths: ["desk", "phone"],
        ready: (s) => ({
          shows: on(s.art, `${PIN_CARD_PLACED}[aria-label="Comment 1"]`),
        }),
      },
      {
        // Its machine's list open, then a machine chosen: the folders on it.
        name: "place-machines",
        route: (s) => `/session/${s.art}`,
        act: async (page) => {
          await machinesOpen(page);
        },
        root: "body",
        widths: ["desk"],
        ready: {
          shows: "[data-slot=select-content][data-state=open] [role=option]",
        },
      },
      {
        name: "place-folder",
        route: (s) => `/session/${s.art}`,
        act: async (page) => {
          await machinesOpen(page);
          // The list stands in its own layer, over the pane: pressed there.
          await page
            .locator(
              "[data-slot=select-content][data-state=open] [role=option]"
            )
            .first()
            .click();
          // Browse: the machine's folders, from the keyboard as the machine was.
          await page
            .locator(`${PLACE_PICK} [data-slot=collapsible-trigger]`)
            .first()
            .focus();
          await page.keyboard.press("Enter");
        },
        root: "body",
        widths: ["desk"],
        ready: {
          // The folders' picker in Browse: its way up a folder (DirectoryPicker).
          shows: `${PLACE_PICK} [data-slot=collapsible][data-state=open] [aria-label="Parent directory"]`,
          not: "[data-slot=select-content][data-state=open]",
        },
      },
      {
        // The pane head's artifact menu: the session's artifacts, each its row.
        name: "menu",
        route: (s) => `/session/${s.art}`,
        act: (page) =>
          page
            .locator("[data-artifact-trigger]")
            .filter({ visible: true })
            .first()
            .click(),
        root: LAYER,
        ready: {
          shows: "[data-artifact-list][data-state=open] [data-artifact-row]",
        },
      },
      {
        // A page with a short name, in a pane at its floor, a comment pinned
        // on it and a pick not yet sent: Comments with its count and Send
        // picks stand in the head beside the mode and Close, and leave the
        // ask's line less than it needs (SideSurface `subtitleStands`: its
        // own width, up to 120px), so the artifact menu says it as its first
        // row (ArtifactMenu's `menu-line`). A live scene's state: the tape
        // holds no short-named page.
        name: "menu-narrow",
        // The scene's short-named page (scene.ts `SHORT_PAGE`): a long name
        // keeps the head's room for itself, and the line stands.
        route: (s) => `/session/${s.media}`,
        widths: ["desk"],
        act: async (page) => {
          await pinWith(page, "h1", "Keep the heading on one line.");
          await paneKey(page, "v");
          await page
            .frameLocator(PREVIEW_FRAME)
            .locator("[data-option=wrap]")
            .click();
          await page.locator("[data-slot=send]").first().waitFor();
          await sideToFloor(page);
          await page
            .locator("[data-artifact-trigger]")
            .filter({ visible: true })
            .first()
            .click();
        },
        root: LAYER,
        ready: {
          shows: "[data-artifact-list][data-state=open] [data-slot=menu-line]",
        },
      },
      // Last on the surface, refuse after hold (docSocket): their route on
      // the doc's socket stays on the page, so every state after them read a
      // doc held or refused (menu-narrow's pin, once it stood after them,
      // was never made). A new state of the surface goes above them.
      // The doc not read yet: past the wait's grace, skeleton rows at the rows' size.
      {
        name: "comments-reading",
        route: (s) => `/session/${s.art}`,
        act: docSocket("hold"),
        root: "body",
        widths: ["desk", "tablet", "phone"],
        ready: (s) => ({
          shows: on(s.art, `${PIN_LIST} [data-slot=pin-list-reading]`),
        }),
      },
      // The doc refused before it ever synced: the fault on the rows' line, with Try again.
      {
        name: "comments-fault",
        route: (s) => `/session/${s.art}`,
        act: docSocket("refuse"),
        root: "body",
        widths: ["desk", "tablet", "phone"],
        ready: (s) => ({
          shows: on(s.art, `${PIN_LIST} [data-pin-list-failed]`),
        }),
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
    states: [
      {
        name: "inspect",
        act: inspectSheet,
        root: "body",
        ready: { shows: INSPECTOR_ROW },
      },
      {
        // The head's View: Map, the scheme and the width, the menu open.
        name: "view",
        act: async (page) => {
          await page
            .frameLocator(PREVIEW_FRAME)
            .locator(SHEET_STORY)
            .first()
            .waitFor();
          await headControl("view", "View")(page);
        },
        root: LAYER,
        ready: { shows: `${OPEN_MENU} [role=menuitemcheckbox]` },
      },
      {
        // Map mode: the canvas's component among what renders it and what it renders.
        name: "map",
        widths: ["desk"],
        act: async (page) => {
          await page
            .frameLocator(PREVIEW_FRAME)
            .locator(SHEET_STORY)
            .first()
            .waitFor();
          // The map's read (a stage's, which the sheet's tape never heard):
          // answered as the stage answers it for the scene's Card.
          await page.route(CANVAS_MAP_READ, (route) =>
            route.fulfill({ status: 200, json: CARD_MAP })
          );
          await headControl("view", "View")(page);
          await page.getByRole("menuitemcheckbox", { name: "Map" }).click();
        },
        root: "body",
        ready: { shows: "[data-slot=canvas-map] [data-slot=map-node]" },
      },
    ],
  },
  {
    // A part of the page that throws while it renders: the tabs, their
    // list failing, stand as their failure line and the rest works on.
    name: "region-failed",
    serve: "built",
    route: (s) => `/session/${s.chips}`,
    states: [
      {
        name: "tabs",
        act: tabsFail,
        // The doubled tab's keyed list throws (PaneTabs' `{#each tabs … (tab.key)}`).
        expects: { error: EACH_KEY_DUPLICATE },
        root: "body",
        ready: { shows: "[data-region-failed=tabs]" },
      },
    ],
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
        ready: (s) => ({
          shows: on(s.permission, "[role=status][aria-busy=true]"),
          says: CATCHING_UP_LINE,
        }),
      },
    ],
  },
  {
    name: "not-found",
    serve: "built",
    route: () => "/no-such-page",
    states: [
      {
        name: "rest",
        root: "body",
        ready: { shows: "main p", says: /^Page not found$/ },
      },
    ],
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
        ready: (s) => ({
          shows: on(s.skillRun, "[data-slot=suggest] [data-slot=suggest-chip]"),
        }),
      },
    ],
  },
  {
    // Every machine offline: where the page says where to start (MachinesEmpty).
    name: "no-machine",
    serve: "built",
    route: () => "/",
    states: [
      {
        // Under the drawer's width, where Home is the page. A desk's `/`
        // opens the workspace's conversation, its machine gone (MachinesEmpty
        // stands there only with nothing open): no-machine/session reads it.
        name: "rest",
        hub: "machineless",
        root: "body",
        widths: ["tablet", "phone"],
        ready: {
          shows: MACHINES_EMPTY,
          says: /^None of your machines are online$/,
        },
      },
      // No machine at all, every one removed: where the page says to add one.
      {
        name: "none",
        hub: "unregistered",
        root: "body",
        ready: {
          shows: MACHINES_EMPTY,
          says: /^Connect a machine to run sessions$/,
        },
      },
      {
        // Its first way to connect one pressed: Add machine's window on
        // Reach over SSH, a popover on a desk and the drawer on a phone.
        name: "connect",
        hub: "unregistered",
        act: async (page) => {
          await page
            .locator("[data-slot=icon-card][aria-haspopup=dialog]")
            .filter({ visible: true })
            .first()
            .focus();
          await page.keyboard.press("Enter");
        },
        root: "body",
        ready: {
          shows: `${CONNECT_WINDOW}[data-step=reach] #connect-title`,
          says: ADD_MACHINE_TITLE,
        },
      },
      // A session on the machine that went away: what its pane can still show.
      {
        name: "session",
        hub: "machineless",
        route: (s) => `/session/${s.chips}`,
        root: MAIN,
        // Its transcript, all its pane has with nothing to run it (the
        // hub's machines all offline: its `machineless` state). The note
        // this asserted, "This session starts once its machine has memory
        // for it", was the recording host's own memory pressure, not this.
        ready: (s) => ({
          shows: on(s.chips, "[role=log][aria-label='Session transcript']"),
          not: STOP_AGENT,
        }),
      },
    ],
  },
  {
    // Paired devices required, and this browser no paired one: the pairing screen.
    name: "pairing",
    serve: "built",
    route: () => "/",
    states: [
      {
        name: "rest",
        hub: "pairing",
        root: "body",
        ready: { shows: "main[data-slot=pairing] [data-slot=code]" },
      },
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
        ready: {
          shows: "main[data-slot=pairing] h1[data-slot=title]",
          says: /^Pairing didn't start$/,
        },
      },
    ],
  },
  ...BENCHES.map(([name, path, draws]): Surface => ({
    name: `bench-${name}`,
    serve: "dev",
    route: () => path,
    states: [
      { name: "rest", root: "body", ready: { shows: draws } },
      ...(BENCH_STATES[name] ?? []),
    ],
  })),
  {
    // The Comments rail on the chosen-hover bench, read whole: its section
    // at its own height (the bench's page runs past the viewport).
    name: "bench-pins",
    serve: "dev",
    route: () => "/motion/chosen-hover",
    states: [
      {
        name: "rest",
        root: "[data-bench] section[data-probe=pins]",
        inView: "[data-bench] section[data-probe=pins]",
        ready: { shows: `[data-probe=pins] ${PIN_ROW}` },
      },
    ],
  },
  {
    // The session's Files: the bar's glass card on a desk, the drawer from
    // the rail's Files row on a phone; then an artifact picked in it,
    // floating on Files' leading side (a desk's alone).
    name: "files",
    serve: "built",
    route: (s) => `/session/${s.art}`,
    states: [
      {
        name: "open",
        act: openFiles,
        root: "body",
        ready: {
          shows:
            ":is([data-files-panel], [data-files-sheet]) [data-files-card]",
        },
      },
      {
        name: "picked",
        widths: ["desk"],
        act: async (page) => {
          // The pick shows the artifact in its session's panel first (hub
          // `…/show`, which the tape never heard): answered as the hub
          // answers it. Last (its route stays).
          await page.route(ARTIFACT_SHOW, (route) =>
            route.fulfill({ status: 200, json: { ok: true } })
          );
          await openFiles(page);
          await page
            .locator("[data-files-panel] [data-files-card]")
            .first()
            .click();
        },
        root: "body",
        ready: { shows: "[data-files-float][data-state=open]" },
      },
      {
        // The floating panel's artifact menu: in its narrower head the ask's
        // line gives way, and the menu says it first (ArtifactMenu's line).
        name: "float-menu",
        widths: ["desk"],
        act: async (page) => {
          await page.route(ARTIFACT_SHOW, (route) =>
            route.fulfill({ status: 200, json: { ok: true } })
          );
          await openFiles(page);
          await page
            .locator("[data-files-panel] [data-files-card]")
            .first()
            .click();
          await page
            .locator(
              "[data-files-float][data-state=open] [data-artifact-trigger]"
            )
            .first()
            .click();
        },
        root: LAYER,
        ready: {
          shows: "[data-artifact-list][data-state=open] [data-artifact-row]",
        },
      },
    ],
  },
  {
    // A New Session opened from the session strip's "+": the popover at it,
    // not the dialog.
    name: "strip-new",
    serve: "built",
    route: (s) => `/session/${s.chips}`,
    states: [
      {
        name: "popover",
        widths: ["desk"],
        act: (page) =>
          page
            .locator("[data-slot=strip-new] [data-tnew]")
            .filter({ visible: true })
            .first()
            .click(),
        root: "[data-ns-popover][data-state=open]",
        // The popover is a dialog itself (NewSessionPopover's `role="dialog"`,
        // one that holds nothing): any other dialog open is the sheet.
        ready: {
          shows:
            '[data-ns-popover][data-state=open] [aria-label="First prompt"]',
          not: `${OPEN_DIALOG}:not([data-ns-popover])`,
        },
      },
    ],
  },
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
