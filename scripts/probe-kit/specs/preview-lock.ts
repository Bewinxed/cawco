/**
 * Every preview origin is behind the lock, in both modes and across a live
 * switch between them (hub preview-access.ts; preview.ts `atTheLock`,
 * `stopAll`, `startHostMode`): no request without a pass reaches a preview by
 * its own port or by a host-mode name, and the person's pass reaches it by
 * either. An artifact's own tab follows its preview to the origin the switch
 * moved it to, with no reload (server.ts `republish`, `tabTarget`).
 *
 * The runs it answers: the stage 2 proof on fba9b39c6, where a preview opened
 * in port mode on the range's first port kept its listener there as Settings
 * switched to host mode and served host mode's names past the lock; and an
 * origin's own port, which took no pass in either mode, so anyone who reached
 * the hub's machine read every preview by its port.
 *
 * On a scratch fleet (real hub, agent and sessiond), one session shows a
 * server of the agent's machine by its port, an HTML page, in port mode;
 * then the mode is switched to host as Settings › Previews switches it (PUT
 * /api/preview-settings, which checks one of the names resolves: localtest.me
 * names, so this needs a machine whose DNS answers; a workspace's has none).
 * Each request below is a connection of its own, so a second socket on a port
 * is met:
 *
 * 0. port mode: the preview's own origin holds the range's first port; 16
 *    requests without a pass to it, and 16 to its session's port, answer the
 *    lock's 401 page; with the person's pass, from a ticket spent at its
 *    port, it answers the server's page.
 * 1. the artifact's own tab in the dashboard draws the server's page from
 *    that port (the dashboard entering before the frame loads).
 * 2. host mode, switched live: the preview's own origin is on another port,
 *    named by it; the tab, never reloaded, draws the page from the new port.
 * 3. 16 requests without a pass each to the preview's name, its session's
 *    name, the lock's port by its own address, the preview's own port and
 *    its session's own port all answer the lock's 401 page.
 * 4. the person's pass reaches the server by the preview's name and by its
 *    own port.
 *
 *   bun scripts/probe-kit/run.ts preview-lock
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one connection after another, each its own
import {
  type PreviewTicket,
  previewEnterUrl,
} from "../../../packages/core/src/frames";
import { type Reply, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";
import { PASS_DOMAIN } from "../pass-legs";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** The lock's own mark on its 401 page (preview-access.ts `lockedResponse`). */
const LOCKED = "cawco-preview-locked";
const TRIES = 16;
const SERVED = "served by the probe";
/** The artifact panel's frame (PreviewPane), in an artifact's own tab. */
const FRAME = 'iframe[title="Preview"]';

/** One request on a connection of its own: its status, body and the pass it set. */
const ask = async (
  url: string,
  headers: Record<string, string> = {}
): Promise<{ body: string; status: number; cookie: string | null }> => {
  const answer = await fetch(url, {
    headers: { connection: "close", ...headers },
    keepalive: false,
    redirect: "manual",
  });
  return {
    status: answer.status,
    body: await answer.text(),
    cookie: answer.headers.get("set-cookie")?.split(";")[0] ?? null,
  };
};

/** Every one of {@link TRIES} requests to `url` with `headers` and no pass: each that wasn't the locked page, said. */
const unlocked = async (
  what: string,
  url: string,
  headers: Record<string, string> = {}
): Promise<string[]> => {
  const opened: string[] = [];
  for (let i = 0; i < TRIES; i += 1) {
    const answer = await ask(url, headers);
    if (!(answer.status === 401 && answer.body.includes(LOCKED))) {
      opened.push(
        `${what} #${i + 1}: ${answer.status} ${answer.body.slice(0, 80)}`
      );
    }
  }
  return opened;
};

const run = async (kit: Kit) => {
  // The machine's server the preview shows: a page of its own.
  const served = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>lock</title></head><body><h1 id="word">${SERVED}</h1></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } }
      ),
  });
  try {
    await probe(kit, served.port as number);
  } finally {
    served.stop(true);
  }
};

const probe = async (kit: Kit, servedPort: number) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const base = await fleet.dashboard();
  const session = await fleet.spawn("claude", "Preview lock", fleet.repo);

  const range = await fleet.api<{ ports: string }>("/api/preview-settings");
  const first = Number(range.ports.split("–")[0]);
  const preview = await fleet.api<{ id: string }>(
    `/api/instances/${session}/artifacts`,
    {
      kind: "preview",
      does: "try",
      ask: "Try the served page",
      name: "lock-served",
      port: servedPort,
    }
  );
  const address = (path: string) =>
    fleet.api<{ origin?: string; port: number }>(path, {});
  const previewAt = () =>
    address(`/api/artifacts/${preview.id}/preview-address`);
  const sessionAt = () => address(`/api/instances/${session}/preview-address`);
  /** A pass from a ticket spent at `origin` (`name=value`), and the entry's status. */
  const entered = async (origin: string, named?: string) => {
    const { ticket } = await fleet.api<PreviewTicket>(
      "/api/preview-ticket",
      {}
    );
    const entry = await ask(
      previewEnterUrl(origin, ticket, "/"),
      named ? { host: named } : {}
    );
    return { status: entry.status, cookie: entry.cookie ?? "" };
  };

  // 0. Port mode: every origin's own port behind the lock.
  const before = await previewAt();
  const sessionPort = (await sessionAt()).port;
  const portOrigin = `http://127.0.0.1:${before.port}`;
  const passlessByPort = [
    ...(await unlocked("the preview's port", `${portOrigin}/`)),
    ...(await unlocked(
      "its session's port",
      `http://127.0.0.1:${sessionPort}/`
    )),
  ];
  const portPass = await entered(portOrigin);
  const passedByPort = await ask(`${portOrigin}/`, {
    cookie: portPass.cookie,
  });
  kit.check(
    `0: port mode: the preview's own origin holds the range's first port (${first}); ${TRIES} requests without a pass each to it and to its session's port (${sessionPort}) answer the lock's 401 page; the person's pass, from a ticket spent at its port, opens it`,
    before.port === first &&
      passlessByPort.length === 0 &&
      portPass.status === 302 &&
      portPass.cookie.startsWith("cawco-preview-pass=") &&
      passedByPort.status === 200 &&
      passedByPort.body.includes(SERVED),
    `port ${before.port}; ${passlessByPort.join("; ") || `${TRIES * 2} locked`}; entry ${portPass.status} ${portPass.cookie.split("=")[0]}; passed ${passedByPort.status} ${passedByPort.body.slice(0, 80)}`
  );

  // 1. The artifact's own tab draws it from its port.
  const tab = await kit.page("desk");
  await open(tab, `${base}/artifact/${preview.id}`, FRAME);
  /** What the tab's frame shows now: its origin and the page's word. */
  const tabReads = async () => {
    const src = await tab
      .locator(FRAME)
      .first()
      .getAttribute("src", { timeout: 1000 })
      .catch(() => null);
    const word = await tab
      .frameLocator(FRAME)
      .first()
      .locator("#word")
      .textContent({ timeout: 1000 })
      .catch(() => null);
    return { origin: src ? new URL(src).origin : null, word };
  };
  const drawn = await until(
    "the tab's page",
    tabReads,
    (now) => now.word === SERVED && now.origin === portOrigin,
    60_000
  ).catch(() => tabReads());
  kit.check(
    "1: the artifact's own tab draws the server's page from the preview's port, entered past the lock",
    drawn.word === SERVED && drawn.origin === portOrigin,
    JSON.stringify(drawn)
  );

  // 2. Host mode, switched to live as Settings › Previews does.
  await tab.evaluate(() => {
    (window as unknown as { __stayed: boolean }).__stayed = true;
  });
  const put = await fetch(`${fleet.base}/api/preview-settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "host",
      pattern: `https://p-{port}.${PASS_DOMAIN}:${first}`,
    }),
  });
  if (
    !kit.check(
      "host mode is taken live, as Settings › Previews saves it (its names must resolve here)",
      put.ok,
      `${put.status} ${await put.text()}`
    )
  ) {
    return;
  }
  const after = await previewAt();
  const host = after.origin ? new URL(after.origin).host : "";
  const movedOrigin = `http://127.0.0.1:${after.port}`;
  const followed = await until(
    "the tab at the new origin",
    tabReads,
    (now) => now.word === SERVED && now.origin === movedOrigin,
    60_000
  ).catch(() => tabReads());
  const stayed = await tab.evaluate(
    () => (window as unknown as { __stayed?: boolean }).__stayed === true
  );
  kit.check(
    `2: in host mode the preview's own origin is off host mode's port ${first}, named by its own; the tab, never reloaded, draws the page from it`,
    after.port !== first &&
      host === `p-${after.port}.${PASS_DOMAIN}:${first}` &&
      followed.word === SERVED &&
      followed.origin === movedOrigin &&
      stayed,
    JSON.stringify({ after, followed, stayed })
  );

  // 3. No pass, no way in: by every name and every port.
  const sessionNow = await sessionAt();
  const sessionHost = sessionNow.origin ? new URL(sessionNow.origin).host : "";
  const byHost = `http://127.0.0.1:${first}/`;
  const opened = [
    ...(await unlocked("the preview's name", byHost, { host })),
    ...(await unlocked("its session's name", byHost, { host: sessionHost })),
    ...(await unlocked("the lock's port by its own address", byHost)),
    ...(await unlocked("the preview's own port", `${movedOrigin}/`)),
    ...(await unlocked(
      "its session's own port",
      `http://127.0.0.1:${sessionNow.port}/`
    )),
  ];
  kit.check(
    `3: ${TRIES} requests without a pass each to the preview's name (${host}), its session's (${sessionHost}), the lock's port by its own address, the preview's own port (${after.port}) and its session's (${sessionNow.port}) all answer the lock's 401 page`,
    opened.length === 0 && !!host && !!sessionHost,
    opened.length === 0 ? `${TRIES * 5} locked` : opened.join("; ")
  );

  // 4. The person's pass reaches it by its name and by its own port.
  const namePass = await entered(byHost.slice(0, -1), host);
  const byName = await ask(byHost, { host, cookie: namePass.cookie });
  const ownPass = await entered(movedOrigin);
  const byOwnPort = await ask(`${movedOrigin}/`, { cookie: ownPass.cookie });
  kit.check(
    "4: with the person's pass, from a ticket spent there, the preview's name and its own port each answer the server's page",
    namePass.status === 302 &&
      byName.status === 200 &&
      byName.body.includes(SERVED) &&
      ownPass.status === 302 &&
      byOwnPort.status === 200 &&
      byOwnPort.body.includes(SERVED),
    `name: entered ${namePass.status}, ${byName.status} ${byName.body.slice(0, 60)}; own port: entered ${ownPass.status}, ${byOwnPort.status} ${byOwnPort.body.slice(0, 60)}`
  );
};

const spec: Spec = { name: "preview-lock", run };
export default spec;
