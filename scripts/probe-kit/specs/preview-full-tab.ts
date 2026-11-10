/**
 * A pane that shows an artifact outside its session's panel ends its wait in
 * the drawing or the hub's refusal, never a cover that pulses for nothing.
 *
 * On 2026-11-05 a task's review pane (ArtifactStage, the artifact panel's
 * own PreviewPane inset, on the artifact's own socket) pulsed its skeleton
 * for good: every preview port was in use, so the hub's frame named no
 * origin, the pane's probe never ran, and the panel's own Show had said the
 * refusal where the pane said nothing. An artifact's own tab
 * (routes/artifact/[id]) draws the same pane on the same socket's frame
 * (hub artifact-pages.ts `shownFrame` with `open`), so it stands for every such pane
 * here.
 *
 *   bun scripts/probe-kit/run.ts preview-full-tab
 *
 * On a scratch fleet whose every preview port another program holds before
 * the hub starts:
 * 1. a decision page's tab says the hub's refusal over the pane's well, as
 *    the hub words it (core words/preview-ports.ts, its status after it, as
 *    hub-read.ts `hubRefusal` says every refusal), with Try again, and no
 *    cover stands;
 * 2. those programs gone, Try again draws the page.
 */
import type { Socket, TCPSocketListener } from "bun";
import { commonWords } from "../../../packages/core/src/words/common";
import { previewPortWords } from "../../../packages/core/src/words/preview-ports";
import { type Reply, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../spec";

/** What the decision page's frame draws once its host has loaded. */
const QUESTION = "Which word reads right?";

const PROGRAM = `root = Decisions("Pick a word", [word])
word = Decision("word", "Which word reads right?", [keep, other], "Read both.", [], [], false, null, "behaviour")
keep = Option("keep", "Keep this word", "The word as it stands.", true, [], "One more look.")
other = Option("other", "Another word", "A new word.", false, [], "Another round.")`;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  const [first, last] = fleet.previewPorts.split("-").map(Number) as [
    number,
    number,
  ];
  // Another program on the hub's machine holds every preview port.
  const held: TCPSocketListener[] = [];
  for (let port = first; port <= last; port += 1) {
    held.push(
      Bun.listen({
        hostname: "0.0.0.0",
        port,
        socket: { data: (_socket: Socket) => undefined },
      })
    );
  }
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const base = await fleet.dashboard();
  const session = await fleet.spawn("claude", "Full range", fleet.repo);
  const page = await fleet.api((hub) =>
    hub.api.instances({ id: session }).artifacts.post({
      kind: "page",
      does: "pick",
      title: "Probe pick artifact",
      ask: "Pick the word",
      name: "full-range-page",
      program: PROGRAM,
    })
  );
  const tab = await kit.page("desk", { engine: "chromium" });
  try {
    await tab.goto(`${base}/artifact/${page.id}`);
    const said = tab.locator("[data-unopened]");
    const words = previewPortWords.everyPortTaken(`${first}–${last}`, {
      screens: 0,
      others: last - first + 1,
    });
    const shown = await said
      .first()
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    const text = shown ? ((await said.first().textContent()) ?? "") : "";
    const again = said.getByRole("button", { name: commonWords.tryAgain });
    const covers = await tab.locator('[data-slot="cover"]').count();
    kit.check(
      "1: every preview port held by another program: the artifact's pane says the hub's refusal in its words, with Try again, and no cover stands",
      shown &&
        text.includes(words.slice(0, -1)) &&
        (await again.count()) === 1 &&
        covers === 0,
      JSON.stringify({ shown, text: text.trim(), wanted: words, covers })
    );

    // 2. The programs gone, Try again draws the page.
    for (const one of held.splice(0)) {
      one.stop(true);
    }
    await again.click();
    const questionShown = (): Promise<boolean> =>
      tab
        .frameLocator('iframe[title="Preview"]')
        .first()
        .getByText(QUESTION)
        .first()
        .isVisible()
        .catch(() => false);
    const drawn = await until(
      "the page drawn after Try again",
      questionShown,
      (now) => now,
      30_000
    ).then(
      () => true,
      () => false
    );
    kit.check(
      "2: the ports free again, Try again opens the page's origin and draws it",
      drawn && (await said.count()) === 0,
      JSON.stringify({ drawn, stillSaid: await said.count() })
    );
  } finally {
    for (const one of held) {
      one.stop(true);
    }
    await tab.context().close();
  }
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "preview-full-tab",
  run,
};
export default spec;
