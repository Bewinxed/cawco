/**
 * The unlock step stays the person's through a refusal and its retry, at
 * every width: after "That password did not unlock the keychain." nothing is
 * drawn over its field, Cancel or Unlock (The Open Page Rule: a step in the
 * page is pressable where it stands), the retry's press lands, and the
 * machine's next answer replaces the refusal.
 *
 * Found live on a Mac (keychain-unlock): after a wrong password the retry's
 * press on Unlock landed on the detail area behind the machines card
 * (`.empty-detail` "intercepts pointer events"). The refusal came back
 * sooner than the form's fade out, so Svelte brought the same form back with
 * `crossOut`'s lift still on it: out of the flow (the card shrank above it)
 * and `pointer-events: none` (motion/curves `crossOut` now sets it down).
 *
 * The scratch fleet's agent cannot have a locked keychain (a workspace's
 * boundary denies the keychain, and Linux has none), and the hub takes the
 * machine's word on Claude from every beat, so the agent is stopped and the
 * machine's row is the hub's word forged in its database: `os` darwin and
 * `auth` `unreadable-credentials`, which is all the dashboard reads to offer
 * Unlock. The machine's answers are the agent's, said on the page's own
 * socket in the frames the hub relays them in (`frames` envelopes carrying a
 * `control_result`): the first press is refused in 40ms, sooner than the
 * form's fade, as a wrong password is; the retry is answered `authenticated`
 * a second later, as the agent's unlock and Claude's re-read take. Every read
 * waits for its own answer to have been said, never for an alert a leaving
 * view still holds.
 *
 *   bun scripts/probe-kit/run.ts web unlock-reachable
 */
import type { Page } from "playwright-core";
import { MACHINE, until } from "../../../scratch-fleet";
import type { Kit, Spec } from "../../kit";
import { open, settle } from "../../kit";

const MACHINES_BUTTON = /^\d+ machines?/;
const UNLOCK_ITEM = /^Unlock keychain/;
const HUB_SOCKET = /\/ws\//;
/** The agent's words for errSecAuthFailed (packages/agent auth.ts). */
const WRONG_PASSWORD = "That password did not unlock the keychain.";
/** Every width the step must stay pressable at: phone, tablet upright, tablet across, desk. */
const WIDTHS = [390, 768, 1024, 1600] as const;
const HEIGHT = 900;
/** Below this the machines are in the sidebar's sheet, not the glass's card (DRAWER_QUERY). */
const DRAWER_MAX = 899;
/** How soon each press is answered: a refusal inside the fade, then the unlock's re-read. */
const ANSWER_MS = [40, 1000] as const;

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

/**
 * The page's socket to the hub, with the machine's answers to
 * `unlockKeychain` said here: each press is answered in turn, a refusal
 * then `authenticated`. `answered(n)` settles once the n-th has been said.
 */
async function answerUnlocks(page: Page) {
  const said: (() => void)[] = [];
  const saidAt: Promise<void>[] = ANSWER_MS.map(
    (_ms, n) =>
      new Promise<void>((done) => {
        said[n] = done;
      })
  );
  let asked = 0;
  await page.routeWebSocket(HUB_SOCKET, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      const control = (() => {
        try {
          return JSON.parse(String(message)) as {
            verb?: string;
            requestId?: string;
            payload?: { method?: string };
          };
        } catch {
          return null;
        }
      })();
      if (
        control?.verb !== "control" ||
        control.payload?.method !== "unlockKeychain" ||
        !control.requestId
      ) {
        server.send(message);
        return;
      }
      const n = asked;
      asked += 1;
      const { requestId } = control;
      const refused = n === 0;
      setTimeout(() => {
        ws.send(
          JSON.stringify({
            verb: "frames",
            machineId: MACHINE,
            requestId,
            payload: refused
              ? {
                  kind: "control_result",
                  requestId,
                  ok: false,
                  error: WRONG_PASSWORD,
                }
              : {
                  kind: "control_result",
                  requestId,
                  ok: true,
                  result: "authenticated",
                },
          })
        );
        said[n]?.();
      }, ANSWER_MS[n] ?? ANSWER_MS[1]);
    });
    server.onMessage((message) => ws.send(message));
  });
  return { answered: (n: number) => saidAt[n] };
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
            el.classList.length > 0
              ? `.${Array.from(el.classList).slice(0, 3).join(".")}`
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
          const style = getComputedStyle(el.closest("form") ?? el);
          return [
            key,
            {
              ok: top !== null && (top === el || el.contains(top)),
              at: [Math.round(x), Math.round(y)],
              hit: name(top),
              form: `${style.position}/${style.pointerEvents}`,
            },
          ];
        })
      ) as Record<
        string,
        { ok: boolean; at: number[] | null; hit: string; form: string }
      >,
    };
  });

/** The step as the host's keychain-unlock reads it: its titles and its alert. */
const stepWords = (page: Page) =>
  page.evaluate(() => {
    const section = document.querySelector("section.unlock");
    return {
      titles: Array.from(
        section?.querySelectorAll('[id$="-title"]') ?? [],
        (title) => title.textContent?.replace(/\s+/g, " ").trim() ?? ""
      ),
      alert:
        section?.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
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
    // The hub takes the machine's word on Claude from every beat, so the
    // agent goes first; then the hub's word on it is a Mac with a locked
    // login keychain, which is all the dashboard reads to offer Unlock.
    await fleet.stop("agent");
    const row = await until(
      "the machine offline",
      () =>
        fetch(`${fleet.base}/api/agents`)
          .then((r) => r.json())
          .then(
            (rows: { machineId: string; status: string; hostname: string }[]) =>
              rows.find((one) => one.machineId === MACHINE)
          ),
      (found) => found !== undefined && found.status !== "online",
      60_000
    );
    fleet.write(
      "UPDATE agents SET os = 'darwin', auth = 'unreadable-credentials' WHERE machine_id = ?",
      MACHINE
    );
    const unlocked = `${row?.hostname ?? MACHINE} is unlocked`;
    const base = await fleet.dashboard();

    for (const width of WIDTHS) {
      // biome-ignore lint/performance/noAwaitInLoops: one width at a time, each on its own page
      const page = await kit.page("desk");
      await page.setViewportSize({ width, height: HEIGHT });
      const machine = await answerUnlocks(page);
      await open(page, base, "[data-needs-caw]");
      await openMachines(page, width);
      await page
        .locator(`li[data-machine="${MACHINE}"] .row`)
        .first()
        .click({ button: "right" });
      // The menu that opened from this machine's row (it holds "Copy machine
      // id"), read as keychain-unlock's `machineMenu` reads it.
      const menu = page
        .getByRole("menu")
        .filter({
          has: page.getByRole("menuitem", { name: "Copy machine id" }),
        })
        .first();
      const items = await menu
        .waitFor({ timeout: 10_000 })
        .then(() => menu.getByRole("menuitem").allTextContents())
        .catch(() => [] as string[]);
      const offer = menu.getByRole("menuitem", { name: UNLOCK_ITEM });
      const offered = items.some((item) => UNLOCK_ITEM.test(item.trim()));
      kit.check(
        `${width}px: the machine's own menu offers Unlock keychain…`,
        offered,
        JSON.stringify(items.map((item) => item.replace(/\s+/g, " ").trim()))
      );
      if (!offered) {
        await page.close();
        continue;
      }
      await offer.click();
      await page.locator("section.unlock").waitFor();
      await settle(page);
      // Unlock stands disabled (and lets the pointer through) until the
      // field holds a password, as the person meets it.
      const field = page.locator('section.unlock input[type="password"]');
      const press = page
        .locator("section.unlock")
        .getByRole("button", { name: "Unlock", exact: true });
      await field.fill("not-the-password");
      const before = await hits(page);
      kit.check(
        `${width}px: the step's field, Cancel and Unlock are pressable as it opens`,
        Object.values(before.controls).every((one) => one.ok),
        JSON.stringify(before)
      );

      await press.click();
      await machine.answered(0);
      await page
        .locator('section.unlock [role="alert"]')
        .filter({ hasText: WRONG_PASSWORD })
        .waitFor({ timeout: 10_000 });
      await settle(page);
      // The field is cleared as it is sent: the retry types again.
      await field.fill("the-password");
      const after = await hits(page);
      kit.check(
        `${width}px: after a refusal nothing covers the step's field, Cancel or Unlock (elementFromPoint at each centre; the form in the flow and pressable)`,
        after.alert === WRONG_PASSWORD &&
          Object.values(after.controls).every(
            (one) => one.ok && one.form === "static/auto"
          ),
        JSON.stringify(after)
      );

      // The retry: the press lands (a covered button times out here), and
      // the machine's answer replaces the refusal.
      const pressed = await press
        .click({ timeout: 10_000 })
        .then(() => "pressed")
        .catch((error: Error) => error.message.split("\n")[0]);
      kit.check(
        `${width}px: the retry's press on Unlock lands`,
        pressed === "pressed",
        pressed
      );
      if (pressed !== "pressed") {
        await page.close();
        continue;
      }
      await machine.answered(1);
      await page
        .locator("section.unlock")
        .getByText(unlocked, { exact: true })
        .waitFor({ timeout: 10_000 })
        .catch(() => undefined);
      await settle(page);
      const answered = await stepWords(page);
      kit.check(
        `${width}px: the retry's answer replaces the refusal: the step says "${unlocked}" and no alert`,
        answered.alert === null &&
          answered.titles.length === 1 &&
          answered.titles[0] === unlocked,
        JSON.stringify(answered)
      );
      await page.close();
    }
  },
};

export default spec;
