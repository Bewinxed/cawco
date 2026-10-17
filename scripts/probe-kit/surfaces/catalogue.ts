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
import type { Page, WebSocketRoute } from "playwright-core";
import { COMPOSER_FIELD } from "../kit";
import { DELEGATE_TITLE, type Scene, STUDIO_HOST, type Variant } from "./scene";

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
  /**
   * The hub state it reads, when not the scene's own: one the scene moves
   * the fleet into after the main recording (scene.ts `VARIANTS`), recorded
   * and played on its own (hub-tape.ts `variants`).
   */
  hub?: Variant;
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
/** An artifact's read, which a task's presented page finds its session by (ArtifactStage `findArtifact`). */
const ARTIFACT_READ = "**/api/artifacts/*";
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

/**
 * The page's socket to the hub carrying every frame but those `withheld`
 * names: those the hub never hears, so the page stands waiting on their
 * answer, as it does while a machine takes its time.
 */
const withholding = (withheld: (frame: string) => boolean) => (page: Page) =>
  page.routeWebSocket(DASHBOARD_SOCKET, (ws) => {
    const hub = ws.connectToServer();
    ws.onMessage((frame) => {
      if (!(typeof frame === "string" && withheld(frame))) {
        hub.send(frame);
      }
    });
  });

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

/** The project's ⋯ menu, then its row named `item`. */
const fromMore = (item: string) => async (page: Page) => {
  await press(MORE_FOR_CAWCO)(page);
  await page.getByRole("menuitem", { name: item }).click();
};

/** Caw's seat on the project page, then `then` in his thread. */
const inCawThread =
  (then: (page: Page) => Promise<unknown>) => async (page: Page) => {
    await press(CAW_SEAT)(page);
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
/** The DEBUG fault a page reads once as it loads (debug-fault.ts), and the region of it that throws: the composer's `/` menu. */
const DEBUG_FAULT = "cawco-debug-fault";
const MENU_FAULT = "composer-menu";

/**
 * The composer's `/` menu throwing while it renders, on a page loaded with
 * the DEBUG fault named: the composer's boundary holds it, and the composer
 * stands as its failure line (RegionBoundary). The page reads the key once,
 * as it loads; it is forgotten again at once, so no later load reads it.
 */
const composerFails = async (page: Page) => {
  await reloadedWith((p) =>
    p.evaluate(([key, region]) => localStorage.setItem(key, region), [
      DEBUG_FAULT,
      MENU_FAULT,
    ] as const)
  )(page);
  await page.evaluate((key) => localStorage.removeItem(key), DEBUG_FAULT);
  await page.locator(COMPOSER_FIELD).first().click();
  await page.keyboard.type("/");
  await page.locator("[data-region-failed=composer]").first().waitFor();
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
      // The fleet not read yet: the section's skeleton rows. Last (its route stays).
      name: "reading",
      act: reloadedWith((page) => page.route("**/api/fleet", () => undefined)),
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
        // Its password sent and the Mac yet to answer: the unlock under way.
        // Its socket's route stays the page's, withholding the unlock alone.
        name: "unlocking",
        widths: ["desk"],
        act: async (page) => {
          await reloadedWith(withholding(UNLOCK_CONTROL))(page);
          await openKeychain(page);
          await page.getByPlaceholder(KEYCHAIN_PASSWORD).fill("probe-password");
          await press(UNLOCK)(page);
        },
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
      {
        // The hub's socket open and silent: the status line, on the way.
        // Last (its route stays).
        name: "connecting",
        act: reloadedWith((page) =>
          page.routeWebSocket(DASHBOARD_SOCKET, () => undefined)
        ),
        root: "body",
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
      { name: "more-menu", act: press(MORE_FOR_CAWCO), root: LAYER },
      // Caw's seat: his thread beside the board.
      { name: "caw", act: press(CAW_SEAT), root: "body" },
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
          await page.route(PROJECT_RUNNING, () => undefined);
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
        act: reloadedWith((page) => page.route(ARTIFACT_READ, () => undefined)),
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
      { name: "panel", act: press(CAW_SEAT), root: "body" },
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
        // it: its peek in place (Finder: → peeks the active row).
        name: "peek",
        act: async (page) => {
          await openJump(page);
          await page.keyboard.type("chip");
          await page
            .locator("[role=option]")
            .filter({ visible: true })
            .first()
            .waitFor();
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
        act: press(/^Comments, /),
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
    // A part of the page that throws while it renders: the composer, its
    // `/` menu failing, stands as its failure line and the rest works on.
    name: "region-failed",
    serve: "built",
    route: (s) => `/session/${s.chips}`,
    states: [{ name: "composer", act: composerFails, root: "body" }],
  },
  {
    name: "not-found",
    serve: "built",
    route: () => "/no-such-page",
    states: [{ name: "rest", root: "body" }],
  },
  {
    // Suggest while typing on: words for the task the session's skill is made for, and its chip.
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
            .waitFor();
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
