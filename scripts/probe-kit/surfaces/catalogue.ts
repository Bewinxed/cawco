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
import type { Page } from "playwright-core";
import { COMPOSER_FIELD } from "../kit";
import { DELEGATE_TITLE, type Scene } from "./scene";

export type Width = "desk" | "tablet" | "phone";

export interface State {
  /** What opens it, on its route freshly loaded (the walk loads each state's route anew). */
  act?: (page: Page) => Promise<unknown>;
  /**
   * It stands on the scene's delegate, which only a host records (a
   * workspace has no user namespaces): read only from a tape whose scene
   * holds one (`split`), and left out, with a NOTE, from any other.
   */
  hostOnly?: true;
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
}

/** An open layer: a dialog, sheet, drawer, menu or popover standing open. */
export const LAYER =
  "[role=dialog][data-state=open], [role=menu][data-state=open], [data-slot$='-content'][data-state=open], .kit-pop[data-state=open], .kit-hang[data-state=open]";

/** Presses the first visible button named `name`. */
const press = (name: string | RegExp) => (page: Page) =>
  page.getByRole("button", { name }).filter({ visible: true }).first().click();

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
const BENCHES: [string, string][] = [
  ["caw", "/motion/caw"],
  ["caw-notices", "/motion/caw-notices?fixture=full"],
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
      ],
    ])
  ),
  skills: [{ name: "fetch", act: press(FETCH_SKILL), root: "body" }],
  memory: [{ name: "new", act: press(NEW_MEMORY), root: "body" }],
  rules: [
    {
      name: "editor",
      route: () => "/config/rules/new",
      root: "body",
    },
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
      name: "routing",
      route: () => "/config/accounts/anthropic/routing",
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
      {
        name: "machines",
        widths: ["desk"],
        act: press(/machine/),
        root: LAYER,
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
      {
        name: "tools-open",
        act: async (page) => {
          for (const name of TOOL_ROWS) {
            // biome-ignore lint/performance/noAwaitInLoops: one tool row at a time, in the transcript's order
            await press(name)(page);
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
        // The delegate it started, reported back: its card opened, its transcript inline.
        name: "delegate",
        route: (s) => `/session/${s.split}`,
        act: press(DELEGATE_CARD),
        root: MAIN,
        hostOnly: true,
      },
      {
        // The workflow run it started: the RunBlock and its steps.
        name: "run-block",
        route: (s) => `/session/${s.runner}`,
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
      { name: "more-menu", act: press(/More for cawco/), root: LAYER },
      // Caw's seat: his thread beside the board.
      { name: "caw", act: press(CAW_SEAT), root: "body" },
      {
        name: "new",
        route: () => "/project/new",
        root: MAIN,
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
        // Its one attempt failed.
        name: "failed",
        route: (s) => `/project/${s.project}?task=${s.failed}`,
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
    states: ["table", "pipeline", "routines", "decisions", "view:week"].map(
      (view): State => ({
        name: view.replace("view:", ""),
        route: (s) => `/project/${s.project}?view=${view}`,
        root: MAIN,
      })
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
      { name: "panel", act: press(CAW_SEAT), root: "body" },
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
    states: [{ name: "rest", root: "body" }],
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
      {
        name: "open",
        act: async (page) => {
          if (
            await page
              .getByRole("button", { name: "Open navigation" })
              .isVisible()
          ) {
            await openRail(page);
            await press(JUMP_BUTTON)(page);
            return;
          }
          await page.keyboard.press("Control+k");
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
    ],
  },
  {
    name: "not-found",
    serve: "built",
    route: () => "/no-such-page",
    states: [{ name: "rest", root: "body" }],
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
