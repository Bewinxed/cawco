/**
 * Nothing moves sideways under a finger because of a hit area.
 *
 * `touch-hit`'s 44px area (design.css, The 44 Touch Rule) is a transparent
 * ::after placed absolutely about its control, so it counts toward the
 * scrollable overflow of every ancestor up to the first that clips: a head
 * whose last control is Close reports a scrollWidth 7.5px past its box.
 * Inside a box that never scrolls that draws nothing; it would matter only
 * where it let the page, or a scroller, move sideways. This holds that it
 * never does, on the dashboard's routes that stand `touch-hit` controls,
 * under the kit's phone view (390×844, a finger), in Chromium and WebKit:
 *
 * - a session, its preview sheet open on its page and a plan's ring in the
 *   composer's tray row, as opened and with the composer taking the focus;
 *   the decision page in its panel (its own frame read too);
 * - an artifact's own tab, the side panel's head over it;
 * - Files, opened from the navigation's row (its list's cards).
 *
 * At each, `document.scrollingElement.scrollWidth ≤ clientWidth`, and no
 * element whose `overflow-x` lets it scroll is wider inside than its box
 * because of a hit area (sideways.ts: a scroller wider only by a control's
 * ::after; one wider by its content, a strip that scrolls by design, is
 * named and passes).
 *
 *   bun scripts/probe-kit/run.ts touch-sideways
 */
import type { Frame, Page } from "playwright-core";
import { until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";
import { type SidewaysRead, sideways, sidewaysHolds } from "../sideways";
import { fleetUp, made, planOn } from "./artifact-resize-loop";

/** A decision page of one card: its options' chips are `touch-hit` controls in the panel's frame. */
const DECISION = `root = Decisions("Plan the launch", [reach])
reach = Decision("reach", "Which channel carries the launch?", [mail, feed], "Each reaches a different reader.")
mail = Option("mail", "The newsletter", "Readers who signed up.", true, [], "A week's wait.")
feed = Option("feed", "The blog feed", "Readers who follow us.", false, [], "Slow to spread.")`;

/** The page's reading and, where given, its frame's, as one verdict and its words. */
const verdict = async (page: Page, frame?: Frame | null) => {
  const reads: [string, SidewaysRead][] = [
    ["dashboard", await page.evaluate(sideways)],
  ];
  if (frame) {
    reads.push(["its page's frame", await frame.evaluate(sideways)]);
  }
  return {
    holds: reads.every(([, read]) => sidewaysHolds(read)),
    said: reads
      .map(
        ([where, read]) =>
          `${where}: page ${read.page.scroll}/${read.page.client}; ${
            read.scrollers
              .filter((one) => one.name !== "document.scrollingElement")
              .map(
                (one) =>
                  `${one.name} ${one.scroll}/${one.client} by ${one.cause} (content to ${one.boxEdge}, hit areas to ${one.hitEdge}${one.hosts.length > 0 ? `: ${one.hosts.join(", ")}` : ""})`
              )
              .join("; ") || "no scroller wider than its box"
          }`
      )
      .join(" | "),
  };
};

const frameOf = async (page: Page, selector: string) =>
  (await page.locator(selector).first().elementHandle())?.contentFrame() ??
  null;

const legs = async (
  kit: Kit,
  base: string,
  ids: { artifact: string; decision: string; session: string },
  engine: "chromium" | "webkit"
) => {
  // The decision page in the session's panel: the last leg's own tab of
  // the other artifact showed that one there.
  await fetch(
    `${base}/api/instances/${ids.session}/artifacts/${ids.decision}/show`,
    { method: "POST" }
  );
  const page = await kit.page("phone", { theme: "light", engine });
  const at = (where: string) => `touch 390 ${engine}, ${where}`;
  const holds = async (where: string, frame?: Frame | null) => {
    const read = await verdict(page, frame);
    kit.check(
      `${at(where)}: the page scrolls nothing sideways, and no scroller scrolls sideways because of a hit area`,
      read.holds,
      read.said
    );
  };
  // The session: its preview sheet open on the decision page, the plan's
  // ring in the tray row.
  await open(
    page,
    `${base}/session/${ids.session}`,
    '[data-slot="lift"] [data-tray-chip]'
  );
  const decision = await until(
    "the decision page in the phone's sheet",
    async () => {
      for (const frame of page.frames()) {
        let cards = 0;
        try {
          // biome-ignore lint/performance/noAwaitInLoops: the first frame holding the card
          cards = await frame.locator("#decision-reach").count();
        } catch {
          // A frame gone mid-read holds no card.
        }
        if (cards > 0) {
          return frame;
        }
      }
      return null;
    },
    Boolean,
    60_000
  ).catch(() => null);
  kit.check(
    `${at("a session")}: its sheet shows the decision page`,
    !!decision,
    decision
      ? "drawn"
      : `never drew; the sheet says ${await page.evaluate(() => document.querySelector("[data-preview-sheet]")?.textContent?.trim().slice(0, 200) ?? "nothing")}`
  );
  await settle(page, 600);
  await holds(
    "a session, its sheet open on the decision page, the plan's ring on the composer",
    decision
  );
  await page.locator('[data-slot="composer-field"]').first().focus();
  await settle(page, 700);
  await holds("a session, the composer taking the focus", decision);
  // Files from the navigation's row.
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur()
  );
  await page.locator('[data-slot="burger"]').click();
  await page.locator("[data-sidebar-files]").click();
  await page
    .locator("[data-files-sheet] [data-files-card]")
    .first()
    .waitFor({ timeout: 30_000 });
  await settle(page, 600);
  await holds("Files from the navigation, its list of cards");
  // The artifact's own tab: the side panel's head over its page.
  await open(
    page,
    `${base}/artifact/${ids.artifact}`,
    '[data-slot="side-card"] [data-slot="side-head"]'
  );
  const own = await until(
    "the artifact's page on its own tab",
    async () => {
      const frame = await frameOf(
        page,
        '[data-slot="side-card"] iframe[title="Preview"]'
      );
      return frame && (await frame.locator("h1").count()) > 0 ? frame : null;
    },
    Boolean,
    60_000
  ).catch(() => null);
  await settle(page, 600);
  await holds("an artifact's own tab, the side panel's head", own);
  // The hit areas are there to find: the head, which never scrolls, is
  // wider inside than its box by Close's reach past its end.
  kit.note(
    `${at("an artifact's own tab")}: the side head (overflow visible, never scrolls) is ${await page.evaluate(
      () => {
        const head = document.querySelector(
          '[data-slot="side-card"] [data-slot="side-head"]'
        );
        return head
          ? `${head.scrollWidth} inside ${head.clientWidth}`
          : "not found";
      }
    )}`
  );
  await page.context().close();
};

const spec: Spec = {
  name: "touch-sideways",
  run: async (kit: Kit) => {
    const fleet = await fleetUp(kit);
    const session = await fleet.spawn("claude", "Launch reach", fleet.repo);
    await planOn(fleet, session, "41");
    const artifact = await made(kit, "42", "launch-wraps", () =>
      fleet.send(session, "PROBE-CALL:42")
    );
    if (!artifact) {
      return;
    }
    const { id: decision } = await fleet.api<{ id: string }>(
      `/api/instances/${session}/artifacts`,
      {
        kind: "page",
        does: "pick",
        ask: "Pick the channel that carries the launch",
        name: "launch-reach",
        program: DECISION,
      }
    );
    const base = await fleet.dashboard();
    for (const engine of ["chromium", "webkit"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one engine's page at a time
      await legs(kit, base, { artifact, decision, session }, engine);
    }
  },
};

export default spec;
