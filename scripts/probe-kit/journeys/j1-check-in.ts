/**
 * J1, check-in and wind-down (JOURNEY.md Flow 1): is anything blocked right
 * now, answered without opening a session to trust the answer.
 *
 *  - With one session asking, Caw's head (the needs-you count, in the bar
 *    on every page) says one needs you, and opening what needs you leads to
 *    that session's ask.
 *  - Once it is answered, the zero state: Caw says all caught up.
 *  - The hub stopped: the board never shows a zero needs-you count while
 *    disconnected (Flow 1's load-bearing rule: “a false zero is exactly the
 *    anxiety force”), and says all caught up again once the hub is back.
 */
import { existsSync } from "node:fs";
import type { Page } from "playwright-core";
import { MACHINE, type Seen } from "../../scratch-fleet";
import type { KitFleet } from "../kit";
import {
  asking,
  commandFor,
  markFile,
  type Parked,
  pendingAsks,
  RAN,
  resumed,
  sessionAsking,
} from "./asks";
import {
  eventually,
  expect,
  gone,
  type Journey,
  type Leg,
  shows,
} from "./suite";

/** Every word Caw's head says of what needs you (NeedsCaw.svelte's label). */
export const CAW_SAYS =
  /^(Needs you, \d+|All caught up|Reading the fleet|Connecting…|Hub unreachable)/;
export const ZERO = "All caught up";
/** Caw's head saying one thing needs you. */
export const ONE_NEEDS = /^Needs you, 1(\D|$)/;
/** Caw's head counting zero as a number: a zero by another name. */
const ZERO_NEEDS = /^Needs you, 0(\D|$)/;
/** A session's ask, by its card's name (Prompt.svelte). */
const ASK_CARD = /^Permission request from/;

/** Caw's head: the needs-you count. */
export const caw = (page: Page) =>
  page.getByRole("button", { name: CAW_SAYS }).first();

/** What Caw's head says now. */
export const cawSays = async (page: Page): Promise<string> =>
  (await caw(page).getAttribute("aria-label", { timeout: 5000 })) ?? "";

/** A session's ask, as its pane draws it over the composer. */
export const askCard = (page: Page) =>
  page.getByRole("region", { name: ASK_CARD });

/** The machine is back on the hub, online with custody. */
export const machineOnline = (fleet: KitFleet) =>
  eventually(
    "the machine online on the hub again",
    () => fleet.api<{ machineId: string; status: string }[]>("/api/agents"),
    (rows) =>
      rows.some((row) => row.machineId === MACHINE && row.status === "online"),
    120_000
  );

/** How long the page has, once the hub is gone, to stop saying all caught up. */
const NOTICE_MS = 5000;
/** How long the page is watched with the hub down. */
const WATCH_MS = 10_000;

async function walk(leg: Leg): Promise<void> {
  const { fleet, page, base } = leg;
  const token = `${leg.id}-j1`;
  const title = leg.title("Tidy the release notes");
  let id = "";
  let parked: Parked | undefined;

  await leg.step(
    "A session asks to run a command; open the dashboard",
    async () => {
      ({ id, parked } = await sessionAsking(fleet, title, token));
      await page.goto(base, { waitUntil: "domcontentloaded" });
    },
    async () => {
      const asks = await pendingAsks(fleet);
      expect(
        "the hub holds exactly that one ask",
        asks.length === 1 && asks[0]?.requestId === parked?.requestId,
        asks.map((one) => `${one.toolName} on ${one.instanceId}`)
      );
      await eventually(
        "Caw's head says one needs you",
        () => cawSays(page),
        (said) => ONE_NEEDS.test(said)
      );
    }
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
    "Review the session's ask",
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

  await leg.step(
    "Approve",
    () => askCard(page).getByRole("button", { name: "Approve" }).click(),
    async () => {
      await eventually(
        "the hub holds no ask",
        () => pendingAsks(fleet),
        (asks) => asks.length === 0
      );
      await eventually(
        "the session's turn went on",
        () => resumed(fleet, token),
        Boolean
      );
      expect(
        "the machine ran the command",
        existsSync(markFile(fleet, token)),
        `no ${markFile(fleet, token)}`
      );
      await gone(askCard(page), "the permission request");
      await shows(page.getByText(RAN), `the session carrying on (“${RAN}”)`);
      await eventually(
        "Caw's head says all caught up",
        () => cawSays(page),
        (said) => said.startsWith(ZERO)
      );
    }
  );

  // The page is watched from the moment the hub goes: every word Caw's head
  // says, with when.
  const heard: { at: number; said: string }[] = [];
  await leg.step(
    "The hub stops",
    async () => {
      await fleet.stop("hub");
      const stopped = Date.now();
      while (Date.now() - stopped < WATCH_MS) {
        // biome-ignore lint/performance/noAwaitInLoops: one reading every 200ms, in order
        const said = await cawSays(page).catch(() => "(no needs-you count)");
        heard.push({ at: Date.now() - stopped, said });
        await Bun.sleep(200);
      }
    },
    () => {
      const noticed = heard.findIndex((one) => !one.said.startsWith(ZERO));
      const after = noticed === -1 ? [] : heard.slice(noticed);
      const falseZero = after.find(
        (one) => one.said.startsWith(ZERO) || ZERO_NEEDS.test(one.said)
      );
      const timeline = [...new Set(heard.map((one) => one.said))].join(" → ");
      expect(
        `within ${NOTICE_MS / 1000}s of the hub stopping, Caw's head stops claiming zero, and never claims it again while the hub is down`,
        noticed !== -1 &&
          (heard[noticed]?.at ?? Number.POSITIVE_INFINITY) <= NOTICE_MS &&
          falseZero === undefined,
        `first changed at ${noticed === -1 ? "never" : `${heard[noticed]?.at}ms`}; said ${timeline}${falseZero ? `; claimed zero again at ${falseZero.at}ms` : ""}`
      );
      return Promise.resolve();
    },
    { hubDown: true }
  );

  await leg.step(
    "The hub comes back",
    async () => {
      fleet.launch("hub");
      await fleet.hubUp();
      await machineOnline(fleet);
    },
    () =>
      eventually(
        "Caw's head says all caught up again",
        () => cawSays(page),
        (said) => said.startsWith(ZERO),
        90_000
      ),
    { hubDown: true }
  );
}

const journey: Journey = {
  name: "j1-check-in",
  flow: "Flow 1: fleet check-in and wind-down",
  respond: (seen: Seen) =>
    asking(seen, () => ({ everyMs: 20, words: ["Ready."] })),
  leg: walk,
};

export default journey;
