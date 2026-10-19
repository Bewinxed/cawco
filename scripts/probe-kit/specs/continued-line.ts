/**
 * A continued session points onward (hub server.ts `retireContinued`,
 * `inputRefusal`; SessionPane.svelte `.continued`). On a scratch fleet with
 * two sessions, the first's row names the second as its continuation
 * (`instances.continued_into`, written as the hub's continuation writes it),
 * the second titled 60 characters long. Read from the hub's records and the
 * page's DOM, never from pixels:
 *
 * 1. A person's message to the first session's id is refused, in the words
 *    "Continued in <the second's title>", and the second never gets it.
 * 2. At 320px wide, the first session's page has no composer, only the line
 *    "Continued in <title>" with the title a link to the second session; the
 *    line fits the width, on one line, and the title ellipsizes inside its
 *    own link (DESIGN.md, the Truncate Inside Rule).
 *
 * It delegates nothing, so it runs inside a workspace. limit-stall's
 * `continued` leg (host) proves the same on a real continuation.
 *
 *   bun scripts/probe-kit/run.ts continued-line
 */
import type { Reply } from "../../scratch-fleet";
import { until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

/** The continuation's title: 60 characters, longer than 320px holds. */
const TITLE = "Continue the payment retry work through the settlement queue";
/** The person's message to the continued session's id. */
const TYPED = "PROBE-TYPED-to-the-continued-session";
const WIDTH = 320;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

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
  const old = await fleet.spawn("claude", "Continued source", fleet.repo);
  const next = await fleet.spawn("claude", TITLE, fleet.repo);
  kit.check(
    "the continuation's title is 60 characters",
    TITLE.length === 60,
    `${TITLE.length}`
  );
  fleet.write(
    "UPDATE instances SET continued_into = ? WHERE id = ?",
    next,
    old
  );
  const words = `Continued in ${TITLE}`;

  // 1. The person's message to the old id.
  await fleet.send(old, `${TYPED}: typed on its page`);
  const sends = () =>
    fleet.query<{ instance_id: string; reason: string | null; state: string }>(
      "SELECT instance_id, state, reason FROM sent_messages WHERE body LIKE ?",
      `%${TYPED}%`
    );
  const typed = await until(
    "the person's send settled",
    sends,
    (rows) => rows.some((one) => one.state !== "pending"),
    20_000
  ).catch(sends);
  kit.check(
    `1: a person's send to the continued session is refused with "${words}", and the continuation never gets it`,
    typed.length === 1 &&
      typed[0]?.instance_id === old &&
      typed[0]?.state === "failed" &&
      typed[0]?.reason === words,
    JSON.stringify(typed)
  );

  // 2. Its page at 320px.
  const base = await fleet.dashboard();
  const page = await kit.page("phone");
  await page.setViewportSize({ width: WIDTH, height: 700 });
  await open(page, `${base}/session/${old}`, '[data-slot="pane"]');
  const read = () =>
    page.evaluate((to) => {
      const link = document.querySelector<HTMLAnchorElement>(
        `a[href="/session/${to}"]`
      );
      const line = link?.closest("p");
      const lead = line?.querySelector(":scope > span");
      const title = link?.querySelector("span");
      const box = (el: Element | null | undefined) => {
        if (!el) {
          return null;
        }
        const r = el.getBoundingClientRect();
        return {
          left: Math.round(r.left),
          right: Math.round(r.right),
          top: Math.round(r.top),
          height: Math.round(r.height),
        };
      };
      return {
        viewport: window.innerWidth,
        pageScroll: document.documentElement.scrollWidth,
        composers: document.querySelectorAll('[data-slot="composer"]').length,
        words: line?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        line: box(line),
        lead: box(lead),
        link: box(link),
        title: title
          ? {
              shown: title.clientWidth,
              whole: title.scrollWidth,
              textOverflow: getComputedStyle(title).textOverflow,
            }
          : null,
        linkColor: link ? getComputedStyle(link).color : null,
      };
    }, next);
  const shown = await until(
    "the continued line on the old page",
    read,
    // Its title, not its id: the line as it settles, whatever drew first.
    (now) => !!now.words?.includes(TITLE),
    60_000
  ).catch(read);
  kit.note(`320px reading: ${JSON.stringify(shown)}`);
  const { line, lead, link, title } = shown;
  kit.check(
    "2: the continued session's page has no composer, only the line, its title a link to the continuation",
    shown.composers === 0 &&
      shown.words?.replace(/\s/g, "") === words.replace(/\s/g, ""),
    JSON.stringify({ composers: shown.composers, words: shown.words })
  );
  kit.check(
    `2: at ${WIDTH}px the line fits, on one line, and the title ellipsizes inside its own link`,
    !!(line && lead && link && title) &&
      shown.pageScroll <= WIDTH &&
      line.left >= 0 &&
      line.right <= WIDTH &&
      Math.abs(lead.top - link.top) <= 2 &&
      link.left >= lead.right &&
      link.right <= line.right &&
      title.whole > title.shown &&
      title.textOverflow === "ellipsis",
    JSON.stringify({
      pageScroll: shown.pageScroll,
      line,
      lead,
      link,
      title,
    })
  );
};

export default { name: "continued-line", run } satisfies Spec;
