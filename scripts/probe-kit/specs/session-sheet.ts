/**
 * A session the person talks to directly (no work item, no workspace) opens,
 * reads and edits a live-component sheet on the files it works on, as a
 * delegate does in its workspace (the owner, from a top-level chat: "is this
 * a gap in the design system tool?"). Its stage runs in a place over the
 * folder the session works in (hub caw.ts `stagePlaceRef`): a boundary like
 * a workspace's, over the session's own files.
 *
 * On a scratch fleet, a Claude Code session spawned in the fleet's repo,
 * which holds a Vite + Svelte project (`Card.svelte` and its story file;
 * its node_modules a link to the dashboard's, which the place's boundary
 * holds read-only, so Vite's config load and caches must write elsewhere),
 * against the mock model:
 *
 * 1. `components_list` answers the repo's components, `src/Card.svelte`
 *    with its story file, never "this session runs in no workspace".
 * 2. `artifact_create(kind: "sheet", file: "src/Card.stories.js")` answers
 *    an id and its stage `live`.
 * 3. `artifact_read` of it answers its stage `live` with no errors, and its
 *    story `One`.
 * 4. The sheet through the session's preview origin mounts `One`; the
 *    session rewrites `Card.svelte` with its shell, and the open sheet shows
 *    the edit in place, with no reload.
 *
 * The place's boundary is made of user namespaces: like a spec that
 * delegates, it runs outside every workspace boundary (README "A spec that
 * delegates runs on the host").
 *
 *   bun scripts/probe-kit/run.ts session-sheet
 */
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const STORY = "src/Card.stories.js";
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
};

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
const ERRORS = /"errors":(\[[^\]]*\])/;
const ID = /"id":"([0-9a-f-]{36})"/;
const short = (said: string) => said.replaceAll(/\s+/g, " ").slice(0, 500);

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  await mkdir(join(fleet.repo, "src"), { recursive: true });
  await Promise.all(
    Object.entries(PROJECT).map(([file, text]) =>
      writeFile(join(fleet.repo, file), text)
    )
  );
  await symlink(
    join(ROOT, "apps/dashboard/node_modules"),
    join(fleet.repo, "node_modules")
  );
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Cards", fleet.repo);
  /** Asks the session to make call `n`, and waits for what it answered. */
  const call = async (n: string, name: string, input: object) => {
    asks.set(n, { name, input });
    await fleet.send(session, `PROBE-CALL:${n}`);
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
  if (!id) {
    return;
  }

  // 3. Read back: live, no errors, its story.
  const read = await call("3", "mcp__cawco__artifact_read", { id });
  kit.check(
    "3: artifact_read answers the stage live with no errors, and story One",
    read.match(STATUS)?.[1] === "live" &&
      read.match(ERRORS)?.[1] === "[]" &&
      read.includes('"One"'),
    short(read)
  );

  // 4. The sheet through the session's preview, and the session's edit reaching it.
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
  const edit = await call("4", "Bash", {
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
    "4: the sheet mounts One through the session's preview, and the session's edit to Card.svelte reaches it in place",
    before === "Hello" && after === "Edited Hello" && stayed === true,
    `before "${before}", after "${after}", ${stayed ? "no reload" : "reloaded"}; the edit answered ${short(edit).slice(0, 120)}`
  );
};

const spec: Spec = { name: "session-sheet", run };
export default spec;
