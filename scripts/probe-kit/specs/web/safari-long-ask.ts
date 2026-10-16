/**
 * A permission for a long Bash command, raised by a session on a scratch
 * fleet and answered on the phone, in WebKit at an iPhone 15 Pro's size
 * (393×852, touch, 3x). The owner's report: "this caused the mobile safari
 * to stop responding and it didn't even show", on a card whose command ran
 * to some 1,200 characters (`while read`, `$(…)`, quotes, pipes) under the
 * description "Slim the exports to text and file lists", with `timeout
 * 300000` among its fields.
 *
 * It hung there (Playwright WebKit 2359): the composer grew into the card,
 * its parts came up out of a transitioning blur (Prompt `.part`), and the
 * web process stopped answering until it was killed some 20s later. WebKit
 * 2370 has the bug fixed and the owner's Safari does not, so this runs on
 * 2359 (kit `PINNED_WEBKIT`).
 *
 * Read twice: once as WebKit hands the page its storage, once with the
 * storage refused (`localStorage` and `sessionStorage` answering null, as
 * WebKit's do for a window it no longer displays in its frame,
 * LocalDOMWindow::sessionStorage). Each time:
 *
 *  - the page answers a script within a second the whole way: a turn of
 *    words, the ask arriving, its command opened whole, Approve;
 *  - the composer grows into the ask's card, its heading the command's
 *    description, its command and its `timeout` field drawn, Approve and
 *    Deny in hand;
 *  - the whole command opens;
 *  - Approve settles it: the hub holds no ask and the card folds;
 *  - nothing reaches the page's error or unhandled-rejection reporters.
 */
import { type Reply, type Seen, until } from "../../../scratch-fleet";
import { answering, settled } from "../../answering";
import {
  type Kit,
  type KitFleet,
  open,
  PINNED_WEBKIT,
  type Spec,
} from "../../kit";

const ASK = "PROBE-LONG-ASK";
const DESCRIPTION = "Slim the exports to text and file lists";

/**
 * The owner's command's shape: a subshell, `while read` loops, command
 * substitutions, quotes and pipes, some 1,000 characters. It starts in a
 * folder the scratch fleet has not got, so approved it does nothing.
 */
const COMMAND = [
  'O=~/.cache/cawco-orchestrator/lost-scan; ( cd ~/.worktrees/backlot-assistant && mkdir -p "$O/exports" &&',
  "git ls-files -z -- 'exports/**' | tr '\\0' '\\n' | while read -r f; do",
  'kind=$(file -b --mime-type "$f" | cut -d/ -f1); size=$(wc -c < "$f" | tr -d " ");',
  'if [ "$kind" = "text" ]; then printf "%s\\t%s\\t%s\\n" "$f" "$kind" "$size" >> "$O/exports/text.tsv";',
  'else printf "%s\\t%s\\n" "$f" "$size" >> "$O/exports/files.tsv"; fi; done;',
  'for list in "$O/exports/text.tsv" "$O/exports/files.tsv"; do [ -f "$list" ] && sort -t "$(printf \'\\t\')" -k1,1 -u "$list" -o "$list"; done;',
  'echo "text: $(wc -l < "$O/exports/text.tsv" 2>/dev/null || echo 0) files: $(wc -l < "$O/exports/files.tsv" 2>/dev/null || echo 0)";',
  'git log --since="14 days ago" --name-only --pretty=format: -- exports | sort -u | grep -v "^$" | while read -r gone; do',
  '[ -e "$gone" ] || echo "lost: $gone ($(git log -1 --format=%h --diff-filter=D -- "$gone"))"; done | tee "$O/exports/lost.txt" | head -n 40;',
  'du -sh "$O/exports" | cut -f1 | xargs -I{} echo "kept {} in $O/exports" )',
].join(" ");

/** A turn that asks to run the long command; every other one, a word. */
const respond = (request: Seen): Reply =>
  request.tools && request.last.includes(ASK) && !request.afterTool
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "Bash",
          input: {
            command: COMMAND,
            description: DESCRIPTION,
            timeout: 300_000,
          },
        },
      }
    : { everyMs: 5, words: ["ok"] };

/** Every error the page's own reporters hear, as its handlers do (hooks.client.ts). */
function hearErrors(): void {
  const heard: string[] = [];
  (window as unknown as { __heard: string[] }).__heard = heard;
  addEventListener("error", (event: ErrorEvent) => {
    heard.push(`error: ${event.message}`);
  });
  addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const reason = event.reason as { message?: string } | undefined;
    heard.push(`rejection: ${reason?.message ?? String(event.reason)}`);
  });
}

/**
 * Storage refused, as WebKit refuses it to a window it no longer displays
 * in its frame: both properties answer null.
 */
function refuseStorage(): void {
  for (const name of ["localStorage", "sessionStorage"]) {
    Object.defineProperty(window, name, {
      configurable: true,
      get: () => null,
    });
  }
}

/** What the composer's ask card says, read from the DOM. */
const cardState = () => {
  const card = document.querySelector(".ask");
  const box = card?.getBoundingClientRect();
  return {
    drawn: Boolean(card && box && box.height > 0),
    text: card?.textContent?.replace(/\s+/g, " ").trim().slice(0, 300) ?? "",
    command: card?.querySelector(".cmd-text")?.textContent?.length ?? 0,
    fields: [...(card?.querySelectorAll(".field") ?? [])].map(
      (field) => field.textContent?.replace(/\s+/g, " ").trim() ?? ""
    ),
    // A button's label and its pending wording stand in one cell
    // ("ApproveApproving…"): read by how it starts.
    buttons: [...(card?.querySelectorAll("button") ?? [])].map(
      (button) => button.textContent?.replace(/\s+/g, " ").trim() ?? ""
    ),
  };
};

async function leg(
  kit: Kit,
  fleet: KitFleet,
  base: string,
  label: string,
  storage: boolean
) {
  const id = await fleet.spawn(
    "claude",
    `Probe long ask, ${label}`,
    fleet.workdir,
    { permissionMode: "default" }
  );
  const page = await kit.page("iphone15Pro", {
    engine: "webkit",
    webkit: PINNED_WEBKIT,
    scale: 3,
    init: storage ? [hearErrors] : [hearErrors, refuseStorage],
  });
  page.setDefaultTimeout(60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  await open(page, `${base}/session/${id}`, "textarea", 90_000);

  const words = await answering(page, async () => {
    await fleet.send(id, "hello");
    await until(
      "the first turn ended",
      () => fleet.instance(id),
      (row) => row?.turn_open_at === null,
      120_000
    );
  });
  kit.check(
    `${label}: the page answers within a second through a turn of words`,
    words.longest < 1000,
    `longest ${Math.round(words.longest)}ms`
  );

  const shown = await answering(page, async () => {
    await fleet.send(id, `${ASK} slim the exports`);
    return settled(
      page
        .locator(".ask button", { hasText: "Approve" })
        .waitFor({ timeout: 120_000 })
    );
  });
  kit.check(
    `${label}: the page answers within a second while the ask arrives`,
    shown.longest < 1000,
    `longest ${Math.round(shown.longest)}ms`
  );
  // The parts come up one after the other once the shape stands.
  await page.waitForTimeout(1000);
  const card = await page.evaluate(cardState);
  kit.check(
    `${label}: the composer grows into the ask, its heading the command's description, the command and timeout drawn, Approve and Deny in hand`,
    card.drawn &&
      card.text.includes(DESCRIPTION) &&
      card.command > 0 &&
      card.fields.some((field) => field.includes("300000")) &&
      card.buttons.some((text) => text.startsWith("Approve")) &&
      card.buttons.some((text) => text.startsWith("Deny")),
    JSON.stringify(card)
  );

  const opened = await answering(page, async () => {
    await page.locator(".ask .cmd-toggle").tap();
    await page.waitForTimeout(600);
    return page.evaluate(
      () => document.querySelector(".ask .cmd-text")?.textContent?.length ?? 0
    );
  });
  kit.check(
    `${label}: the whole command opens, the page answering within a second`,
    opened.result === COMMAND.length && opened.longest < 1000,
    `${opened.result} of ${COMMAND.length} characters, longest ${Math.round(opened.longest)}ms`
  );

  const approved = await answering(page, async () => {
    await page.locator(".ask button", { hasText: "Approve" }).tap();
    const answered = await settled(
      until(
        "the hub holds no ask",
        () =>
          fleet.query<{ n: number }>(
            "SELECT COUNT(*) AS n FROM parked_asks WHERE instance_id = ?",
            id
          )[0]?.n ?? 0,
        (n) => n === 0,
        60_000
      )
    );
    const folded = await settled(
      page.waitForFunction(() => !document.querySelector(".ask"), null, {
        timeout: 30_000,
      })
    );
    return { answered, folded };
  });
  kit.check(
    `${label}: Approve settles it: the hub holds no ask, the card folds, the page answering within a second`,
    approved.result.answered &&
      approved.result.folded &&
      approved.longest < 1000,
    `${JSON.stringify(approved.result)}, longest ${Math.round(approved.longest)}ms`
  );
  const heard = await page
    .evaluate(() => (window as unknown as { __heard: string[] }).__heard)
    .catch(() => ["the page is gone"]);
  kit.check(
    `${label}: no page error, nothing at the page's reporters`,
    pageErrors.length === 0 && heard.length === 0,
    JSON.stringify({ pageErrors, heard })
  );
  await page.close();
}

const spec: Spec = {
  name: "safari-long-ask",
  run: async (kit) => {
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
    await leg(kit, fleet, base, "storage given", true);
    await leg(kit, fleet, base, "storage refused", false);
  },
};
export default spec;
