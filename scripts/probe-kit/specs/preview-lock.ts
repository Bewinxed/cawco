/**
 * Host mode's lock holds for a machine's preview across a live switch of the
 * mode (hub preview.ts `stopAll`, `startHostMode`, `atTheLock`): no request
 * without a pass reaches a preview by any name, nor on the lock's port by
 * any Host. The stage 2 proof's run on fba9b39c6: a dev server's preview,
 * opened in port mode on the range's first port (its artifact's own origin,
 * f536f2675), kept its listener there as Settings switched to host mode, and
 * host mode's listener bound beside it (`reusePort`), so the kernel handed
 * that listener a share of the names' requests and it served them with no
 * lock: `-H 'Host: p-3458.localtest.me:3457' … served … HTTP 200`.
 *
 * On a scratch fleet (real hub, agent and sessiond), one session shows a
 * server of the agent's machine by its port, in port mode, then the mode is
 * switched to host as Settings › Previews switches it (PUT
 * /api/preview-settings, which checks one of the names resolves: localtest.me
 * names, so this needs a machine whose DNS answers; a workspace's has none).
 * Each request below is a connection of its own, so a second socket on the
 * lock's port is met:
 *
 * 0. in port mode the preview's own origin holds the range's first port and
 *    answers by it (port mode has no lock), the case the run failed on.
 * 1. in host mode the preview's own origin is on another port, and its name
 *    is that port's.
 * 2. 16 requests without a pass to the preview's name, 16 to its session's
 *    name, and 16 to the lock's port by its own address (no name) all answer
 *    the lock's 401 page.
 * 3. the person's pass, from a ticket spent at the preview's name, reaches
 *    the server through the same name.
 *
 *   bun scripts/probe-kit/run.ts preview-lock
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one connection after another, each its own
import {
  type PreviewTicket,
  previewEnterUrl,
} from "../../../packages/core/src/frames";
import type { Reply } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";
import { PASS_DOMAIN } from "../pass-legs";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** The lock's own mark on its 401 page (preview-access.ts `lockedResponse`). */
const LOCKED = "cawco-preview-locked";
const TRIES = 16;
const SERVED = "served by the probe";

/** One request on a connection of its own: its status and body. */
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
    cookie: answer.headers.get("set-cookie"),
  };
};

const run = async (kit: Kit) => {
  // The machine's server the preview shows.
  const served = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(SERVED),
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

  // 0. Port mode: the preview's own origin on the range's first port.
  const before = await previewAt();
  const direct = await ask(`http://127.0.0.1:${before.port}/`);
  kit.check(
    `0: in port mode the preview's own origin holds the range's first port (${first}) and answers by it`,
    before.port === first &&
      direct.status === 200 &&
      direct.body.includes(SERVED),
    `port ${before.port}; ${direct.status} ${direct.body.slice(0, 80)}`
  );

  // Host mode, switched to live as Settings › Previews does.
  const put = await fetch(`${fleet.base}/api/preview-settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "host",
      pattern: `https://p-{port}.${PASS_DOMAIN}:${first}`,
    }),
  });
  const switched = put.ok;
  kit.check(
    "host mode is taken live, as Settings › Previews saves it (its names must resolve here)",
    switched,
    `${put.status} ${await put.text()}`
  );
  if (!switched) {
    return;
  }

  // 1. The preview's origin moved off the lock's port.
  const after = await previewAt();
  const host = after.origin ? new URL(after.origin).host : "";
  kit.check(
    `1: in host mode the preview's own origin is off host mode's port ${first}, named by its own`,
    after.port !== first && host === `p-${after.port}.${PASS_DOMAIN}:${first}`,
    JSON.stringify(after)
  );

  // 2. No pass, no way in: by the preview's name, its session's, and the lock's port with no name.
  const sessionAt = await address(`/api/instances/${session}/preview-address`);
  const sessionHost = sessionAt.origin ? new URL(sessionAt.origin).host : "";
  const byHost = `http://127.0.0.1:${first}/`;
  const askers: [string, Record<string, string>][] = [
    ["the preview's name", { host }],
    ["its session's name", { host: sessionHost }],
    ["the lock's port by its own address", {}],
  ];
  const opened: string[] = [];
  for (const [what, headers] of askers) {
    for (let i = 0; i < TRIES; i += 1) {
      const answer = await ask(byHost, headers);
      if (!(answer.status === 401 && answer.body.includes(LOCKED))) {
        opened.push(
          `${what} #${i + 1}: ${answer.status} ${answer.body.slice(0, 80)}`
        );
      }
    }
  }
  kit.check(
    `2: ${TRIES} requests without a pass each to the preview's name (${host}), its session's (${sessionHost}) and the lock's port by its own address all answer the lock's 401 page`,
    opened.length === 0 && !!host && !!sessionHost,
    opened.length === 0 ? `${TRIES * askers.length} locked` : opened.join("; ")
  );

  // 3. The person's pass reaches it through the same name.
  const { ticket } = await fleet.api<PreviewTicket>("/api/preview-ticket", {});
  const entered = await ask(previewEnterUrl(byHost.slice(0, -1), ticket, "/"), {
    host,
  });
  const cookie = entered.cookie?.split(";")[0] ?? "";
  const passed = await ask(byHost, { host, cookie });
  kit.check(
    "3: with the person's pass from a ticket spent at the preview's name, the name answers the server's page",
    entered.status === 302 &&
      passed.status === 200 &&
      passed.body.includes(SERVED),
    `entered ${entered.status}; ${passed.status} ${passed.body.slice(0, 80)}`
  );
};

const spec: Spec = { name: "preview-lock", run };
export default spec;
