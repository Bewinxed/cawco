/**
 * A project's decision page is served on its project's own preview origin
 * (Projects spec §5.8), on a scratch fleet: a real hub, agent and sessiond,
 * two Claude Code sessions of one project against the mock model, the built
 * dashboard. Read from the engine: each frame's document, or its load error,
 * and every request and answer of the browser's context.
 *
 *   bun scripts/probe-kit/run.ts project-origin
 *
 * Its project's id is of the older shape (capitals and `_`), which a
 * `{session}` name holds only as a label of its own. The page's two options
 * each show a Preview embed of a dev server of the writer's.
 *
 * In port mode (each origin on its own port) and in host mode, by a
 * `https://p-{port}.localtest.me` pattern and by a
 * `https://p-{session}.localtest.me` one: every name on the range's first
 * port behind a Cloudflare-like front answering https, the dashboard behind
 * one of its own at `https://localtest.me:<port>`, under the names' domain,
 * as the owner's tunnel serves both ("The entire domain name localtest.me—and
 * all wildcard entries—point to 127.0.0.1",
 * weblogs.asp.net/owscott/introducing-testing-domain-localtest-me). Each
 * tab is a browser of its own, holding no pass when it opens.
 * (a) The page opened in its writer's panel (as Files opens it) draws its
 *     cards, and both Preview embeds draw inside it, again after they reload
 *     themselves: each embed's frame-ancestors name the exact origin the
 *     page was served on.
 * (b) Its writing session deleted, the page opens in the project's
 *     Decisions tab, draws its cards and its embed, and takes a new pick,
 *     kept on the hub.
 *
 * The owner's 401s (2026-10-20: "Failed to load resource: the server
 * responded with a status of 401", seven times on one decision page), in
 * each host mode, on that tab:
 * (c) Both embeds remounted three times (the page sets each frame's address
 *     again, as a Preview mounting anew does) draw each time; no embed's
 *     answer is ever 401, nor the page's own first load (the dashboard
 *     enters before it), and exactly one `/__cawco/enter` is asked in all,
 *     none per remount: nothing is locked or entered once the remounts begin.
 *     No ticket stands in the page's media or any
 *     embed's address, and neither dev server is ever sent the pass.
 * (d) The pass revoked (`DELETE /api/preview-pass`, the person's sign-out of
 *     previews), every frame's next load answers 401 with the locked page:
 *     each embed remounted, and the page reloaded, which the pane answers
 *     with one new entry, the page and both embeds drawn again.
 *
 * The names are localtest.me's (pass-legs.ts): a frame carries the pass
 * only under a domain the Public Suffix List knows. Each mode is stored as
 * Settings › Previews keeps it and the hub started on it (pass-legs
 * `storeHostMode`), and the browser is told the names, so it runs where no
 * DNS answers too. Not run here: the outpost route (cloudflared itself in
 * front of the host-mode port) and the tailnet route (the hub's HTTPS twins
 * on its tailnet name).
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the legs are read in order, one after another.
import type { Frame, Page } from "playwright-core";
import { PREVIEW_PASS_COOKIE } from "../../../packages/core/src/frames";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";
import {
  hear,
  PASS_DOMAIN,
  PASS_HOSTS,
  passHeld,
  passPattern,
  passTunnel,
  remount,
  storeHostMode,
} from "../pass-legs";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

const SITE = "The live site";
const OTHER = "The other site";
/** Both embeds' headings, as {@link Drawn} sorts them. */
const BOTH = [OTHER, SITE].toSorted().join(" | ");

const pageProgram = (
  site: string,
  other: string
) => `root = Decisions("Pair the code", [leave])
leave = Decision("leave", "When you approve, how does the code leave?", [swallow, fly], "Both drawn live.")
swallow = Option("swallow", "Caw swallows the code", "It goes in one gulp.", true, [desk], "Less to watch.")
fly = Option("fly", "The code flies up to Caw", "It travels up the page.", false, [phone], "More motion to follow.")
desk = Preview("${site}", "Desk · Caw swallows the code")
phone = Preview("${other}", "Phone · The code flies up to Caw")`;

/** What the page and its embeds drew: the card, the live site's heading or every address one failed on, both headings, and the words of a piece whose artifact is gone. */
interface Drawn {
  card: boolean;
  embed: string;
  embeds: string;
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
    return { card: false, embed: "", embeds: "", gone: "" };
  }
  const gone = await page
    .evaluate(
      () =>
        document.querySelector("[data-slot=media-gone]")?.textContent?.trim() ??
        ""
    )
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
    embeds: said.toSorted().join(" | "),
    gone,
  };
};

/** Whether every embed of the page stands on the locked page now, and how many embeds it has. */
const lockedIn = async (
  page: Frame
): Promise<{ embeds: number; locked: number }> => {
  const frames = page.childFrames();
  const locked = await Promise.all(
    frames.map((frame) =>
      frame
        .evaluate(
          () => !!document.querySelector('meta[name="cawco-preview-locked"]')
        )
        .catch(() => false)
    )
  );
  return { embeds: frames.length, locked: locked.filter(Boolean).length };
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

/** Reads `tab` until the page and both its embeds drew, or what it had at the end. */
const drawnBy = (tab: Page, label: string): Promise<Drawn> =>
  until(
    label,
    () => drawnIn(tab),
    (drawn) => drawn.card && drawn.embeds === BOTH,
    30_000
  ).catch(() => drawnIn(tab));

/** The person's press on `option` in the page. */
const pickIn = async (tab: Page, option: string): Promise<string> => {
  const frame = await pageFrame(tab);
  if (!frame) {
    return "no page frame";
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

/**
 * How previews are reached in each leg: by port, or by name in host mode,
 * each origin's name holding its port (`{port}`) or its own label
 * (`{session}`: a session's id, `project-<id>`, `embed-<id>`), every name on
 * the range's first port.
 */
const MODES = ["port", "host", "session"] as const;

/** `front`: the port of the https front in front of the range's first port. */
const settingsOf = (mode: (typeof MODES)[number], front: number) =>
  mode === "port"
    ? { mode }
    : passPattern(mode === "host" ? "{port}" : "{session}", front);

/** The hosts of the page's embeds as they stand now. */
const embedHosts = async (tab: Page): Promise<Set<string>> =>
  new Set(
    ((await pageFrame(tab))?.childFrames() ?? []).map(
      (frame) => new URL(frame.url()).hostname
    )
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
  const dir = `${fleet.sandbox}/pairing-site`;
  await Bun.$`mkdir -p ${dir} && git init -q -b main ${dir}`.quiet();
  // A project of an id shape the hub stores beside its UUIDs (capitals and
  // `_`, as an older project's): made with no place, so nothing names its id
  // yet, its id given here, then its place added as a folder joins one.
  const { id: made } = await fleet.api<{ id: string }>("/api/projects", {
    name: "Pairing",
    caw: false,
  });
  const projectId = "Pairing_Old-1";
  fleet.write("UPDATE projects SET id = ? WHERE id = ?", projectId, made);
  await fleet.api(`/api/projects/${projectId}/places`, {
    machineId: MACHINE,
    path: dir,
  });
  const writer = await fleet.spawn("claude", "Pair the code", dir, {
    projectId,
  });
  const later = await fleet.spawn("claude", "Ship the pairing", dir, {
    projectId,
  });
  const at = (session: string) => `/api/instances/${session}/artifacts`;
  /** Every Cookie header the dev servers were sent. */
  const cookies: string[] = [];
  // Two dev servers on the machine's host, each shown as a preview of its port.
  const devServer = (heading: string) =>
    Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) => {
        cookies.push(request.headers.get("cookie") ?? "");
        return new Response(
          `<!doctype html><html><body><h1>${heading}</h1></body></html>`,
          { headers: { "content-type": "text/html" } }
        );
      },
    });
  const server = devServer(SITE);
  const otherServer = devServer(OTHER);
  const preview = (name: string, port: number) =>
    fleet.api<{ id: string }>(at(writer), {
      kind: "preview",
      does: "try",
      ask: "Try this page and say whether it works",
      name,
      port,
      machine: MACHINE,
    });
  const site = await preview("pairing-site", server.port as number);
  const other = await preview("pairing-other", otherServer.port as number);
  const page = await fleet.api<{ id: string }>(at(writer), {
    kind: "page",
    does: "pick",
    ask: "Pick how the code leaves",
    name: "pairing-behaviour",
    program: pageProgram(site.id, other.id),
  });
  const base = await fleet.dashboard();
  const range = await fleet.api<{ ports: string }>("/api/preview-settings");
  const first = Number(range.ports.split("–")[0]);
  // The owner's tunnel: https in front of the names and of the dashboard.
  const tunnel = await passTunnel(kit.out, first, base);

  for (const mode of MODES) {
    await storeHostMode(fleet, settingsOf(mode, tunnel.front));
    const settings = await fleet.api<{ mode: string; passDomain?: string }>(
      "/api/preview-settings"
    );
    // Host mode's names are loaded by a dashboard reached under their domain.
    const board = mode === "port" ? base : tunnel.board;
    const tab = await kit.page("desk", {
      theme: "light",
      ignoreHTTPSErrors: true,
      hostRules: PASS_HOSTS,
    });
    const heard = hear(tab);
    await open(tab, `${board}/session/${writer}`, '[data-slot="pane"]');
    // Brought to the front of the writer's panel, as Files opens it.
    await (
      await fetch(`${fleet.base}${at(writer)}/${page.id}/show`, {
        method: "POST",
      })
    ).text();
    const panel = await drawnBy(
      tab,
      `${mode}: the page and its embeds in the panel`
    );
    const embeds = await embedHosts(tab);
    const again = await reloadedIn(tab);
    kit.check(
      `(a) ${mode}: the page opened in its writer's panel draws its card, and both Preview embeds draw inside it, again after they reload themselves`,
      settings.mode === (mode === "port" ? "port" : "host") &&
        panel.card &&
        panel.embeds === BOTH &&
        again.embeds === BOTH,
      JSON.stringify({ settings, ...panel, reloaded: again.embeds })
    );
    if (mode === "port") {
      await tab.close();
      continue;
    }

    // (c) The owner's remounts.
    const frame = await pageFrame(tab);
    const media = frame
      ? await frame
          .evaluate(
            () => document.getElementById("cawco-media")?.textContent ?? ""
          )
          .catch(() => "")
      : "";
    const remountsFrom = heard.length;
    const remounts: string[] = [];
    for (let time = 1; time <= 3; time += 1) {
      if (frame) {
        await remount(frame).catch(() => undefined);
      }
      await tab.waitForTimeout(3000);
      remounts.push((await drawnIn(tab)).embeds);
    }
    const addresses = (await pageFrame(tab))
      ?.childFrames()
      .map((one) => one.url());
    const pass = passHeld(heard, embeds, remountsFrom);
    kit.check(
      `(c) ${mode}: both embeds remounted three times draw each time; none of the embeds' ${pass.said.embedAnswers} answers is 401, nor the page's first load (entered before it), one /__cawco/enter is asked in all and none per remount; no ticket in the page's media or an embed's address, and no dev server is sent the pass`,
      remounts.every((one) => one === BOTH) &&
        embeds.size === 2 &&
        pass.held &&
        media.includes(`.${PASS_DOMAIN}:`) &&
        !media.includes("ticket") &&
        (addresses ?? []).length === 2 &&
        !(addresses ?? []).some((one) => one.includes("ticket=")) &&
        !cookies.some((one) => one.includes(PREVIEW_PASS_COOKIE)),
      JSON.stringify({
        remounts,
        embeds: [...embeds],
        ...pass.said,
        addresses,
        media: media.slice(0, 400),
        devCookies: [...new Set(cookies)],
      })
    );

    // (d) Revoked: every frame locks at its next load.
    const revoked = await tab.evaluate(async () => {
      const answer = await fetch("/api/preview-pass", { method: "DELETE" });
      return `${answer.status} ${await answer.text()}`;
    });
    const before = heard.length;
    const shown = await pageFrame(tab);
    if (shown) {
      await remount(shown).catch(() => undefined);
    }
    const embedsLocked = shown
      ? await until(
          `${mode}: every embed on the locked page`,
          () => lockedIn(shown),
          (read) => read.embeds === 2 && read.locked === 2,
          15_000
        ).catch(() => lockedIn(shown))
      : { embeds: 0, locked: 0 };
    const remounted = heard.slice(before);
    await shown?.evaluate(() => location.reload()).catch(() => undefined);
    const back = await drawnBy(
      tab,
      `${mode}: the page and its embeds again after its reload`
    );
    const reloaded = heard.slice(before + remounted.length);
    kit.check(
      `(d) ${mode}: the pass revoked, each embed remounted answers 401 with the locked page, the page reloaded answers 401, and the pane enters once more and draws it and both embeds again`,
      revoked.startsWith("200") &&
        embedsLocked.embeds === 2 &&
        embedsLocked.locked === 2 &&
        remounted.filter((one) => one.kind === "locked" && embeds.has(one.host))
          .length === 2 &&
        reloaded.some(
          (one) => one.kind === "locked" && !embeds.has(one.host)
        ) &&
        reloaded.filter((one) => one.kind === "enter").length === 1 &&
        back.card &&
        back.embeds === BOTH,
      JSON.stringify({
        revoked,
        embedsLocked,
        remounted: remounted.map((one) => `${one.kind} ${one.url}`),
        reloaded: reloaded
          .filter((one) => one.kind !== "answer")
          .map((one) => `${one.kind} ${one.url}`),
        back,
      })
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
  // Its own previews go with it (db/index.ts `dropInstances`), the page
  // staying with the project: waited for before the hub restarts below.
  const leftOver = await until(
    "the writer's previews gone with it",
    () =>
      fleet.query<{ id: string }>(
        "SELECT id FROM artifacts WHERE id IN (?, ?)",
        site.id,
        other.id
      ).length,
    (rows) => rows === 0,
    60_000
  ).catch(() => -1);

  for (const mode of MODES) {
    await storeHostMode(fleet, settingsOf(mode, tunnel.front));
    const board = mode === "port" ? base : tunnel.board;
    const tab = await kit.page("desk", {
      theme: "light",
      ignoreHTTPSErrors: true,
      hostRules: PASS_HOSTS,
    });
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
    const option = mode === "host" ? "swallow" : "fly";
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
        leftOver === 0 &&
        tabbed.card &&
        tabbed.gone === "What this card showed is gone." &&
        JSON.stringify(picked?.state.leave?.options) ===
          JSON.stringify([option]),
      JSON.stringify({
        deleted: deleteSaid,
        previewsLeft: leftOver,
        ...tabbed,
        pressed,
        pick: picked?.state.leave ?? null,
      })
    );
    await tab.close();
  }
  server.stop(true);
  otherServer.stop(true);
  tunnel.stop();
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "project-origin",
  run,
};
export default spec;
