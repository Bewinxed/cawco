/**
 * A browser ask reaches the person where they are looking, and Take over
 * shows the page the agent asked about. The owner's case of 2026-11-06:
 * Caw's delegate asked him to take over its browser; nothing reached Caw's
 * session, and Take over, pressed in the delegate's own session, showed an
 * extension's first-run tab with the band reading "No page open". The
 * delegate's page had closed with its work item before it asked, and the
 * take-over brought the browser's first tab forward in its place (agent
 * shield.ts `frontPage`, which fell back to any page).
 *
 * On a scratch fleet (real hub, agent and sessiond; the mock model; the
 * project's browser on the local host), in a project: a top session, its
 * delegate, and that delegate's delegate, each delegate's work item seeded
 * on the hub's rows in a workspace of its own, its door made as the
 * workspace's boundary makes it (gated-pages.ts). A site on loopback is the
 * page's origin.
 *
 * (a) The first delegate, with no page open, calls `browser_ask`: it is
 *     refused in the words naming what to do, and nothing waits on the
 *     person.
 * (b) The delegate two deep opens the site's home page, then its sign-in
 *     page in a tab of its own, and a page on a second origin; it drives
 *     the sign-in page again and calls `browser_ask` on the site's origin:
 *     the ask waits on the person, routed to no agent.
 * (c) The top session's pane, at 1440, draws the ask as a card named by
 *     the delegate that asked, with its reason, and its tab reads that it
 *     needs you.
 * (d) After the ask, a tab opens on the same origin (the asker's own, and
 *     another session's). Take over on the top session's card brings the
 *     page the agent drove and asked about to the front (the shield's
 *     page; not its older home page on the same origin), and
 *     takes the person to the asking delegate's session, where its panel
 *     shows the browser.
 * (e) Handed back, the asker's call answers that it was handed back, on
 *     the site's origin.
 * (f) An ask whose page closed before the person took it: Take over is
 *     refused in the words saying so, and the gate is open to the agents
 *     again.
 *
 *   bun scripts/probe-kit/run.ts browser-ask-tree
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserKey } from "../../../packages/core/src/browser";
import {
  hubRequest,
  type Sending,
  type ToolArgs,
  type ToolName,
} from "../../../packages/core/src/hub-request";
import { askWords } from "../../../packages/core/src/words/asks";
import { browserAskWords } from "../../../packages/core/src/words/browser";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import { doorOf, liveBrowser, servedSite } from "../gated-pages";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const REASON = `Sign in to the probe's site ${crypto.randomUUID().slice(0, 8)}`;

interface Parked {
  instanceId?: string;
  payload: {
    browserAsk?: { key: string; origin: string };
    routedTo?: string;
  };
  requestId?: string;
}

const callAs = async <N extends ToolName, const A>(
  fleet: KitFleet,
  as: string,
  name: N,
  args: Sending<A, ToolArgs<N>>,
  timeoutMs?: number
) =>
  await toolWords(
    {
      base: fleet.base,
      id: as,
      credential: await fleet.sessionCredential(as),
    },
    name,
    args,
    timeoutMs ? { timeoutMs } : {}
  );

/** The page the shield brought to the front, as the browser's dir keeps it (agent shield.ts `shield.json`). */
const shieldPage = async (
  fleet: KitFleet,
  key: BrowserKey
): Promise<string | undefined> => {
  const { browserDir } =
    await import("../../../packages/agent/src/browser/state");
  const before = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = fleet.env.XDG_DATA_HOME as string;
  try {
    const kept = JSON.parse(
      await readFile(join(browserDir(key), "shield.json"), "utf8")
    ) as { targetId?: string };
    return kept.targetId;
  } catch {
    // No take-over kept yet: nothing in front.
    return undefined;
  } finally {
    if (before === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = before;
    }
  }
};

const pending = (fleet: KitFleet) =>
  fleet.api<Parked[]>(hubRequest("GET /api/pending"));

const run = async (kit: Kit) => {
  const { check } = kit;
  const site = servedSite("Probe sign-in");
  // A second origin: another port.
  const other = servedSite("Probe elsewhere");
  try {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent", [], { DOCKER_HOST: "unix:///nonexistent" });
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const project = await fleet.api<{ id: string }>(
      hubRequest("POST /api/projects", {
        body: {
          name: "Ask tree",
          machineId: MACHINE,
          cwd: fleet.repo,
          caw: false,
        },
      })
    );
    const key: BrowserKey = `project:${project.id}`;
    const top = await fleet.spawn("claude", "Ask top", fleet.repo, {
      projectId: project.id,
    });
    /** A delegate of `parent` titled `title`, in a workspace of its own seeded on the hub's rows. */
    const seeded = async (
      parent: string,
      title: string
    ): Promise<{ id: string; workspace: string }> => {
      const child = await fleet.spawn("claude", title, fleet.repo, {
        projectId: project.id,
      });
      const now = Date.now();
      const workspace = crypto.randomUUID();
      const item = crypto.randomUUID();
      fleet.write(
        "INSERT INTO workspaces (id, machine_id, repo_root, path, branch, state, created_by_instance_id, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
        workspace,
        MACHINE,
        fleet.repo,
        join(fleet.sandbox, `ws-${workspace.slice(0, 8)}`),
        `ws/${workspace.slice(0, 8)}`,
        parent,
        now
      );
      fleet.write(
        "INSERT INTO work_items (id, workspace_id, parent_instance_id, instance_id, brief, title, harness, state, project_id, created_at) VALUES (?, ?, ?, ?, ?, ?, 'claude', 'running', ?, ?)",
        item,
        workspace,
        parent,
        child,
        "Do your part.",
        title,
        project.id,
        now
      );
      fleet.write(
        "UPDATE instances SET parent_instance_id = ?, work_item_id = ? WHERE id = ?",
        parent,
        item,
        child
      );
      await fleet.api(
        hubRequest("PATCH /api/instances/:id", {
          path: { id: child },
          body: { title },
        })
      );
      return { id: child, workspace };
    };
    const first = await seeded(top, "Ask middle");
    const deep = await seeded(first.id, "Ask deep");

    const browser = await liveBrowser(fleet, key, MACHINE);
    check(
      `the project's browser is live on the local host (${browser?.state}, ${browser?.host})`,
      browser?.state === "live",
      JSON.stringify(browser)
    );
    if (browser?.state !== "live") {
      return;
    }

    // (a) No page open: refused, and nothing waits on the person.
    const refused = await callAs(fleet, first.id, "browser_ask", {
      origin: site.origin,
      reason: REASON,
    });
    const middleParked = (await pending(fleet)).some(
      (one) => one.instanceId === first.id
    );
    check(
      "(a) a delegate with no page open on the origin calls browser_ask: refused in the words naming what to do, and nothing waits on the person",
      refused.refused &&
        refused.text.includes(browserAskWords.noPage(site.origin)) &&
        !middleParked,
      `${refused.status} ${refused.text.slice(0, 400)}; parked for it: ${middleParked}`
    );

    // (b) Two deep, with its page open and driven, it asks.
    const door = await doorOf(fleet, deep.workspace, project.id);
    // Its first page on the site, then the sign-in it went on to in a tab of
    // its own: the one it drives and asks about.
    const home = await door.open(`${site.origin}/home`);
    const asked = await door.open(`${site.origin}/sign-in`);
    await door.open(`${other.origin}/other`);
    await door.drive(asked);
    door.close();
    const call = callAs(
      fleet,
      deep.id,
      "browser_ask",
      { origin: site.origin, reason: REASON },
      900_000
    );
    const parked = await until(
      "(b) the deep delegate's browser ask waiting on the person",
      async () =>
        (await pending(fleet)).find(
          (one) => one.instanceId === deep.id && one.payload.browserAsk
        ),
      Boolean,
      60_000
    ).catch(() => undefined);
    const elsewhereParked = (await pending(fleet)).filter(
      (one) => one.instanceId === top || one.instanceId === first.id
    ).length;
    check(
      "(b) the delegate two deep, its page open and driven, calls browser_ask: the ask waits on the person, routed to no agent, and none is parked on the sessions above it",
      !!parked &&
        parked.payload.routedTo === undefined &&
        elsewhereParked === 0,
      JSON.stringify({ parked, elsewhereParked })
    );
    if (!parked?.requestId) {
      return;
    }

    // (c) The top session's pane draws it, named by its asker; its tab needs you.
    const base = await fleet.dashboard();
    const page = await kit.page("desk");
    await open(page, `${base}/session/${top}`, '[data-slot="pane"]');
    const card = page.locator(
      `section[data-slot="hitl"][aria-label="${askWords.browserAskFrom("Ask deep")}"]`
    );
    const drawn = await card
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(
        () => true,
        () => false
      );
    const reasonShown = drawn
      ? ((await card.locator('[data-slot="lede"]').textContent()) ?? "")
      : "";
    const needs = await page
      .locator(`[data-slot="tab"][data-needs]:has(a[href="/session/${top}"])`)
      .count();
    check(
      `(c) the top session's pane at 1440 draws the ask two deep as a card named by its asker ("${askWords.browserAskFrom("Ask deep")}"), with its reason, and its tab reads that it needs you`,
      drawn && reasonShown.includes(REASON) && needs === 1,
      JSON.stringify({
        drawn,
        reasonShown,
        needs,
        cards: await page
          .locator('section[data-slot="hitl"]')
          .evaluateAll((all) =>
            all.map((one) => one.getAttribute("aria-label"))
          ),
      })
    );

    // (d) Tabs open after the ask; Take over shows the asked page.
    const again = await doorOf(fleet, deep.workspace, project.id);
    const newer = await again.open(`${site.origin}/later`);
    again.close();
    const neighbour = await doorOf(fleet, crypto.randomUUID(), project.id).then(
      async (theirs) => {
        const id = await theirs.open(`${site.origin}/theirs`);
        theirs.close();
        return id;
      }
    );
    if (drawn) {
      await card.getByRole("button", { name: askWords.takeOver }).click();
    } else {
      await fleet.api(
        hubRequest("POST /api/browsers/:key/takeover", {
          path: { key },
          body: { requestId: parked.requestId, machineId: MACHINE },
        })
      );
    }
    const front = await until(
      "(d) the shield's page",
      () => shieldPage(fleet, key),
      Boolean,
      60_000
    ).catch(() => undefined);
    const went = await until(
      "(d) the person taken to the asking delegate's session",
      () => Promise.resolve(new URL(page.url()).pathname),
      (path) => path === `/session/${deep.id}`,
      30_000
    ).catch(() => new URL(page.url()).pathname);
    const listed = (
      await fleet.api<{ key: string; origin?: string }[]>(
        hubRequest("GET /api/browsers")
      )
    ).find((one) => one.key === key);
    check(
      "(d) with the asker's older page on the same origin, and a newer tab of its own and another session's opened there after the ask, Take over on the top session's card brings the sign-in page the agent drove and asked about to the front, its band naming the origin, and takes the person to the asking delegate's session",
      front === asked &&
        listed?.origin === site.origin &&
        went === `/session/${deep.id}`,
      JSON.stringify({
        front,
        asked,
        home,
        newer,
        neighbour,
        origin: listed?.origin,
        went,
      })
    );

    // (e) Handed back: the call answers with the origin.
    await fleet
      .api(
        hubRequest("POST /api/browsers/:key/handback", {
          path: { key },
          body: { machineId: MACHINE },
        })
      )
      .catch(() => undefined);
    const answered = await call.then(
      (said) => said.text,
      (error: unknown) => `failed: ${String(error)}`
    );
    check(
      "(e) handed back, the asker's call answers that it was handed back, on the site's origin",
      answered.includes(browserAskWords.handedBack(site.origin)),
      answered.slice(0, 400)
    );

    // (f) The asked page closed before Take over: refused, the gate open again.
    const third = await doorOf(fleet, deep.workspace, project.id);
    await third.drive(asked);
    callAs(
      fleet,
      deep.id,
      "browser_ask",
      { origin: site.origin, reason: `${REASON} again` },
      900_000
    ).catch(() => undefined);
    const second = await until(
      "(f) the second ask waiting on the person",
      async () =>
        (await pending(fleet)).find(
          (one) => one.instanceId === deep.id && one.payload.browserAsk
        ),
      Boolean,
      60_000
    ).catch(() => undefined);
    await third.send("Target.closeTarget", { targetId: asked });
    third.close();
    const take = await fleet
      .api<unknown>(
        hubRequest("POST /api/browsers/:key/takeover", {
          path: { key },
          body: { requestId: second?.requestId, machineId: MACHINE },
        })
      )
      .then(
        () => "taken",
        (error: unknown) =>
          error instanceof Error ? error.message : String(error)
      );
    const reopened = await doorOf(fleet, deep.workspace, project.id).then(
      (back) => {
        back.close();
        return true;
      },
      () => false
    );
    check(
      "(f) an ask whose page closed before the person took it: Take over is refused in the words saying so, and the agents' gate is open again",
      take.includes(browserAskWords.pageClosed) && reopened,
      `${take.slice(0, 400)}; gate open: ${reopened}`
    );
  } finally {
    site.stop();
    other.stop();
  }
};

const spec: Spec = {
  group: "The hub and machines",
  name: "browser-ask-tree",
  run,
};

export default spec;
