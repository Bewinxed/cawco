/**
 * A preview whose workspace is gone (archived or discarded) says so: its
 * machine answers its load and its ping `gone` (agent stage.ts
 * `WorkspaceNotHere`, preview.ts `staged`, `pinged`), the hub carries that
 * hop to the pane (hub preview.ts `pingSession`, core preview-reach
 * `PreviewPingDown.down`), and the pane draws the gone state (dashboard
 * PreviewPane): its own title and line, no Try again (nothing it tries
 * again brings it back), its one action its session making it again. Not
 * a served server's crash, whose line says CawCo starts it again by itself.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), a session's served preview names a workspace that is on no
 * machine (written to the hub's database as an archived workspace's
 * preview stands once its clone is gone):
 *
 * - (1) its own origin answers its page 410 with the proxy's `gone` page,
 *   never a 502, and its ping answers the hub's words naming `gone`;
 * - (2) its own tab, at the desk (1440) and on the phone (390), draws the
 *   pane's gone state: its title and line, no Try again, and its one
 *   action (here, with no composer of its session beside it, why it can't
 *   be asked and the link that opens the session). Each is kept as a
 *   picture in the spec's output folder.
 *
 *   bun scripts/probe-kit/run.ts preview-gone
 */
import { join } from "node:path";
import { hubRequest } from "../../../packages/core/src/hub-request";
import { downOf } from "../../../packages/core/src/preview/proxy";
import { commonWords } from "../../../packages/core/src/words/common";
import { previewWords } from "../../../packages/core/src/words/preview";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";
import { passedFetch } from "../preview-pass";

/** The artifact panel's frame (PreviewPane), in an artifact's own tab. */
const FRAME = 'iframe[title="Preview"]';
/** The pane's gone state, over the frame. */
const GONE = '[data-slot="down"][data-down="gone"]';
/** The port the gone workspace's server listened on. Our pick: nothing listens there. */
const PORT = 47_651;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** What the artifact's own origin answers at its root and at its ping. */
const originReads = async (fleet: KitFleet, id: string) => {
  const { port } = await fleet.api<{ port: number }>(
    hubRequest("POST /api/artifacts/:artifact/preview-address", {
      path: { artifact: id },
    })
  );
  const page = await passedFetch(fleet, `http://127.0.0.1:${port}/`, {
    headers: { "sec-fetch-mode": "navigate" },
  });
  const body = await page.text();
  const ping = await fetch(`http://127.0.0.1:${port}/__cawco/ping`);
  const said = (await ping.json().catch(() => null)) as {
    down?: string;
    why?: string;
  } | null;
  return {
    status: page.status,
    down: downOf(body)?.down ?? null,
    ping: said,
  };
};

/** What the tab's gone state says: its title, its line, whether Try again stands, and its action's words. */
const goneReads = async (page: Parameters<typeof open>[0]) => {
  const state = page.locator(GONE).first();
  const shown = await state.isVisible().catch(() => false);
  const text = shown ? await state.innerText().catch(() => "") : "";
  const tryAgain = await state
    .getByRole("button", { name: commonWords.tryAgain })
    .count()
    .catch(() => 0);
  return { shown, text, tryAgain };
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "preview-gone",
  run: async (kit: Kit) => {
    const { check } = kit;
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
    const session = await fleet.spawn("claude", "Gone preview", fleet.repo);
    const id = crypto.randomUUID();
    const at = Date.now();
    // A served preview of a workspace no machine holds: its id as a
    // place's, which no workspace row need stand for.
    fleet.write(
      "INSERT INTO artifacts (id, instance_id, origin, kind, name, does, ask, machine_id, source_port, source_place, source_serve_command, source_serve_cwd, revision, seq, delivered_seq, created_at, updated_at) VALUES (?, ?, ?, 'preview', 'gone-page', 'try', 'Try this page', ?, ?, ?, 'bun run dev', '.', 1, 0, 0, ?, ?)",
      id,
      session,
      crypto.randomUUID(),
      MACHINE,
      PORT,
      crypto.randomUUID(),
      at,
      at
    );

    // (1) Its origin answers gone, never a 502, and so does its ping.
    const origin = await originReads(fleet, id);
    check(
      "(1) its own origin answers its page 410 with the proxy's gone page, never a 502, and its ping names gone",
      origin.status === 410 &&
        origin.down === "gone" &&
        origin.ping?.down === "gone",
      JSON.stringify(origin)
    );

    // (2) Its own tab draws the gone state, at the desk and on the phone.
    for (const view of ["desk", "phone"] as const) {
      const tab = await kit.page(view);
      await open(tab, `${base}/artifact/${id}`, FRAME);
      const gone = await until(
        `the ${view} tab's gone state`,
        () => goneReads(tab),
        (now) => now.shown,
        60_000
      ).catch(() => goneReads(tab));
      // Its picture once every run on the page has ended: the state's own
      // entrance, and the pane's.
      await tab
        .waitForFunction(
          () => window.kitRuns().every((run) => run.playState !== "running"),
          null,
          { timeout: 10_000 }
        )
        .catch(() => undefined);
      await tab.screenshot({ path: join(kit.out, `gone-${view}.png`) });
      check(
        `(2) at the ${view === "desk" ? "desk (1440)" : "phone (390)"}, its own tab draws the gone state: its title and line, no Try again, and its one action`,
        gone.shown &&
          gone.text.includes(previewWords.goneTitle) &&
          gone.text.includes(previewWords.goneLine) &&
          gone.text.includes(previewWords.goneCantAsk) &&
          gone.tryAgain === 0,
        JSON.stringify(gone)
      );
    }
  },
};
export default spec;
