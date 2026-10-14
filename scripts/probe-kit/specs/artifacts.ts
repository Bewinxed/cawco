/**
 * Artifacts, slice 1 (Projects spec §5.10): a page artifact on a scratch
 * fleet (real hub, agent and sessiond; real Claude Code against the mock
 * model, which calls the hub's MCP tools as each PROBE-CALL message says),
 * shown in the built dashboard at the desk (1440), read from the hub's
 * answers and the page's own attributes, never from pixels. In order:
 *
 * 0. The shell's sidebar, in a browser with no width of its own, is drawn
 *    (getBoundingClientRect) at the `c-sidebar-w` token of
 *    design/tokens/cawco.tokens.json, as tokens.css carries it.
 * 1. `artifact_create` of a page holding one `data-cawco-choice` answers an
 *    id, and the panel's menu lists it.
 * 2. A click on an option in the page (inside the panel's frame) is in
 *    the hub's read of the artifact within 5 s.
 * 3. A reload of the dashboard shows the pick still marked
 *    (`data-cawco-picked`).
 * 4. `artifact_update` with a JSON Patch changes the state, and the page
 *    reads it back (the other option marked).
 * 5. The session hears nothing of the person's change, or of the agent's own
 *    patch: only a Send tells it (artifact-responses.ts).
 * 6. No cawco tool about previews or choices is among the session's tools
 *    (the ones the artifact tools replaced); the artifact tools are.
 *
 * Slice 2, on a page of fields (a text input `title`, a radio group `size`,
 * a select `tone`, and a `data-cawco-choice` `mood`):
 *
 * 7. Typing into `title` is in artifact_read within 2 s as its `value`;
 *    picking a radio and an option is there as `options`; the session hears
 *    nothing of them.
 * 8. A dashboard reload shows all three from the doc on the page's
 *    DOMContentLoaded plus one frame.
 * 9. With `title` focused and holding typed text, artifact_update with new
 *    HTML morphs the page: the heading changes, focus, text and scroll stay,
 *    no `load` fires and no socket is opened again.
 * 10. The artifact's own tab (`/artifact/<id>`) shows the same state, and a
 *    pick made there is marked in the first page within 2 s.
 * 11. No JSON-RPC message crosses postMessage in any window during 7–10.
 *
 * `opened` is a view's word, not the publish's:
 *
 * 12. Check 1's create, made while no dashboard is open, answers
 *    `opened: false` with the no-view sentence once the hub's 10 s wait is
 *    up; the panel's menu lists the artifact once a page opens (check 1).
 * 13. Check 7's create, made with the session's page open, answers
 *    `opened: true` only after the pane's `/shown` (which comes after the
 *    page's `cawco:ready`), and the artifact's `shownAt` is set.
 * 14. A preview of a port nothing listens on answers `opened: false` with
 *    the server sentence within 10 s, and the pane draws its failure.
 *
 * The theme follows ours (DESIGN.md, Artifact panel, canvas and ink):
 *
 * 18. The fields page's root reads `data-theme` and `color-scheme` light
 *    from the pane's hello, dark after the dashboard's switch flips to dark,
 *    light after it flips back; a preview of a live port keeps its root
 *    untouched through the same flips.
 *
 * `artifact_promote` (slice 6), read from the project's folder on the hub
 * with git:
 *
 * 15. In a project session, a page with one pick and one pin promotes to a
 *    commit and `artifacts/<name>/`; that commit holds index.html,
 *    state.json (the pick), pins.json (the pin) and artifact.json, and the
 *    panel's menu tags the row "Promoted <short commit>". After a `patch`, a
 *    second promote is a newer commit changing state.json.
 * 16. A canvas, once its screen drew its picture, promotes canvas.excalidraw,
 *    outline.md and picture.png.
 * 17. Outside a project the tool answers the refusal sentence and no project
 *    folder holds anything of it.
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec, settle } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
/** The design tokens' one source (CLAUDE.md, Design Context). */
const TOKENS = join(
  import.meta.dir,
  "../../../design/tokens/cawco.tokens.json"
);
const UPDATE = "mcp__cawco__artifact_update";
const PROMOTE = "mcp__cawco__artifact_promote";
/** The commit in artifact_promote's answer. */
const ANSWERED_COMMIT = /"commit":"([0-9a-f]{40})"/;
/** The refusal outside a project (artifacts/service.ts `NO_PROJECT`). */
const NO_PROJECT =
  "This session belongs to no project, so there is nowhere to promote to.";
const COMMAND = /PROBE-CALL:(\d+)/g;
/** Anything the hub would tell the session of the person's responses, or the person's picks as words. */
const TOLD =
  /\[CawCo\] The (?:page|canvas|preview) "|changed my picks|sent my picks/;
/** A cawco tool named for previews or choices: the tools the artifact tools replaced. */
const PREVIEW_TOOL = /mcp__cawco__\w*(?:preview|choices)\w*/g;
/** The id in artifact_create's answer, as the tool result carries it. */
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
/** How long a probe listens for a word the session must not hear. Our call: past any debounce the hub could have. */
const LISTEN_MS = 6000;
/** How long a show waits for a view's word (artifacts/service.ts `SHOWN_WAIT_MS`). */
const SHOWN_WAIT_MS = 10_000;
/** A pane's word to the hub: `POST /api/instances/:id/artifacts/:artifact/shown`. */
const SHOWN_PATH =
  /^\/api\/instances\/[^/]+\/artifacts\/([0-9a-f-]{36})\/shown$/;
/** The no-view sentence (artifacts/service.ts `NO_VIEW`). */
const NO_VIEW =
  "No open dashboard is showing this session. The artifact is in the session's panel and opens when one is.";

const PAGE = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Pick a hero</title></head>
  <body>
    <h1>Pick a hero</h1>
    <div data-cawco-choice="hero">
      <button data-option="a" type="button">Hero A</button>
      <button data-option="b" type="button">Hero B</button>
    </div>
  </body>
</html>`;

/** The page of fields, its heading the one thing a re-publish changes. */
const fieldsPage = (heading: string) => `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Fields</title></head>
  <body style="min-height: 3000px">
    <h1 id="heading">${heading}</h1>
    <label>Title <input name="title" type="text"></label>
    <fieldset>
      <label><input name="size" type="radio" value="s"> Small</label>
      <label><input name="size" type="radio" value="m"> Medium</label>
      <label><input name="size" type="radio" value="l"> Large</label>
    </fieldset>
    <select name="tone">
      <option value="calm">Calm</option>
      <option value="bright">Bright</option>
    </select>
    <div data-cawco-choice="mood">
      <button data-option="warm" type="button">Warm</button>
      <button data-option="cool" type="button">Cool</button>
    </div>
  </body>
</html>`;

/**
 * Installed in every window and frame of a page before its own scripts:
 * each JSON-RPC message posted to it is kept (check 11), and a preview
 * frame keeps its fields as they stand on DOMContentLoaded plus one frame
 * (check 8).
 */
const watchFrames = () => {
  const seen: string[] = [];
  (window as unknown as { __jsonrpc: string[] }).__jsonrpc = seen;
  window.addEventListener(
    "message",
    (event) => {
      const data = event.data as unknown;
      if (data && typeof data === "object" && "jsonrpc" in data) {
        seen.push(
          `${location.pathname}: ${JSON.stringify(data).slice(0, 160)}`
        );
      }
    },
    true
  );
  // A preview frame: the dashboard is never framed, a preview always is.
  if (window.parent !== window) {
    document.addEventListener("DOMContentLoaded", () =>
      requestAnimationFrame(() => {
        (window as unknown as { __firstFrame: object }).__firstFrame = {
          title:
            document.querySelector<HTMLInputElement>('input[name="title"]')
              ?.value ?? null,
          size:
            document.querySelector<HTMLInputElement>(
              'input[name="size"]:checked'
            )?.value ?? null,
          tone:
            document.querySelector<HTMLSelectElement>('select[name="tone"]')
              ?.value ?? null,
        };
      })
    );
  }
};

/** The three fields as a frame shows them now. */
const fieldValues = (frame: Frame) =>
  frame.evaluate(() => ({
    title:
      document.querySelector<HTMLInputElement>('input[name="title"]')?.value ??
      null,
    size:
      document.querySelector<HTMLInputElement>('input[name="size"]:checked')
        ?.value ?? null,
    tone:
      document.querySelector<HTMLSelectElement>('select[name="tone"]')?.value ??
      null,
  }));

/** The panel's one page frame once it shows the page of fields. */
const fieldsFrame = async (on: Page): Promise<Frame> => {
  const frames = on.locator('iframe[title="Preview"]');
  await until(
    "the panel's one frame showing the fields",
    async () =>
      (await frames.count()) === 1 &&
      (await on
        .frameLocator('iframe[title="Preview"]')
        .locator('input[name="title"]')
        .count()),
    (found) => found === 1,
    60_000
  );
  const frame = await (await frames.elementHandle())?.contentFrame();
  if (!frame) {
    throw new Error("the panel's frame has no document");
  }
  return frame;
};

/** The JSON-RPC messages every window of `on` was posted. */
const rpcSeen = async (on: Page): Promise<string[]> => {
  const all = await Promise.all(
    on
      .frames()
      .map((frame) =>
        frame
          .evaluate(
            () =>
              (window as unknown as { __jsonrpc?: string[] }).__jsonrpc ?? []
          )
          .catch(() => [] as string[])
      )
  );
  return all.flat();
};

/** Each `/shown` a page's panes post to the hub, as they go: when, for which artifact, and the body. */
const watchShown = (on: Page) => {
  const posts: {
    artifact: string;
    at: number;
    body: { client?: string; error?: string; ok?: boolean; revision?: string };
  }[] = [];
  on.on("request", (request) => {
    const shown = SHOWN_PATH.exec(new URL(request.url()).pathname);
    if (request.method() === "POST" && shown?.[1]) {
      posts.push({
        artifact: shown[1],
        at: Date.now(),
        body: request.postDataJSON() ?? {},
      });
    }
  });
  return posts;
};

/** What each numbered message asks the session to call, and what it answered. */
const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
/** When the model called each tool, and when its answer came back: the tool's own time. */
const issuedAt = new Map<string, number>();
const answeredAt = new Map<string, number>();
let lastMarker = "";
/** The last call's own time: from the model's call to its answer, ms. */
const took = () =>
  (answeredAt.get(lastMarker) ?? Number.NaN) -
  (issuedAt.get(lastMarker) ?? Number.NaN);

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask) || TOLD.test(request.last)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
      answeredAt.set(marker, Date.now());
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    issuedAt.set(marker, Date.now());
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

interface Read {
  seq: number;
  state: Record<string, { options: string[]; value: unknown }>;
}

/** The picked options the page marks, inside the panel's frame. */
const picked = (page: Page): Promise<string[]> =>
  page
    .frameLocator('iframe[title="Preview"]')
    .locator("[data-option][data-cawco-picked]")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-option") ?? "")
    );

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
  const session = await fleet.spawn("claude", "Artifacts", fleet.repo);

  let sent = 0;
  /** Asks session `on` to call `tool` with `input`; what it answered. */
  const callIn =
    (on: string) =>
    async (tool: string, input: object): Promise<string> => {
      sent += 1;
      const marker = String(sent);
      lastMarker = marker;
      asks.set(marker, { name: tool, input });
      await fleet.send(on, `PROBE-CALL:${marker}`);
      return (await until(
        `the ${tool} call (${marker})`,
        () => answered.get(marker),
        Boolean,
        180_000
      )) as string;
    };
  const call = callIn(session);
  const read = (artifact: string) =>
    fleet.api<Read>(`/api/instances/${session}/artifacts/${artifact}`);

  // 1. The page, made by the session through the MCP tool.
  const created = await call(CREATE, {
    kind: "page",
    name: "hero-pick",
    html: PAGE,
  });
  const id = created.match(ANSWERED_ID)?.[1];
  const unseen = took();
  kit.check(
    "12: with no dashboard open, artifact_create answers its id, opened false and the no-view sentence once the 10 s wait is up",
    !!id &&
      created.includes('"opened":false') &&
      created.includes(NO_VIEW) &&
      unseen >= SHOWN_WAIT_MS,
    `the tool took ${unseen} ms; ${created.slice(created.indexOf('{"id"'), created.indexOf('{"id"') + 400)}`
  );
  if (!id) {
    return;
  }
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  // What the dashboard and the page say, for a failure's detail.
  const said: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      said.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      said.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("websocket", (socket) =>
    socket.on("close", () => said.push(`socket closed: ${socket.url()}`))
  );
  await open(page, `${base}/session/${session}`, ".artifact-trigger");
  // The shell's rail, in a browser with no width of its own, is drawn at the
  // `c-sidebar-w` token (DESIGN.md: "228px by default"), its one source.
  const token = (
    (await Bun.file(TOKENS).json()) as {
      size: { "c-sidebar-w": { $value: string } };
    }
  ).size["c-sidebar-w"].$value;
  const rail = await page.evaluate(() => ({
    css: getComputedStyle(document.documentElement)
      .getPropertyValue("--c-sidebar-w")
      .trim(),
    drawn: document.querySelector("aside.rail")?.getBoundingClientRect().width,
    viewport: innerWidth,
  }));
  kit.check(
    "0: at 1440 the sidebar is drawn at the c-sidebar-w token",
    rail.viewport === 1440 &&
      rail.css === token &&
      rail.drawn === Number.parseFloat(token),
    `token ${token}, css ${rail.css}, drawn ${rail.drawn}px at ${rail.viewport}`
  );
  await page.click(".artifact-trigger");
  await page.locator(`.artifact-row[data-artifact="${id}"]`).waitFor();
  // The menu rises from 0.92 as it opens: read its geometry once it has landed.
  await settle(page);
  const listed = await page
    .locator(`.artifact-row[data-artifact="${id}"]`)
    .count();
  kit.check(
    "1, 12: the panel's menu lists it once a page opens",
    listed === 1,
    `${listed} rows`
  );
  // DESIGN.md (Artifact panel, canvas and ink): a 44px row, the kind's 16px
  // glyph, the name in the label role, its age in meta ink.
  const row = await page
    .locator(`.artifact-row[data-artifact="${id}"]`)
    .evaluate((node) => {
      const probe = document.createElement("span");
      probe.style.font = "var(--type-label)";
      probe.style.color = "var(--ink-muted)";
      document.body.append(probe);
      const label = getComputedStyle(probe);
      const name = node.querySelector(".row-name");
      const age = node.querySelector(".row-age");
      const glyph = node.querySelector("svg")?.getBoundingClientRect();
      const out = {
        height: node.getBoundingClientRect().height,
        glyph: glyph ? [glyph.width, glyph.height] : null,
        nameFont: name ? getComputedStyle(name).font === label.font : false,
        ageInk: age ? getComputedStyle(age).color === label.color : false,
        text: name?.textContent ?? "",
      };
      probe.remove();
      return out;
    });
  kit.check(
    "1: its row is 44px, the kind's glyph 16px, the name in the label role, the age in meta ink",
    row.height === 44 &&
      row.glyph?.join() === "16,16" &&
      row.nameFont &&
      row.ageInk &&
      row.text === "hero-pick",
    JSON.stringify(row)
  );
  // The open menu holds the page's pointer events until it has gone.
  await page.keyboard.press("Escape");
  await page
    .locator(`.artifact-row[data-artifact="${id}"]`)
    .waitFor({ state: "detached" });
  await settle(page);

  // 2. The person picks B inside the page.
  const frame = page.frameLocator('iframe[title="Preview"]');
  await frame.locator('[data-option="b"]').waitFor();
  await until(
    "the page's bridge marking its options",
    () => frame.locator('[data-option="a"][aria-pressed]').count(),
    (count) => count === 1,
    30_000
  );
  const clickedAt = Date.now();
  await frame.locator('[data-option="b"]').click();
  const heard = await until(
    "the pick in artifact_read",
    () => read(id),
    (answer) => answer.state.hero?.options.join() === "b",
    5000
  ).then(
    () => Date.now() - clickedAt,
    () => null
  );
  kit.check(
    "2: the click is in artifact_read within 5 s",
    heard !== null,
    heard === null
      ? `not within 5 s; the page marks ${(await picked(page)).join() || "nothing"}; toasts: ${(await page.locator("[data-sonner-toast]").allTextContents()).join(" | ") || "none"}; said: ${said.slice(-8).join(" | ") || "nothing"}`
      : `${heard} ms`
  );

  // 3. A reload of the dashboard still marks the pick.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".artifact-trigger");
  const afterReload = await until(
    "the page marking its stored pick",
    () => picked(page),
    (marks) => marks.length > 0,
    30_000
  ).catch(() => [] as string[]);
  kit.check(
    "3: after a reload the pick is still marked",
    afterReload.join() === "b",
    `marked: ${afterReload.join() || "nothing"}`
  );

  // 4. The agent patches the state; the page reads it back.
  const updated = await call(UPDATE, {
    id,
    patch: [{ op: "replace", path: "/hero/options", value: ["a"] }],
  });
  const readBack = await until(
    "the page marking the agent's pick",
    () => picked(page),
    (marks) => marks.join() === "a",
    15_000
  ).catch(() => picked(page));
  kit.check(
    "4: artifact_update's patch is the state the page reads back",
    updated.includes('"options":["a"]') && readBack.join() === "a",
    `tool: ${updated.slice(0, 200)}; page marks ${readBack.join() || "nothing"}`
  );

  // 5. Nothing for the person's change, nothing for the patch: only a Send tells the session.
  await Bun.sleep(LISTEN_MS);
  const told = fleet.seen.filter((one) => TOLD.test(one.all));
  kit.check(
    "5: the session hears nothing of the person's change or the agent's patch",
    told.length === 0,
    told.map((one) => one.last.slice(0, 160)).join(" | ") || "nothing"
  );

  // 6. The session's own tool list.
  const offered = fleet.seen
    .filter((one) => one.tools)
    .flatMap((one) => [...one.toolNames, one.all]);
  const names = (tool: string) =>
    offered.some((each) => each.includes(`mcp__cawco__${tool}`));
  const strays = [
    ...new Set(offered.flatMap((each) => each.match(PREVIEW_TOOL) ?? [])),
  ];
  kit.check(
    "6: no preview or choices tool is in the tool list; the artifact tools are",
    strays.length === 0 &&
      ["artifact_create", "artifact_update", "artifact_read", "artifact_show"]
        .map(names)
        .every(Boolean),
    `preview or choices tools: ${strays.join(", ") || "none"}; artifact_read ${names("artifact_read")}`
  );

  await fieldChecks({ kit, fleet, session, page, base, call, said });
  await promoteChecks({ kit, fleet, base, call, callIn, heroId: id });
};

/** A git command in `folder`; its output. */
const gitIn = (folder: string, ...args: string[]) =>
  Bun.$`git -C ${folder} ${args}`.quiet().text();

/** The files a commit touched, from the folder's root. */
const touched = async (folder: string, commit: string) =>
  (await gitIn(folder, "show", "--name-only", "--format=", commit))
    .split("\n")
    .filter(Boolean);

/** Checks 15–17: artifact_promote outside a project, then in one. */
const promoteChecks = async ({
  kit,
  fleet,
  base,
  call,
  callIn,
  heroId,
}: {
  base: string;
  call: (tool: string, input: object) => Promise<string>;
  callIn: (on: string) => (tool: string, input: object) => Promise<string>;
  fleet: KitFleet;
  heroId: string;
  kit: Kit;
}) => {
  const projects = join(dirname(fleet.env.CAWCO_DB_PATH ?? ""), "projects");
  /** Every project folder's `artifacts/` entries, by project. */
  const promotedAnywhere = () =>
    existsSync(projects)
      ? readdirSync(projects).flatMap((one) =>
          existsSync(join(projects, one, "artifacts"))
            ? readdirSync(join(projects, one, "artifacts")).map(
                (name) => `${one}/${name}`
              )
            : []
        )
      : [];

  // 17. Outside a project: the refusal, and nothing written.
  const refused = await call(PROMOTE, { id: heroId });
  const strays = promotedAnywhere();
  kit.check(
    "17: outside a project artifact_promote answers the refusal sentence and writes nothing",
    refused.includes(NO_PROJECT) && strays.length === 0,
    `${refused.slice(0, 300)}; promoted folders: ${strays.join(", ") || "none"}`
  );

  // 15. A project session's page, with one pick and one pin.
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Promotes",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  const folder = join(projects, project.id);
  const inProject = await fleet.spawn("claude", "Promotes", fleet.repo, {
    projectId: project.id,
  });
  const callP = callIn(inProject);
  const made = await callP(CREATE, { kind: "page", name: "kept", html: PAGE });
  const keptId = made.match(ANSWERED_ID)?.[1];
  if (!keptId) {
    kit.check("15: artifact_create answers the page's id", false, made);
    return;
  }
  // Its panel, as check 1 opens one: the page in its frame, a screen for the canvas.
  const page = await kit.page("desk");
  await open(page, `${base}/session/${inProject}`, ".artifact-trigger");
  const at = `/api/instances/${inProject}/artifacts/${keptId}`;
  const frame = page.frameLocator('iframe[title="Preview"]');
  await until(
    "the page's bridge marking its options",
    () => frame.locator('[data-option="a"][aria-pressed]').count(),
    (count) => count === 1,
    60_000
  );
  await frame.locator('[data-option="b"]').click();
  await until(
    "the pick in the hub's read",
    () => fleet.api<Read>(at),
    (answer) => answer.state.hero?.options.join() === "b",
    10_000
  );
  // The person's pin, written by the page's own doc client as the overlay writes one.
  const pageFrame = await (
    await page.locator('iframe[title="Preview"]').elementHandle()
  )?.contentFrame();
  await pageFrame?.evaluate(() => {
    const { doc } = (
      window as unknown as {
        cawcoArtifact: {
          doc: {
            getMap: (n: string) => { set: (k: string, v: object) => void };
          };
        };
      }
    ).cawcoArtifact;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    doc.getMap("pins").set(id, {
      id,
      number: 1,
      kind: "comment",
      by: "person",
      at: now,
      anchor: { selector: "h1", source: null, text: "Pick a hero" },
      elements: [],
      thread: [
        { id: crypto.randomUUID(), by: "person", text: "Bigger", at: now },
      ],
    });
  });
  await until(
    "the pin in comment_read",
    () =>
      fleet.api<{ artifacts: { pins: unknown[] }[] }>(
        `/api/instances/${inProject}/artifacts/comments?artifact=${keptId}&filter=all`
      ),
    (answer) => answer.artifacts[0]?.pins.length === 1,
    10_000
  );
  const first = await callP(PROMOTE, { id: keptId });
  const firstCommit = first.match(ANSWERED_COMMIT)?.[1];
  const firstFiles = firstCommit ? await touched(folder, firstCommit) : [];
  const keptState = firstCommit
    ? await gitIn(folder, "show", `${firstCommit}:artifacts/kept/state.json`)
    : "";
  const keptPins = firstCommit
    ? await gitIn(folder, "show", `${firstCommit}:artifacts/kept/pins.json`)
    : "";
  const wanted = ["index.html", "state.json", "pins.json", "artifact.json"].map(
    (name) => `artifacts/kept/${name}`
  );
  kit.check(
    "15: a promote answers a commit and artifacts/kept/, and that commit holds index.html, state.json (the pick), pins.json (the pin) and artifact.json",
    !!firstCommit &&
      first.includes('"path":"artifacts/kept/"') &&
      wanted.every((path) => firstFiles.includes(path)) &&
      JSON.parse(keptState || "{}").hero?.options?.join() === "b" &&
      keptPins.includes('"Bigger"'),
    `${first.slice(first.indexOf('{"commit"'), first.indexOf('{"commit"') + 120)}; git show --stat: ${firstFiles.join(", ")}`
  );

  // 15. The panel's menu tags the row with the commit.
  await page.click(".artifact-trigger");
  const tag = await page
    .locator(`.artifact-row[data-artifact="${keptId}"] .row-promoted`)
    .textContent({ timeout: 10_000 })
    .catch(() => null);
  kit.check(
    "15: the panel's menu tags the promoted row with its short commit",
    !!firstCommit && tag?.trim() === `Promoted ${firstCommit.slice(0, 7)}`,
    JSON.stringify(tag)
  );
  await page.keyboard.press("Escape");

  // 15. A patch, then a second promote: a newer commit changing state.json.
  await callP(UPDATE, {
    id: keptId,
    patch: [{ op: "replace", path: "/hero/options", value: ["a"] }],
  });
  const second = await callP(PROMOTE, { id: keptId });
  const secondCommit = second.match(ANSWERED_COMMIT)?.[1];
  const secondFiles = secondCommit ? await touched(folder, secondCommit) : [];
  const after = Boolean(
    firstCommit &&
      secondCommit &&
      secondCommit !== firstCommit &&
      (
        await Bun.$`git -C ${folder} merge-base --is-ancestor ${firstCommit} ${secondCommit}`
          .quiet()
          .nothrow()
      ).exitCode === 0
  );
  kit.check(
    "15: after a patch a second promote makes a newer commit changing state.json",
    after && secondFiles.includes("artifacts/kept/state.json"),
    `${firstCommit?.slice(0, 7)} → ${secondCommit?.slice(0, 7)}: ${secondFiles.join(", ")}`
  );

  // 16. A canvas, once its screen drew its picture.
  const drawn = await callP(CREATE, {
    kind: "canvas",
    name: "sketch",
    mermaid: "flowchart LR; A --> B",
  });
  const sketchId = drawn.match(ANSWERED_ID)?.[1];
  const pictured = sketchId
    ? await until(
        "the canvas's picture",
        () =>
          fleet.api<{ pictureAt?: string | null }>(
            `/api/instances/${inProject}/artifacts/${sketchId}`
          ),
        (answer) => !!answer.pictureAt,
        60_000
      ).then(
        () => true,
        () => false
      )
    : false;
  const sketch = sketchId ? await callP(PROMOTE, { id: sketchId }) : drawn;
  const sketchCommit = sketch.match(ANSWERED_COMMIT)?.[1];
  const sketchFiles = sketchCommit ? await touched(folder, sketchCommit) : [];
  const outline = sketchCommit
    ? await gitIn(folder, "show", `${sketchCommit}:artifacts/sketch/outline.md`)
    : "";
  kit.check(
    "16: a canvas promote writes canvas.excalidraw, outline.md and picture.png",
    pictured &&
      ["canvas.excalidraw", "outline.md", "picture.png"].every((name) =>
        sketchFiles.includes(`artifacts/sketch/${name}`)
      ) &&
      outline.includes("rectangle"),
    `picture drawn: ${pictured}; git show --stat: ${sketchFiles.join(", ")}; outline: ${outline.slice(0, 120)}`
  );
};

/** What checks 7–11 run on: the fleet, its session and the dashboard page checks 1–6 opened. */
interface OnSession {
  base: string;
  call: (tool: string, input: object) => Promise<string>;
  fleet: KitFleet;
  kit: Kit;
  page: Page;
  said: string[];
  session: string;
}

/** A frame's root as the theme writes it: `data-theme` and the computed `color-scheme`. */
const rootTheme = (frame: Frame) =>
  frame.evaluate(() => ({
    data: document.documentElement.dataset.theme ?? null,
    inline: document.documentElement.style.colorScheme || null,
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }));

/** The dashboard's theme switch (the sidebar's), pressed from `from` to the other scheme. */
const flipTheme = (page: Page, from: "light" | "dark") =>
  page
    .getByRole("button", {
      name: from === "light" ? "Light mode" : "Dark mode",
    })
    .first()
    .click();

/**
 * 18. A page artifact draws in the dashboard's theme (DESIGN.md: the theme
 * follows ours): its root reads `data-theme` and `color-scheme` light from
 * the pane's hello, dark after the dashboard flips to dark, light again
 * after it flips back. A preview is someone's own app: its root is untouched.
 */
const themeChecks = async (
  { kit, page, call }: Pick<OnSession, "call" | "kit" | "page">,
  pageFrame: Frame
) => {
  const turned = (frame: Frame, scheme: "light" | "dark") =>
    until(
      `the page's root ${scheme}`,
      () => rootTheme(frame),
      (root) => root.data === scheme && root.scheme === scheme,
      5000
    ).catch(() => rootTheme(frame));
  const hello = await turned(pageFrame, "light");
  await flipTheme(page, "light");
  const dark = await turned(pageFrame, "dark");
  await flipTheme(page, "dark");
  const light = await turned(pageFrame, "light");
  kit.check(
    "18: a page artifact's root reads data-theme and color-scheme light from the hello, dark after the dashboard flips to dark, light after it flips back",
    hello.data === "light" &&
      hello.scheme === "light" &&
      dark.data === "dark" &&
      dark.scheme === "dark" &&
      light.data === "light" &&
      light.scheme === "light",
    `hello ${JSON.stringify(hello)}; dark ${JSON.stringify(dark)}; light ${JSON.stringify(light)}`
  );

  const app = Bun.serve({
    port: 0,
    fetch: () =>
      new Response(
        '<!doctype html><html lang="en"><head><title>Own app</title></head><body><p id="own-app">Its own app.</p></body></html>',
        { headers: { "content-type": "text/html" } }
      ),
  });
  try {
    await call(CREATE, { kind: "preview", name: "own-app", port: app.port });
    const frames = page.locator('iframe[title="Preview"]');
    await until(
      "the panel's one frame showing the preview, its overlay in it",
      async () =>
        (await frames.count()) === 1 &&
        (await page
          .frameLocator('iframe[title="Preview"]')
          .locator("#own-app")
          .count()) === 1 &&
        (await page
          .frameLocator('iframe[title="Preview"]')
          .locator("cawco-overlay")
          .count()),
      (found) => found === 1,
      60_000
    );
    const previewFrame = await (await frames.elementHandle())?.contentFrame();
    if (!previewFrame) {
      kit.check("18: the preview's frame has a document", false, "none");
      return;
    }
    const before = await rootTheme(previewFrame);
    await flipTheme(page, "light");
    // The flip's message reaches the page within a frame or two; give it ample.
    await settle(page, 500);
    const flipped = await rootTheme(previewFrame);
    await flipTheme(page, "dark");
    await settle(page, 500);
    const back = await rootTheme(previewFrame);
    kit.check(
      "18: a preview's root is untouched by the hello and both flips: no data-theme, no inline color-scheme",
      [before, flipped, back].every(
        (root) => root.data === null && root.inline === null
      ),
      `before ${JSON.stringify(before)}; dark ${JSON.stringify(flipped)}; light ${JSON.stringify(back)}`
    );
  } finally {
    await app.stop(true);
  }
};

/** One entry of a read, or none. */
const entryOf = (answer: Read, key: string) =>
  answer.state[key] as Read["state"][string] | undefined;

/** Checks 7–11 (slice 2), on a page of fields. */
const fieldChecks = async ({
  kit,
  fleet,
  session,
  page,
  base,
  call,
  said,
}: OnSession) => {
  // 7. A page of fields: each field is state.
  await page.addInitScript(watchFrames);
  await page.evaluate(watchFrames);
  // 13. When the dashboard heard a page say it was ready, and when its pane told the hub.
  const shownPosts = watchShown(page);
  await page.evaluate(() => {
    const kept = window as unknown as { __readyAt: number[] };
    kept.__readyAt = [];
    addEventListener("message", (event) => {
      if ((event.data as { type?: unknown } | null)?.type === "cawco:ready") {
        kept.__readyAt.push(Date.now());
      }
    });
  });
  const askedAt = Date.now();
  const made = await call(CREATE, {
    kind: "page",
    name: "fields",
    html: fieldsPage("Fields, first"),
  });
  const fieldsId = made.match(ANSWERED_ID)?.[1];
  if (!fieldsId) {
    kit.check("7: artifact_create answers the fields page's id", false, made);
    return;
  }
  const madeAt = answeredAt.get(lastMarker) ?? Number.NaN;
  const readyAt = (
    await page.evaluate(
      () => (window as unknown as { __readyAt: number[] }).__readyAt
    )
  ).find((at) => at >= askedAt);
  const ack = shownPosts.find(
    (post) => post.artifact === fieldsId && post.body.ok === true
  );
  const fieldsRow = (
    await fleet.api<{ id: string; shownAt: string | null }[]>(
      `/api/instances/${session}/artifacts`
    )
  ).find((one) => one.id === fieldsId);
  const shownAt = fieldsRow?.shownAt ? Date.parse(fieldsRow.shownAt) : null;
  kit.check(
    "13: with the page open, opened is true only after the pane's word, which follows the page's cawco:ready; shownAt is set by it",
    made.includes('"opened":true') &&
      readyAt !== undefined &&
      ack !== undefined &&
      readyAt <= ack.at &&
      ack.at <= madeAt &&
      shownAt !== null &&
      shownAt >= readyAt,
    `ready +${(readyAt ?? Number.NaN) - askedAt} ms, /shown +${(ack?.at ?? Number.NaN) - askedAt} ms ${JSON.stringify(ack?.body)}, shownAt +${(shownAt ?? Number.NaN) - askedAt} ms, answer +${madeAt - askedAt} ms: ${made.slice(made.indexOf('{"id"'), made.indexOf('{"id"') + 200)}`
  );
  const readFields = () =>
    fleet.api<Read>(`/api/instances/${session}/artifacts/${fieldsId}`);
  /** Milliseconds until the hub's read passes `test`, or null past 2 s. */
  const within2s = async (test: (answer: Read) => boolean, from: number) =>
    await until("the hub's read", readFields, test, 2000).then(
      () => Date.now() - from,
      () => null
    );
  let fieldFrame = await fieldsFrame(page);
  await fieldFrame
    .locator('input[name="title"]')
    .pressSequentially("Hello probe", { delay: 20 });
  const typed = await within2s(
    (answer) => entryOf(answer, "title")?.value === "Hello probe",
    Date.now()
  );
  const pickedAt = Date.now();
  await fieldFrame.locator('input[name="size"][value="m"]').check();
  await fieldFrame.locator('select[name="tone"]').selectOption("bright");
  const pickedIn = await within2s(
    (answer) =>
      entryOf(answer, "size")?.options.join() === "m" &&
      entryOf(answer, "tone")?.options.join() === "bright",
    pickedAt
  );
  const fieldsRead = await readFields();
  kit.check(
    "7: typing is in artifact_read within 2 s as value; a radio and a select as options",
    typed !== null && pickedIn !== null,
    `typed ${typed ?? "not within 2 s"} ms, picked ${pickedIn ?? "not within 2 s"} ms; state ${JSON.stringify(fieldsRead.state).slice(0, 300)}; said: ${said.slice(-6).join(" | ") || "nothing"}`
  );
  await Bun.sleep(LISTEN_MS);
  const fieldsTold = fleet.seen.filter((one) => TOLD.test(one.all));
  kit.check(
    "7: the session hears nothing of the fields until a Send",
    fieldsTold.length === 0,
    fieldsTold.map((one) => one.last.slice(0, 160)).join(" | ") || "nothing"
  );
  const rpcBefore = await rpcSeen(page);

  // 8. A reload fills the fields from the doc by the first fieldFrame.
  await page.reload({ waitUntil: "domcontentloaded" });
  fieldFrame = await fieldsFrame(page);
  const firstFrame = await until(
    "the frame's fields on its first frame",
    () =>
      fieldFrame.evaluate(
        () =>
          (window as unknown as { __firstFrame?: Record<string, string> })
            .__firstFrame ?? null
      ),
    Boolean,
    15_000
  ).catch(() => null);
  kit.check(
    "8: after a reload the three fields stand as kept on DOMContentLoaded + one frame",
    firstFrame?.title === "Hello probe" &&
      firstFrame.size === "m" &&
      firstFrame.tone === "bright",
    JSON.stringify(firstFrame)
  );

  // 9. Re-publish with the input focused and holding typed text.
  const titleInput = fieldFrame.locator('input[name="title"]');
  await titleInput.focus();
  await titleInput.press("End");
  await titleInput.pressSequentially(" plus", { delay: 20 });
  await fieldFrame.evaluate(() => {
    const kept = window as unknown as { __loads: number; __sockets: number };
    scrollTo(0, 400);
    kept.__loads = 0;
    kept.__sockets = 0;
    addEventListener("load", () => {
      kept.__loads += 1;
    });
    window.WebSocket = new Proxy(window.WebSocket, {
      construct(target, args) {
        kept.__sockets += 1;
        return Reflect.construct(target, args);
      },
    });
  });
  const beforeMorph = await fieldFrame.evaluate(() => scrollY);
  await call(UPDATE, { id: fieldsId, html: fieldsPage("Fields, second") });
  const morphed = await until(
    "the heading morphed",
    () => fieldFrame.evaluate(() => document.querySelector("h1")?.textContent),
    (text) => text === "Fields, second",
    15_000
  ).catch(() => null);
  const afterMorph = await fieldFrame.evaluate(() => {
    const kept = window as unknown as { __loads?: number; __sockets?: number };
    const active = document.activeElement as HTMLInputElement | null;
    return {
      active: active?.getAttribute("name") ?? active?.localName ?? null,
      text: active?.value ?? null,
      scrollY,
      loads: kept.__loads ?? null,
      sockets: kept.__sockets ?? null,
    };
  });
  kit.check(
    "9: the re-publish morphs: heading changed, focus and text kept, scroll kept, no load, no new socket",
    morphed === "Fields, second" &&
      afterMorph.active === "title" &&
      afterMorph.text === "Hello probe plus" &&
      afterMorph.scrollY === beforeMorph &&
      afterMorph.loads === 0 &&
      afterMorph.sockets === 0,
    `heading ${JSON.stringify(morphed)}; scroll ${beforeMorph} → ${JSON.stringify(afterMorph)}`
  );

  // 10. The artifact's own tab: the same doc, both ways.
  const tab = await kit.page("desk", { init: [watchFrames] });
  await open(tab, `${base}/artifact/${fieldsId}`, 'iframe[title="Preview"]');
  const tabFrame = await fieldsFrame(tab);
  const tabValues = await until(
    "the tab's fields from the doc",
    () => fieldValues(tabFrame),
    (values) => values.title === "Hello probe plus",
    10_000
  ).catch(() => fieldValues(tabFrame));
  const tabPickedAt = Date.now();
  await tabFrame.locator('[data-option="cool"]').click();
  const crossed = await until(
    "the tab's pick in the first page",
    () => fieldFrame.locator('[data-option="cool"][data-cawco-picked]').count(),
    (count) => count === 1,
    2000
  ).then(
    () => Date.now() - tabPickedAt,
    () => null
  );
  kit.check(
    "10: /artifact/<id> shows the same state, and its pick is marked in the first page within 2 s",
    tabValues.title === "Hello probe plus" &&
      tabValues.size === "m" &&
      tabValues.tone === "bright" &&
      crossed !== null,
    `tab shows ${JSON.stringify(tabValues)}; pick crossed in ${crossed ?? "not within 2 s"} ms`
  );

  // 11. Nothing spoke JSON-RPC.
  const rpc = [...rpcBefore, ...(await rpcSeen(page)), ...(await rpcSeen(tab))];
  kit.check(
    "11: no JSON-RPC message crossed postMessage during 7–10",
    rpc.length === 0,
    rpc.slice(0, 4).join(" | ") || "none"
  );

  await themeChecks({ kit, page, call }, fieldFrame);

  // 14. A preview of a port nothing listens on: the pane's word is the failure.
  const freed = Bun.serve({ port: 0, fetch: () => new Response() });
  const deadPort = freed.port as number;
  await freed.stop(true);
  const dead = await call(CREATE, {
    kind: "preview",
    name: "dead-port",
    port: deadPort,
  });
  const deadTook = took();
  const deadId = dead.match(ANSWERED_ID)?.[1];
  const failed = shownPosts.find((post) => post.artifact === deadId);
  const band = await page
    .locator(".preview-pane .down[role=alert]")
    .textContent({ timeout: 5000 })
    .catch(() => null);
  kit.check(
    "14: a port nothing answers: opened false with the server sentence within 10 s, from the pane's word, and the pane's failure band",
    dead.includes('"opened":false') &&
      dead.includes(`The server on port ${deadPort} on `) &&
      dead.includes("did not answer: nothing is listening on that port.") &&
      deadTook < SHOWN_WAIT_MS &&
      failed?.body.ok === false &&
      failed.body.error === "server" &&
      !!band?.includes(`Nothing is running on port ${deadPort}`),
    `the tool took ${deadTook} ms; pane said ${JSON.stringify(failed?.body)}; band ${JSON.stringify(band?.trim().slice(0, 160))}; ${dead.slice(dead.indexOf('{"id"'), dead.indexOf('{"id"') + 300)}`
  );
};

const spec: Spec = { name: "artifacts", run };
export default spec;
