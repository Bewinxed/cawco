/**
 * A session the person talks to directly (no work item, no workspace) opens,
 * reads and edits a live-component sheet on the files it works on, as a
 * delegate does in its workspace (the owner, from a top-level chat: "is this
 * a gap in the design system tool?"). Its stage runs in the place over the
 * folder the session works in (hub caw.ts `stagePlaceRef`), in that place's
 * stage clone (agent stage-clone.ts): a clone of the checkout at its HEAD
 * with its uncommitted changes, kept in step with it, in a boundary of its
 * own, so the toolchain never writes the person's checkout.
 *
 * On a scratch fleet, a Claude Code session spawned in the fleet's repo,
 * which holds a Vite + Svelte project, all of it uncommitted (`Card.svelte`
 * and its story file; its bun.lock, which names the manager its stage clone
 * installs with, and nothing installed in the checkout), against the mock
 * model:
 *
 * 1. `design_map` answers the repo's components, `src/Card.svelte`
 *    with its story file, never "this session runs in no workspace".
 * 2. `artifact_create(kind: "component", file: "src/Card.stories.js", about)`
 *    answers an id and its stage `live`, which states it is a states file's on
 *    Vite (`runs: "sheet"`, `toolchain: "vite"`).
 * 3. A dashboard's raw `stageEnsure` control, naming a place id and a folder
 *    the hub never resolved (the same project, copied elsewhere), is refused
 *    at the hub's relay as the hub's to send, and never reaches the machine:
 *    no place record is kept for it (stage.ts `keepPlace`).
 * 4. `artifact_read` of it answers its stage `live` with no errors, and its
 *    story `One`.
 * 5. The sheet through the session's preview origin mounts `One`; the
 *    session rewrites `Card.svelte` with its shell, and the open sheet shows
 *    the edit in place, with no reload.
 *
 * Then a second session, in a checkout of its own whose node_modules the
 * session's boundary holds read-only, as `~/cockpit` is: a SvelteKit project
 * committed with its bun.lock and installed in place, its card and story
 * file uncommitted. SvelteKit's sync writes into the tree it serves
 * (`node_modules/$app/tsconfig.json`, `.svelte-kit/`); on a place over the
 * checkout it died "EROFS: read-only file system, open
 * '…/node_modules/$app/tsconfig.json'".
 *
 * 6. `design_map` answers `src/lib/Card.svelte` with its states file.
 * 7. `artifact_create(kind: "component", file: "src/lib/Card.stories.js", about)`
 *    answers an id and its stage `live`.
 * 8. The checkout holds nothing the stage wrote: its `git status
 *    --ignored` as before the legs, and no `node_modules/$app`.
 *
 * Then a third session, in a checkout of a Vite + Svelte project committed
 * with an npm package-lock.json and nothing installed: its stage clone
 * installs with `npm ci` (the manager its lockfile names), not bun. The
 * fleet's agent runs with `CAWCO_STAGE_IDLE_MS` short, so its stage sleeps
 * within a minute of its last use.
 *
 * 9. `artifact_create(kind: "component")` there answers an id and its stage
 *    `live`.
 * 10. The hub's retire sweep (`POST /api/workspaces/retire`) holds the stage
 *     clone, filed as a workspace, for its stage that serves.
 * 11. Once the stage sleeps, a sweep retires the clone and its folder is
 *     gone.
 * 12. The next `design_map` there cuts it again and answers the card,
 *     and the sweep holds it again.
 *
 * Then back in the SvelteKit checkout, which also holds
 * `src/other/Other.svelte` and its own Prettier with this repository's
 * `.prettierrc`:
 *
 * 13. `design_map({ dir: "src/lib" })` answers `src/lib/Card.svelte`
 *     alone: the folder asked for, not the whole app.
 * 14. `design_map({ dir: "../.." })` is refused, saying it is outside.
 * 15. `artifact_update` of story `One`'s args with a title past the print
 *     width leaves the story file passing the project's `prettier --check`,
 *     and changes nothing outside that story's statement.
 *
 * Then back in the first session's folder, a story file that builds its
 * stories four ways: a literal, a spread of a local object, a call of a
 * local helper, and a spread of an imported helper's call.
 *
 * 16. `artifact_create(kind: "component")` of it answers an id and its stage
 *     `live`.
 * 17. `artifact_read({ detail: "story" })` answers each story's own args as
 *     the file builds them (the literal's, the spread's, the helper call's)
 *     and the imported one's empty rather than the meta's; an
 *     `artifact_update` of the imported one's args is refused "args not
 *     readable here", with its export name and the reason, and one of the
 *     spread's as shared code, the file unchanged by either.
 *
 * Then the first session's card in its panel on the dashboard, a page open
 * on the session as the person has it, the browser's colour-scheme
 * emulation off so a frame hears its element's `color-scheme`:
 *
 * 18. The panel head (side/head.ts `standing`, DESIGN.md Artifact panel):
 *     at the desk, the canvas's name short of the 120px it keeps, every
 *     control stands, in head order, with no More, each in the form
 *     `standing` gives it: under a 640px head (the desk's pane is 523px)
 *     Send picks and Comments by glyph and count, their words not drawn,
 *     every other control whole;
 *     at 390 the mode stands as its one button, More stands before Close,
 *     and More's menu holds the controls that went to it, in head order.
 * 19. The sidebar's theme switch, with no reload, turns the canvas frame's
 *     `color-scheme` from light to dark, and the frame's own
 *     `prefers-color-scheme: dark` from false to true.
 * 20. A real held press on the canvas view stands it `data-pressed` at
 *     scale 0.97 while held and lets both go on release; its menu opens on
 *     the press and stays open.
 * 21. The panel, its head included, at the desk and at 390 in light and
 *     dark, captured to `$TMPDIR/caps/` for a reviewer; the spec reads none.
 * 22. Once the panel has opened (its page resized a frame at a time), the
 *     first frame stands in the middle of the canvas, at the desk and at 390:
 *     each centring measured where the world stands, never mid-move.
 * 23. Name once, description once, no route (owner: "ur also repeating the
 *     title of the card twice, the url should have the description there
 *     instead"): at the desk and at 390 the line under the head's name is
 *     the canvas's `about`, one line inside the panel and whole in its
 *     tooltip; the name stands once across the panel and its canvas page,
 *     and no text in either holds `/@cawco/`.
 * 24. The hub's map of that canvas (`GET …/artifacts/:id/map`, what the
 *     panel's Map reads) answers Card in the middle with its states, its
 *     states file from the toolchain root, and its frames' thumbnail from
 *     the panel's draw; nothing renders it and it renders nothing.
 *
 * The stage's boundary is made of user namespaces: like a spec that
 * delegates, it runs outside every workspace boundary (README "A spec that
 * delegates runs on the host").
 *
 *   bun scripts/probe-kit/run.ts session-sheet
 */
import { existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { Page } from "playwright-core";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import { type CanvasMap, STAGE_ENSURE } from "../../../packages/core/src/stage";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, ROOT, type Spec } from "../kit";

const STORY = "src/Card.stories.js";
/** A story file whose stories are built four ways (legs 16 and 17). */
const MIXED = "src/Mixed.stories.js";
const REFUSAL = "this session runs in no workspace";

/** The project in the session's folder: plain Vite and Svelte, installed only in its stage clone. */
const PROJECT: Record<string, string> = {
  ".gitignore": "node_modules\n",
  "package.json": JSON.stringify({
    name: "probe-cards",
    private: true,
    type: "module",
    devDependencies: {
      "@sveltejs/vite-plugin-svelte": "^7.3.1",
      svelte: "5.57.1",
      vite: "^8.3.4",
    },
  }),
  "vite.config.mjs": `import { svelte } from "@sveltejs/vite-plugin-svelte";
export default { plugins: [svelte()], server: { fs: { strict: false } } };
`,
  "index.html": "<!doctype html><html><head></head><body></body></html>\n",
  "src/Card.svelte": `<script>
  let { title } = $props();
</script>

<h2 data-probe="title">{title}</h2>
`,
  [STORY]: `import Card from "./Card.svelte";

export default { component: Card, args: { title: "Hello" } };

export const One = { args: {} };
`,
  "src/fixture.js":
    "export const fixture = (title) => ({ args: { title } });\n",
  [MIXED]: `import Card from "./Card.svelte";
import { fixture } from "./fixture.js";

export default { component: Card, args: { title: "Meta" } };

const shared = { args: { title: "Shared" } };
function card(title) {
  return { component: Card, args: { title } };
}

export const Literal = { args: { title: "Literal" } };
export const Spread = { parameters: {}, ...shared };
export const Helper = card("Helper");
export const Imported = { ...fixture("Imported") };
`,
};

/** A SvelteKit project, committed as a checkout of its own: its tsconfig extends the one Kit's sync writes into node_modules, as the dashboard's does. */
const KIT: Record<string, string> = {
  ".gitignore": "node_modules\n.svelte-kit\n",
  "package.json": JSON.stringify({
    name: "probe-kit",
    private: true,
    type: "module",
    devDependencies: {
      "@sveltejs/kit": "^3.1.0",
      "@sveltejs/vite-plugin-svelte": "^7.3.1",
      // Its own formatter, as this repository pins it with the plugin its .prettierrc names: a sheet's write is formatted by it (leg 15).
      prettier: "3.9.10",
      "prettier-plugin-svelte": "4.1.1",
      svelte: "5.57.1",
      vite: "^8.3.4",
    },
  }),
  // A component outside src/lib: a design_map of src/lib leaves it out (leg 13).
  "src/other/Other.svelte": "<p>other</p>\n",
  "vite.config.ts": `import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [sveltekit()] });
`,
  "tsconfig.json": '{ "extends": "$app/tsconfig" }\n',
  "src/app.html":
    "<!doctype html>\n<html>\n<head>%sveltekit.head%</head>\n<body>%sveltekit.body%</body>\n</html>\n",
  "src/routes/+page.svelte": "<h1>kit</h1>\n",
};

const KIT_STORY = "src/lib/Card.stories.js";

/** The Kit project's card and its story file, left uncommitted: the stage shows what the session sees. */
const KIT_CARD: Record<string, string> = {
  "src/lib/Card.svelte": PROJECT["src/Card.svelte"] as string,
  [KIT_STORY]: PROJECT[STORY] as string,
};

/** A title long enough that a one-line `export const One = { args: { title: … } };` runs past Prettier's print width (leg 15). */
const LONG_TITLE =
  "A card title long enough to carry the story's args past the print width";

/** What the session's edit writes: the same card, its heading changed. */
const EDITED = `<script>\n  let { title } = $props();\n</script>\n\n<h2 data-probe="title">Edited {title}</h2>\n`;

/** What each numbered message asks the session to call, and what it answered. */
const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
/** A call's marker: its leg's number, and the letter of a leg's later calls (2c). */
const COMMAND = /PROBE-CALL:(\d+[a-z]?)/g;

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

const STATUS = /"status":"(\w+)"/;

const ERRORS = /"errors":(\[[^\]]*\])/;
const ID = /"id":"([0-9a-f-]{36})"/;
const short = (said: string) => said.replaceAll(/\s+/g, " ").slice(0, 500);

/** A place id no session names: what a dashboard's raw stage control could invent. */
const FORGED_PLACE = "0badc0de-caw";

/** `files` written into `dir`, each folder made. */
const writeFiles = async (dir: string, files: Record<string, string>) => {
  await Promise.all(
    Object.entries(files).map(async ([file, text]) => {
      await mkdir(dirname(join(dir, file)), { recursive: true });
      await writeFile(join(dir, file), text);
    })
  );
};

/**
 * {@link KIT} in a checkout of its own at `dir`: installed in place by bun
 * (a real node_modules, held read-only by a place's boundary), committed
 * with its bun.lock, and {@link KIT_CARD} left uncommitted.
 */
const writeKit = async (dir: string) => {
  await writeFiles(dir, {
    ...KIT,
    // This repository's own Prettier config: its fmt.ts checks with it.
    ".prettierrc": await readFile(join(ROOT, ".prettierrc"), "utf8"),
  });
  await Bun.$`bun install --no-progress`.cwd(dir).quiet();
  await Bun.$`git init -q && git add -A && git -c user.email=p@p -c user.name=p commit -q -m kit`
    .cwd(dir)
    .quiet();
  await writeFiles(dir, KIT_CARD);
};

/** How long the fleet's stages run unused before they sleep (agent stage.ts `CAWCO_STAGE_IDLE_MS`). */
const IDLE_MS = 30_000;

/** A Vite + Svelte project whose package-lock.json names npm as its manager. */
const NPM: Record<string, string> = {
  ".gitignore": "node_modules\n",
  "package.json": JSON.stringify({
    name: "probe-npm",
    private: true,
    type: "module",
    devDependencies: {
      "@sveltejs/vite-plugin-svelte": "^7.3.1",
      svelte: "5.57.1",
      vite: "^8.3.4",
    },
  }),
  "vite.config.mjs": `import { svelte } from "@sveltejs/vite-plugin-svelte";
export default { plugins: [svelte()] };
`,
  "index.html": PROJECT["index.html"] as string,
  "src/Card.svelte": PROJECT["src/Card.svelte"] as string,
  [STORY]: PROJECT[STORY] as string,
};

/** {@link NPM} committed in a checkout of its own at `dir` with the package-lock.json npm resolves for it, and nothing installed. */
const writeNpm = async (dir: string) => {
  await writeFiles(dir, NPM);
  await Bun.$`npm install --package-lock-only --ignore-scripts --no-audit --no-fund`
    .cwd(dir)
    .quiet();
  await Bun.$`git init -q && git add -A && git -c user.email=p@p -c user.name=p commit -q -m npm`
    .cwd(dir)
    .quiet();
};

/** The stage clone the fleet's machine cut from the checkout at `checkout`, by its record (agent stage-clone.ts): its workspace id and folder. */
const stageCloneIn = async (
  home: string,
  checkout: string
): Promise<{ id: string; path: string } | undefined> => {
  const dir = join(home, ".cawco", "workspaces");
  const repo = await realpath(checkout);
  for (const id of await readdir(dir).catch(() => [] as string[])) {
    // biome-ignore lint/performance/noAwaitInLoops: a handful of records, read until the one cut from the checkout
    const kept = await Bun.file(join(dir, id, "stage-clone.json"))
      .json()
      .catch(() => undefined);
    const made = await Bun.file(join(dir, id, "create.json"))
      .json()
      .catch(() => undefined);
    if (kept?.repo === repo && typeof made?.path === "string") {
      return { id, path: made.path };
    }
  }
};

/** One retire sweep of the hub's, as it answers (hub workspace-retire.ts `RetireSweep`). */
const sweep = async (
  base: string
): Promise<{
  held: unknown[];
  kept: { hold: string; workspaceId: string }[];
  retired: { workspaceId: string }[];
}> =>
  (await (
    await fetch(`${base}/api/workspaces/retire`, { method: "POST" })
  ).json()) as Awaited<ReturnType<typeof sweep>>;

/** {@link PROJECT} written into `dir` with the bun.lock bun resolves for it, nothing installed: the stage clone installs from it (agent stage-clone.ts `installOf`). */
const writeProject = async (dir: string) => {
  await writeFiles(dir, PROJECT);
  await Bun.$`bun install --lockfile-only --no-progress`.cwd(dir).quiet();
};

/** Legs 2b to 2e: the component canvas's answers through the session's own tools. */
const componentLegs = async (
  kit: Kit,
  call: (n: string, name: string, input: object) => Promise<string>,
  created: string,
  id: string | undefined
) => {
  // 2b. No panel drew it (this run opens no dashboard): the daemon did, in the machine's Chromium.
  kit.check(
    "2b: with no panel open, artifact_create's answer is the daemon's draw: by stage, every frame drawn",
    created.includes('"by":"stage"') &&
      created.includes('"state":"drawn"') &&
      !created.includes('"state":"unseen"'),
    short(created.slice(created.indexOf('"render"')))
  );

  // 2c. A canvas with no word on what it is for is refused, with the shape and an example.
  const bare = await call("2c", "mcp__cawco__artifact_create", {
    kind: "component",
    name: "bare",
    file: STORY,
  });
  kit.check(
    "2c: artifact_create(kind: component) with no about is refused with its shape and an example",
    bare.includes("takes about") && bare.includes('kind: "component"'),
    short(bare)
  );

  // 2d. One frame read: its state, its parts; a fresh draw on asking.
  if (id) {
    const frame = await call("2d", "mcp__cawco__artifact_read", {
      id,
      state: { story: "One", interaction: "rest" },
      render: true,
    });
    kit.check(
      "2d: artifact_read with state answers that frame, drawn, with the component chain it drew; render: true is the daemon's draw",
      frame.includes('"frame":{"story":"One"') &&
        frame.includes('"parts":[{') &&
        frame.includes('"by":"stage"'),
      short(frame.slice(frame.indexOf('"frame"')))
    );
  }

  // 2e. The library's card of the component: its states file and stories.
  const card = await call("2e", "mcp__cawco__design_map", {
    component: "src/Card.svelte",
  });
  kit.check(
    "2e: design_map with component answers its card: states file, stories, used in and made of",
    // Mixed.stories.js renders Card too: the card lists both.
    card.includes('"statesFiles":[') &&
      card.includes(`"${STORY}"`) &&
      card.includes('"stories":[{') &&
      card.includes('"usedIn":['),
    short(card)
  );
};

/** Legs 16 and 17, in the first session's folder: a sheet whose stories are built by spreads and helpers. */
async function builtStories(
  kit: Kit,
  call: (n: string, name: string, input: object) => Promise<string>,
  repo: string
): Promise<void> {
  // 16. The sheet made.
  const mixed = await call("16", "mcp__cawco__artifact_create", {
    kind: "component",
    name: "mixed",
    file: MIXED,
    about: "The card's stories, built four ways",
  });
  const mixedId = mixed.match(ID)?.[1];
  kit.check(
    "16: artifact_create(kind: component) of the story file built four ways answers an id and its stage live",
    !!mixedId && mixed.match(STATUS)?.[1] === "live",
    short(mixed)
  );

  // 17. Each story's args as the file builds them, one story at a time.
  const detail = async (n: string, story: string) =>
    mixedId
      ? await call(n, "mcp__cawco__artifact_read", {
          id: mixedId,
          detail: "story",
          story,
        })
      : "no sheet from leg 16";
  const reads = {
    Literal: await detail("17a", "Literal"),
    Spread: await detail("17b", "Spread"),
    Helper: await detail("17c", "Helper"),
    Imported: await detail("17d", "Imported"),
  };
  const argsOf = (name: keyof typeof reads, args: object) =>
    reads[name].includes(
      `"story":{"name":"${name}","args":${JSON.stringify(args)}`
    );
  kit.check(
    "17: artifact_read with detail story answers the literal, spread and helper stories' own args, and the imported one's empty",
    argsOf("Literal", { title: "Literal" }) &&
      argsOf("Spread", { title: "Shared" }) &&
      argsOf("Helper", { title: "Helper" }) &&
      argsOf("Imported", {}),
    Object.entries(reads)
      .map(([name, said]) => {
        const at = said.indexOf('"story":{');
        return `${name} ${at < 0 ? short(said).slice(0, 200) : said.slice(at, at + 160)}`;
      })
      .join("; ")
  );

  // 17. A write the file's code decides is refused with why, and writes nothing.
  const mixedPath = join(repo, MIXED);
  const before = await readFile(mixedPath, "utf8");
  const write = (n: string, story: string) =>
    mixedId
      ? call(n, "mcp__cawco__artifact_update", {
          id: mixedId,
          args: { story, values: { title: "Written" } },
        })
      : Promise.resolve("no sheet from leg 16");
  const imported = await write("17e", "Imported");
  const spread = await write("17f", "Spread");
  const after = await readFile(mixedPath, "utf8");
  kit.check(
    "17: an args write to the imported story is refused, args not readable here, with its name and why; one to the spread story as shared code; the file unchanged",
    imported.includes("Imported: args not readable here") &&
      imported.includes("./fixture.js") &&
      spread.includes("code other stories may share") &&
      after === before,
    `imported: ${short(imported).slice(0, 250)}; spread: ${short(spread).slice(0, 250)}; file ${after === before ? "unchanged" : "changed"}`
  );
}

/** The artifact panel, as the session page holds it. */
const PANE =
  ':is([data-slot="preview-pane"], [data-side-surface-class~="preview-pane"])';
/** The canvas page's frame, which the panel themes (PreviewPane `data-scheme`). */
const FRAME = `${PANE} iframe[data-scheme]`;
/** The controls with words, which only a head 640px or wider draws (side/head.ts `WORDS_FROM`). */
const WORDED = new Set(["send", "comments"]);
/** DESIGN.md's head order, Send picks to Expand; Close stands after them all. */
const HEAD_ORDER = [
  "send",
  "create",
  "undock",
  "open",
  "view",
  "inspect",
  "mode",
  "comments",
  "reload",
  "expand",
];
/** Where the panel's pictures go for a reviewer, as component-canvas's do. */
const CAPS = join(process.env.TMPDIR ?? "/tmp", "caps");
const SCALE = /^matrix\(([\d.]+), 0, 0, ([\d.]+),/;

/** The head as drawn: its width (what the words key on), its room inside its padding and the name's own width (what side/head.ts `standing` reads), each control's key, whether it stands, its form, whether its word is drawn, its name; then whether More and Close stand, More before Close. */
const headOf = (page: Page) =>
  page.evaluate((pane) => {
    const head = document.querySelector<HTMLElement>(
      `${pane} [data-slot="side-head"]`
    );
    const style = head ? getComputedStyle(head) : null;
    const lead = head?.querySelector(":scope > .identity > *");
    const items = [
      ...(head?.querySelectorAll<HTMLElement>(":scope > [data-head-item]") ??
        []),
    ].map((one) => {
      const control = one.querySelector("[aria-label], button");
      const word = one.querySelector(".comments-label, .send-label");
      return {
        key: one.dataset.headItem ?? "",
        stands: !one.hidden,
        form: one.dataset.form ?? null,
        word: !!word && getComputedStyle(word).display !== "none",
        name:
          control?.getAttribute("aria-label") ??
          control?.textContent?.trim() ??
          "",
      };
    });
    const more = head?.querySelector<HTMLElement>(
      ':scope > [data-slot="more"]'
    );
    const close = head?.querySelector<HTMLElement>(
      ':scope > [data-slot="close"]'
    );
    return {
      width: head?.clientWidth ?? null,
      room:
        head && style
          ? head.clientWidth -
            Number.parseFloat(style.paddingInlineStart) -
            Number.parseFloat(style.paddingInlineEnd)
          : null,
      name: lead ? Math.round(lead.getBoundingClientRect().width) : null,
      items,
      more: !!more,
      moreBeforeClose:
        !!(more && close) &&
        more.getBoundingClientRect().right <=
          close.getBoundingClientRect().left + 0.5,
      closeLast: head?.lastElementChild === close,
    };
  }, PANE);

/** The page of session `session` with its panel standing on the canvas `name` made, the colour-scheme emulation off. */
const panelPage = async (
  kit: Kit,
  base: string,
  session: string,
  view: "desk" | "phone",
  theme: "light" | "dark"
) => {
  const page = await kit.page(view, { theme });
  await page.emulateMedia({ colorScheme: null });
  await open(page, `${base}/session/${session}`, '[data-slot="pane"]');
  return page;
};

/** The canvas drawn in the panel's frame: its card's heading stands. */
const drawn = (page: Page) =>
  page
    .frameLocator(FRAME)
    .first()
    .locator('[data-probe="title"]')
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });

/** The panel, its head included, as a reviewer sees it. */
const capture = async (page: Page, name: string) => {
  await mkdir(CAPS, { recursive: true });
  await page
    .locator(PANE)
    .first()
    .screenshot({ path: join(CAPS, `${name}.png`), animations: "disabled" });
};

/** The frame's element's `color-scheme`, and `prefers-color-scheme: dark` as the frame's own document hears it. */
const schemeOf = async (page: Page) => {
  const element = page.locator(FRAME).first();
  const frame = await (await element.elementHandle())?.contentFrame();
  return {
    colorScheme: await element.evaluate(
      (el) => getComputedStyle(el).colorScheme
    ),
    prefersDark: frame
      ? await frame.evaluate(
          () => matchMedia("(prefers-color-scheme: dark)").matches
        )
      : null,
  };
};

/** The canvas view's trigger as a held press leaves it. */
const pressOf = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => ({
    pressed: el.getAttribute("data-pressed"),
    transform: getComputedStyle(el).transform,
    expanded: el.getAttribute("aria-expanded"),
    menu: !!document.querySelector('[role="menu"]'),
  }));

/** Whether a computed transform is a scale of `to` (to the third place), or none at all for 1. */
const scaled = (transform: string, to: number) => {
  if (to === 1) {
    return transform === "none";
  }
  const [, x, y] = transform.match(SCALE) ?? [];
  return Math.abs(Number(x) - to) < 0.001 && Math.abs(Number(y) - to) < 0.001;
};

/**
 * The canvas's name and description in legs 18 and 23: words no other text
 * in the panel holds. The name is short on purpose: its trigger (glyph, name,
 * chevron) stays under side/head.ts `NAME_KEEPS` (120px), the room leg 18's
 * desk claim stands on. At a 523px pane the head's room is 509px; every
 * control whole needs the name's width + 392px, so a name at the cap leaves
 * the mode 3px short (1ab897290's "probe-panel-card" did), and "pcard"'s
 * 92px leaves 25px to spare.
 */
const PANEL_NAME = "pcard";
/** The description the panel's artifact is made with: the head's line under the name reads it (leg 23). */
const PANEL_DESCRIPTION = "The card in its panel, at every width";

/** Leg 23's read: the head's line under the name and where it stands, and the name and any route across the rendered text of the panel and its canvas page. */
async function describedOf(page: Page) {
  const outer = await page
    .locator(PANE)
    .first()
    .evaluate((pane, name) => {
      const card = (pane.closest('[data-slot="side-card"]') ??
        pane) as HTMLElement;
      const line = card.querySelector<HTMLElement>('[data-slot="subtitle"]');
      const box = line?.getBoundingClientRect();
      const edge = card.getBoundingClientRect();
      // What is drawn, not what is hidden (a control in More, a band's hidden name).
      const text = card.innerText;
      return {
        line: line?.textContent ?? null,
        tooltip: line?.title ?? null,
        inside:
          !!box && box.left >= edge.left - 0.5 && box.right <= edge.right + 0.5,
        oneLine:
          !!line &&
          !!box &&
          box.height <=
            Number.parseFloat(getComputedStyle(line).lineHeight) + 1,
        names: text.split(name).length - 1,
        route: text.includes("/@cawco/"),
      };
    }, PANEL_NAME);
  const frame = await (
    await page.locator(FRAME).first().elementHandle()
  )?.contentFrame();
  const inner = frame
    ? await frame.evaluate((name) => {
        // The chrome's shadow root has no innerText: its drawn text nodes, so
        // the band's name and about, hidden in a frame (chrome.ts), count none.
        const root = document.getElementById("cawco-chrome")?.shadowRoot;
        const shown: string[] = [];
        if (root) {
          const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let node = walk.nextNode(); node; node = walk.nextNode()) {
            if (node.parentElement?.checkVisibility()) {
              shown.push(node.textContent ?? "");
            }
          }
        }
        const text = `${document.body.innerText}\n${shown.join("\n")}`;
        return {
          names: text.split(name).length - 1,
          route: text.includes("/@cawco/"),
        };
      }, PANEL_NAME)
    : null;
  return { ...outer, frame: inner };
}

/** What leg 23 finds wrong in one read, each as what it compared (none: it holds): the description under the name, one line inside the panel, the name once across panel and page, no route. */
const describedWrong = (read: Awaited<ReturnType<typeof describedOf>>) => {
  const names = read.names + (read.frame?.names ?? 0);
  return [
    read.line === PANEL_DESCRIPTION
      ? ""
      : `line ${JSON.stringify(read.line)} is not ${JSON.stringify(PANEL_DESCRIPTION)}`,
    read.tooltip === PANEL_DESCRIPTION
      ? ""
      : `tooltip ${JSON.stringify(read.tooltip)} is not ${JSON.stringify(PANEL_DESCRIPTION)}`,
    read.inside ? "" : "line outside the panel",
    read.oneLine ? "" : "line on more than one line",
    read.frame ? "" : "no canvas frame to read",
    names === 1
      ? ""
      : `name ${read.names} in the panel + ${read.frame?.names ?? "?"} in the page = ${names}, not 1`,
    read.route || read.frame?.route ? "a route stands" : "",
  ].filter(Boolean);
};

/** Legs 18 to 24: the first session's card in its panel on the dashboard. */
async function panelLegs(
  kit: Kit,
  call: (n: string, name: string, input: object) => Promise<string>,
  base: string,
  session: string
): Promise<void> {
  // The page open first, so the canvas the session makes stands in its panel.
  const desk = await panelPage(kit, base, session, "desk", "light");
  const made = await call("18", "mcp__cawco__artifact_create", {
    kind: "component",
    name: PANEL_NAME,
    file: STORY,
    about: PANEL_DESCRIPTION,
  });
  await desk
    .locator(`${FRAME}[data-ready]`)
    .first()
    .waitFor({ timeout: 120_000 });
  await drawn(desk);

  // 18. The head at the desk: every control stands, in head order, no More;
  // under a 640px head the worded ones by glyph and count, the rest whole.
  const wide = await headOf(desk);
  const keys = wide.items.map((one) => one.key);
  const worded = (wide.width ?? 0) >= 640;
  kit.check(
    "18: at the desk every head control stands, in head order, with no More, Close last; under a 640px head Send picks and Comments by glyph and count with no word drawn, every other control whole",
    wide.items.length > 0 &&
      wide.items.every(
        (one) =>
          one.stands &&
          (WORDED.has(one.key)
            ? one.word === (one.form === "whole") &&
              (worded || one.form === "compact")
            : one.form === "whole")
      ) &&
      keys.every((key) => HEAD_ORDER.includes(key)) &&
      keys.every(
        (key, at) =>
          at === 0 ||
          HEAD_ORDER.indexOf(key) > HEAD_ORDER.indexOf(keys[at - 1] ?? "")
      ) &&
      !wide.more &&
      wide.closeLast,
    JSON.stringify(wide)
  );

  // 19. The theme switched in the sidebar, no reload: the frame's scheme follows.
  const light = await schemeOf(desk);
  await capture(desk, "panel-desk-light");
  await desk.evaluate(() => {
    (window as unknown as { __stayed: boolean }).__stayed = true;
  });
  await desk.getByRole("button", { name: "Light mode" }).first().click();
  await desk.waitForFunction(() =>
    document.documentElement.classList.contains("dark")
  );
  const dark = await until(
    "the frame's scheme dark",
    () => schemeOf(desk),
    (now) => now.colorScheme === "dark" && now.prefersDark === true,
    10_000
  ).catch(() => schemeOf(desk));
  const stayed = await desk.evaluate(
    () => (window as unknown as { __stayed?: boolean }).__stayed === true
  );
  kit.check(
    "19: the sidebar's theme switch, with no reload, turns the frame's color-scheme light to dark and its prefers-color-scheme dark false to true",
    light.colorScheme === "light" &&
      light.prefersDark === false &&
      dark.colorScheme === "dark" &&
      dark.prefersDark === true &&
      stayed,
    `light ${JSON.stringify(light)}; dark ${JSON.stringify(dark)}; ${stayed ? "no reload" : "reloaded"}`
  );
  await capture(desk, "panel-desk-dark");

  // 20. A real held press on the canvas view.
  const trigger = `${PANE} [data-head-item="view"] [aria-label="Canvas view"]`;
  const box = await desk.locator(trigger).boundingBox();
  const before = await pressOf(desk, trigger);
  let held = before;
  let settled = before;
  if (box) {
    await desk.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await desk.mouse.down();
    await desk.waitForTimeout(60);
    held = await pressOf(desk, trigger);
    await desk.waitForTimeout(400);
    settled = await pressOf(desk, trigger);
    await desk.mouse.up();
  }
  await desk.waitForTimeout(300);
  const released = await pressOf(desk, trigger);
  kit.check(
    "20: a held press on the canvas view stands it data-pressed at scale 0.97, lets both go on release, and its menu opens on the press and stays open",
    before.pressed === null &&
      held.pressed === "true" &&
      held.expanded === "true" &&
      held.menu &&
      settled.pressed === "true" &&
      scaled(settled.transform, 0.97) &&
      released.pressed === null &&
      scaled(released.transform, 1) &&
      released.expanded === "true" &&
      released.menu,
    `before ${JSON.stringify(before)}; 60ms ${JSON.stringify(held)}; 460ms ${JSON.stringify(settled)}; released ${JSON.stringify(released)}`
  );
  await desk.keyboard.press("Escape");
  const described = { desk: await describedOf(desk) } as Record<
    string,
    Awaited<ReturnType<typeof describedOf>>
  >;

  // 18 and 21 at 390, light and dark: the mode as one button, More before Close holding the rest.
  for (const theme of ["light", "dark"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one phone page at a time
    const phone = await panelPage(kit, base, session, "phone", theme);
    await drawn(phone);
    const narrow = await headOf(phone);
    const gone = narrow.items.filter((one) => !one.stands);
    const mode = narrow.items.find((one) => one.key === "mode");
    await phone.locator(`${PANE} [data-slot="more"]`).click();
    const entries = await phone
      .locator(
        '[role="menu"] :is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"])'
      )
      .allTextContents();
    const at = gone.map((one) =>
      entries.findIndex((entry) => entry.trim() === one.name)
    );
    kit.check(
      `18: at 390 (${theme}) the mode stands as its one button, More before Close, and More's menu holds what went to it in head order`,
      mode?.stands === true &&
        mode.form === "compact" &&
        narrow.more &&
        narrow.moreBeforeClose &&
        narrow.closeLast &&
        gone.length > 0 &&
        at.every((one, n) => one >= 0 && (n === 0 || one > (at[n - 1] ?? -1))),
      `head ${JSON.stringify(narrow)}; More's entries ${JSON.stringify(entries)}`
    );
    await phone.keyboard.press("Escape");
    described[`phone-${theme}`] = await describedOf(phone);
    await capture(phone, `panel-phone-${theme}`);
  }
  kit.check(
    "23: at the desk and at 390 the line under the name is the canvas's about, one line inside the panel and whole in its tooltip; the name stands once across the panel and its page, and no text holds /@cawco/",
    Object.keys(described).length === 3 &&
      Object.values(described).every(
        (read) => describedWrong(read).length === 0
      ),
    JSON.stringify(
      Object.fromEntries(
        Object.entries(described).map(([at, read]) => [
          at,
          { wrong: describedWrong(read), ...read },
        ])
      )
    )
  );

  // 24. The hub's map of the canvas, read as the panel's Map reads it.
  const madeId = made.match(ID)?.[1];
  const mapRead = madeId
    ? await desk.evaluate(
        async (path) => {
          const answer = await fetch(path);
          return {
            status: answer.status,
            body: (await answer.json().catch(() => null)) as CanvasMap | null,
          };
        },
        `/api/instances/${encodeURIComponent(session)}/artifacts/${madeId}/map`
      )
    : null;
  const center = mapRead?.body?.center;
  kit.check(
    "24: the hub's map of the canvas answers Card in the middle with its states, its states file from the toolchain root and its frames' thumbnail, nothing above or below it",
    mapRead?.status === 200 &&
      center?.name === "Card" &&
      center.file === "src/Card.svelte" &&
      center.statesFiles.includes(STORY) &&
      center.states >= 1 &&
      (center.thumb?.frames.length ?? 0) > 0 &&
      mapRead.body?.usedIn.length === 0 &&
      mapRead.body?.madeOf.length === 0,
    JSON.stringify(mapRead).slice(0, 800)
  );
  const pictures = [
    "panel-desk-light",
    "panel-desk-dark",
    "panel-phone-light",
    "panel-phone-dark",
  ].map((name) => join(CAPS, `${name}.png`));
  const sizes = await Promise.all(pictures.map((path) => Bun.file(path).size));
  kit.check(
    "21: the panel, its head included, is captured at the desk and at 390 in light and dark, for a reviewer",
    sizes.every((size) => size > 0),
    pictures.map((path, n) => `${path} ${sizes[n]} bytes`).join("; ")
  );
}

/** Leg 22: the first frame stands in the middle of the canvas once the panel has opened, at the desk and at 390. */
async function centredLegs(
  kit: Kit,
  base: string,
  session: string
): Promise<void> {
  for (const view of ["desk", "phone"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    const page = await panelPage(kit, base, session, view, "light");
    await drawn(page);
    const frame = await (
      await page.locator(FRAME).first().elementHandle()
    )?.contentFrame();
    const said = frame
      ? await frame.evaluate(async () => {
          const world = document.querySelector(".cawco-world") as HTMLElement;
          // The panel's opening resizes the page a frame at a time: read once it and its moves have settled.
          let width = 0;
          while (width !== innerWidth) {
            width = innerWidth;
            // biome-ignore lint/performance/noAwaitInLoops: one width after the last, until it holds
            await new Promise((done) => setTimeout(done, 300));
          }
          await Promise.all(world.getAnimations().map((one) => one.finished));
          const canvas = document
            .querySelector(".cawco-canvas")
            ?.getBoundingClientRect();
          const first = document
            .querySelector(".cawco-frame")
            ?.getBoundingClientRect();
          return canvas && first
            ? {
                canvas: canvas.x + canvas.width / 2,
                frame: first.x + first.width / 2,
                width: canvas.width,
              }
            : null;
        })
      : null;
    kit.check(
      `22: at ${view === "desk" ? "the desk" : "390"} the first frame stands in the middle of the canvas once the panel has opened`,
      !!said && Math.abs(said.frame - said.canvas) <= 0.5,
      JSON.stringify(said)
    );
  }
}

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  await writeProject(fleet.repo);
  const elsewhere = join(fleet.sandbox, "elsewhere");
  await writeProject(elsewhere);
  const kitDir = join(fleet.sandbox, "kit");
  await writeKit(kitDir);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  const npmDir = join(fleet.sandbox, "npm");
  await writeNpm(npmDir);
  // Short enough that the npm stage sleeps within a minute of its last use (legs 10–12).
  fleet.launch("agent", [], { CAWCO_STAGE_IDLE_MS: String(IDLE_MS) });
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Cards", fleet.repo);
  /** Asks session `who` to make call `n`, and waits for what it answered. */
  const call = async (
    n: string,
    name: string,
    input: object,
    who: string = session
  ) => {
    asks.set(n, { name, input });
    await fleet.send(who, `PROBE-CALL:${n}`);
    return (await until(
      `${name}'s answer`,
      () => answered.get(n),
      Boolean,
      240_000
    )) as string;
  };

  // 1. The components of the session's folder.
  const listed = await call("1", "mcp__cawco__design_map", {
    response_format: "detailed",
  });
  kit.check(
    "1: design_map answers the folder's components, Card.svelte with its states file",
    !listed.includes(REFUSAL) &&
      listed.includes('"src/Card.svelte"') &&
      listed.includes(`"${STORY}"`),
    short(listed)
  );

  // 2. The sheet made, on a stage over the session's folder.
  const created = await call("2", "mcp__cawco__artifact_create", {
    kind: "component",
    name: "cards",
    file: STORY,
    about: "The card in each of its states",
  });
  const id = created.match(ID)?.[1];
  kit.check(
    "2: artifact_create(kind: component) answers an id and its stage live",
    !!id && created.match(STATUS)?.[1] === "live",
    short(created)
  );
  kit.check(
    "2: its stage states what it runs: a sheet's, on Vite",
    created.includes('"runs":"sheet"') &&
      created.includes('"toolchain":"vite"'),
    short(created)
  );

  await componentLegs(kit, call, created, id);

  // 3. A dashboard's raw stage control, on a folder the hub never resolved.
  // A machine that took it answers once its stage is up or has failed.
  const forged = await fleet.controlAnswer(
    STAGE_ENSURE,
    [{ id: FORGED_PLACE, path: elsewhere }, STORY],
    180_000
  );
  const kept = existsSync(
    join(fleet.env.HOME as string, ".cawco", "workspaces", FORGED_PLACE)
  );
  kit.check(
    "3: a dashboard's stageEnsure naming an arbitrary folder is refused at the relay, and the machine keeps no place for it",
    !forged.ok &&
      (forged.error ?? "").includes(`${STAGE_ENSURE} is the hub's to send`) &&
      !kept,
    `${JSON.stringify(forged).slice(0, 300)}; place record ${kept ? "kept" : "none"}`
  );
  // 4 and 5 read and edit the sheet leg 2 made.
  if (id) {
    await readAndEdit(id);
  }

  // 6. A session in a checkout whose node_modules its boundary holds read-only, as ~/cockpit's are.
  const status = () =>
    Bun.$`git status --porcelain --ignored --untracked-files=all`
      .cwd(kitDir)
      .text();
  const untouched = await status();
  const kitSession = await fleet.spawn("claude", "Kit", kitDir);
  const kitListed = await call(
    "6",
    "mcp__cawco__design_map",
    { response_format: "detailed" },
    kitSession
  );
  kit.check(
    "6: design_map in a checkout read-only to its boundary answers src/lib/Card.svelte with its states file",
    kitListed.includes('"src/lib/Card.svelte"') &&
      kitListed.includes(`"${KIT_STORY}"`),
    short(kitListed)
  );

  // 7. The sheet made on that checkout, its stage live.
  const kitCreated = await call(
    "7",
    "mcp__cawco__artifact_create",
    {
      kind: "component",
      name: "kit-cards",
      file: KIT_STORY,
      about: "The kit's card in each of its states",
    },
    kitSession
  );
  kit.check(
    "7: artifact_create(kind: component) there answers an id and its stage live",
    !!kitCreated.match(ID)?.[1] && kitCreated.match(STATUS)?.[1] === "live",
    short(kitCreated)
  );

  // 8. Nothing of the stage's in the checkout.
  // What a session's own spawn may place (its project Claude dir) is the session's, not the stage's.
  const prior = new Set(untouched.split("\n"));
  const sessions = `${relative(kitDir, projectClaudeDir(kitDir))}/`;
  const made = (await status())
    .split("\n")
    .filter((line) => !(prior.has(line) || line.slice(3).startsWith(sessions)));
  const app = existsSync(join(kitDir, "node_modules", "$app"));
  kit.check(
    "8: the checkout holds nothing the stage wrote: no entry in its status it lacked before, and no node_modules/$app",
    made.length === 0 && !app,
    `new in its status: ${JSON.stringify(made)}; node_modules/$app ${app ? "made" : "none"}`
  );

  // 9. A checkout whose package-lock.json names npm, nothing installed: its stage clone runs `npm ci`.
  const npmSession = await fleet.spawn("claude", "Npm", npmDir);
  const npmCreated = await call(
    "9",
    "mcp__cawco__artifact_create",
    {
      kind: "component",
      name: "npm-cards",
      file: STORY,
      about: "The npm project's card in each of its states",
    },
    npmSession
  );
  kit.check(
    "9: artifact_create(kind: component) in an npm-lockfile checkout answers an id and its stage live",
    !!npmCreated.match(ID)?.[1] && npmCreated.match(STATUS)?.[1] === "live",
    short(npmCreated)
  );

  // 10. The hub holds the clone, filed as a workspace, while its stage serves.
  const clone = await stageCloneIn(fleet.env.HOME as string, npmDir);
  const serving = clone ? await sweep(fleet.base) : undefined;
  const hold = serving?.kept.find((one) => one.workspaceId === clone?.id);
  kit.check(
    "10: the retire sweep keeps the npm stage clone for its stage that serves",
    !!hold?.hold.includes("sheet stage"),
    `clone ${clone ? `${clone.id} at ${clone.path}` : "not found"}; sweep ${String(JSON.stringify(serving)).slice(0, 400)}`
  );

  // 11. Its stage sleeps, and the clone retires.
  const gone = clone
    ? await until(
        "the npm stage clone retired",
        async () => {
          const swept = await sweep(fleet.base);
          return existsSync(clone.path) ||
            swept.kept.some((one) => one.workspaceId === clone.id) ||
            swept.held.some((one) => JSON.stringify(one).includes(clone.id))
            ? undefined
            : swept;
        },
        Boolean,
        IDLE_MS + 180_000
      ).catch(() => undefined)
    : undefined;
  kit.check(
    "11: once its stage sleeps, the sweep retires the stage clone and its folder is gone",
    !!gone,
    clone
      ? `${clone.path} ${existsSync(clone.path) ? "still there" : "gone"}; last sweep ${JSON.stringify(gone ?? (await sweep(fleet.base))).slice(0, 400)}`
      : "no clone found"
  );

  // 12. The next sheet call cuts it again, and the hub holds it again.
  const relisted = await call("12", "mcp__cawco__design_map", {}, npmSession);
  const again = await sweep(fleet.base);
  kit.check(
    "12: the next design_map cuts the clone again and answers the card, and the sweep keeps it again",
    relisted.includes('"src/Card.svelte"') &&
      !!clone &&
      existsSync(clone.path) &&
      again.kept.some((one) => one.workspaceId === clone.id),
    `${short(relisted)}; sweep ${JSON.stringify(again).slice(0, 300)}`
  );

  await scopedAndStyled(kitCreated.match(ID)?.[1]);
  await builtStories(kit, call, fleet.repo);
  await panelLegs(kit, call, await fleet.dashboard(), session);
  await centredLegs(kit, await fleet.dashboard(), session);

  /** Legs 13 to 15, in the SvelteKit checkout of legs 6 to 8 (its session `kitSession`), on the sheet leg 7 made (`kitId`). */
  async function scopedAndStyled(kitId: string | undefined): Promise<void> {
    // 13. A design_map of one folder answers that folder's components alone.
    const scoped = await call(
      "13",
      "mcp__cawco__design_map",
      { dir: "src/lib" },
      kitSession
    );
    kit.check(
      "13: design_map with dir src/lib answers src/lib/Card.svelte alone, not src/other/Other.svelte",
      scoped.includes('"src/lib/Card.svelte"') &&
        !scoped.includes("Other.svelte") &&
        (scoped.match(/"name":/g)?.length ?? 0) === 1,
      short(scoped)
    );

    // 14. A dir outside the session's folder is refused in words.
    const outside = await call(
      "14",
      "mcp__cawco__design_map",
      { dir: "../.." },
      kitSession
    );
    kit.check(
      "14: design_map with a dir outside the folder is refused, saying it is outside",
      outside.includes("is outside") && !outside.includes('"components"'),
      short(outside)
    );

    // 15. An args write in the project's own style: its Prettier passes, and only the story's statement changed.
    const storyPath = join(kitDir, KIT_STORY);
    const beforeWrite = await readFile(storyPath, "utf8");
    const wrote = kitId
      ? await call(
          "15",
          "mcp__cawco__artifact_update",
          { id: kitId, args: { story: "One", values: { title: LONG_TITLE } } },
          kitSession
        )
      : "no sheet from leg 7";
    const afterWrite = await readFile(storyPath, "utf8");
    const statement = beforeWrite.indexOf("export const One");
    const prefix = beforeWrite.slice(0, statement);
    const suffix = beforeWrite.slice(beforeWrite.indexOf(";", statement) + 1);
    const pretty =
      await Bun.$`${join(kitDir, "node_modules", ".bin", "prettier")} --check ${KIT_STORY}`
        .cwd(kitDir)
        .quiet()
        .nothrow();
    kit.check(
      "15: an args edit leaves the story file passing its project's prettier --check, and changes only the edited story's statement",
      afterWrite.includes(LONG_TITLE) &&
        pretty.exitCode === 0 &&
        afterWrite.startsWith(prefix) &&
        afterWrite.endsWith(suffix),
      `prettier --check exit ${pretty.exitCode}; the file after: ${JSON.stringify(afterWrite.slice(statement)).slice(0, 300)}; the write answered ${short(wrote).slice(0, 200)}`
    );
  }

  /** Legs 4 and 5, on the sheet `sheet` leg 2 made. */
  async function readAndEdit(sheet: string): Promise<void> {
    // 4. Read back: live, no errors, its story.
    const read = await call("4", "mcp__cawco__artifact_read", { id: sheet });
    kit.check(
      "4: artifact_read answers the stage live with no errors, and story One",
      read.match(STATUS)?.[1] === "live" &&
        read.match(ERRORS)?.[1] === "[]" &&
        read.includes('"One"'),
      short(read)
    );

    // 5. The sheet through the session's preview, and the session's edit reaching it.
    const { port } = (await (
      await fetch(`${fleet.base}/api/instances/${session}/preview-address`, {
        method: "POST",
      })
    ).json()) as { port?: number };
    const page = await kit.page("desk");
    await page.goto(
      `http://127.0.0.1:${port ?? 0}/@cawco/canvas?file=${encodeURIComponent(STORY)}`,
      { waitUntil: "domcontentloaded" }
    );
    const heading = () =>
      page
        .locator('[data-cawco-story="One"] [data-probe="title"]')
        .textContent({ timeout: 5000 })
        .catch((error: Error) => `none (${error.message.split("\n")[0]})`);
    const before = await until(
      "the story's heading",
      heading,
      (said) => said === "Hello",
      60_000
    ).catch(() => heading());
    await page.evaluate(() => {
      (window as unknown as { __stayed: boolean }).__stayed = true;
    });
    const edit = await call("5", "Bash", {
      command: `cat > ${join(fleet.repo, "src/Card.svelte")} <<'EOF'\n${EDITED}EOF`,
      description: "Rewrite the card's heading",
    });
    const after = await until(
      "the edited heading",
      heading,
      (said) => said === "Edited Hello",
      30_000
    ).catch(() => heading());
    const stayed = await page
      .evaluate(() => (window as unknown as { __stayed?: boolean }).__stayed)
      .catch(() => false);
    kit.check(
      "5: the sheet mounts One through the session's preview, and the session's edit to Card.svelte reaches it in place",
      before === "Hello" && after === "Edited Hello" && stayed === true,
      `before "${before}", after "${after}", ${stayed ? "no reload" : "reloaded"}; the edit answered ${short(edit).slice(0, 120)}`
    );
  }
};

const spec: Spec = {
  name: "session-sheet",
  host: "its stage runs in a place, a boundary of its own",
  run,
};
export default spec;
