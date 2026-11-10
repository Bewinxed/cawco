/**
 * A page's socket across a hub restart, on a scratch fleet (the owner's ask,
 * 2026-11-04: it reconnects after any restart with no failure). A page whose
 * link has stood down enters again as the hub comes back (PreviewPane
 * `enterAgain`), its socket's backoff going on: the entry replaced the pass
 * at once, so a handshake sent with the old cookie as it landed was refused
 * 401 (1 in about 4 runs of `comments`'s restart leg).
 *
 * 1. Right after an entry, what the browser sent with the pass it replaced
 *    still gets through; past its overlap (preview-access.ts
 *    `REPLACED_PASS_MS`) the replaced pass is refused, as it was before.
 * 2. Through a restart long enough for the page's link to stand down, and one
 *    too short for it, the page says no refused socket, and its link is synced
 *    again: a write on it reaches the hub's doc through the new socket.
 */
import type { Page } from "playwright-core";
import { dataOf } from "../../../packages/agent/src/hub-client";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { ToolCalls } from "../../tool-calls";
import { pageHub } from "../hub";
import { COMPOSER, open } from "../kit";
import type { Kit, Spec } from "../spec";

const CREATE = "mcp__cawco__artifact_create";
const REFUSED = /HTTP Authentication failed/u;
/** Past preview-access.ts `REPLACED_PASS_MS`. */
const PAST_OVERLAP_MS = 11_000;
/** Past PreviewPane `LINK_DOWN_MS`, where the page's link stands down and it enters again; and well short of it. */
const DOWNS_MS = [1500, 13_000];

/** The mock's one call (scripts/tool-calls.ts). */
const calls = new ToolCalls();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  return calls.reply(request) ?? text("ok");
};

/** The browser's person's pass, as a cookie header, and a new entry made as the dashboard makes one. */
const passOn = (page: Page) => ({
  now: async () => {
    const pass = (await page.context().cookies()).find((one) =>
      one.name.includes("preview-pass")
    );
    return pass ? `${pass.name}=${pass.value}` : "";
  },
  enter: async (origin: string) => {
    const { ticket } = dataOf(await pageHub(page).api["preview-ticket"].post());
    // The preview's own door, not the hub: its cookie lands only in the browser.
    await page.evaluate(
      async ({ at, entry }) => {
        await fetch(`${at}/__cawco/enter?ticket=${encodeURIComponent(entry)}`, {
          mode: "no-cors",
          credentials: "include",
          cache: "no-store",
        });
      },
      { at: origin, entry: ticket }
    );
  },
});

/** The link of the page at `origin`, as its overlay holds it; empty while it holds none. */
const linkOn = async (page: Page, origin: string) => {
  const frame = page.frames().find((one) => one.url().startsWith(origin));
  try {
    return await frame?.evaluate(() => {
      const { cawcoArtifact: held } = window as unknown as {
        cawcoArtifact: {
          subscribe: (
            hear: (hold: { link: { state: string } }) => void
          ) => () => void;
        };
      };
      let state = "";
      held.subscribe((hold) => {
        ({ state } = hold.link);
      })();
      return state;
    });
  } catch {
    return "";
  }
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  await fleet.up();
  const session = await fleet.spawn("claude", "Restart", fleet.repo);
  await calls.call(fleet, session, CREATE, {
    response_format: "detailed",
    kind: "page",
    does: "judge",
    title: "Probe judge artifact",
    ask: "Judge this page: pin anything that reads wrong",
    name: "restarted",
    html: '<!doctype html><html><body><p id="one">A page across restarts.</p></body></html>',
  });
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  const said: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      said.push(message.text());
    }
  });
  await open(page, `${base}/session/${session}`, COMPOSER);
  const frameOf = () =>
    until(
      "the page in its frame",
      () =>
        page
          .frames()
          .find(
            (one) => !one.url().startsWith(base) && one.url() !== "about:blank"
          ),
      Boolean,
      60_000
    );
  const frame = await frameOf();
  await frame.waitForSelector("#one");
  const { origin } = new URL(frame.url());

  // 1. A replaced pass, right after its entry and past its overlap.
  const pass = passOn(page);
  const replaced = await pass.now();
  await pass.enter(origin);
  const given = await pass.now();
  const statusWith = async (cookie: string) =>
    (await fetch(`${origin}/`, { headers: { cookie }, redirect: "manual" }))
      .status;
  const within = await statusWith(replaced);
  await page.waitForTimeout(PAST_OVERLAP_MS);
  const past = await statusWith(replaced);
  const current = await statusWith(given);
  kit.check(
    "1: an entry replaces the pass; what was sent with the old one as it landed gets through, past its overlap it is refused, and the new one stands",
    given !== replaced && within !== 401 && past === 401 && current !== 401,
    `right after ${within}; past its overlap ${past}; the new pass ${current}`
  );

  // 2. Each restart, and the page's link after it.
  for (const down of DOWNS_MS) {
    const from = said.length;
    await fleet.stop("hub");
    await page.waitForTimeout(down);
    fleet.launch("hub");
    await fleet.hubUp();
    const synced = await until(
      `the page's link after ${down} ms down`,
      () => linkOn(page, origin),
      (state) => state === "synced",
      60_000
    ).catch(() => "not");
    const refused = said.slice(from).filter((line) => REFUSED.test(line));
    kit.check(
      `2: down ${down} ms: the page's socket comes back with none refused, its link synced`,
      synced === "synced" && refused.length === 0,
      `link ${synced}; refused ${refused.length}${refused[0] ? `: ${refused[0].slice(0, 120)}` : ""}`
    );
  }
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "preview-restart",
  run,
};
export default spec;
