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
 * 6. `show_preview` is not among the session's tools; the artifact tools are.
 */
import type { Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const UPDATE = "mcp__cawco__artifact_update";
const COMMAND = /PROBE-CALL:(\d+)/g;
const CHANGED = "I changed my picks";
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
  state: Record<string, { options: string[] }>;
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
  kit.check(
    "6: show_preview is not in the tool list; the artifact tools are",
    !(names("show_preview") || names("read_choices")) &&
      ["artifact_create", "artifact_update", "artifact_read", "artifact_show"]
        .map(names)
        .every(Boolean),
    `show_preview ${names("show_preview")}, read_choices ${names("read_choices")}, artifact_read ${names("artifact_read")}`
  );
};

const spec: Spec = { name: "artifacts", run };
export default spec;
