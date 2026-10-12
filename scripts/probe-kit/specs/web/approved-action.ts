/**
 * An approved action's card in Caw's panel (Needs you), on the built
 * dashboard against a scratch fleet holding three actions: one proposed (its
 * arguments long enough to scroll), one whose call may or may not have
 * happened, and one the service refused. On the desk (1440) and the phone
 * (390), light and dark, read from the engine (rule 7: geometry and computed
 * styles, no pixels):
 *  - all three stand as rows of the panel, one lead column, one text column;
 *  - the proposed one: its reason, then Runs, Through and Tool, then the
 *    arguments exactly as the hub will send them, pretty-printed, in a well
 *    that scrolls (overflow auto, 12rem tall at most) on the text column,
 *    never past the row; Deny then Approve as the permission card's peers,
 *    Approve in the done pair and Deny in the fail pair, one height, ending
 *    on the text column's trailing edge;
 *  - the unknown one: says it may or may not have happened and to check the
 *    service, with Remove and no Approve;
 *  - the failed one: says it failed, in the service's words, with Remove
 *    and no Approve;
 *  - the list never scrolls sideways.
 * Then, desk light: Approve sends the hash the hub gave, the hub files it
 * approved, and the row leaves.
 */
import type { Page } from "playwright-core";
import { MACHINE, type Seen, until } from "../../../scratch-fleet";
import {
  type Kit,
  type KitFleet,
  open,
  type Spec,
  THEMES,
  type View,
} from "../../kit";

const respond = (_request: Seen) => ({ everyMs: 5, words: ["ok"] });
/** A failed action's error, as actions.ts files a service's refusal. */
const SERVICE_SAID_PREFIX = "X answered that it failed: ";
const SERVICE_SAID = "rate limited: try in an hour";
const ROWS = 3;

const ARGS = JSON.stringify({
  text: "Launch day: Caw&Co now runs approved actions once, at their time, and never through a model.",
  tags: ["launch", "p3", "approved-actions"],
  media: Array.from({ length: 8 }, (_, i) => ({
    url: `https://cdn.example.test/launch/${i}.png`,
    alt: `Frame ${i} of the launch reel`,
  })),
});

/** The project, and three actions filed as the hub files them. */
async function stage(fleet: KitFleet) {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Launch",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  // The connection the actions name: an approval checks it still signs in
  // as the account shown. Nothing listens at its address: nothing is called.
  await fleet.api("/api/connections", {
    name: "x-brand",
    service: "X",
    account: "@cawco",
    transport: "http",
    url: "http://127.0.0.1:9/mcp",
    auth: "none",
  });
  const now = Date.now();
  const file = (
    state: "proposed" | "unknown" | "failed",
    args: string,
    extra: { error?: string; runAt?: number; startedAt?: number }
  ) => {
    const id = crypto.randomUUID();
    fleet.write(
      "INSERT INTO actions (id, project_id, task_id, connection, service, account, tool, args, args_hash, run_at, reason, proposed_by, state, idempotency_key, started_at, ended_at, error, created_at) VALUES (?, ?, NULL, 'x-brand', 'X', '@cawco', 'post', ?, ?, ?, ?, 'probe-session', ?, ?, ?, ?, ?, ?)",
      id,
      project.id,
      args,
      new Bun.CryptoHasher("sha256").update(args).digest("hex"),
      extra.runAt ?? null,
      "The launch post, at the slot the calendar holds for it.",
      state,
      `cawco-action-${id}`,
      extra.startedAt ?? null,
      extra.startedAt ?? null,
      extra.error ?? null,
      now - (state === "proposed" ? 30_000 : 60_000)
    );
    return id;
  };
  file("failed", JSON.stringify({ text: "Refused" }), {
    startedAt: now - 45_000,
    error: `${SERVICE_SAID_PREFIX}${SERVICE_SAID}`,
  });
  const proposed = file("proposed", ARGS, { runAt: now + 2 * 3_600_000 });
  const unknown = file("unknown", JSON.stringify({ text: "Held" }), {
    startedAt: now - 60_000,
    error:
      "The hub stopped while its call to X was under way: this may or may not have happened. Check X.",
  });
  return { proposed, unknown };
}

/** Opens Caw's panel and waits for every action row. */
async function openPanel(page: Page, base: string) {
  await open(page, base, "[data-needs-caw]");
  await page.click("[data-needs-caw]");
  await page.waitForSelector(".caw-pop[data-shown] .list", { timeout: 30_000 });
  await page.waitForFunction(
    (rows) =>
      document.querySelectorAll('.caw-pop .row[data-kind="action"]').length ===
      rows,
    ROWS,
    { timeout: 30_000 }
  );
  await page.waitForTimeout(900);
}

/** The two rows as the engine lays them out. */
const layoutOf = () => {
  const pop = document.querySelector(".caw-pop") as HTMLElement;
  const rows = [
    ...pop.querySelectorAll<HTMLElement>('.row[data-kind="action"]'),
  ];
  const rect = (el: Element | null | undefined) => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  };
  const swatch = (token: string) => {
    const el = document.createElement("div");
    el.style.background = `var(${token})`;
    pop.append(el);
    const fill = getComputedStyle(el).backgroundColor;
    el.remove();
    return fill;
  };
  const list = pop.querySelector(".list") as HTMLElement;
  return {
    done: swatch("--status-done-bg"),
    fail: swatch("--status-fail-bg"),
    sideways: list.scrollWidth - list.clientWidth,
    rows: rows.map((row) => {
      const args = row.querySelector<HTMLElement>(".args");
      const style = args ? getComputedStyle(args) : null;
      const deny = row.querySelector(".peers .deny");
      const approve = row.querySelector(".peers .approve");
      return {
        row: rect(row),
        name: rect(row.querySelector(".name")),
        want: rect(row.querySelector(".want")),
        wantText: row.querySelector(".want")?.textContent?.trim() ?? "",
        terms: [...row.querySelectorAll(".call dt")].map((e) =>
          e.textContent?.trim()
        ),
        tool: row.querySelector(".call .tool")?.textContent?.trim(),
        args: rect(args),
        argsText: args?.textContent ?? "",
        overflow: style?.overflowY,
        maxHeight: style?.maxHeight,
        scrolls: args ? args.scrollHeight > args.clientHeight : false,
        argsHeight: args?.getBoundingClientRect().height ?? 0,
        buttons: [...row.querySelectorAll(".peers button")].map((e) =>
          e.textContent?.trim()
        ),
        peers: rect(row.querySelector(".peers button:last-of-type")),
        deny: deny
          ? {
              fill: getComputedStyle(deny).backgroundColor,
              height: deny.getBoundingClientRect().height,
            }
          : null,
        approve: approve
          ? {
              fill: getComputedStyle(approve).backgroundColor,
              height: approve.getBoundingClientRect().height,
            }
          : null,
      };
    }),
  };
};

const near = (a: number | undefined, b: number | undefined, by = 1) =>
  a !== undefined && b !== undefined && Math.abs(a - b) <= by;

type Layout = ReturnType<typeof layoutOf>;

/** One width and theme's rows, checked. */
function checkWidth(kit: Kit, read: Layout, at: string, pretty: string) {
  const proposed = read.rows.find((row) => row.argsText.length > 200);
  const unknown = read.rows.find((row) =>
    row.wantText.includes("may or may not")
  );
  const refused = read.rows.find((row) =>
    row.wantText.startsWith("It failed.")
  );
  kit.check(
    `three action rows: the proposed, the unknown and the failed (${at})`,
    read.rows.length === ROWS && Boolean(proposed && unknown && refused),
    `${read.rows.length} rows`
  );
  if (!(proposed && unknown && refused)) {
    return;
  }
  kit.check(
    `the call: Runs, Through, Tool, and the arguments as sent (${at})`,
    JSON.stringify(proposed.terms) ===
      JSON.stringify(["Runs", "Through", "Tool"]) &&
      proposed.tool === "post" &&
      proposed.argsText === pretty,
    `${proposed.terms.join(", ")}; tool ${proposed.tool}; args ${proposed.argsText.length} chars`
  );
  kit.check(
    `the arguments' well scrolls, 12rem at most, on the text column (${at})`,
    proposed.overflow === "auto" &&
      proposed.maxHeight === "192px" &&
      proposed.scrolls &&
      proposed.argsHeight <= 192.5 &&
      near(proposed.args?.left, proposed.want?.left) &&
      near(proposed.args?.right, proposed.want?.right) &&
      (proposed.args?.right ?? 0) <= (proposed.row?.right ?? 0),
    JSON.stringify({
      overflow: proposed.overflow,
      maxHeight: proposed.maxHeight,
      height: proposed.argsHeight,
      args: proposed.args,
      want: proposed.want,
    })
  );
  kit.check(
    `Deny then Approve, the permission's peers: done and fail pairs, one height, on the trailing edge (${at})`,
    JSON.stringify(proposed.buttons) === JSON.stringify(["Deny", "Approve"]) &&
      proposed.approve?.fill === read.done &&
      proposed.deny?.fill === read.fail &&
      near(proposed.approve?.height, proposed.deny?.height, 0.5) &&
      near(proposed.peers?.right, proposed.want?.right),
    JSON.stringify({
      buttons: proposed.buttons,
      approve: proposed.approve,
      deny: proposed.deny,
      done: read.done,
      fail: read.fail,
      peersRight: proposed.peers?.right,
      wantRight: proposed.want?.right,
    })
  );
  kit.check(
    `the unknown one says to check the service, with Remove and no Approve (${at})`,
    unknown.wantText.includes("Check X") &&
      JSON.stringify(unknown.buttons) === JSON.stringify(["Remove"]) &&
      near(unknown.peers?.right, unknown.want?.right),
    `${unknown.wantText}; ${unknown.buttons.join(", ")}`
  );
  kit.check(
    `the failed one says it failed in the service's words, with Remove and no Approve (${at})`,
    refused.wantText.includes(SERVICE_SAID) &&
      JSON.stringify(refused.buttons) === JSON.stringify(["Remove"]) &&
      JSON.stringify(refused.terms) ===
        JSON.stringify(["Runs", "Through", "Tool"]) &&
      near(refused.peers?.right, refused.want?.right),
    `${refused.wantText}; ${refused.buttons.join(", ")}`
  );
  kit.check(
    `one text column; the list never scrolls sideways (${at})`,
    near(proposed.name?.left, unknown.name?.left) &&
      near(proposed.name?.left, refused.name?.left) &&
      near(proposed.want?.left, proposed.name?.left) &&
      read.sideways <= 0,
    `sideways ${read.sideways}px`
  );
}

/** Approve on the proposed row: the hub files it approved and the row leaves; then it is proposed again. */
async function approveOnce(kit: Kit, fleet: KitFleet, page: Page, id: string) {
  await page.click('.caw-pop .row[data-kind="action"] .peers .approve');
  const state = await until(
    "the approval filed",
    () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM actions WHERE id = ?",
        id
      )[0]?.state,
    (one) => one !== "proposed",
    30_000
  );
  await page.waitForFunction(
    (rows) =>
      document.querySelectorAll('.caw-pop .row[data-kind="action"]').length ===
      rows - 1,
    ROWS,
    { timeout: 30_000 }
  );
  kit.check(
    "Approve files the shown call approved, and its row leaves",
    state === "approved",
    `state ${state}`
  );
  // The rest of the widths read the proposed one again.
  fleet.write(
    "UPDATE actions SET state = 'proposed', approved_at = NULL, approved_by = NULL, started_at = NULL, ended_at = NULL, error = NULL WHERE id = ?",
    id
  );
}

const spec: Spec = {
  name: "approved-action",
  run: async (kit) => {
    const fleet = await kit.fleet(respond);
    const ids = await stage(fleet);
    const base = await fleet.dashboard();
    const pretty = JSON.stringify(JSON.parse(ARGS), null, 2);
    for (const theme of THEMES) {
      for (const view of ["desk", "phone"] as View[]) {
        // biome-ignore lint/performance/noAwaitInLoops: one width and theme at a time
        const page = await kit.page(view, { theme });
        await openPanel(page, base);
        checkWidth(
          kit,
          await page.evaluate(layoutOf),
          `${view}, ${theme}`,
          pretty
        );
        if (view === "desk" && theme === "light") {
          await approveOnce(kit, fleet, page, ids.proposed);
        }
        await page.close();
      }
    }
  },
};

export default spec;
