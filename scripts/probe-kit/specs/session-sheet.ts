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
 * and its story file; its node_modules a link to the dashboard's, which the
 * stage's boundary holds read-only, so Vite's config load and caches must
 * write elsewhere), against the mock model:
 *
 * 1. `components_list` answers the repo's components, `src/Card.svelte`
 *    with its story file, never "this session runs in no workspace".
 * 2. `artifact_create(kind: "sheet", file: "src/Card.stories.js")` answers
 *    an id and its stage `live`, which states it is a sheet's on Vite
 *    (`runs: "sheet"`, `toolchain: "vite"`).
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
 * 6. `components_list` answers `src/lib/Card.svelte` with its story file.
 * 7. `artifact_create(kind: "sheet", file: "src/lib/Card.stories.js")`
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
 * 9. `artifact_create(kind: "sheet")` there answers an id and its stage
 *    `live`.
 * 10. The hub's retire sweep (`POST /api/workspaces/retire`) holds the stage
 *     clone, filed as a workspace, for its stage that serves.
 * 11. Once the stage sleeps, a sweep retires the clone and its folder is
 *     gone.
 * 12. The next `components_list` there cuts it again and answers the card,
 *     and the sweep holds it again.
 *
 * Then back in the SvelteKit checkout, which also holds
 * `src/other/Other.svelte` and its own Prettier with this repository's
 * `.prettierrc`:
 *
 * 13. `components_list({ dir: "src/lib" })` answers `src/lib/Card.svelte`
 *     alone: the folder asked for, not the whole app.
 * 14. `components_list({ dir: "../.." })` is refused, saying it is outside.
 * 15. `artifact_update` of story `One`'s args with a title past the print
 *     width leaves the story file passing the project's `prettier --check`,
 *     and changes nothing outside that story's statement.
 *
 * Then back in the first session's folder, a story file that builds its
 * stories four ways: a literal, a spread of a local object, a call of a
 * local helper, and a spread of an imported helper's call.
 *
 * 16. `artifact_create(kind: "sheet")` of it answers an id and its stage
 *     `live`.
 * 17. `artifact_read` of it lists each readable story's own component and
 *     args (the literal writable, the spread and the helper call read-only
 *     as shared code) and the imported one "args not readable here", with
 *     its export name and the reason, its component and args empty rather
 *     than the meta's.
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
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import { STAGE_ENSURE } from "../../../packages/core/src/stage";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const STORY = "src/Card.stories.js";
/** A story file whose stories are built four ways (legs 16 and 17). */
const MIXED = "src/Mixed.stories.js";
const REFUSAL = "this session runs in no workspace";

/** The project in the session's folder: plain Vite and Svelte, the dashboard's packages linked in. */
const PROJECT: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "probe-cards",
    private: true,
    type: "module",
    devDependencies: {
      "@sveltejs/vite-plugin-svelte": "*",
      svelte: "*",
      vite: "*",
    },
  }),
  // The linked node_modules are the dashboard's, outside the place and read-only in its boundary: the stage writes nothing there.
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
  // A component outside src/lib: a components_list of src/lib leaves it out (leg 13).
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
const COMMAND = /PROBE-CALL:(\d+)/g;

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

/** A story as `artifact_read` lists it (core stage.ts `Story`), as far as legs 16 and 17 read it. */
interface ListedStory {
  args: Record<string, unknown>;
  component: string | null;
  name: string;
  readOnly: { read: boolean; reason: string } | null;
}

/** The `stories` array of the sheet an `artifact_read` answered, its JSON scanned out of the answer's text; empty when it has none. */
const storiesIn = (said: string): ListedStory[] => {
  const start = said.indexOf("[", said.indexOf('"stories":'));
  if (said.indexOf('"stories":') < 0 || start < 0) {
    return [];
  }
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let at = start; at < said.length; at += 1) {
    const char = said[at];
    if (escaped) {
      escaped = false;
    } else if (quoted) {
      escaped = char === "\\";
      quoted = char !== '"';
    } else if (char === '"') {
      quoted = true;
    } else if (char === "[" || char === "{") {
      depth += 1;
    } else if (char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(said.slice(start, at + 1)) as ListedStory[];
      }
    }
  }
  return [];
};
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

/** {@link PROJECT} written into `dir`, the dashboard's packages linked in. */
const writeProject = async (dir: string) => {
  await writeFiles(dir, PROJECT);
  await symlink(
    join(ROOT, "apps/dashboard/node_modules"),
    join(dir, "node_modules")
  );
};

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
  const listed = await call("1", "mcp__cawco__components_list", {});
  kit.check(
    "1: components_list answers the folder's components, Card.svelte with its story file",
    !listed.includes(REFUSAL) &&
      listed.includes('"src/Card.svelte"') &&
      listed.includes(`"${STORY}"`),
    short(listed)
  );

  // 2. The sheet made, on a stage over the session's folder.
  const created = await call("2", "mcp__cawco__artifact_create", {
    kind: "sheet",
    name: "cards",
    file: STORY,
  });
  const id = created.match(ID)?.[1];
  kit.check(
    "2: artifact_create(kind: sheet) answers an id and its stage live",
    !!id && created.match(STATUS)?.[1] === "live",
    short(created)
  );
  kit.check(
    "2: its stage states what it runs: a sheet's, on Vite",
    created.includes('"runs":"sheet"') &&
      created.includes('"toolchain":"vite"'),
    short(created)
  );

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
    "mcp__cawco__components_list",
    {},
    kitSession
  );
  kit.check(
    "6: components_list in a checkout read-only to its boundary answers src/lib/Card.svelte with its story file",
    kitListed.includes('"src/lib/Card.svelte"') &&
      kitListed.includes(`"${KIT_STORY}"`),
    short(kitListed)
  );

  // 7. The sheet made on that checkout, its stage live.
  const kitCreated = await call(
    "7",
    "mcp__cawco__artifact_create",
    { kind: "sheet", name: "kit-cards", file: KIT_STORY },
    kitSession
  );
  kit.check(
    "7: artifact_create(kind: sheet) there answers an id and its stage live",
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
    { kind: "sheet", name: "npm-cards", file: STORY },
    npmSession
  );
  kit.check(
    "9: artifact_create(kind: sheet) in an npm-lockfile checkout answers an id and its stage live",
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
    `clone ${clone ? `${clone.id} at ${clone.path}` : "not found"}; sweep ${JSON.stringify(serving).slice(0, 400)}`
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
  const relisted = await call(
    "12",
    "mcp__cawco__components_list",
    {},
    npmSession
  );
  const again = await sweep(fleet.base);
  kit.check(
    "12: the next components_list cuts the clone again and answers the card, and the sweep keeps it again",
    relisted.includes('"src/Card.svelte"') &&
      !!clone &&
      existsSync(clone.path) &&
      again.kept.some((one) => one.workspaceId === clone.id),
    `${short(relisted)}; sweep ${JSON.stringify(again).slice(0, 300)}`
  );

  await scopedAndStyled(kitCreated.match(ID)?.[1]);
  await builtStories();

  /** Legs 16 and 17, in the first session's folder: a sheet whose stories are built by spreads and helpers. */
  async function builtStories(): Promise<void> {
    // 16. The sheet made.
    const mixed = await call("16", "mcp__cawco__artifact_create", {
      kind: "sheet",
      name: "mixed",
      file: MIXED,
    });
    const mixedId = mixed.match(ID)?.[1];
    kit.check(
      "16: artifact_create(kind: sheet) of the story file built four ways answers an id and its stage live",
      !!mixedId && mixed.match(STATUS)?.[1] === "live",
      short(mixed)
    );

    // 17. Each story as the file builds it.
    const read = mixedId
      ? await call("17", "mcp__cawco__artifact_read", { id: mixedId })
      : "no sheet from leg 16";
    const stories = storiesIn(read);
    const one = (name: string) => stories.find((story) => story.name === name);
    const said = (name: string) => JSON.stringify(one(name) ?? null);
    const titled = (name: string, title: string) =>
      JSON.stringify(one(name)?.args) === JSON.stringify({ title });
    const imported = one("Imported");
    kit.check(
      "17: artifact_read lists the literal, spread and helper stories' own component and args, and the imported one read-only with its name and why",
      titled("Literal", "Literal") &&
        one("Literal")?.readOnly === null &&
        titled("Spread", "Shared") &&
        one("Spread")?.readOnly?.read === true &&
        titled("Helper", "Helper") &&
        one("Helper")?.component === "src/Card.svelte" &&
        one("Helper")?.readOnly?.read === true &&
        imported?.readOnly?.read === false &&
        imported.readOnly.reason.startsWith(
          "Imported: args not readable here"
        ) &&
        imported.readOnly.reason.includes("./fixture.js") &&
        imported.component === null &&
        JSON.stringify(imported.args) === "{}",
      ["Literal", "Spread", "Helper", "Imported"]
        .map((name) => `${name} ${said(name)}`)
        .join("; ")
        .slice(0, 1500) || short(read)
    );
  }

  /** Legs 13 to 15, in the SvelteKit checkout of legs 6 to 8 (its session `kitSession`), on the sheet leg 7 made (`kitId`). */
  async function scopedAndStyled(kitId: string | undefined): Promise<void> {
    // 13. A components_list of one folder answers that folder's components alone.
    const scoped = await call(
      "13",
      "mcp__cawco__components_list",
      { dir: "src/lib" },
      kitSession
    );
    kit.check(
      "13: components_list with dir src/lib answers src/lib/Card.svelte alone, not src/other/Other.svelte",
      scoped.includes('"src/lib/Card.svelte"') &&
        !scoped.includes("Other.svelte") &&
        (scoped.match(/"name":/g)?.length ?? 0) === 1,
      short(scoped)
    );

    // 14. A dir outside the session's folder is refused in words.
    const outside = await call(
      "14",
      "mcp__cawco__components_list",
      { dir: "../.." },
      kitSession
    );
    kit.check(
      "14: components_list with a dir outside the folder is refused, saying it is outside",
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
      `http://127.0.0.1:${port ?? 0}/@cawco/sheet?file=${encodeURIComponent(STORY)}`,
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
