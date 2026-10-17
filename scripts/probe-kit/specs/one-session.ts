/**
 * A session pane shows one session: when the route's session can't be shown
 * (an unknown id, any of SessionPane's named states), nothing of the session
 * shown before it paints in that pane, takes a pointer, or reaches the
 * accessibility tree. A pane kept mounted for a fast tab return is out of all
 * three, not merely covered.
 *
 *   bun scripts/probe-kit/run.ts one-session
 *
 * The case is nightly 3944's (c38ff9186, desk 901×900): a conversation open,
 * then /session/<unknown id>; the "isn't reachable" state stands, and the
 * conversation's speaker lines are still in the DOM behind it, computed
 * `visibility: visible`, `opacity: 1`, with real rects.
 *
 * On a scratch fleet: session A says something; the dashboard opens it at
 * 901×900 and draws its rows. Then the unknown id, two ways: the reader's own
 * navigation in the page (a link, SvelteKit's router), and the address typed
 * again (a full load, A's tab kept by the workspace and mounted behind).
 * Read for every one of A's speaker lines and A's own words:
 *
 *   - paint: the engine's `checkVisibility` (visibility, opacity and
 *     `content-visibility` on every ancestor), with each ancestor's
 *     `content-visibility`, `visibility`, `display` and `inert` that hides it;
 *   - pointer: `document.elementFromPoint` at its centre lands in A's pane;
 *   - accessibility: CDP `Accessibility.getFullAXTree`, any node not ignored
 *     whose name carries A's words.
 *
 * Asserted per way: none of the three.
 */
import type { Page } from "playwright-core";
import { until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

const UNKNOWN = "00000000-0000-4000-8000-000000000000";
/** The case's desk. */
const VIEWPORT = { width: 901, height: 900 };

/** What one of A's nodes reads after the unknown id stands. */
interface Kept {
  /** Its ancestors that keep it out of paint or reach, nearest first. */
  hiddenBy: string[];
  /** The element `elementFromPoint` finds at its centre lies in A's pane. */
  hit: boolean;
  /** The engine says it is drawn (`checkVisibility`, every check on). */
  paints: boolean;
  rect: string;
  what: string;
}

/** Every speaker line and every element carrying `words`, in A's own pane. */
const readKept = (page: Page, pane: string, words: string): Promise<Kept[]> =>
  page.evaluate(
    ([id, said]) => {
      // A's slot in its group (PaneLeaf), where PaneHost docks its pane.
      const inA = (el: Element | null): boolean =>
        !!el?.closest(`[data-pane="${CSS.escape(id)}"]`);
      const nodes = new Set<Element>();
      for (const who of document.querySelectorAll("h2[data-slot='who']")) {
        if (inA(who)) {
          nodes.add(who);
        }
      }
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT
      );
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (text.textContent?.includes(said) && inA(text.parentElement)) {
          nodes.add(text.parentElement as Element);
        }
      }
      return [...nodes].map((el) => {
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2
        );
        const hiddenBy: string[] = [];
        for (let up: Element | null = el; up; up = up.parentElement) {
          const s = getComputedStyle(up);
          const marks = [
            s.contentVisibility !== "visible" &&
              `content-visibility: ${s.contentVisibility}`,
            s.visibility !== "visible" && `visibility: ${s.visibility}`,
            s.display === "none" && "display: none",
            (up as HTMLElement).inert && "inert",
          ].filter(Boolean);
          if (marks.length > 0) {
            hiddenBy.push(
              `${up.tagName.toLowerCase()}.${String(up.className).split(" ").filter(Boolean).join(".")} (${marks.join(", ")})`
            );
          }
        }
        return {
          what: `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 40)}"`,
          rect: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`,
          paints: el.checkVisibility({
            contentVisibilityAuto: true,
            opacityProperty: true,
            visibilityProperty: true,
          }),
          hit: inA(at),
          hiddenBy,
        };
      });
    },
    [pane, words] as const
  );

/** The names of every accessibility node not ignored that carries `words`. */
async function axWith(page: Page, words: string): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as {
    nodes: {
      ignored: boolean;
      name?: { value?: string };
      role?: { value?: string };
    }[];
  };
  await cdp.detach();
  return nodes
    .filter((node) => !node.ignored && node.name?.value?.includes(words))
    .map((node) => `${node.role?.value}: ${node.name?.value?.slice(0, 60)}`);
}

/** The three readings for A, asserted for one way to the unknown id. */
async function leg(
  kit: Kit,
  page: Page,
  way: string,
  pane: string,
  words: string
): Promise<void> {
  await page.waitForSelector('[data-slot="empty"], .kit-empty', {
    timeout: 60_000,
  });
  // Every pane the group mounts in the background is in by then (PaneLeaf's
  // QUIET and GAP), and the unknown id's state has landed.
  await page.waitForTimeout(3000);
  const kept = await readKept(page, pane, words);
  const ax = await axWith(page, words);
  const lines = kept.map(
    (k) =>
      `${k.what} at ${k.rect}: paints ${k.paints}, hit ${k.hit}, hidden by ${k.hiddenBy.join(" < ") || "nothing"}`
  );
  kit.note(`${way}: A's nodes kept: ${kept.length}; ${lines.join(" | ")}`);
  const named = await page
    .locator(`[data-pane="${UNKNOWN}"] .kit-empty-title`)
    .allTextContents();
  kit.check(
    `${way}: a named state stands in the unknown id's pane`,
    named.length > 0,
    named.join(" | ") || "none"
  );
  kit.check(
    `${way}: none of A's nodes paints`,
    kept.every((k) => !k.paints),
    lines.filter((_, i) => kept[i]?.paints).join(" | ")
  );
  kit.check(
    `${way}: none of A's nodes takes the pointer`,
    kept.every((k) => !k.hit),
    lines.filter((_, i) => kept[i]?.hit).join(" | ")
  );
  kit.check(
    `${way}: A's words are not in the accessibility tree`,
    ax.length === 0,
    ax.join(" | ")
  );
}

const spec: Spec = {
  name: "one-session",
  async run(kit) {
    const fleet = await kit.fleet(() => ({
      everyMs: 5,
      words: ["one-session", "answer", "drawn"],
    }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const a = await fleet.spawn("claude", "Session A");
    const words = `one-session-${crypto.randomUUID().slice(0, 8)}`;
    const uuid = await fleet.send(a, `${words}: hello.`);
    await until(
      "A's send read",
      () => fleet.sendRow(uuid),
      (row) => row?.state === "read",
      120_000
    );
    await until(
      "A's turn over",
      () => fleet.instance(a),
      (row) => row?.turn_open_at === null,
      120_000
    );
    const base = await fleet.dashboard();
    const page = await kit.page("desk");
    await page.setViewportSize(VIEWPORT);
    const rowsOfA = `[data-pane="${a}"] h2[data-slot="who"]`;
    await open(page, `${base}/session/${a}`, rowsOfA, 120_000);
    kit.check(
      "A's rows are drawn before the unknown id",
      (await page.locator(rowsOfA).count()) > 0
    );

    // The reader's own navigation: a link, taken by SvelteKit's router.
    await page.evaluate((id) => {
      const link = document.createElement("a");
      link.href = `/session/${id}`;
      document.body.append(link);
      link.click();
      link.remove();
    }, UNKNOWN);
    await leg(kit, page, "in-page navigation", a, words);

    // The address typed again: a full load, A's tab kept by the workspace.
    await open(
      page,
      `${base}/session/${UNKNOWN}`,
      '[data-slot="empty"], .kit-empty',
      120_000
    );
    await leg(kit, page, "full load", a, words);
  },
};

export default spec;
