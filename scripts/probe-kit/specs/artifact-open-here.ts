/**
 * An artifact opens in the panel of the session it is opened in (the
 * orchestrator's live check of nightly 5450: a delegate's page, opened
 * from the delegate's conversation, came up "on a different session"): a
 * chip pressed in a conversation shows its artifact in that conversation's
 * panel, the one on screen, whichever session of the tree holds it; Files
 * shows a session's own in its own panel. On a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model, which writes
 * the links), in a project: a parent and its delegate, the delegate's link
 * seeded on the hub's own row (no workspace is cut, so the spec runs inside
 * one). Read from the page's DOM (the panel's frame and its heading, the
 * address on screen) at the desk.
 *
 * (a) In the delegate's conversation, the chip of a page the delegate
 *     handed to its parent (`to: "parent"`, the parent's to hold): pressed,
 *     the delegate's own panel shows it, the conversation on screen still
 *     the delegate's.
 * (b) The chip of the delegate's own page: its own panel, the same.
 * (c) The delegate's own page from its Files: its own panel.
 * (d) In the parent's conversation, the chip of the page its delegate
 *     handed it: the parent's panel, the conversation on screen the
 *     parent's.
 *
 *   bun scripts/probe-kit/run.ts artifact-open-here
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
const LINKS = "PROBE-LINKS";

const pageOf = (heading: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${heading}</title></head><body><h1>${heading}</h1><p>${heading}, as the panel shows it.</p></body></html>`;

/** What the model says to the next message naming {@link LINKS}: the links of the artifacts set here. */
let links = "";

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Probe title"] };
  }
  return {
    everyMs: 5,
    words: [request.last.includes(LINKS) ? `Here they are: ${links}.` : "ok"],
  };
};

/** The heading of the page the panel on screen shows; null while it shows none. */
const shown = (page: Page): Promise<string | null> =>
  page
    .frameLocator(`${PANE} iframe[title="Preview"]`)
    .locator("h1")
    .textContent({ timeout: 1000 })
    .catch(() => null);

const run = async (kit: Kit) => {
  const { check } = kit;
  const fleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const base = await fleet.dashboard();
  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`sh -c ${"git init -q -b main && echo here > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Open here",
    machineId: MACHINE,
    cwd: src,
  });
  const inProject = { projectId: project.id };
  const parent = await fleet.spawn("claude", "Parent", src, inProject);
  const delegate = await fleet.spawn("claude", "Delegate", src, inProject);
  // The delegate reports to the parent, as `delegate` writes its row.
  fleet.write(
    "UPDATE instances SET parent_instance_id = ? WHERE id = ?",
    parent,
    delegate
  );

  const create = (id: string, body: object) =>
    fleet.api<{ id: string }>(`/api/instances/${id}/artifacts`, body);
  /** The person's Close of `id`'s panel, as its head's Close sends it. */
  const close = async (id: string) => {
    await fetch(`${fleet.base}/api/instances/${id}/preview`, {
      method: "DELETE",
    });
  };
  const handed = await create(delegate, {
    kind: "page",
    does: "judge",
    ask: "Judge the handed page",
    name: "handed-page",
    html: pageOf("Handed"),
    to: "parent",
  });
  const own = await create(delegate, {
    kind: "page",
    does: "judge",
    ask: "Judge the delegate's own page",
    name: "own-page",
    html: pageOf("Own"),
  });
  const holders = fleet.query<{ id: string; instance_id: string }>(
    "SELECT id, instance_id FROM artifacts WHERE id IN (?, ?)",
    handed.id,
    own.id
  );
  check(
    "setup: the handed page is the parent's to hold, the own page the delegate's",
    holders.find((one) => one.id === handed.id)?.instance_id === parent &&
      holders.find((one) => one.id === own.id)?.instance_id === delegate,
    JSON.stringify(holders)
  );

  // The delegate's conversation on a desk, one tab of its own.
  const page = await kit.page("desk");
  await page.addInitScript(
    ([tab]) => {
      localStorage.setItem(
        "cawco-workspace",
        JSON.stringify({
          v: 1,
          root: { t: "l", id: "pone", tabs: [tab], active: tab, opened: null },
          focusedLeaf: "pone",
        })
      );
    },
    [delegate] as const
  );
  await open(page, `${base}/session/${delegate}`, '[data-slot="pane"]');
  links = `[handed-page](cawco:artifact/${handed.id}) and [own-page](cawco:artifact/${own.id})`;
  await fleet.send(delegate, `${LINKS}: name both pages.`);
  const chip = (id: string) =>
    page.locator(`[data-artifact-chip="${id}"]`).first();
  await chip(handed.id).waitFor({ timeout: 120_000 });
  await chip(own.id).waitFor({ timeout: 30_000 });

  /** Closes `session`'s panel, then `open` opens the page `heading` names: the heading the panel on screen shows, and the address. */
  const opens = async (
    session: string,
    heading: string,
    press: () => Promise<void>
  ) => {
    await close(session);
    await until(
      "the panel closed",
      () => page.locator(PANE).count(),
      (count) => count === 0,
      15_000
    ).catch(() => null);
    await press();
    const seen = await until(
      `${heading} in the panel on screen`,
      () => shown(page),
      (text) => text === heading,
      30_000
    ).catch(() => shown(page));
    return { seen, at: new URL(page.url()).pathname };
  };

  // (a) The handed page's chip, in the delegate's conversation.
  const a = await opens(delegate, "Handed", () => chip(handed.id).click());
  check(
    "(a) in the delegate's conversation, the chip of the page it handed its parent opens it in the delegate's own panel, the delegate's conversation still on screen",
    a.seen === "Handed" && a.at === `/session/${delegate}`,
    JSON.stringify(a)
  );

  // (b) Its own page's chip.
  const b = await opens(delegate, "Own", () => chip(own.id).click());
  check(
    "(b) the chip of the delegate's own page opens it in the delegate's own panel",
    b.seen === "Own" && b.at === `/session/${delegate}`,
    JSON.stringify(b)
  );

  // (c) Its own page from Files.
  const c = await opens(delegate, "Own", async () => {
    await page.locator("[data-files-control]").first().click();
    await page
      .locator(`[data-files-card][data-artifact="${own.id}"]`)
      .first()
      .click();
  });
  check(
    "(c) the delegate's own page, picked in its Files, opens in the delegate's own panel",
    c.seen === "Own" && c.at === `/session/${delegate}`,
    JSON.stringify(c)
  );

  // (d) The handed page's chip in the parent's conversation.
  await page.close();
  const top = await kit.page("desk");
  await top.addInitScript(
    ([tab]) => {
      localStorage.setItem(
        "cawco-workspace",
        JSON.stringify({
          v: 1,
          root: { t: "l", id: "pone", tabs: [tab], active: tab, opened: null },
          focusedLeaf: "pone",
        })
      );
    },
    [parent] as const
  );
  await open(top, `${base}/session/${parent}`, '[data-slot="pane"]');
  links = `[handed-page](cawco:artifact/${handed.id})`;
  await fleet.send(parent, `${LINKS}: name the handed page.`);
  const topChip = top.locator(`[data-artifact-chip="${handed.id}"]`).first();
  await topChip.waitFor({ timeout: 120_000 });
  await close(parent);
  await topChip.click();
  const d = {
    seen: await until(
      "Handed in the parent's panel",
      () => shown(top),
      (text) => text === "Handed",
      30_000
    ).catch(() => null),
    at: new URL(top.url()).pathname,
  };
  check(
    "(d) in the parent's conversation, the chip of the page its delegate handed it opens it in the parent's panel, the parent's conversation on screen",
    d.seen === "Handed" && d.at === `/session/${parent}`,
    JSON.stringify(d)
  );
  await top.close();
};

const spec: Spec = { name: "artifact-open-here", run };
export default spec;
