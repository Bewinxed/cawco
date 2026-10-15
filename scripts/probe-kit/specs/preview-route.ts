/**
 * A preview loads from the same place the person reached the dashboard
 * (core frames.ts `previewRoute`). On a scratch fleet (real hub, agent and
 * sessiond; Claude Code against the mock model, which calls
 * artifact_create) in host mode with the pattern
 * `http://p-{port}.localhost:<first port>`, one session shows a page, and the
 * built dashboard is opened by two addresses of the same server:
 *
 * 1. The hub listens on the session's own port beside host mode's listener:
 *    both answer the ping, and the session's port is not the range's first.
 * 2. Reached at `http://127.0.0.1:<dash>` (not under the pattern's domain):
 *    the pane's frame is `http://127.0.0.1:<session port>`, its page answers
 *    200, and the pane asks for no ticket and loads no entry.
 * 3. Reached at `http://dash.localhost:<dash>` (under `localhost`, the
 *    pattern's domain): the pane's frame is the host-mode origin the hub
 *    named, entered with a ticket (`/__cawco/enter?ticket=…`) that it asked
 *    the hub for, and its page answers 200.
 * 4. The lock still stands on that name: a browser with no pass gets 401
 *    and the locked page there.
 *
 *   bun scripts/probe-kit/run.ts preview-route
 */
import type { Frame, Page } from "playwright-core";
import {
  PREVIEW_ENTER_PATH,
  PREVIEW_PING_PATH,
} from "../../../packages/core/src/frames";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const FRAME = 'iframe[title="Preview"]';
const TITLE = "Routed probe page";
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${TITLE}</title></head><body><h1>${TITLE}</h1></body></html>`;

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

/** The pane's frame once its page's title is {@link TITLE}; null with what it last read. */
const paneFrame = async (
  page: Page
): Promise<{ frame: Frame | null; last: string }> => {
  let last = "no frame";
  const titleOf = (inner: Frame | null): Promise<string> =>
    inner ? inner.title().catch(() => "") : Promise.resolve("");
  const read = async () => {
    const handles = await page.locator(FRAME).elementHandles();
    for (const handle of handles.reverse()) {
      // biome-ignore lint/performance/noAwaitInLoops: the newest frame first, one at a time
      const inner = await handle.contentFrame();
      const said = await titleOf(inner);
      last = `${said || "an untitled frame"} at ${inner?.url() ?? "?"}`;
      if (said === TITLE) {
        return inner;
      }
    }
    return null;
  };
  const frame = await until(
    "the page's title in the pane",
    read,
    Boolean,
    60_000
  ).catch(() => null);
  return { frame, last };
};

/** The dashboard at `url`, and what its pane asked of the network on the way: every request, and each document's status. */
const openPane = async (kit: Kit, url: string) => {
  const page = await kit.page("desk");
  const requests: string[] = [];
  const documents = new Map<string, number>();
  page.on("request", (request) => {
    requests.push(`${request.method()} ${request.url()}`);
  });
  page.on("response", (response) => {
    if (response.request().resourceType() === "document") {
      documents.set(response.url(), response.status());
    }
  });
  await open(page, url, FRAME);
  const shown = await paneFrame(page);
  return { page, requests, documents, ...shown };
};

const probe = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Route", fleet.repo);

  const range = (await (
    await fetch(`${fleet.base}/api/preview-settings`)
  ).json()) as { ports: string };
  const first = Number(range.ports.split("–")[0]);
  const pattern = `http://p-{port}.localhost:${first}`;
  const put = await fetch(`${fleet.base}/api/preview-settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "host", pattern }),
  });
  if (!kit.check("host mode is kept", put.ok, await put.text())) {
    return;
  }

  asks.set("1", {
    name: CREATE,
    input: { kind: "page", name: "routed", html: PAGE },
  });
  await fleet.send(session, "PROBE-CALL:1");
  await until("the page made", () => answered.get("1"), Boolean, 180_000);
  const address = (await (
    await fetch(`${fleet.base}/api/instances/${session}/preview-address`, {
      method: "POST",
    })
  ).json()) as { host?: string; origin?: string; port?: number };
  const port = address.port ?? 0;
  const hostOrigin = `http://p-${port}.localhost:${first}`;
  const portOrigin = `http://127.0.0.1:${port}`;

  // 1. Both listeners.
  const ownPing = await fetch(`${portOrigin}${PREVIEW_PING_PATH}`)
    .then((answer) => answer.status)
    .catch((error: Error) => error.message);
  const hostPing = await fetch(`http://127.0.0.1:${first}${PREVIEW_PING_PATH}`)
    .then((answer) => answer.status)
    .catch((error: Error) => error.message);
  kit.check(
    "1: in host mode the hub answers the ping on the session's own port and on host mode's listener, and names both in the address",
    ownPing === 200 &&
      hostPing === 200 &&
      port > first &&
      address.origin === hostOrigin &&
      address.host === new URL(hostOrigin).host,
    `address ${JSON.stringify(address)}; ${portOrigin} ${ownPing}; :${first} ${hostPing}`
  );

  const base = await fleet.dashboard();
  const where = `${base}/session/${session}`;
  const tickets = (requests: string[]) =>
    requests.filter((one) => one.includes("/preview-ticket"));
  const entries = (requests: string[]) =>
    requests.filter((one) => one.includes(PREVIEW_ENTER_PATH));

  // 2. Off the pattern's domain: the session's port, no ticket.
  const byIp = await openPane(kit, where);
  kit.check(
    "2: a dashboard reached at 127.0.0.1 loads the preview from 127.0.0.1 on the session's port (200), with no ticket and no entry",
    !!byIp.frame &&
      new URL(byIp.frame.url()).origin === portOrigin &&
      byIp.documents.get(`${portOrigin}/`) === 200 &&
      tickets(byIp.requests).length === 0 &&
      entries(byIp.requests).length === 0,
    `${byIp.last}; documents ${JSON.stringify([...byIp.documents])}; tickets ${tickets(byIp.requests).length}; entries ${entries(byIp.requests).length}`
  );
  await byIp.page.context().close();

  // 3. Under the pattern's domain: host mode's name, entered with a ticket.
  const byName = await openPane(
    kit,
    where.replace("//127.0.0.1:", "//dash.localhost:")
  );
  const entered = entries(byName.requests);
  kit.check(
    "3: a dashboard reached at dash.localhost loads the preview from host mode's origin, entered with a ticket it asked the hub for, and the page answers 200",
    !!byName.frame &&
      new URL(byName.frame.url()).origin === hostOrigin &&
      tickets(byName.requests).some((one) => one.startsWith("POST ")) &&
      entered.some((one) =>
        one.startsWith(`GET ${hostOrigin}${PREVIEW_ENTER_PATH}?ticket=`)
      ) &&
      byName.documents.get(`${hostOrigin}/`) === 200,
    `${byName.last}; entries ${entered.map((one) => one.slice(0, 90)).join(", ") || "none"}; documents ${JSON.stringify([...byName.documents])}`
  );
  await byName.page.context().close();

  // 4. The lock on the name, for a browser with no pass.
  const stranger = await kit.page("desk");
  const locked = await stranger.goto(`${hostOrigin}/`, {
    waitUntil: "domcontentloaded",
  });
  const lockedBody = (await locked?.text().catch(() => "")) ?? "";
  await stranger.context().close();
  kit.check(
    "4: without the hub's pass host mode's name answers 401 and the locked page",
    locked?.status() === 401 && lockedBody.includes("cawco-preview-locked"),
    `${locked?.status()} ${lockedBody.slice(0, 120)}`
  );
};

const spec: Spec = { name: "preview-route", run: probe };
export default spec;
