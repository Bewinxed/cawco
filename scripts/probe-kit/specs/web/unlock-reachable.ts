/**
 * The unlock step's controls stay the person's after a refusal, at every
 * width: nothing is drawn over its field, Cancel or Unlock (The Open Page
 * Rule: a step in the page is pressable where it stands).
 *
 * Found live on a Mac (keychain-unlock): after a wrong password the retry's
 * press on Unlock landed on the detail area behind the machines card
 * (`.empty-detail` "intercepts pointer events").
 *
 * The scratch fleet's agent cannot have a locked keychain (a workspace's
 * boundary denies the keychain, and Linux has none), so the machine's row is
 * the hub's word forged in its database: `os` darwin and `auth`
 * `unreadable-credentials`, which is all the dashboard reads to offer
 * Unlock. The refusal is the agent's real answer to `unlockKeychain`
 * (security refused, or "Only macOS…"): an alert line under the field, which
 * is what grows the step.
 *
 *   bun scripts/probe-kit/run.ts web unlock-reachable
 */
import type { Page } from "playwright-core";
import { MACHINE } from "../../../scratch-fleet";
import type { Kit, Spec } from "../../kit";
import { open, settle } from "../../kit";

const MACHINES_BUTTON = /^\d+ machines?/;
const UNLOCK_ITEM = /^Unlock keychain/;
/** Every width the step must stay pressable at: phone, tablet upright, tablet across, desk. */
const WIDTHS = [390, 768, 1024, 1600] as const;
const HEIGHT = 900;
/** Below this the machines are in the sidebar's sheet, not the glass's card (DRAWER_QUERY). */
const DRAWER_MAX = 899;

/** Opens the machines where this width keeps them. */
async function openMachines(page: Page, width: number): Promise<void> {
  if (width <= DRAWER_MAX) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  } else {
    await page.getByRole("button", { name: MACHINES_BUTTON }).first().click();
  }
  await page.locator(`li[data-machine="${MACHINE}"] .row`).first().waitFor();
  await settle(page);
}

/** What is drawn at each control's centre, and what holds it if not the control. */
const hits = (page: Page) =>
  page.evaluate(() => {
    const section = document.querySelector("section.unlock");
    const controls = {
      field: section?.querySelector('input[type="password"]'),
      cancel: Array.from(section?.querySelectorAll("button") ?? []).find(
        (one) => one.textContent?.trim() === "Cancel"
      ),
      unlock: Array.from(section?.querySelectorAll("button") ?? []).find(
        (one) => one.textContent?.trim() === "Unlock"
      ),
    };
    const name = (el: Element | null) =>
      el
        ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${
            typeof el.className === "string" && el.className
              ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
              : ""
          }`
        : "nothing";
    const card = section?.closest(".kit-pop");
    return {
      alert:
        section?.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
      card: card
        ? {
            state: card.getAttribute("data-state"),
            pointerEvents: getComputedStyle(card).pointerEvents,
            bottom: Math.round(card.getBoundingClientRect().bottom),
          }
        : null,
      controls: Object.fromEntries(
        Object.entries(controls).map(([key, el]) => {
          if (!el) {
            return [key, { ok: false, at: null, hit: "missing" }];
          }
          const box = el.getBoundingClientRect();
          const x = box.left + box.width / 2;
          const y = box.top + box.height / 2;
          const top = document.elementFromPoint(x, y);
          return [
            key,
            {
              ok: top !== null && (top === el || el.contains(top)),
              at: [Math.round(x), Math.round(y)],
              hit: name(top),
            },
          ];
        })
      ) as Record<
        string,
        { ok: boolean; at: number[] | null; hit: string }
      >,
    };
  });

const spec: Spec = {
  name: "unlock-reachable",
  run: async (kit: Kit) => {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    // The hub's word on the machine, as a Mac with a locked login keychain
    // reports it (the agent's Claude report already landed, and is sent
    // again only when it changes).
    fleet.write(
      "UPDATE agents SET os = 'darwin', auth = 'unreadable-credentials' WHERE machine_id = ?",
      MACHINE
    );
    const base = await fleet.dashboard();

    for (const width of WIDTHS) {
      // biome-ignore lint/performance/noAwaitInLoops: one width at a time, each on its own page
      const page = await kit.page("desk");
      await page.setViewportSize({ width, height: HEIGHT });
      await open(page, base, "[data-needs-caw]");
      await openMachines(page, width);
      await page
        .locator(`li[data-machine="${MACHINE}"] .row`)
        .first()
        .click({ button: "right" });
      await page.getByRole("menuitem", { name: UNLOCK_ITEM }).click();
      await page.locator("section.unlock").waitFor();
      await settle(page);
      const before = await hits(page);
      kit.check(
        `${width}px: the step's field, Cancel and Unlock are pressable as it opens`,
        Object.values(before.controls).every((one) => one.ok),
        JSON.stringify(before)
      );
      await page
        .locator('section.unlock input[type="password"]')
        .fill("not-the-password");
      await page.keyboard.press("Enter");
      await page
        .locator('section.unlock [role="alert"]')
        .waitFor({ timeout: 60_000 });
      await settle(page);
      const after = await hits(page);
      kit.check(
        `${width}px: after a refusal nothing covers the step's field, Cancel or Unlock (elementFromPoint at each centre)`,
        after.alert !== null &&
          Object.values(after.controls).every((one) => one.ok),
        JSON.stringify(after)
      );
      await page.close();
    }
  },
};

export default spec;
