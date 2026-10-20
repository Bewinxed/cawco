/**
 * A project's decision page is served on its project's own preview origin
 * (Projects spec §5.8), on a scratch fleet: a real hub, agent and sessiond,
 * two Claude Code sessions of one project against the mock model, the built
 * dashboard. Read from the engine: each frame's document, or its load error.
 *
 *   bun scripts/probe-kit/run.ts project-origin
 *
 * In port mode (each origin on its own port) and in host mode (a
 * `p-{port}.localhost` pattern, every name on the range's first port, as an
 * outpost's proxy reaches the hub):
 * (a) The page opened in its writer's panel (as Files opens it) draws its
 *     cards, and its option's Preview embed of a dev server draws inside it:
 *     the embed's frame-ancestors name the exact origin the page was served
 *     on.
 * (b) Its writing session deleted, the page opens in the project's
 *     Decisions tab, draws its cards and its embed, and takes a new pick,
 *     kept on the hub.
 *
 * Host-only (not run here): the same on the outpost route (cloudflared in
 * front of the host-mode port, https names) and the tailnet route (the hub's
 * HTTPS twins on its tailnet name).
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one step at a time, as a person takes them
import type { Frame, Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

const SITE = "The live site";

const pageProgram = (
  site: string
) => `root = Decisions("Pair the code", [leave])
leave = Decision("leave", "When you approve, how does the code leave?", [swallow, fly], "Both drawn live.")
swallow = Option("swallow", "Caw swallows the code", "It goes in one gulp.", true, [desk], "Less to watch.")
fly = Option("fly", "The code flies up to Caw", "It travels up the page.", false, [], "More motion to follow.")
desk = Preview("${site}", "Desk · Caw swallows the code")`;

/** What the page and its embed drew: the card, the embed's heading or the address it failed on, and the words of a piece whose artifact is gone. */
interface Drawn {
  card: boolean;
  embed: string;
  gone: string;
}

/** The frame in `tab` that draws the decision page. */
const pageFrame = async (tab: Page): Promise<Frame | undefined> =>
  (
    await Promise.all(
      tab
        .frames()
        .map(
          async (frame) =>
            [
              frame,
              await frame
                .evaluate(() => !!document.getElementById("decision-leave"))
                .catch(() => false),
            ] as const
        )
    )
  ).find(([, card]) => card)?.[0];

/** The decision page's frame in `tab`, and its embed's document. */
const drawnIn = async (tab: Page): Promise<Drawn> => {
  const page = await pageFrame(tab);
  if (!page) {
    return { card: false, embed: "", gone: "" };
  }
  const gone = await page
    .evaluate(() => document.querySelector(".gone")?.textContent?.trim() ?? "")
    .catch(() => "");
  const embeds = page.childFrames();
  const said = await Promise.all(
    embeds.map(async (frame) => {
      const heading = await frame
        .evaluate(() => document.querySelector("h1")?.textContent ?? "")
        .catch(() => "");
      return heading || `no heading at ${frame.url()}`;
    })
  );
  return {
    card: true,
    embed: said.find((one) => one === SITE) ?? said.join(" | "),
    gone,
  };
};

/**
 * The embed's frame loaded again from inside (as a dev server's client
 * reloads on reconnecting), then read once it settled: the address it ends
 * on is one its ancestors may frame.
 */
const reloadedIn = async (tab: Page): Promise<Drawn> => {
  for (const frame of (await pageFrame(tab))?.childFrames() ?? []) {
    await frame.evaluate(() => location.reload()).catch(() => undefined);
  }
  await tab.waitForTimeout(3000);
  return drawnIn(tab);
};

/** Reads `tab` until the page and its embed drew, or what it had at the end. */
const drawnBy = (tab: Page, label: string): Promise<Drawn> =>
  until(
    label,
    () => drawnIn(tab),
    (drawn) => drawn.card && drawn.embed === SITE,
    30_000
  ).catch(() => drawnIn(tab));

/** The person's press on `option` in the page: Change first, when a pick on the other route folded the card. */
const pickIn = async (tab: Page, option: string): Promise<string> => {
  const frame = await pageFrame(tab);
  if (!frame) {
    return "no page frame";
  }
  const change = frame.locator("#decision-leave .dp-change", {
    hasText: "Change",
  });
  if ((await change.count()) > 0) {
    await change
      .first()
      .click({ timeout: 10_000 })
      .catch(() => undefined);
  }
  return await frame
    .locator(`[data-option="${option}"]`)
    .first()
    .click({ timeout: 10_000 })
    .then(
      () => `pressed at ${frame.url()}`,
      (error: unknown) => String(error).split("\n")[0] ?? ""
    );
};

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
  const dir = `${fleet.sandbox}/pairing-site`;
  await Bun.$`mkdir -p ${dir} && git init -q -b main ${dir}`.quiet();
  const { id: projectId } = await fleet.api<{ id: string }>("/api/projects", {
    name: "Pairing",
    machineId: MACHINE,
    cwd: dir,
    caw: false,
  });
  const writer = await fleet.spawn("claude", "Pair the code", dir, {
    projectId,
  });
  const later = await fleet.spawn("claude", "Ship the pairing", dir, {
    projectId,
  });
  const at = (session: string) => `/api/instances/${session}/artifacts`;
  // A dev server on the machine's host, shown as a preview of its port.
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        `<!doctype html><html><body><h1>${SITE}</h1></body></html>`,
        {
          headers: { "content-type": "text/html" },
        }
      ),
  });
  const site = await fleet.api<{ id: string }>(at(writer), {
    kind: "preview",
    does: "try",
    ask: "Try this page and say whether it works",
    name: "pairing-site",
    port: server.port,
    machine: MACHINE,
  });
  const page = await fleet.api<{ id: string }>(at(writer), {
    kind: "page",
    does: "pick",
    ask: "Pick how the code leaves",
    name: "pairing-behaviour",
    program: pageProgram(site.id),
  });
  const base = await fleet.dashboard();
  const range = await fleet.api<{ ports: string }>("/api/preview-settings");
  const first = Number(range.ports.split("–")[0]);

  for (const mode of ["port", "host"] as const) {
    const put = await fetch(`${fleet.base}/api/preview-settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        mode === "host"
          ? { mode, pattern: `http://p-{port}.localhost:${first}` }
          : { mode }
      ),
    });
    // Host mode's names are loaded by a dashboard reached under their domain.
    const board =
      mode === "host" ? base.replace("127.0.0.1", "localhost") : base;
    const tab = await kit.page("desk", { theme: "light" });
    await open(tab, `${board}/session/${writer}`, '[data-slot="pane"]');
    // Brought to the front of the writer's panel, as Files opens it.
    await (
      await fetch(`${fleet.base}${at(writer)}/${page.id}/show`, {
        method: "POST",
      })
    ).text();
    const panel = await drawnBy(
      tab,
      `${mode}: the page and its embed in the panel`
    );
    const again = await reloadedIn(tab);
    kit.check(
      `(a) ${mode}: the page opened in its writer's panel draws its card, and its Preview embed draws inside it, again after it reloads itself`,
      put.ok && panel.card && panel.embed === SITE && again.embed === SITE,
      JSON.stringify({ put: put.status, ...panel, reloaded: again.embed })
    );
    await tab.close();
  }

  // The person stops the writing session, then deletes it.
  await fleet.post({
    verb: "stop",
    machineId: MACHINE,
    instanceId: writer,
    requestId: crypto.randomUUID(),
    payload: { instanceId: writer },
  });
  await until(
    "the writing session stopped",
    () =>
      fleet.query<{ status: string }>(
        "SELECT status FROM instances WHERE id = ?",
        writer
      )[0],
    (row) => row.status === "stopped",
    60_000
  ).catch(() => undefined);
  let deleteSaid = "";
  await until(
    "the stopped writing session deleted",
    async () => {
      const deleted = await fetch(`${fleet.base}/api/instances/${writer}`, {
        method: "DELETE",
      });
      deleteSaid = `${deleted.status} ${await deleted.text()}`;
      return deleted.ok;
    },
    Boolean,
    60_000
  ).catch(() => undefined);

  for (const mode of ["port", "host"] as const) {
    await fetch(`${fleet.base}/api/preview-settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        mode === "host"
          ? { mode, pattern: `http://p-{port}.localhost:${first}` }
          : { mode }
      ),
    });
    const board =
      mode === "host" ? base.replace("127.0.0.1", "localhost") : base;
    const tab = await kit.page("desk", { theme: "light" });
    await open(
      tab,
      `${board}/project/${projectId}?view=decisions&page=pairing-behaviour`,
      '[data-slot="decisions"]'
    );
    const tabbed = await until(
      `${mode}: the page in the Decisions tab`,
      () => drawnIn(tab),
      (drawn) => drawn.card && drawn.gone !== "",
      30_000
    ).catch(() => drawnIn(tab));
    const option = mode === "port" ? "fly" : "swallow";
    const pressed = await pickIn(tab, option);
    const picked = await until(
      `${mode}: the pick on the hub`,
      () =>
        fleet.api<{ state: Record<string, { options?: string[] }> }>(
          `${at(later)}/${page.id}`
        ),
      (read) => (read.state.leave?.options ?? []).includes(option),
      15_000
    ).catch(() => undefined);
    kit.check(
      `(b) ${mode}: its writer deleted, the page opens in the Decisions tab, draws its card (the writer's own preview it showed is gone, said so) and takes a new pick`,
      deleteSaid.startsWith("200") &&
        tabbed.card &&
        tabbed.gone === "What this card showed is gone." &&
        JSON.stringify(picked?.state.leave?.options) ===
          JSON.stringify([option]),
      JSON.stringify({
        deleted: deleteSaid,
        ...tabbed,
        pressed,
        pick: picked?.state.leave ?? null,
      })
    );
    await tab.close();
  }
  server.stop(true);
};

const spec: Spec = { name: "project-origin", run };
export default spec;
