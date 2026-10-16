/**
 * J2, triage a blocked session (JOURNEY.md Flows 2 and 3; the phone size is
 * Flow 3's remote approval): a session asks for a Bash permission, the
 * person opens it from what needs them and answers it.
 *
 *  - Approve: the ask resolves in place, the machine runs the command, and
 *    the session resumes (the hub reads the turn going on).
 *  - Deny: the ask resolves in place, nothing runs, and the session says it
 *    held back.
 *  - Answered elsewhere (through the hub's API, as the phone app answers)
 *    while the page is open: the card shows the answer that won, never a
 *    stale answer row (Flow 2's error state: “the answer row resolves to
 *    the answer that won, naming where it came from”).
 */
import { existsSync } from "node:fs";
import type { Seen } from "../../scratch-fleet";
import {
  answerThroughHub,
  asking,
  commandFor,
  HELD_BACK,
  markFile,
  type Parked,
  pendingAsks,
  RAN,
  resumed,
  sessionAsking,
} from "./asks";
import { askCard, caw, cawSays, ONE_NEEDS, ZERO } from "./j1-check-in";
import {
  eventually,
  expect,
  gone,
  type Journey,
  type Leg,
  shows,
} from "./suite";

/** The page saying an ask was approved: the answer that won. */
const APPROVED = /approved|allowed/i;

/** Opens the dashboard, what needs you, and the session's ask: Flow 1's exit into triage. */
async function openTheAsk(
  leg: Leg,
  id: string,
  title: string,
  token: string
): Promise<void> {
  const { page, base } = leg;
  await leg.step(
    "Open the dashboard",
    () => page.goto(base, { waitUntil: "domcontentloaded" }),
    () =>
      eventually(
        "Caw's head says one needs you",
        () => cawSays(page),
        (said) => ONE_NEEDS.test(said)
      )
  );
  await leg.step(
    "Open what needs you",
    () => caw(page).click(),
    () =>
      shows(
        page.getByLabel(`Open ${title}`, { exact: true }),
        `the ask's row, “Open ${title}”`
      )
  );
  await leg.step(
    "Open the session's ask",
    () => page.getByLabel(`Open ${title}`, { exact: true }).first().click(),
    async () => {
      await eventually(
        "the session's page is open",
        () => new URL(page.url()).pathname,
        (path) => path === `/session/${id}`
      );
      await shows(askCard(page), "the session's permission request");
      await shows(
        askCard(page).getByText(commandFor(token), { exact: false }),
        "the command the session asks to run"
      );
    }
  );
}

/** The ask is settled on the hub and the page: nothing left to answer, the count at zero. */
async function settled(leg: Leg): Promise<void> {
  await eventually(
    "the hub holds no ask",
    () => pendingAsks(leg.fleet),
    (asks) => asks.length === 0
  );
  await gone(askCard(leg.page), "the permission request");
  await eventually(
    "Caw's head says all caught up",
    () => cawSays(leg.page),
    (said) => said.startsWith(ZERO)
  );
}

/**
 * An approved command ran and the session resumed: the hub read the turn
 * going on with the command's result, the machine holds the file it wrote,
 * and the page shows the session carrying on.
 */
async function carriedOn(leg: Leg, token: string): Promise<void> {
  await eventually(
    "the session's turn went on with the command's result",
    () => resumed(leg.fleet, token),
    Boolean
  );
  expect(
    "the machine ran the command",
    existsSync(markFile(leg.fleet, token)),
    `no ${markFile(leg.fleet, token)}`
  );
  await shows(leg.page.getByText(RAN), `the session carrying on (“${RAN}”)`);
}

async function walk(leg: Leg): Promise<void> {
  const { fleet, page } = leg;

  // ── Approve ──────────────────────────────────────────────────────────
  const approveToken = `${leg.id}-j2a`;
  const approveTitle = leg.title("Ship the invoice export");
  const approved = await sessionAsking(fleet, approveTitle, approveToken);
  await openTheAsk(leg, approved.id, approveTitle, approveToken);
  await leg.step(
    "Approve",
    () => askCard(page).getByRole("button", { name: "Approve" }).click(),
    async () => {
      await settled(leg);
      await carriedOn(leg, approveToken);
    }
  );

  // ── Deny ─────────────────────────────────────────────────────────────
  const denyToken = `${leg.id}-j2d`;
  const denyTitle = leg.title("Rotate the staging keys");
  const denied = await sessionAsking(fleet, denyTitle, denyToken);
  await openTheAsk(leg, denied.id, denyTitle, denyToken);
  await leg.step(
    "Deny",
    () => askCard(page).getByRole("button", { name: "Deny" }).click(),
    async () => {
      await settled(leg);
      await eventually(
        "the session's turn went on with the denial",
        () => resumed(fleet, denyToken),
        Boolean
      );
      expect(
        "the machine never ran the command",
        !existsSync(markFile(fleet, denyToken)),
        `${markFile(fleet, denyToken)} exists`
      );
      await shows(
        page.getByText(HELD_BACK),
        `the session holding back (“${HELD_BACK}”)`
      );
    }
  );

  // ── Answered elsewhere ───────────────────────────────────────────────
  const elsewhereToken = `${leg.id}-j2e`;
  const elsewhereTitle = leg.title("Prune the old backups");
  const elsewhere = await sessionAsking(fleet, elsewhereTitle, elsewhereToken);
  await openTheAsk(leg, elsewhere.id, elsewhereTitle, elsewhereToken);
  await leg.step(
    "Another device approves the ask while the page is open",
    () => answerThroughHub(fleet, elsewhere.parked as Parked, "allow"),
    async () => {
      await settled(leg);
      await carriedOn(leg, elsewhereToken);
      await shows(
        page.getByText(APPROVED),
        "the answer that won (approved), where the ask stood"
      );
    }
  );
}

const journey: Journey = {
  name: "j2-triage",
  flow: "Flows 2 and 3: triage a blocked session, on the desk and on a phone",
  respond: (seen: Seen) =>
    asking(seen, () => ({ everyMs: 20, words: ["Ready."] })),
  leg: walk,
};

export default journey;
