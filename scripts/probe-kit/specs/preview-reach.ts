/**
 * A preview pane's "This preview can't be reached" is the state now, not
 * one failed probe, and it says what failed (owner, 2026-10-18, on a page
 * artifact that said so while its origin answered: "tf?").
 *
 *   bun scripts/probe-kit/run.ts preview-reach
 *
 * A scratch fleet, the built dashboard at the desk, read from the pane's
 * DOM. Nothing is pressed: every recovery is the pane's own.
 *
 * 1. A page artifact whose first ping this browser refuses (the route
 *    aborted as connection refused): the pane says it can't be reached, and
 *    why ("… didn't answer"); then it shows the page by itself, within
 *    `FIRST_BACK_MS`.
 * 2. A port preview whose machine's agent is stopped: the hub's ping
 *    answers 502 with its own words, and the pane says them ("… answered
 *    502: …"), with no "Previews need" advice (the origin answered) and one
 *    next step, its own "Trying again on its own." (the hub's words carry
 *    the cause alone, core `machineFaultWords` `next: false`). The
 *    agent back, the pane shows the page by itself, within `AGENT_BACK_MS`.
 * 3. The agent frozen (SIGSTOP), so the hub still knows its listener and
 *    the listener doesn't answer (the owner's hub logged ECONNRESET from
 *    one): the hub's relayed ping fails, and the pane says "answered 502:
 *    its machine's listener didn't answer the hub (…)". The agent running
 *    again, the pane shows the page by itself.
 */
import type { Page } from "playwright-core";
import { until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

/** The pane probes again 2 s after a failure (PreviewPane `PROBE_FIRST_MS`); slack for the probe and the frame's load. */
const FIRST_BACK_MS = 6000;
/** The backoff's most (30 s, PreviewPane `PROBE_MOST_MS`), and the agent's listener started again. */
const AGENT_BACK_MS = 45_000;
/** The hub's relay of the ping waits 5 s on the listener (hub preview.ts `PING_RELAY_MS`); slack for the page's open. */
const LISTENER_SAID_MS = 20_000;
/** A next step in the line: the pane's "Trying again on its own.", or a "Try again …" the hub's words once carried. */
const NEXT_STEP = /\btry(?:ing)? again\b/gi;

const pageOf = (heading: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${heading}</title></head><body><h1>${heading}</h1></body></html>`;

/** The desk's workspace: one tab, the session's, in front. */
const tabAt = (page: Page, id: string) =>
  page.addInitScript((shown) => {
    localStorage.setItem(
      "cawco-workspace",
      JSON.stringify({
        v: 1,
        root: {
          t: "l",
          id: "pone",
          tabs: [shown],
          active: shown,
          opened: null,
        },
        focusedLeaf: "pone",
      })
    );
  }, id);

/** What the pane of session `id` shows now: its unreached state's words, and whether its frame said ready. */
const paneNow = (page: Page, id: string) =>
  page.evaluate((pane) => {
    const root = document.querySelector(
      `[data-slot="pane"][data-pane="${pane}"]`
    );
    const down = root?.querySelector('[data-slot="down"]');
    const words = (node: Element | null | undefined) =>
      node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return {
      down: words(down),
      // The empty state's line alone, without its buttons' labels.
      line: words(down?.querySelector(".kit-empty-line")),
      ready: !!root?.querySelector('iframe[title="Preview"][data-ready]'),
    };
  }, id);

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const base = await fleet.dashboard();

  // 1. A page artifact, its first ping refused at this browser.
  const paged = await fleet.spawn("claude", "Refused once", fleet.repo);
  await fleet.api(`/api/instances/${paged}/artifacts`, {
    kind: "page",
    name: "refused-once",
    html: pageOf("Refused once"),
  });
  const desk = await kit.page("desk");
  let pings = 0;
  await desk.route(
    (url) => url.pathname === "/__cawco/ping",
    (route) => {
      pings += 1;
      return pings === 1 ? route.abort("connectionrefused") : route.continue();
    }
  );
  await tabAt(desk, paged);
  await open(
    desk,
    `${base}/session/${paged}`,
    `[data-slot="pane"][data-pane="${paged}"] [data-slot="down"]`
  );
  const refused = await paneNow(desk, paged);
  const downAt = Date.now();
  const back = await until(
    "the page shown after its refused ping",
    () => paneNow(desk, paged),
    (now) => now.ready && !now.down,
    FIRST_BACK_MS
  ).then(
    () => Date.now() - downAt,
    () => null
  );
  kit.check(
    "1: a refused first ping: the pane says it can't be reached and why",
    refused.down.includes("This preview can't be reached") &&
      refused.down.includes("didn't answer.") &&
      refused.down.includes("Trying again on its own."),
    refused.down
  );
  kit.check(
    `1: then it shows the page by itself, within ${FIRST_BACK_MS / 1000} s, no press`,
    back !== null,
    `shown after ${back ?? "never"} ms; pings ${pings}`
  );
  await desk.close();

  // 2. A port preview, its machine's agent stopped.
  const app = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(pageOf("Served"), {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
  });
  const ported = await fleet.spawn("claude", "Agent away", fleet.repo);
  await fleet.api(`/api/instances/${ported}/artifacts`, {
    kind: "preview",
    name: "agent-away",
    port: app.port,
  });
  await fleet.stop("agent");
  const away = await kit.page("desk");
  await tabAt(away, ported);
  await open(
    away,
    `${base}/session/${ported}`,
    `[data-slot="pane"][data-pane="${ported}"] [data-slot="down"]`
  );
  const hubSaid = await paneNow(away, ported);
  kit.check(
    "2: the agent stopped: the pane says the hub's own words for its 502, and no Previews need advice",
    hubSaid.down.includes("answered 502:") &&
      !hubSaid.down.includes("Previews need"),
    hubSaid.down
  );
  const nextSteps = hubSaid.line.match(NEXT_STEP)?.length ?? 0;
  kit.check(
    "2: its line says one next step, the pane's own: the hub's 502 carries the cause alone",
    nextSteps === 1 && hubSaid.line.endsWith("Trying again on its own."),
    `${nextSteps} next steps: ${hubSaid.line}`
  );
  fleet.launch("agent");
  await fleet.agentUp();
  const agentAt = Date.now();
  const served = await until(
    "the page shown once the agent is back",
    () => paneNow(away, ported),
    (now) => now.ready && !now.down,
    AGENT_BACK_MS
  ).then(
    () => Date.now() - agentAt,
    () => null
  );
  const last = await paneNow(away, ported);
  kit.check(
    `2: the agent back: the pane shows the page by itself, within ${AGENT_BACK_MS / 1000} s, no press`,
    served !== null,
    `shown ${served ?? "never"} ms after the agent was up; the pane now: ${last.down || "the page"}`
  );
  await away.close();

  // 3. The agent frozen: still the machine the hub knows, its listener
  // silent, as one that resets its connections is.
  fleet.freeze("agent", true);
  const frozen = await kit.page("desk");
  await tabAt(frozen, ported);
  await open(frozen, `${base}/session/${ported}`, '[data-slot="pane"]');
  const silent = await until(
    "the hub's words for a silent listener",
    () => paneNow(frozen, ported),
    (now) => now.down.includes("listener didn't answer the hub"),
    LISTENER_SAID_MS
  ).then(
    (now) => now.down,
    async () => (await paneNow(frozen, ported)).down || "the page"
  );
  kit.check(
    "3: the machine's listener silent: the pane says the hub's 502 and that its listener didn't answer the hub",
    silent.includes(
      "answered 502: its machine's listener didn't answer the hub"
    ),
    silent
  );
  fleet.freeze("agent", false);
  const thawAt = Date.now();
  const thawed = await until(
    "the page shown once the listener answers",
    () => paneNow(frozen, ported),
    (now) => now.ready && !now.down,
    AGENT_BACK_MS
  ).then(
    () => Date.now() - thawAt,
    () => null
  );
  const thawedNow = await paneNow(frozen, ported);
  kit.check(
    `3: the agent running again: the pane shows the page by itself, within ${AGENT_BACK_MS / 1000} s, no press`,
    thawed !== null,
    `shown ${thawed ?? "never"} ms after the thaw; the pane now: ${thawedNow.down || "the page"}`
  );
  await frozen.close();
  app.stop(true);
};

const spec: Spec = { name: "preview-reach", run };
export default spec;
