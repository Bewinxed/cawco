/**
 * The machines list says a machine's fleet items that didn't set up as one
 * fault line per cause, never one per item (ItemFaults.svelte, convergence.ts
 * `failureGroups`). On the /motion/machine-faults bench (niftybot.art with
 * 141 of 141 items failed for one cause, obelisk-of-light with four failed
 * for three), in Chromium and WebKit at 390 and 1440:
 *
 *  (a) niftybot's row has one group line, counted 141, saying "141 items
 *      didn't set up." and the machine's cause, with one Show details and one
 *      Retry;
 *  (b) Show details unfolds the 141 items, one to a line, by name;
 *  (c) obelisk's three lines come most items first, and each line's Show
 *      details and Retry stand together on one line, every line's actions
 *      ending on the same trailing edge;
 *  (d) nothing spills: no line, action or detail past the card's edge, and
 *      no sideways scroll in the card or the page;
 *  (e) no group line carries the "Error: " a harness's thrown error has
 *      after its name (convergence.ts `failureReason`);
 *  (f) ElevenLabs, waiting on the fleet's sign-in on both machines under
 *      every harness, is one line at the card's head, and its Sign in lands
 *      on the server's page in Configure, where its sign-in runs.
 *
 *   bun scripts/probe-kit/run.ts web machine-faults
 */
import { mcpWords } from "../../../../packages/core/src/words/mcp";
import type { Engine, Kit, Spec, View } from "../../kit";
import { open, settle } from "../../kit";

const BENCH = "[data-bench]";
const NIFTY = 'li[data-machine="niftybot.art"]';
const OBELISK = 'li[data-machine="obelisk-of-light"]';
const ENGINES: Engine[] = ["chromium", "webkit"];
/** A harness's name and the thrown error's own prefix after it, as the agent joins them. */
const HARNESS_ERROR = /^([\w-]+): (?:Error: )+/;
const SERVER = "ElevenLabs";
const VIEWS: { name: string; view: View }[] = [
  { name: "390", view: "phone" },
  { name: "1440", view: "desk" },
];

const spec: Spec = {
  name: "machine-faults",
  run: async (kit: Kit) => {
    const bench = await kit.bench();
    for (const engine of ENGINES) {
      for (const leg of VIEWS) {
        const at = `${engine} ${leg.name}`;
        // biome-ignore lint/performance/noAwaitInLoops: one engine and viewport at a time, each on its own page
        const page = await kit.page(leg.view, { engine });
        await open(page, `${bench}/motion/machine-faults`, BENCH);
        await settle(page, 400);

        // (a) One line for the 141, one Show details, one Retry.
        const nifty = await page.evaluate((selector) => {
          const li = document.querySelector(selector);
          const groups = [
            ...(li?.querySelectorAll("[data-fault-group]") ?? []),
          ];
          return {
            cause: document
              .querySelector("[data-cause]")
              ?.getAttribute("data-cause"),
            groups: groups.map((group) => ({
              count: group.getAttribute("data-fault-group"),
              reason:
                group
                  .querySelector('[data-slot="reason"]')
                  ?.textContent?.trim() ?? "",
            })),
            details: li?.querySelectorAll("[data-details]").length ?? 0,
            retries: li?.querySelectorAll("[data-again]").length ?? 0,
          };
        }, NIFTY);
        const [only] = nifty.groups;
        kit.check(
          `${at} (a) niftybot.art: one line for its 141 items, with its cause, one Show details and one Retry`,
          nifty.groups.length === 1 &&
            only?.count === "141" &&
            typeof nifty.cause === "string" &&
            only.reason ===
              `141 items didn't set up. ${nifty.cause.replace(HARNESS_ERROR, "$1: ")}` &&
            nifty.details === 1 &&
            nifty.retries === 1,
          JSON.stringify(nifty)
        );

        // (b) Show details unfolds the list.
        await page.locator(`${NIFTY} [data-details]`).click();
        const list = page.locator(`${NIFTY} [data-slot="details"]`);
        const shown = await list
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => list.innerText())
          .catch(() => "");
        const lines = shown.split("\n").filter(Boolean);
        const expanded = await page
          .locator(`${NIFTY} [data-details]`)
          .getAttribute("aria-expanded");
        kit.check(
          `${at} (b) Show details lists the 141 items, one to a line, by name`,
          lines.length === 141 &&
            lines.includes("MCP server Exa_ai") &&
            lines.includes("skill svelte-house-rules") &&
            expanded === "true",
          `${lines.length} lines, aria-expanded ${expanded}; first ${JSON.stringify(lines.slice(0, 4))}`
        );
        await settle(page, 400);

        // (c) Most items first; each line's actions together, every line's ending on one edge.
        const obelisk = await page.evaluate((selector) => {
          const li = document.querySelector(selector);
          return [...(li?.querySelectorAll("[data-fault-group]") ?? [])].map(
            (group) => {
              const actions = group.querySelector('[data-slot="actions"]');
              const buttons = [...(actions?.querySelectorAll("button") ?? [])];
              const box = actions?.getBoundingClientRect();
              return {
                count: group.getAttribute("data-fault-group"),
                end: box ? Math.round(box.right) : null,
                tops: buttons.map((button) =>
                  Math.round(button.getBoundingClientRect().top)
                ),
              };
            }
          );
        }, OBELISK);
        const ends = new Set(obelisk.map((group) => group.end));
        kit.check(
          `${at} (c) obelisk-of-light: three lines, most items first, Show details and Retry on one line, every line's actions on one trailing edge`,
          obelisk.length === 3 &&
            obelisk[0]?.count === "2" &&
            obelisk.every(
              (group) =>
                group.tops.length >= 1 &&
                new Set(group.tops).size === 1 &&
                group.end !== null
            ) &&
            ends.size === 1,
          JSON.stringify(obelisk)
        );

        // (d) Nothing past the card's edge, no sideways scroll.
        const spill = await page.evaluate((selector) => {
          const card = document.querySelector<HTMLElement>(selector);
          if (!card) {
            return null;
          }
          const edge = card.getBoundingClientRect();
          const out = [
            ...card.querySelectorAll<HTMLElement>(
              '[data-row-fault], [data-slot="reason"], [data-slot="actions"], [data-slot="details"], button'
            ),
          ]
            .filter((element) => {
              const box = element.getBoundingClientRect();
              return (
                box.width > 0 &&
                (box.left < edge.left - 0.5 || box.right > edge.right + 0.5)
              );
            })
            .map((element) => element.outerHTML.slice(0, 80));
          return {
            out,
            cardScroll: card.scrollWidth - card.clientWidth,
            pageScroll:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
            cardWidth: Math.round(edge.width),
          };
        }, BENCH);
        kit.check(
          `${at} (d) nothing spills past the card, and nothing scrolls sideways`,
          spill !== null &&
            spill.out.length === 0 &&
            spill.cardScroll <= 0 &&
            spill.pageScroll <= 0,
          JSON.stringify(spill)
        );

        // (e) No group line says "Error: " after its harness.
        const reasons = await page
          .locator('[data-fault-group] [data-slot="reason"]')
          .allInnerTexts();
        kit.check(
          `${at} (e) no group line carries a thrown error's "Error: "`,
          reasons.length === 4 &&
            reasons.every((reason) => !reason.includes("Error: ")),
          JSON.stringify(reasons)
        );

        // (f) The sign-in waiting, once for the fleet, and its Sign in to the server's page.
        const waits = page.locator("[data-sign-in-wait]");
        const wait = {
          count: await waits.count(),
          name: await waits.first().getAttribute("data-sign-in-wait"),
          reason: await waits
            .first()
            .locator('[data-slot="reason"]')
            .innerText(),
          href: await waits
            .first()
            .locator("[data-go-to]")
            .getAttribute("href"),
          label: await waits.first().locator("[data-go-to]").innerText(),
        };
        await waits.first().locator("[data-go-to]").click();
        const landed = await page
          .waitForURL(`**/config/mcp/${SERVER}`, { timeout: 10_000 })
          .then(
            () => new URL(page.url()).pathname,
            () => `(stayed at ${page.url()})`
          );
        kit.check(
          `${at} (f) ${SERVER} waiting on the fleet's sign-in is one line, and its Sign in lands on its page in Configure`,
          wait.count === 1 &&
            wait.name === SERVER &&
            wait.reason === mcpWords.needsSignIn(SERVER) &&
            wait.label.trim() === mcpWords.signIn &&
            wait.href === `/config/mcp/${SERVER}` &&
            landed === `/config/mcp/${SERVER}`,
          JSON.stringify({ ...wait, landed })
        );
        await page.close();
      }
    }
  },
};

export default spec;
