/**
 * Caw's sheet on a phone, in a project with no checkout on any machine (the
 * owner, 11-07, Safari on his iPhone, nightly 7120, in Private office: he
 * pasted a link into Caw's sheet and sent; the line "This project has no
 * checkout on a machine yet, so a conversation can't start…" stood over the
 * second suggestion card's words, and the composer over the third).
 *
 *   bun scripts/probe-kit/run.ts caw-no-checkout
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), the built dashboard, a project made with a name alone (its
 * folder on the hub, no checkout), Caw on Claude Code and the fleet's
 * Claude model, Accept edits the mode last chosen for Claude Code on the
 * machine, and this browser's New Session form last left on OpenCode with
 * its model, high effort and Plan; in WebKit at Playwright's iPhone 13
 * (390×664, the room Safari's toolbars leave; the kit's `phoneSafari`):
 *
 * 1. A failed start (the hub's answer for how it starts refused, its own
 *    words), after a long link was pasted into the field: its line stands
 *    over the field, and no suggestion card, as much of it as the hero
 *    shows, stands under the composer, that line included. Read with the
 *    hero at its top and scrolled to its end, and by the rendered checks.
 *    (Before: the hero kept room for the composer at rest only, so the
 *    grown field and the line stood over the cards.)
 * 2. The person's words sent from the hero start Caw's conversation: the
 *    project's row names a session, it runs where the hub says (its folder
 *    on the hub: caw.ts `startOf`), the model is asked with the words, and
 *    no line says it could not start. (Before 424837c17: the dashboard
 *    looked for a checkout of its own and refused.)
 * 3. It runs on the project's harness and model, in the mode the hub's one
 *    rule gives (the project's, else the one last chosen on the machine),
 *    never the New Session form's. (Before: OpenCode, the form's.)
 * 4. No page error.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { CAW_NO_MACHINE } from "../../../packages/core/src/project-conversation";
import type { ProjectStarter } from "../../../packages/core/src/starters";
import {
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { COMPOSER, type Kit, open, type Spec, settle } from "../kit";
import { RenderedChecks } from "../rendered-checks";

const SHEET = "[data-caw-float-sheet]";
const SEAT = '[data-slot="caw-seat"]';
const HERO = `${SHEET} [data-slot="conversation-hero"]`;
const FIELD = `${SHEET} [data-slot="composer-dock"] ${COMPOSER}`;
const SEND = `${SHEET} [data-slot="composer-dock"] button[data-slot="stop"]`;

/** The hub's refusal as the line says it: the sentence, its full stop given to the status after it. */
const REFUSED = CAW_NO_MACHINE.slice(0, -1);

/** What he pasted: a long link, the field grown to three lines round it at 390. */
const LINK =
  "https://x.com/_chenglou/status/2118857947140980945?a=Z26qEikLPKFQkG_VdNA&s=46";
/** What he sends in leg 2. */
const WORDS = `What does this mean for the office lease? ${LINK}`;

/** Private office's suggestions, as the hub writes a project's starters: words, glyph, one reason each. */
const STARTERS: ProjectStarter[] = [
  {
    text: "Find out why the “Monthly expiry pass” routine failed and fix it",
    glyph: "bug",
    reason: "This routine’s last run failed.",
    sources: [],
  },
  {
    text: "Walk me through what “Fix his public profiles to the record” needs from me",
    glyph: "brief",
    reason: "It waits on you in your call.",
    sources: [],
  },
  {
    text: "Draft the reply to the landlord about the March service charge",
    glyph: "reply",
    reason: "The landlord’s email has gone unanswered for nine days.",
    sources: [],
  },
  {
    text: "List what renews this quarter and what each one costs",
    glyph: "calendar",
    reason: "Three subscriptions renew before the end of December.",
    sources: [],
  },
];

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "Reading the link now." : "Office lease"],
});

const shot = async (kit: Kit, page: Page, name: string) => {
  const dir = join(kit.out, "shots");
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`) });
};

/**
 * The hero's cards, each as much of it as the hero's scroller shows, and the
 * composer's column (its field, attachments and the line over the field):
 * every pair that crosses by more than half a pixel, and the line's words.
 */
const layout = (page: Page) =>
  page.evaluate(
    ({ hero, sheet }) => {
      const scroller = document.querySelector(hero);
      const column = document.querySelector(
        `${sheet} [data-slot="composer-dock"] [data-slot="composer"]`
      );
      const line = document.querySelector(
        `${sheet} [data-slot="composer-dock"] [data-slot="send-error"]`
      );
      if (!(scroller && column)) {
        return null;
      }
      const room = scroller.getBoundingClientRect();
      const cut = (box: DOMRect) => ({
        top: Math.max(box.top, room.top),
        bottom: Math.min(box.bottom, room.bottom),
        left: Math.max(box.left, room.left),
        right: Math.min(box.right, room.right),
      });
      type Edges = ReturnType<typeof cut>;
      const crossing = (a: Edges, b: Edges) =>
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5 &&
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5;
      const over = column.getBoundingClientRect();
      const lineBox = line?.getBoundingClientRect();
      const cards = [...scroller.querySelectorAll('[data-slot="starter"]')]
        .map((card, at) => ({ at, box: cut(card.getBoundingClientRect()) }))
        .filter(({ box }) => box.bottom - box.top > 0.5);
      const crossed = cards
        .filter(({ box }) => crossing(box, over))
        .map(({ at, box }) => ({
          card: at,
          cardBox: [Math.round(box.top), Math.round(box.bottom)],
          composer: [Math.round(over.top), Math.round(over.bottom)],
          underLine: lineBox ? crossing(box, lineBox) : false,
        }));
      return {
        cards: scroller.querySelectorAll('[data-slot="starter"]').length,
        shown: cards.length,
        crossed,
        line: line?.textContent?.trim() ?? "",
        scrolls: scroller.scrollHeight > scroller.clientHeight + 1,
        composerTop: Math.round(over.top),
        heroBottom: Math.round(room.bottom),
      };
    },
    { hero: HERO, sheet: SHEET }
  );

/** Caw's sheet opened from his seat, pressed again until the page has hydrated and hears it. */
const openSheet = async (page: Page, at: string) => {
  await open(page, at, SEAT, 90_000);
  for (let tries = 0; tries < 10; tries += 1) {
    await page.waitForTimeout(1500);
    if ((await page.locator(HERO).filter({ visible: true }).count()) > 0) {
      return;
    }
    await page.locator(SEAT).first().click();
  }
  await page.waitForSelector(HERO, { timeout: 5000 });
};

const probe = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const base = await fleet.dashboard();
  const project = await fleet.api((hub) =>
    hub.api.projects.post({ name: "Private office" })
  );
  kit.check(
    "Private office is made with a name alone: no checkout on any machine",
    !!project.id && project.primaryPlaceId === null,
    JSON.stringify(project)
  );
  const at = `${base}/project/${project.id}`;
  // The mode he last chose for Claude Code on the machine, as his New
  // Session form writes it: the hub's rule starts Caw on it (caw.ts
  // `startOf`).
  fleet.write(
    "INSERT INTO chosen_modes (machine_id, harness, permission_mode, chosen_at) VALUES (?, 'claude', 'acceptEdits', ?)",
    MACHINE,
    Date.now()
  );
  // Caw on Claude Code and the fleet's Claude model: the project's choice.
  await fleet.api((hub) =>
    hub.api
      .projects({ id: project.id })
      .caw.patch({ harness: "claude", model: MODEL.claude })
  );

  const page = await kit.page("phoneSafari", {
    engine: "webkit",
    theme: "light",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // The New Session form last left on another harness, model, effort and
  // mode in this browser (spawnPrefs): none of it is Caw's.
  await page.addInitScript((model) => {
    localStorage.setItem(
      "cawco-spawn-prefs",
      JSON.stringify({
        harness: "opencode",
        model,
        effort: "high",
        permissionMode: "plan",
      })
    );
  }, MODEL.opencode);
  // His suggestions, as the hub would have written them for Private office.
  await page.route(`**/api/projects/${project.id}/stages`, async (route) => {
    const answer = await route.fetch();
    const body = (await answer.json()) as Record<string, unknown>;
    await route.fulfill({
      response: answer,
      json: { ...body, starters: STARTERS },
    });
  });
  // 1. A start that fails: the hub's own refusal for its place.
  const place = `**/api/projects/${project.id}/caw/place`;
  await page.route(place, (route) =>
    route.fulfill({
      status: 409,
      contentType: "text/plain",
      body: CAW_NO_MACHINE,
    })
  );
  await openSheet(page, at);
  await page.locator(`${HERO} [data-slot="starter"]`).first().waitFor({
    timeout: 30_000,
  });
  await settle(page, 800);
  await shot(kit, page, "1-hero");
  await page.locator(FIELD).click();
  await page.locator(FIELD).fill(LINK);
  await settle(page, 300);
  await page.locator(SEND).click();
  await page
    .locator(`${SHEET} [data-slot="send-error"]`)
    .waitFor({ timeout: 30_000 });
  await settle(page, 800);
  const house = new RenderedChecks(kit, "caw-no-checkout", { scope: SHEET });
  for (const end of ["top", "end"] as const) {
    await page.locator(HERO).evaluate((node, to) => {
      node.scrollTop = to === "top" ? 0 : node.scrollHeight;
    }, end);
    await settle(page, 500);
    await shot(kit, page, `2-failed-${end}`);
    const read = await layout(page);
    kit.check(
      `webkit 390×664, a failed start after a long link, the hero at its ${end}: its line says why over the field, and none of the ${read?.shown} card(s) the hero shows stands under the composer or that line`,
      !!read &&
        read.cards === STARTERS.length &&
        read.shown > 0 &&
        read.line.includes(REFUSED) &&
        read.crossed.length === 0 &&
        read.heroBottom <= read.composerTop,
      JSON.stringify(read)
    );
    await house.at(page, `failed start, hero at its ${end}`);
  }
  house.report();

  // 2. The words sent from the hero start his conversation.
  await page.unroute(place);
  await page.locator(FIELD).fill(WORDS);
  await settle(page, 300);
  await page.locator(SEND).click();
  const named = await until(
    "the project's conversation named",
    async () =>
      (await fleet.api((hub) => hub.api.projects({ id: project.id }).caw.get()))
        .instanceId,
    Boolean,
    90_000
  ).catch(() => null);
  await settle(page, 1500);
  await shot(kit, page, "3-sent");
  const refused = await page
    .locator(`${SHEET} [data-slot="send-error"]`)
    .allTextContents();
  const where = await fleet
    .api((hub) => hub.api.projects({ id: project.id }).caw.place.post())
    .catch(() => null);
  const session = named
    ? fleet.query<{
        cwd: string;
        harness: string;
        model: string | null;
        permission_mode: string | null;
        project_id: string | null;
      }>(
        "SELECT cwd, harness, model, permission_mode, project_id FROM instances WHERE id = ?",
        named
      )[0]
    : undefined;
  kit.check(
    `webkit 390×664: the words sent from the hero start Caw's conversation, in the place the hub names (${where?.cwd}), with no line saying it could not start`,
    !!session &&
      !!where &&
      session.cwd === where.cwd &&
      session.project_id === project.id &&
      refused.every((one) => one.trim() === ""),
    JSON.stringify({ named, session, where, refused })
  );
  kit.check(
    `his conversation runs on the project's harness and model (claude, ${MODEL.claude}), not the New Session form's (opencode, ${MODEL.opencode}), in the mode last chosen on the machine (acceptEdits)`,
    !!session &&
      session.harness === "claude" &&
      session.model === MODEL.claude &&
      session.permission_mode === "acceptEdits",
    JSON.stringify(session)
  );
  await until(
    "the model asked with his words",
    () => fleet.seen.some((one) => one.all.includes(LINK)) || undefined,
    Boolean,
    60_000
  ).catch(() => undefined);
  kit.check(
    "his words reach the model as the conversation's first message",
    fleet.seen.some((one) => one.all.includes(LINK))
  );
  kit.check(
    "no page error",
    errors.length === 0,
    errors.slice(0, 6).join(" | ")
  );
  await page.close();
};

const spec: Spec = {
  group: "iPhone Safari",
  name: "caw-no-checkout",
  run: probe,
};
export default spec;
