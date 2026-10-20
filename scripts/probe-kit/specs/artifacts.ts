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
 * 6. None of the tools the artifact tools replaced (show_preview, page_show,
 *    page_choices, canvas_choices, read_choices) is among the session's
 *    tools; the artifact tools are.
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
 * 19. The head says no path under the artifact's name (owner: "a stray /
 *    below the preview title"): for the page, the live preview and a canvas
 *    the session makes, at 1440 and at 390, the head stands with the
 *    artifact's own ask as its line under the name, and no text in the
 *    panel holds a route.
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
 * 17. Outside a project the session is never listed the tool (hub
 *    delegation-mcp.ts `PROJECT_ONLY`, 2edf20006): neither the hub's listing
 *    nor any request the model got names it, artifact_create is listed, and
 *    no project folder holds anything.
 *
 * A delegate's `to: "parent"` (`handChecks`), first, before any dashboard:
 *
 * H1–H6. The parent shows its own page; its delegate's canvas handed up
 *    answers opened false; the parent's panel still shows its page; the
 *    parent hears the hand-off line once; its artifact_list has the canvas
 *    shown false, waiting on its session; its artifact_show opens it.
 * H7. A handed canvas with elements is drawn unopened, on the hub machine's
 *    headless screen: its create wrote them, the parent reads them and a
 *    picture, and the parent's panel still shows its own page.
 * H9. The delegate's own artifact_show of what it handed up is refused, and
 *    the parent's panel keeps its page.
 * H8. Once the parent opened it, the delegate's re-create while the
 *    parent's panel shows it is held as its next version: the panel keeps
 *    it, it waits on the parent, the parent is told it changed.
 * H10–H12. The delegate's new HTML for a page the parent's panel shows, and
 *    its elements for the held canvas, wait as the next version: the
 *    panel's revision stays, the parent is told once, and the parent's
 *    artifact_show merges the last version in.
 * H13. A change to a page the parent opened that the panel no longer shows
 *    is held all the same.
 * P1–P3. The delegate's `to: "parent"` preview of a folder that isn't there,
 *    and one of a port nothing listens on, are refused, and the parent gets
 *    no artifact and no send of either.
 *
 * Every artifact carries its ask (the artifact purpose spec's §4 legs 12 to
 * 18, named "ask 12" to "ask 18" here), each the hub's own answer:
 *
 * ask 12. A create of a page with `program` and neither `does` nor `ask`, on
 *    the hub's route (the tool's own schema refuses it before the hub hears
 *    it): 422, the tool's shape.
 * ask 13. `kind: "component"`, `does: "pick"`: a pick is a decision page's.
 * ask 14. `kind: "page"`, `does: "pick"`, HTML with no choice and no named
 *    field: a page for picking holds a choice.
 * ask 15. `kind: "page"`, `does: "try"`, a program: a try is a flow.
 * ask 16. `kind: "page"`, `does: "judge"`, a folder whose page.html shows
 *    three 2880×1800 PNGs: too many desk captures for the panel.
 * ask 17. `ask: "Tap the card"`: no "tap" or "poke".
 * ask 18. `ask: "Judge src/lib/Card.svelte"`: no file in the person's words.
 *
 * The head carries the ask (§3.4, §4 "The head"), on a page made with
 * `ask: "Judge the six pairing states: pin anything that reads wrong"`:
 *
 * ask 22. At 1440 and 390, light and dark, the 44px head says the ask once:
 *    its subtitle under the name where the head has the room the line needs
 *    by the name's own rule (side/head.ts `NAME_KEEPS`), else the menu's
 *    first row; the title control's title is the ask either way.
 * ask 23. Within 5 s of a Send with a note, the same line reads
 *    "Sent to <the session's title>".
 * ask 24. `artifact_update({ id, ask })` turns the line to the new ask with
 *    no `load` on the frame.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { PNG } from "pngjs";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import {
  type Kit,
  type KitFleet,
  open,
  pressIn,
  type Spec,
  settle,
} from "../kit";

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
const COMMAND = /PROBE-CALL:(\d+)/g;
/** Anything the hub would tell the session of the person's responses, or the person's picks as words. */
const TOLD =
  /\[CawCo\] The (?:page|canvas|preview) "|changed my picks|sent my picks/;
/** The tools the artifact tools replaced (a4f208b90, Artifacts slice 1), by name. */
const REPLACED = [
  "show_preview",
  "page_show",
  "page_choices",
  "canvas_choices",
  "read_choices",
].map((tool) => `mcp__cawco__${tool}`);
/** A replaced tool's name, whole: `admin_previews_read` and the like are other tools. */
const PREVIEW_TOOL = new RegExp(`\\b(?:${REPLACED.join("|")})\\b`, "g");
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
  // H, P: a hand-up's own sessions, before anything opens a dashboard.
  await handChecks({ kit, fleet, callIn });
  const read = (artifact: string) =>
    fleet.api<Read>(`/api/instances/${session}/artifacts/${artifact}`);

  // 1. The page, made by the session through the MCP tool.
  const created = await call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
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
  await open(page, `${base}/session/${session}`, "[data-artifact-trigger]");
  // The shell's rail, in a browser with no width of its own, is drawn at the
  // `c-sidebar-w` token (DESIGN.md: "228px by default"), its one source.
  const width = (
    (await Bun.file(TOKENS).json()) as {
      size: { "c-sidebar-w": { $value: { value: number; unit: string } } };
    }
  ).size["c-sidebar-w"].$value;
  const token = `${width.value}${width.unit}`;
  const rail = await page.evaluate(() => ({
    css: getComputedStyle(document.documentElement)
      .getPropertyValue("--c-sidebar-w")
      .trim(),
    drawn: document
      .querySelector(
        'aside:is([data-slot="rail"], [data-home-variant~="rail"])'
      )
      ?.getBoundingClientRect().width,
    viewport: innerWidth,
  }));
  kit.check(
    "0: at 1440 the sidebar is drawn at the c-sidebar-w token",
    rail.viewport === 1440 &&
      rail.css === token &&
      rail.drawn === Number.parseFloat(token),
    `token ${token}, css ${rail.css}, drawn ${rail.drawn}px at ${rail.viewport}`
  );
  await page.click("[data-artifact-trigger]");
  await page.locator(`[data-artifact-row][data-artifact="${id}"]`).waitFor();
  // The menu rises from 0.92 as it opens: read its geometry once it has landed.
  await settle(page);
  const listed = await page
    .locator(`[data-artifact-row][data-artifact="${id}"]`)
    .count();
  kit.check(
    "1, 12: the panel's menu lists it once a page opens",
    listed === 1,
    `${listed} rows`
  );
  // DESIGN.md (Artifact panel, canvas and ink): a 44px row, the kind's 16px
  // glyph, the name in the label role, its age in meta ink.
  const row = await page
    .locator(`[data-artifact-row][data-artifact="${id}"]`)
    .evaluate((node) => {
      const probe = document.createElement("span");
      probe.style.font = "var(--type-label)";
      probe.style.color = "var(--ink-muted)";
      document.body.append(probe);
      const label = getComputedStyle(probe);
      const name = node.querySelector('[data-slot="row-name"]');
      const age = node.querySelector('[data-slot="row-age"]');
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
    .locator(`[data-artifact-row][data-artifact="${id}"]`)
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
  await pressIn(frame, '[data-option="b"]');
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
  await page.waitForSelector("[data-artifact-trigger]");
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
    "6: none of the tools the artifact tools replaced is in the tool list; the artifact tools are",
    strays.length === 0 &&
      ["artifact_create", "artifact_update", "artifact_read", "artifact_show"]
        .map(names)
        .every(Boolean),
    `replaced tools: ${strays.join(", ") || "none"}; artifact_read ${names("artifact_read")}`
  );

  await askChecks({ kit, fleet, session, call });
  await fieldChecks({ kit, fleet, session, page, base, call, said });
  await headChecks({ kit, fleet, session, base, call });
  await promoteChecks({ kit, fleet, base, callIn, session });
};

/** The hand-off line a parent gets for its delegate's `to: "parent"` artifact (core `artifactHandedNotice`), after its tag. */
const handedLine = (from: string, kind: string, name: string, id: string) =>
  `[CawCo] ${from} handed you the ${kind} "${name}" (artifact ${id}), not opened: artifact_show opens it in your panel.`;

/** One artifact as artifact_list answers it (artifacts/service.ts `ArtifactStatus`). */
interface Listed {
  id: string;
  madeBy?: string;
  shown: boolean;
  waitingOn: string[];
}

/**
 * H1–H13: a delegate's `to: "parent"` artifact reaches its parent listed,
 * not opened, a canvas drawn all the same; only the parent's own
 * artifact_show puts it in its panel.
 * P1–P3: a `to: "parent"` preview that can't start or doesn't answer is
 * refused, and nothing reaches the parent. Read from the hub
 * (`/api/artifacts/:id`'s `shown`, the parent's `sent_messages`) and the
 * tools' answers; no dashboard is open.
 */
const handChecks = async ({
  kit,
  fleet,
  callIn,
}: {
  callIn: (on: string) => (tool: string, input: object) => Promise<string>;
  fleet: KitFleet;
  kit: Kit;
}) => {
  const parent = await fleet.spawn("claude", "Hand parent", fleet.repo);
  const delegate = await fleet.spawn("claude", "Hand delegate", fleet.repo, {
    parent: { instanceId: parent },
  });
  const callParent = callIn(parent);
  const callDelegate = callIn(delegate);
  const shownOf = (id: string) =>
    fleet.api<{ instanceId: string; shown: boolean }>(`/api/artifacts/${id}`);
  /** The words of the parent's sends that carry a hand-off tag naming `id` (each body is the harness's JSON line). */
  const handedSends = (id: string) =>
    fleet
      .query<{ body: string }>(
        "SELECT body FROM sent_messages WHERE instance_id = ? ORDER BY accepted_at",
        parent
      )
      .map(
        (one) =>
          (JSON.parse(one.body) as { message?: { content?: unknown } }).message
            ?.content
      )
      .map((content) =>
        typeof content === "string" ? content : JSON.stringify(content ?? "")
      )
      .filter((text) => text.includes("artifact-handed") && text.includes(id));

  // H1. The parent shows its own page.
  const own = await callParent(CREATE, {
    kind: "page",
    name: "parent-own",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    html: PAGE,
  });
  const ownId = own.match(ANSWERED_ID)?.[1];
  if (!ownId) {
    kit.check("H1: the parent's own page is made", false, own.slice(0, 400));
    return;
  }
  const ownShown = await shownOf(ownId);
  kit.check(
    "H1: the parent's own page is what its panel shows",
    ownShown.shown && ownShown.instanceId === parent,
    JSON.stringify(ownShown)
  );

  // H2. The delegate hands up a canvas.
  const handed = await callDelegate(CREATE, {
    kind: "canvas",
    name: "handed-canvas",
    does: "draw",
    ask: "Draw on this canvas",
    to: "parent",
  });
  const handedId = handed.match(ANSWERED_ID)?.[1];
  const handedAt = handed.slice(Math.max(0, handed.indexOf('{"id"')));
  kit.check(
    "H2: the delegate's to: parent canvas is made, readied and not opened",
    !!handedId &&
      handedAt.includes('"opened":false') &&
      handedAt.includes("Handed to your parent, not opened"),
    handedAt.slice(0, 400)
  );
  if (!handedId) {
    return;
  }

  // H3. The parent's panel still shows its own page.
  const [ownAfter, handedShown] = await Promise.all([
    shownOf(ownId),
    shownOf(handedId),
  ]);
  kit.check(
    "H3: the parent's panel still shows its own page, not the handed canvas",
    ownAfter.shown && !handedShown.shown && handedShown.instanceId === parent,
    `own ${JSON.stringify(ownAfter)}; handed ${JSON.stringify(handedShown)}`
  );

  // H4. The parent got the hand-off line once.
  const line = handedLine("Hand delegate", "canvas", "handed-canvas", handedId);
  const sends = await until(
    "the parent's hand-off send",
    () => handedSends(handedId),
    (found) => found.length > 0,
    30_000
  ).catch(() => handedSends(handedId));
  await Bun.sleep(LISTEN_MS);
  const sendsLater = handedSends(handedId);
  kit.check(
    "H4: the parent got the hand-off line once",
    sendsLater.length === 1 && sends[0]?.includes(line) === true,
    `${sendsLater.length} send(s); first: ${sends[0]?.slice(0, 400) ?? "none"}`
  );

  // H5. artifact_list from the parent: shown false, waiting on the parent.
  const listedText = await callParent("mcp__cawco__artifact_list", {});
  const listed = await fleet.api<Listed[]>(
    `/api/instances/${parent}/artifacts/status`
  );
  const entry = listed.find((one) => one.id === handedId);
  kit.check(
    "H5: artifact_list from the parent has it shown false, madeBy the delegate, waitingOn the parent's session",
    entry?.shown === false &&
      entry.madeBy === delegate &&
      entry.waitingOn.includes("session") &&
      listedText.includes(handedId),
    JSON.stringify(entry ?? null)
  );

  // H7. A handed canvas with elements is drawn unopened: on the hub
  // machine's headless screen, while the parent's panel keeps its page.
  const drawing = await callDelegate(CREATE, {
    kind: "canvas",
    name: "handed-drawing",
    does: "draw",
    ask: "Draw over this sketch",
    to: "parent",
    elements: [
      {
        type: "rectangle",
        id: "handed-box",
        x: 0,
        y: 0,
        width: 160,
        height: 60,
        label: { text: "Handed box" },
      },
    ],
  });
  const drawingId = drawing.match(ANSWERED_ID)?.[1];
  const drawn = drawingId
    ? await until(
        "the handed drawing's picture, from its headless screen",
        () =>
          fleet.api<{ outline: string; pictureAt: string | null }>(
            `/api/instances/${parent}/artifacts/${drawingId}`
          ),
        (read) => read.pictureAt !== null,
        30_000
      ).catch(() =>
        fleet.api<{ outline: string; pictureAt: string | null }>(
          `/api/instances/${parent}/artifacts/${drawingId}`
        )
      )
    : null;
  const [ownWhileDrawn, drawingShown] = await Promise.all([
    shownOf(ownId),
    drawingId ? shownOf(drawingId) : Promise.resolve(null),
  ]);
  const drawingSends = drawingId ? handedSends(drawingId).length : 0;
  kit.check(
    "H7: a handed canvas with elements is drawn unopened: its create wrote them, the parent reads them and a picture, is told once, and its panel still shows its own page",
    drawing.includes('"wrote":["handed-box"') &&
      drawing.includes("Handed to your parent, not opened") &&
      drawn?.outline.includes("Handed box") === true &&
      drawn.pictureAt !== null &&
      drawingSends === 1 &&
      ownWhileDrawn.shown &&
      drawingShown?.shown === false,
    `create: ${drawing.slice(Math.max(0, drawing.indexOf('{"id"')), drawing.indexOf('{"id"') + 500)}; read ${JSON.stringify(drawn)}; ${drawingSends} send(s); own ${ownWhileDrawn.shown}, drawing ${drawingShown?.shown}`
  );

  // H9. The delegate can't open what it handed up: its artifact_show is
  // refused, and the parent's panel keeps its page.
  const delegateShow = await callDelegate("mcp__cawco__artifact_show", {
    id: handedId,
  });
  const [ownAfterRefused, handedAfterRefused] = await Promise.all([
    shownOf(ownId),
    shownOf(handedId),
  ]);
  kit.check(
    "H9: the delegate's artifact_show of the canvas it handed up is refused, and the parent's panel keeps its page",
    delegateShow.includes("is your parent's: it opens in their panel") &&
      ownAfterRefused.shown &&
      !handedAfterRefused.shown,
    `delegate show: ${delegateShow.slice(-300)}; own ${ownAfterRefused.shown}, handed ${handedAfterRefused.shown}`
  );

  // H6. The parent's artifact_show opens it; it waits on no one for it after.
  const opened = await callParent("mcp__cawco__artifact_show", {
    id: handedId,
  });
  const [handedOpened, ownClosed] = await Promise.all([
    shownOf(handedId),
    shownOf(ownId),
  ]);
  const after = (
    await fleet.api<Listed[]>(`/api/instances/${parent}/artifacts/status`)
  ).find((one) => one.id === handedId);
  kit.check(
    "H6: the parent's artifact_show puts it in its panel, and the hand-off waits on the parent no more",
    handedOpened.shown &&
      !ownClosed.shown &&
      after?.shown === true &&
      !after.waitingOn.includes("session"),
    `show: ${opened.slice(Math.max(0, opened.lastIndexOf("{")), opened.lastIndexOf("{") + 200)}; handed ${JSON.stringify(handedOpened)}; list ${JSON.stringify(after ?? null)}`
  );

  await heldChecks({
    kit,
    fleet,
    parent,
    callParent,
    callDelegate,
    handedSends,
    shownOf,
    canvasId: handedId,
  });
  await refusedHandChecks({ kit, fleet, parent, callDelegate });
};

/** The next version a held change answers (artifacts/service.ts `heldId`). */
const HELD_ID = /"held":"([0-9a-f-]{36})"/;

/** What the hub reads of an artifact: its revision, page hash and outline (artifacts/service.ts `ArtifactRead`). */
interface HeldRead {
  outline?: string;
  pageHash: string | null;
  revision: number;
}

/** A page whose heading names its version. */
const versionPage = (version: string) =>
  PAGE.replace("<h1>Pick a hero</h1>", `<h1>Version ${version}</h1>`);

/**
 * H8, H10–H13: a maker's change to an artifact its parent opened is held
 * as its next version. The panel's artifact keeps its revision, the
 * parent is told once ("… changed the …"), the next version reads as what
 * the maker wrote, and the parent's artifact_show merges it in. A page's new
 * HTML, a canvas's re-create and its elements; read from the hub
 * (`/api/instances/:id/artifacts/:artifact`) and the parent's sends.
 */
const heldChecks = async ({
  kit,
  fleet,
  parent,
  callParent,
  callDelegate,
  handedSends,
  shownOf,
  canvasId,
}: {
  callDelegate: (tool: string, input: object) => Promise<string>;
  callParent: (tool: string, input: object) => Promise<string>;
  canvasId: string;
  fleet: KitFleet;
  handedSends: (id: string) => string[];
  kit: Kit;
  parent: string;
  shownOf: (id: string) => Promise<{ instanceId: string; shown: boolean }>;
}) => {
  const readOf = (id: string) =>
    fleet.api<HeldRead>(`/api/instances/${parent}/artifacts/${id}`);
  const heldOf = (answer: string) => answer.match(HELD_ID)?.[1];
  const changedSends = (id: string) =>
    handedSends(id).filter((text) => text.includes("changed the"));

  // H8. The delegate re-creates the canvas the parent's panel now shows: held.
  const again = await callDelegate(CREATE, {
    kind: "canvas",
    name: "handed-canvas",
    does: "draw",
    ask: "Draw on this canvas",
    to: "parent",
  });
  const canvasNext = heldOf(again);
  const relisted = (
    await fleet.api<Listed[]>(`/api/instances/${parent}/artifacts/status`)
  ).find((one) => one.id === canvasId);
  const canvasShown = await shownOf(canvasId);
  kit.check(
    "H8: the delegate's re-create of the canvas the parent's panel shows is held as its next version: the panel keeps it, it waits on the parent, and the parent is told it changed",
    !!canvasNext &&
      again.includes("waits as its next version") &&
      canvasShown.shown &&
      relisted?.waitingOn.includes("session") === true &&
      changedSends(canvasId).length === 1,
    `create: ${again.slice(Math.max(0, again.indexOf('{"id"')), again.indexOf('{"id"') + 300)}; shown ${canvasShown.shown}; list ${JSON.stringify(relisted ?? null)}; ${changedSends(canvasId).length} change send(s)`
  );

  // H10. A page the parent opened, then the delegate's new HTML twice.
  const made = await callDelegate(CREATE, {
    kind: "page",
    name: "held-page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    html: versionPage("1"),
    to: "parent",
  });
  const pageId = made.match(ANSWERED_ID)?.[1];
  if (!pageId) {
    kit.check("H10: the delegate's page is handed up", false, made.slice(-400));
    return;
  }
  await callParent("mcp__cawco__artifact_show", { id: pageId });
  const shownRead = await readOf(pageId);
  const first = await callDelegate(UPDATE, {
    id: pageId,
    html: versionPage("2"),
  });
  const second = await callDelegate(UPDATE, {
    id: pageId,
    html: versionPage("3"),
  });
  const pageNext = heldOf(first);
  const sends = await until(
    "the parent's change send",
    () => changedSends(pageId),
    (found) => found.length > 0,
    30_000
  ).catch(() => changedSends(pageId));
  await Bun.sleep(LISTEN_MS);
  const [heldRead, nextRead, pageShown] = await Promise.all([
    readOf(pageId),
    pageNext ? readOf(pageNext) : Promise.resolve(null),
    shownOf(pageId),
  ]);
  kit.check(
    "H10: the delegate's new HTML for a page the parent's panel shows leaves the panel's page on its revision, waits as one next version, and tells the parent once",
    !!pageNext &&
      heldOf(second) === pageNext &&
      pageShown.shown &&
      heldRead.revision === shownRead.revision &&
      heldRead.pageHash === shownRead.pageHash &&
      nextRead !== null &&
      nextRead.pageHash !== shownRead.pageHash &&
      changedSends(pageId).length === 1 &&
      sends[0]?.includes(
        `changed the page "held-page" (artifact ${pageId}): your panel keeps the version you opened`
      ) === true,
    `shown r${shownRead.revision} ${shownRead.pageHash?.slice(0, 8)}; after r${heldRead.revision} ${heldRead.pageHash?.slice(0, 8)}; next ${pageNext} ${nextRead?.pageHash?.slice(0, 8)}; ${changedSends(pageId).length} change send(s): ${sends[0]?.slice(0, 300) ?? "none"}`
  );

  // H11. The parent's artifact_show opens the new version.
  await callParent("mcp__cawco__artifact_show", { id: pageId });
  const opened = await readOf(pageId);
  const listed = (
    await fleet.api<Listed[]>(`/api/instances/${parent}/artifacts/status`)
  ).find((one) => one.id === pageId);
  const gone = pageNext
    ? await fleet
        .api<unknown>(`/api/instances/${parent}/artifacts/${pageNext}`)
        .then(
          () => false,
          () => true
        )
    : false;
  kit.check(
    "H11: the parent's artifact_show moves its panel's page to the delegate's last version, and nothing waits after",
    opened.pageHash === nextRead?.pageHash &&
      opened.revision > shownRead.revision &&
      gone &&
      listed?.shown === true &&
      !listed.waitingOn.includes("session"),
    `opened r${opened.revision} ${opened.pageHash?.slice(0, 8)}; next gone ${gone}; list ${JSON.stringify(listed ?? null)}`
  );

  // H12. Elements for the canvas held in H8: drawn on its next version, merged on show.
  const drawn = await callDelegate(UPDATE, {
    id: canvasId,
    elements: [
      {
        type: "rectangle",
        id: "held-box",
        x: 0,
        y: 0,
        width: 160,
        height: 60,
        label: { text: "Held box" },
      },
    ],
  });
  const [liveCanvas, nextCanvas] = await Promise.all([
    readOf(canvasId),
    canvasNext ? readOf(canvasNext) : Promise.resolve(null),
  ]);
  await callParent("mcp__cawco__artifact_show", { id: canvasId });
  const openedCanvas = await readOf(canvasId);
  kit.check(
    "H12: the delegate's elements for the held canvas are drawn on its next version, not the panel's, the parent told no more, and its artifact_show merges them in",
    heldOf(drawn) === canvasNext &&
      drawn.includes('"wrote":["held-box"') &&
      liveCanvas.outline?.includes("Held box") === false &&
      nextCanvas?.outline?.includes("Held box") === true &&
      changedSends(canvasId).length === 1 &&
      openedCanvas.outline?.includes("Held box") === true,
    `update: ${drawn.slice(Math.max(0, drawn.indexOf('{"')), drawn.indexOf('{"') + 300)}; live ${JSON.stringify(liveCanvas.outline)}; next ${JSON.stringify(nextCanvas?.outline)}; opened ${JSON.stringify(openedCanvas.outline)}; ${changedSends(canvasId).length} change send(s)`
  );

  // H13. The page the parent opened, no longer in front (the canvas is): a
  // change is held all the same, so the panel's list opens what it opened.
  const behind = await callDelegate(UPDATE, {
    id: pageId,
    html: versionPage("4"),
  });
  const behindSends = await until(
    "the parent's second change send for the page",
    () => changedSends(pageId),
    (found) => found.length > 1,
    30_000
  ).catch(() => changedSends(pageId));
  const [behindRead, pageNow] = await Promise.all([
    readOf(pageId),
    shownOf(pageId),
  ]);
  kit.check(
    "H13: the delegate's change to the page the parent opened, while the panel shows something else, is held too: its revision stays and the parent is told",
    !!heldOf(behind) &&
      !pageNow.shown &&
      behindRead.pageHash === opened.pageHash &&
      behindRead.revision === opened.revision &&
      behindSends.length === 2,
    `update: ${behind.slice(Math.max(0, behind.indexOf('{"')), behind.indexOf('{"') + 200)}; shown ${pageNow.shown}; r${behindRead.revision} ${behindRead.pageHash?.slice(0, 8)} (opened r${opened.revision} ${opened.pageHash?.slice(0, 8)}); ${behindSends.length} change send(s)`
  );
};

/**
 * P1–P3: a delegate's `to: "parent"` preview that can't start, or whose
 * port nothing answers on, is refused, and nothing of it reaches `parent`:
 * no artifact, no send.
 */
const refusedHandChecks = async ({
  kit,
  fleet,
  parent,
  callDelegate,
}: {
  callDelegate: (tool: string, input: object) => Promise<string>;
  fleet: KitFleet;
  kit: Kit;
  parent: string;
}) => {
  /** The parent's artifacts and sends, counted. */
  const reached = () => ({
    artifacts: fleet.query<{ n: number }>(
      "SELECT count(*) AS n FROM artifacts WHERE instance_id = ?",
      parent
    )[0]?.n,
    sends: fleet.query<{ n: number }>(
      "SELECT count(*) AS n FROM sent_messages WHERE instance_id = ?",
      parent
    )[0]?.n,
  });

  // P1. A preview that can't start (its folder is not there) is refused.
  const before = reached();
  const broken = await callDelegate(CREATE, {
    kind: "preview",
    name: "broken-preview",
    does: "try",
    ask: "Try this page and say whether it works",
    dir: join(fleet.repo, "no-such-folder"),
    to: "parent",
  });
  kit.check(
    "P1: a delegate's to: parent preview whose folder can't be served is refused",
    !ANSWERED_ID.test(broken) && broken.includes("no such file or directory"),
    broken.slice(-400)
  );

  // P3. A preview of a port nothing listens on: no panel would load it to
  // fail, so it is loaded first, refused, and never handed up.
  const free = Bun.serve({ port: 0, fetch: () => new Response("") });
  const silent = free.port;
  free.stop(true);
  const deaf = await callDelegate(CREATE, {
    kind: "preview",
    name: "silent-preview",
    does: "try",
    ask: "Try this page and say whether it works",
    port: silent,
    to: "parent",
  });
  kit.check(
    "P3: a delegate's to: parent preview of a port nothing listens on is refused with the server sentence",
    !ANSWERED_ID.test(deaf) &&
      deaf.includes(`The server on port ${silent} on `) &&
      deaf.includes("did not answer: nothing is listening on that port.") &&
      deaf.includes("It wasn't handed to your parent."),
    deaf.slice(-400)
  );

  // P2. Nothing of either reaches the parent: no artifact, no send.
  await Bun.sleep(LISTEN_MS);
  const after2 = reached();
  kit.check(
    "P2: nothing of the refused previews reaches the parent: no artifact in its list, no send",
    after2.artifacts === before.artifacts && after2.sends === before.sends,
    `artifacts ${before.artifacts} → ${after2.artifacts}; sends ${before.sends} → ${after2.sends}`
  );
};

/** A decision page's program with one question, as the decision library takes it. */
const ONE_QUESTION = `root = Decisions("Pick a hero", [hero])
hero = Decision("hero", "Which hero leads?", [a, b], "A reads at a glance.")
a = Option("a", "Hero A", "One line, one button.", true, [], "Says less.")
b = Option("b", "Hero B", "A picture and a quote.", false, [], "Slower to read.")`;

/** A PNG of `width` × `height`, one flat colour: a desk capture as the page holds it. */
const capturePng = (width: number, height: number): Buffer => {
  const png = new PNG({ width, height });
  png.data.fill(200);
  return PNG.sync.write(png);
};

/** Checks ask 12 to ask 18: each refusal the hub gives a create that names no ask, or one its kind can't deliver. */
const askChecks = async ({
  kit,
  fleet,
  session,
  call,
}: Pick<OnSession, "call" | "fleet" | "kit" | "session">) => {
  // ask 12: on the hub's route, as the tool posts it.
  const bare = await fleet
    .api(`/api/instances/${session}/artifacts`, {
      kind: "page",
      name: "no-ask",
      program: ONE_QUESTION,
    })
    .then(
      (answer) => `200 ${JSON.stringify(answer)}`,
      (error: Error) => error.message
    );
  const body = bare.slice(bare.indexOf(" 422 ") + " 422 ".length);
  kit.check(
    "ask 12: a create with no does and no ask is 422, its body the tool's shape",
    bare.includes(": 422 ") &&
      body.startsWith(
        "artifact_create takes kind, name, does (pick | judge | try | draw), ask"
      ),
    bare.slice(0, 300)
  );

  const refused = async (
    leg: string,
    input: object,
    text: string,
    status = 400
  ) => {
    const answer = await call(CREATE, input);
    kit.check(
      `${leg}: refused ${status} with "${text.slice(0, 60)}…"`,
      answer.includes(text) && !ANSWERED_ID.test(answer),
      answer.slice(0, 400)
    );
  };
  await refused(
    "ask 13",
    {
      kind: "component",
      name: "picked-on-canvas",
      does: "pick",
      ask: "Pick the card",
      file: "src/Card.stories.ts",
    },
    'A pick happens on a decision page: kind "page" with a program holding one Decision per question (decision-page skill). This component is an option\'s media: embed it with Canvas or Preview inside the Option.'
  );
  await refused(
    "ask 14",
    {
      kind: "page",
      name: "nothing-to-pick",
      does: "pick",
      ask: "Pick the hero",
      html: '<!doctype html><html lang="en"><body><h1>Heroes</h1><p>Two of them.</p></body></html>',
    },
    "A page for picking holds a choice: a Decision in its program, or a data-cawco-choice in its HTML. This one holds none."
  );
  await refused(
    "ask 15",
    {
      kind: "page",
      name: "tried-program",
      does: "try",
      ask: "Try the hero",
      program: ONE_QUESTION,
    },
    "is judged or picked on, not tried."
  );
  // ask 16: three desk captures beside page.html, in a folder on the session's machine.
  const folder = join(fleet.sandbox, "captures");
  mkdirSync(folder, { recursive: true });
  for (const n of [1, 2, 3]) {
    writeFileSync(join(folder, `state-${n}.png`), capturePng(2880, 1800));
  }
  writeFileSync(
    join(folder, "page.html"),
    `<!doctype html><html lang="en"><body>${[1, 2, 3]
      .map((n) => `<img alt="State ${n}" src="state-${n}.png">`)
      .join("")}</body></html>`
  );
  await refused(
    "ask 16",
    {
      kind: "page",
      name: "captures",
      does: "judge",
      ask: "Judge the relay's three states",
      dir: folder,
    },
    "3 captures wider than 1600px on one page draw at a fraction of their size in the panel."
  );
  await refused(
    "ask 17",
    {
      kind: "page",
      name: "tapped",
      does: "judge",
      ask: "Tap the card",
      html: PAGE,
    },
    'The ask reaches the person: say what they do (pick, pin, try, draw) and to what, without "tap" or "poke".'
  );
  await refused(
    "ask 18",
    {
      kind: "page",
      name: "pathed",
      does: "judge",
      ask: "Judge src/lib/Card.svelte",
      html: PAGE,
    },
    "The ask is in the person's words: no file, path or id in it. Name the thing as they call it."
  );
};

/** The ask the head legs' page opens with, and the round after it. */
const ASK = "Judge the six pairing states: pin anything that reads wrong";
const ASK_AGAIN = "Round two: judge the denied state";
const PANE =
  ':is([data-slot="preview-pane"], [data-side-surface-class~="preview-pane"])';

/** The head's line as it shows: its subtitle under the name, or the menu's first row; the head's height and the title control's title. */
const lineOf = async (on: Page) => {
  const head = await on.evaluate((pane) => {
    const side = document.querySelector(`${pane} [data-slot="side-head"]`);
    const line = side?.querySelector<HTMLElement>('[data-slot="subtitle"]');
    return {
      height: side?.getBoundingClientRect().height ?? 0,
      title:
        side?.querySelector<HTMLElement>("[data-artifact-trigger]")?.title ??
        "",
      line:
        line && !line.hasAttribute("data-dropped")
          ? (line.textContent?.trim() ?? null)
          : null,
      inside: line
        ? line.getBoundingClientRect().bottom <=
          (side?.getBoundingClientRect().bottom ?? 0)
        : false,
    };
  }, PANE);
  if (head.line !== null) {
    return { ...head, at: "head" as const };
  }
  await on.locator(`${PANE} [data-artifact-trigger]`).click();
  const row = await on
    .locator('[data-artifact-list] [data-slot="menu-line"]')
    .textContent({ timeout: 5000 })
    .catch(() => null);
  await on.keyboard.press("Escape");
  return { ...head, line: row?.trim() ?? null, at: "menu" as const };
};

/** Checks ask 22 to ask 24: the head's line, its Sent line, a new round's ask. */
const headChecks = async ({
  kit,
  fleet,
  session,
  base,
  call,
}: Pick<OnSession, "base" | "call" | "fleet" | "kit" | "session">) => {
  const made = await call(CREATE, {
    kind: "page",
    name: "pairing-ask",
    does: "judge",
    ask: ASK,
    html: PAGE,
  });
  const id = made.match(ANSWERED_ID)?.[1];
  if (!id) {
    kit.check("ask 22: the page with its ask is made", false, made);
    return;
  }
  for (const view of ["desk", "phone"] as const) {
    for (const theme of ["light", "dark"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time, as a person opens them
      const shown = await kit.page(view, { theme });
      await open(
        shown,
        `${base}/session/${session}`,
        "[data-artifact-trigger]"
      );
      const seen = await until(
        "the head's line",
        () => lineOf(shown),
        (now) => now.line === ASK,
        15_000
      ).catch(() => lineOf(shown));
      kit.check(
        `ask 22: at ${view === "desk" ? 1440 : 390} (${theme}) the 44px head says the ask once (${seen.at}), and the title control's title is it`,
        seen.height === 44 &&
          seen.line === ASK &&
          seen.title === ASK &&
          (seen.at === "menu" || seen.inside),
        JSON.stringify(seen)
      );
      await shown.close();
    }
  }

  // ask 23. The person's Send, with a note: the head says where it went.
  const desk = await kit.page("desk", { theme: "light" });
  await open(desk, `${base}/session/${session}`, "[data-artifact-trigger]");
  const instance = (
    await fleet.api<{ id: string; title: string | null }[]>("/api/instances")
  ).find((one) => one.id === session);
  const sentAt = Date.now();
  const status = await desk.evaluate(
    ({ who, artifact }) =>
      fetch(`/api/instances/${who}/artifacts/${artifact}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "The denied state reads wrong" }),
      }).then((response) => response.status),
    { who: session, artifact: id }
  );
  const sent = await until(
    "the head's Sent line",
    () => lineOf(desk),
    (now) => now.line?.startsWith("Sent to ") === true,
    5000
  ).catch(() => lineOf(desk));
  const sentIn = Date.now() - sentAt;
  kit.check(
    "ask 23: within 5 s of the Send the head's line reads Sent to <the session's title>",
    status === 200 &&
      sent.line === `Sent to ${instance?.title ?? ""}` &&
      sentIn <= 5000,
    `send ${status} in ${sentIn} ms; ${JSON.stringify(sent)}; session title ${JSON.stringify(instance?.title)}`
  );

  // ask 24. A new round's ask: the head turns to it, the frame never loads again.
  await desk.evaluate(() => {
    const kept = window as unknown as { __loads: number };
    kept.__loads = 0;
    document
      .querySelector('iframe[title="Preview"]')
      ?.addEventListener("load", () => {
        kept.__loads += 1;
      });
  });
  const revised = await call(UPDATE, { id, ask: ASK_AGAIN });
  const again = await until(
    "the head's new ask",
    () => lineOf(desk),
    (now) => now.line === ASK_AGAIN,
    10_000
  ).catch(() => lineOf(desk));
  const loads = await desk.evaluate(
    () => (window as unknown as { __loads: number }).__loads
  );
  kit.check(
    "ask 24: artifact_update with a new ask turns the head's line to it, with no load on the frame",
    again.line === ASK_AGAIN && again.title === ASK_AGAIN && loads === 0,
    `${revised.slice(0, 200)}; ${JSON.stringify(again)}; loads ${loads}`
  );
  await desk.close();
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
  callIn,
  session,
}: {
  base: string;
  callIn: (on: string) => (tool: string, input: object) => Promise<string>;
  fleet: KitFleet;
  kit: Kit;
  /** Checks 1–14's session, in no project. */
  session: string;
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

  // 17. Outside a project the session is never listed the tool, so nothing is
  // written. Every request so far is this session's: the project's is spawned below.
  const listing = await fleet.api<{ tools: { name: string }[] }>(
    `/api/delegation/tools?instanceId=${session}`
  );
  const listed = listing.tools.map((tool) => tool.name);
  const offered = fleet.seen.filter((one) => one.toolNames.includes(PROMOTE));
  const strays = promotedAnywhere();
  kit.check(
    "17: outside a project artifact_promote is in neither the hub's listing nor any model request, artifact_create is, and nothing is promoted",
    !listed.includes("artifact_promote") &&
      listed.includes("artifact_create") &&
      offered.length === 0 &&
      strays.length === 0,
    `listed promote ${listed.includes("artifact_promote")}, create ${listed.includes("artifact_create")}; requests offering promote: ${offered.length}; promoted folders: ${strays.join(", ") || "none"}`
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
  const made = await callP(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "kept",
    html: PAGE,
  });
  const keptId = made.match(ANSWERED_ID)?.[1];
  if (!keptId) {
    kit.check("15: artifact_create answers the page's id", false, made);
    return;
  }
  // Its panel, as check 1 opens one: the page in its frame, a screen for the canvas.
  const page = await kit.page("desk");
  await open(page, `${base}/session/${inProject}`, "[data-artifact-trigger]");
  const at = `/api/instances/${inProject}/artifacts/${keptId}`;
  const frame = page.frameLocator('iframe[title="Preview"]');
  await until(
    "the page's bridge marking its options",
    () => frame.locator('[data-option="a"][aria-pressed]').count(),
    (count) => count === 1,
    60_000
  );
  // The panel slides in as the session opens: a click while it moves is
  // aimed where the button was and lands outside the frame (the frame heard
  // no pointerdown, with 85 runs going on the page). Clicked once it lands,
  // as check 2 is.
  await settle(page);
  await pressIn(frame, '[data-option="b"]');
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
  await page.click("[data-artifact-trigger]");
  const tag = await page
    .locator(
      `[data-artifact-row][data-artifact="${keptId}"] [data-slot="row-promoted"]`
    )
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
    does: "draw",
    ask: "Draw on this canvas",
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
/** What the panel's head says under the name, read from the DOM: whether the head stands, its line (null when none), and whether any text in the panel holds a stage route. */
const headLine = (page: Page) =>
  page.evaluate(() => {
    const head = document.querySelector(
      '[data-side-surface-class~="preview-pane"] [data-slot="side-head"]'
    );
    const panel = head?.closest('[data-slot="side-card"]');
    return {
      head: !!head,
      line: head?.querySelector('[data-slot="subtitle"]')?.textContent ?? null,
      route: !!panel?.textContent?.includes("/@cawco/"),
    };
  });

/** Leg 19's artifacts' asks: the line each one's head says under its name. */
const HEAD_ASKS = {
  page: "Judge this page: pin anything that reads wrong",
  preview: "Try this page and say whether it works",
  canvas: "Draw on this canvas",
};

/** {@link headLine} at the desk (1440) and at 390, the desk's size given back after. */
async function headLines(page: Page) {
  // Text is read, not motion: a beat for the layout after each size.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const phone = await headLine(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(600);
  return { desk: await headLine(page), phone };
}

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
  const lines: Record<string, Awaited<ReturnType<typeof headLines>>> = {
    page: await headLines(page),
  };

  const app = Bun.serve({
    port: 0,
    fetch: () =>
      new Response(
        '<!doctype html><html lang="en"><head><title>Own app</title></head><body><p id="own-app">Its own app.</p></body></html>',
        { headers: { "content-type": "text/html" } }
      ),
  });
  try {
    await call(CREATE, {
      kind: "preview",
      does: "try",
      ask: "Try this page and say whether it works",
      name: "own-app",
      port: app.port,
    });
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
    lines.preview = await headLines(page);
    await call(CREATE, {
      kind: "canvas",
      name: "head-sketch",
      does: "draw",
      ask: HEAD_ASKS.canvas,
      mermaid: "flowchart LR; A --> B",
    });
    await until(
      "the panel showing the canvas",
      () => page.locator('[data-slot="canvas-slot"]').count(),
      (count) => count === 1,
      30_000
    );
    lines.canvas = await headLines(page);
  } finally {
    await app.stop(true);
  }
  const reads = Object.values(lines).flatMap((one) => [one.desk, one.phone]);
  kit.check(
    "19: for the page, the live preview and a canvas, at 1440 and 390, the head stands with each one's ask as its line under the name and no route in the panel",
    Object.keys(lines).length === 3 &&
      Object.entries(lines).every(([kind, read]) =>
        [read.desk, read.phone].every(
          (one) =>
            one.head &&
            one.line === HEAD_ASKS[kind as keyof typeof HEAD_ASKS] &&
            !one.route
        )
      ) &&
      reads.length === 6,
    JSON.stringify(lines)
  );
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
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
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
  await pressIn(fieldFrame, 'input[name="size"][value="m"]');
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
  await pressIn(tabFrame, '[data-option="cool"]');
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
    does: "try",
    ask: "Try this page and say whether it works",
    name: "dead-port",
    port: deadPort,
  });
  const deadTook = took();
  const deadId = dead.match(ANSWERED_ID)?.[1];
  const failed = shownPosts.find((post) => post.artifact === deadId);
  const band = await page
    .locator(
      ':is([data-slot="preview-pane"], [data-side-surface-class~="preview-pane"]) [data-slot="down"][role=alert]'
    )
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
