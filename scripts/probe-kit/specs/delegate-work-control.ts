/**
 * The routing page's at-limit group offers what a delegate's work does at
 * its account's limit (core `DelegateWork`, the routing's
 * `atLimit.delegateWork`; dashboard AtLimitBlock.svelte), saved through the
 * routing's PUT as its siblings are. On a scratch fleet (a real hub) with two
 * anthropic accounts, so the routing page exists:
 *
 * 1. Unset, the control reads "Carry on after the reset".
 * 2. "Move it to an account with room" picked and the routing saved.
 * 3. The hub's routing for anthropic holds `delegateWork` "move".
 * 4. Reloaded, the control still reads the move choice.
 *
 *   bun scripts/probe-kit/run.ts delegate-work-control
 */
import type { ProviderRouting } from "../../../packages/core/src/accounts";
import { accountsWords } from "../../../packages/core/src/words/accounts";
import type { Reply } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

const words = accountsWords.atLimit;
const ROUTING = "/config/accounts/anthropic/routing";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** The control's chosen item's words. */
const chosen = (page: Awaited<ReturnType<Kit["page"]>>) =>
  page
    .getByRole("group", { name: words.delegateWork })
    .locator('[data-state="on"]')
    .innerText();

const run = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet(respond);
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.write(
    "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES ('acct-probe-b', 'anthropic', 'console', 'Probe B', 'green', 1, 0, ?)",
    Date.now()
  );
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  const ready = `[aria-label="${words.delegateWork}"]`;

  await open(page, `${base}${ROUTING}`, ready);
  const [label, sibling] = await page.evaluate(
    ([work, move]) =>
      [work, move].map((text) => {
        const el = [...document.querySelectorAll("p, label")].find(
          (one) => one.textContent?.trim() === text
        ) as HTMLElement;
        const style = getComputedStyle(el);
        return `x ${Math.round(el.getBoundingClientRect().left)}, ${style.font}, ${style.color}`;
      }),
    [words.delegateWork, words.move]
  );
  kit.check(
    "its label stands on the move switch's edge, in its font and ink",
    label === sibling,
    `${label} | ${sibling}`
  );
  const unset = await chosen(page);
  kit.check(
    `1. unset, the control reads "${words.delegateWorkChoices.resume}"`,
    unset === words.delegateWorkChoices.resume,
    `read "${unset}"`
  );

  await page
    .getByRole("group", { name: words.delegateWork })
    .getByText(words.delegateWorkChoices.move)
    .click();
  await page
    .getByRole("button", { name: accountsWords.routingEditor.save })
    .click();
  await page.waitForURL((url) => url.pathname === "/config/accounts");

  const { routing } = (await (
    await fetch(`${fleet.base}/api/accounts`)
  ).json()) as { routing: ProviderRouting[] };
  const held = routing.find((one) => one.provider === "anthropic")?.atLimit
    .delegateWork;
  kit.check(
    '3. the hub\'s routing holds atLimit.delegateWork "move"',
    held === "move",
    `read ${JSON.stringify(held)}`
  );

  await open(page, `${base}${ROUTING}`, ready);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(ready);
  const after = await chosen(page);
  kit.check(
    `4. reloaded, the control reads "${words.delegateWorkChoices.move}"`,
    after === words.delegateWorkChoices.move,
    `read "${after}"`
  );
};

export default { name: "delegate-work-control", run } satisfies Spec;
