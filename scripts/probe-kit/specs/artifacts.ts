/**
 * Artifacts, slice 1 (Projects spec §5.10): a page artifact on a scratch
 * fleet (real hub, agent and sessiond; real Claude Code against the mock
 * model, which calls the hub's MCP tools as each PROBE-CALL message says),
 * shown in the built dashboard at the desk (1440), read from the hub's
 * answers and the page's own attributes, never from pixels. In order:
 *
 * 1. `artifact_create` of a page holding one `data-cawco-choice` answers an
 *    id, and the panel's menu lists it.
 * 2. A click on an option in the page (inside the panel's frame) is in
 *    the hub's read of the artifact within 5 s.
 * 3. A reload of the dashboard shows the pick still marked
 *    (`data-cawco-picked`).
 * 4. `artifact_update` with a JSON Patch changes the state, and the page
 *    reads it back (the other option marked).
 * 5. The session hears the person's change as one message, after the 3 s
 *    quiet, and nothing for the agent's own patch.
 * 6. No cawco tool about previews or choices is among the session's tools
 *    (the ones the artifact tools replaced); the artifact tools are.
 *
 * Slice 2, on a page of fields (a text input `title`, a radio group `size`,
 * a select `tone`, and a `data-cawco-choice` `mood`):
 *
 * 7. Typing into `title` is in artifact_read within 2 s as its `value`;
 *    picking a radio and an option is there as `options`; the session hears
 *    them as picks.
 * 8. A dashboard reload shows all three from the doc on the page's
 *    DOMContentLoaded plus one frame.
 * 9. With `title` focused and holding typed text, artifact_update with new
 *    HTML morphs the page: the heading changes, focus, text and scroll stay,
 *    no `load` fires and no socket is opened again.
 * 10. The artifact's own tab (`/artifact/<id>`) shows the same state, and a
 *    pick made there is marked in the first page within 2 s.
 * 11. No JSON-RPC message crosses postMessage in any window during 7–10.
 */
import type { Frame, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec, settle } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const UPDATE = "mcp__cawco__artifact_update";
const COMMAND = /PROBE-CALL:(\d+)/g;
const CHANGED = "I changed my picks";
/** A cawco tool named for previews or choices: the tools the artifact tools replaced. */
const PREVIEW_TOOL = /mcp__cawco__\w*(?:preview|choices)\w*/g;
/** The id in artifact_create's answer, as the tool result carries it. */
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
/** The quiet the hub waits for before it tells the session (artifacts/service.ts). */
const QUIET_MS = 3000;

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
  if (location.pathname.startsWith("/preview/")) {
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

/** What each numbered message asks the session to call, and what it answered. */
const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask) || request.last.includes(CHANGED)) {
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
  const call = async (tool: string, input: object): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, { name: tool, input });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };
  const read = (artifact: string) =>
    fleet.api<Read>(`/api/instances/${session}/artifacts/${artifact}`);

  // 1. The page, made by the session through the MCP tool.
  const created = await call(CREATE, {
    kind: "page",
    name: "hero-pick",
    html: PAGE,
  });
  const id = created.match(ANSWERED_ID)?.[1];
  kit.check(
    "1: artifact_create answers the page's id, opened in the panel",
    !!id && created.includes('"opened":true'),
    created.slice(0, 300)
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
  await page.click(".artifact-trigger");
  await page.locator(`.artifact-row[data-artifact="${id}"]`).waitFor();
  // The menu rises from 0.92 as it opens: read its geometry once it has landed.
  await settle(page);
  const listed = await page
    .locator(`.artifact-row[data-artifact="${id}"]`)
    .count();
  kit.check("1: the panel's menu lists it", listed === 1, `${listed} rows`);
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

  // 5 (first half). The session hears it once, after the quiet.
  const delivered = (await until(
    "the session told of the change",
    () => fleet.seen.find((one) => one.last.includes(CHANGED)),
    Boolean,
    20_000
  )) as Seen;

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

  // 5. One message for the person's change, after the quiet; none for the patch.
  await Bun.sleep(QUIET_MS * 2);
  const told = fleet.seen.filter((one) => one.last.includes(CHANGED));
  const gap = delivered.at - clickedAt;
  kit.check(
    "5: the session hears one message, after the quiet",
    told.length === 1 && gap >= QUIET_MS,
    `${told.length} message(s), the first ${gap} ms after the click: ${delivered.last.slice(delivered.last.indexOf(CHANGED), delivered.last.indexOf(CHANGED) + 120)}`
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
  const fieldsHeard = (await until(
    "the session told of the fields",
    () =>
      fleet.seen.find(
        (one) =>
          one.last.includes('"fields"') && one.last.includes("- tone: bright")
      ),
    Boolean,
    20_000
  ).catch(() => null)) as Seen | null;
  const heardLines = fieldsHeard?.last.slice(
    fieldsHeard.last.indexOf(CHANGED),
    fieldsHeard.last.indexOf(CHANGED) + 200
  );
  kit.check(
    "7: the session hears the fields as picks, by key and value",
    !!heardLines?.includes('- title: value "Hello probe"') &&
      heardLines.includes("- size: m") &&
      heardLines.includes("- tone: bright"),
    heardLines ?? "no message naming the fields"
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
};

const spec: Spec = { name: "artifacts", run };
export default spec;
