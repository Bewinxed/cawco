/**
 * J10, rules (JOURNEY.md Flow 5): from a template, live on every session;
 * edited, the session hears the new words; deleted, with an undo.
 *
 *  - On an empty Rules page the person adds the “Unverified claim” starter:
 *    the hub holds it, enabled, and a session that then says something
 *    “should work” is sent the rule's reply (the model is asked with it).
 *  - The person edits its reply and saves: the hub holds the new words, and
 *    the next session that says it is sent them.
 *  - The person deletes it: the hub no longer holds it, its row is gone.
 *    Then undo: Flow 5 requires “an undo affordance after the fact rather
 *    than a confirm dialog before it”; undone, the hub holds the rule again.
 */
import type { Seen } from "../../scratch-fleet";
import type { KitFleet } from "../kit";
import { say } from "./mock";
import {
  eventually,
  gone,
  type Journey,
  type Leg,
  shows,
  unmet,
} from "./suite";

const TEMPLATE = "Unverified claim";
/** The template's reply (core rules.ts RULE_TEMPLATES). */
const REPLY =
  "You said it should work. Run it and report what actually happened, with the output.";
const EDITED = "Show me the command you ran and every line of its output.";
const CLAIM = "JOURNEY-RULE";
const CLAIMED = "That should work now.";
const UNDO = /^Undo/;
const FIRED = /Fired \d+ times?/;

interface RuleRow {
  enabled: boolean;
  id: string;
  name: string;
  reply: string;
  stats: { totalFires: number };
}

const rulesOf = async (fleet: KitFleet): Promise<RuleRow[]> =>
  (await fleet.api<{ rules: RuleRow[] }>("/api/rules")).rules;

/** A session that says something should work, and what its model was sent after. */
async function claims(fleet: KitFleet, token: string): Promise<string> {
  const id = await fleet.spawn("claude", `Claims ${token}`);
  await fleet.send(id, `${CLAIM} ${token} fix the flaky test.`);
  return id;
}

/** The words the session that carries `token` was sent after it claimed. */
const heardAfter = (fleet: KitFleet, token: string, words: string) =>
  fleet.seen.some(
    (one) =>
      one.tools &&
      one.all.includes(`${CLAIM} ${token}`) &&
      one.last.includes(words)
  );

async function walk(leg: Leg): Promise<void> {
  const { fleet, page, base } = leg;
  const name = leg.title("Unverified claim, checked");
  let rule: RuleRow | undefined;
  const ruleRow = () =>
    page
      .getByRole("list", { name: "Rules" })
      .getByRole("listitem")
      .filter({ hasText: rule?.name ?? TEMPLATE });

  await leg.step(
    "Open Rules",
    () => page.goto(`${base}/config/rules`, { waitUntil: "domcontentloaded" }),
    async () => {
      await shows(
        page.getByText("Nothing is watching yet"),
        "the empty Rules page"
      );
      await shows(
        page.getByText(TEMPLATE, { exact: true }),
        `the “${TEMPLATE}” starter`
      );
    }
  );

  await leg.step(
    `Add the “${TEMPLATE}” starter`,
    () =>
      page
        .getByRole("list", { name: "Starter rules" })
        .getByRole("listitem")
        .filter({ hasText: TEMPLATE })
        .getByRole("button", { name: "Add" })
        .click(),
    async () => {
      const rules = await eventually(
        "the hub holds the rule, enabled",
        () => rulesOf(fleet),
        (all) => all.some((one) => one.name === TEMPLATE && one.enabled)
      );
      rule = rules.find((one) => one.name === TEMPLATE);
      await shows(ruleRow(), "the rule's row in Rules");
    }
  );

  await leg.step(
    "A session says its fix should work",
    () => claims(fleet, `${leg.id}-a`),
    async () => {
      await eventually(
        "the session is sent the rule's reply",
        () => heardAfter(fleet, `${leg.id}-a`, REPLY),
        Boolean,
        90_000
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await shows(ruleRow().getByText(FIRED), "the rule saying it fired");
    }
  );

  await leg.step(
    "Edit the rule's name and reply, and save",
    async () => {
      await ruleRow().getByRole("link").first().click();
      await page.getByLabel("Rule name").fill(name);
      await page.getByLabel("Reply").fill(EDITED);
      await page.getByRole("button", { name: "Save changes" }).click();
    },
    async () => {
      await eventually(
        "the hub holds the new name and reply",
        async () => (await rulesOf(fleet)).find((one) => one.id === rule?.id),
        (one) => one?.name === name && one.reply === EDITED
      );
      rule = { ...(rule as RuleRow), name };
    }
  );

  await leg.step(
    "Another session says its fix should work",
    () => claims(fleet, `${leg.id}-b`),
    () =>
      eventually(
        "the session is sent the edited reply",
        () => heardAfter(fleet, `${leg.id}-b`, EDITED),
        Boolean,
        90_000
      )
  );

  await leg.step(
    "Delete the rule",
    async () => {
      await page.goto(`${base}/config/rules`, {
        waitUntil: "domcontentloaded",
      });
      await page.getByRole("button", { name: `More for ${name}` }).click();
      await page.getByRole("menuitem", { name: "Delete rule" }).click();
      await page.getByRole("button", { name: "Delete rule" }).click();
    },
    async () => {
      await eventually(
        "the hub no longer holds the rule",
        () => rulesOf(fleet),
        (all) => !all.some((one) => one.id === rule?.id)
      );
      await gone(
        page.getByText(name, { exact: true }),
        "the deleted rule's row"
      );
    }
  );

  await leg.step(
    "Undo the delete",
    async () => {
      const undo = page
        .getByRole("button", { name: UNDO })
        .filter({ visible: true });
      const offered = await undo
        .first()
        .waitFor({ timeout: 10_000 })
        .then(
          () => true,
          () => false
        );
      if (!offered) {
        unmet(
          "the page offered no Undo after the delete (JOURNEY Flow 5: “an undo affordance after the fact”)"
        );
      }
      await undo.first().click();
    },
    async () => {
      await eventually(
        "the hub holds the rule again",
        () => rulesOf(fleet),
        (all) => all.some((one) => one.name === name)
      );
      await shows(
        page.getByText(name, { exact: true }),
        "the rule's row again"
      );
    }
  );
}

/** Every rule the fleet holds, deleted: each leg starts on the empty page. */
async function clean(fleet: KitFleet): Promise<void> {
  for (const one of await rulesOf(fleet)) {
    // biome-ignore lint/performance/noAwaitInLoops: one delete at a time
    await fetch(`${fleet.base}/api/rules/${encodeURIComponent(one.id)}`, {
      method: "DELETE",
    });
  }
}

const journey: Journey = {
  name: "j10-rules",
  flow: "Flow 5: author or edit a rule",
  respond: (seen: Seen) => {
    if (!seen.tools) {
      return say("Claims");
    }
    if (seen.last.includes(REPLY) || seen.last.includes(EDITED)) {
      return say("Ran it: 3 passed, 0 failed.");
    }
    return seen.last.includes(CLAIM) ? say(CLAIMED) : say("Ready.");
  },
  clean,
  leg: walk,
};

export default journey;
