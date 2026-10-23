/**
 * J7, previews and comments: a session shows a page; the person opens it,
 * presses what they mean, writes in the composer that opens there and
 * presses Comment: the session receives it by itself as one delivery a few
 * seconds later, with no Send (artifacts/service.ts `personMarked`,
 * `deliverMarks`).
 *
 * The page is the session's own, made through the hub's artifact API as
 * `artifact_create` makes one. The outcome is read from the model: it is
 * asked with the comments notice and the person's words.
 */

import { previewWords } from "../../../packages/core/src/words/preview";
import { transcriptWords } from "../../../packages/core/src/words/transcript";
import type { Seen } from "../../scratch-fleet";
import { type KitFleet, pressAt } from "../kit";
import { say } from "./mock";
import {
  eventually,
  expect,
  type Journey,
  type Leg,
  shows,
  unmet,
} from "./suite";

/** How the comments notice opens (core injected.ts `artifactCommentsNotice`). */
const NOTICE = "[CawCo] The person commented on the page";
const PAGE = "release-notes";
const LEAD = "Version 4.2 ships the new import screen and two fixes.";
const DETAIL = "The import screen reads CSV and Excel files up to 50 MB.";
/** The hub's send, the agent and the harness's request. */
const DELIVERY_MS = 30_000;

const html = (title: string) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body { margin: 0; font: 18px/1.6 system-ui; } main { padding: 24px; } p { margin: 0 0 32px; }</style>
</head><body><main>
<h1>${title}</h1>
<p>${LEAD}</p>
<p>${DETAIL}</p>
</main></body></html>`;

/** The session's page, made as artifact_create makes one: its id. */
const pageFor = async (fleet: KitFleet, session: string, title: string) =>
  (
    await fleet.api<{ id: string }>(`/api/instances/${session}/artifacts`, {
      kind: "page",
      does: "judge",
      ask: "Judge this page: pin anything that reads wrong",
      name: PAGE,
      html: html(title),
    })
  ).id;

async function walk(leg: Leg): Promise<void> {
  const { fleet, page, base } = leg;
  const title = leg.title("Release notes");
  const session = await fleet.spawn("claude", title);
  await pageFor(fleet, session, title);
  const words = `Say which version first, ${leg.id}.`;
  const preview = page.getByTitle("Preview").contentFrame();

  await leg.step(
    "Open the session's page",
    () =>
      page.goto(`${base}/session/${session}`, {
        waitUntil: "domcontentloaded",
      }),
    () =>
      shows(preview.getByText(LEAD), "the page's words in its preview", 60_000)
  );

  // The preview's mode: Interact, Comment, Draw, as three segments, or,
  // where a phone's head has no room for them, one button (`Mode: …`)
  // opening the three.
  const segment = page
    .getByRole("tablist", { name: previewWords.previewMode })
    .getByRole("tab", { name: "Comment" })
    .filter({ visible: true });
  const modeButton = page
    .locator('button[aria-label^="Mode:"]')
    .filter({ visible: true })
    .first();
  await leg.step(
    "Turn on Comment",
    async () => {
      if ((await segment.count()) > 0) {
        await segment.click();
        return;
      }
      await modeButton.click();
      await page
        .getByRole("menuitemradio", { name: "Comment" })
        .filter({ visible: true })
        .first()
        .click();
    },
    () =>
      eventually(
        "Comment is the preview's mode",
        async () =>
          (await segment.count()) > 0
            ? (await segment.getAttribute("aria-selected")) === "true"
            : (await modeButton.getAttribute("aria-label")) === "Mode: Comment",
        Boolean
      )
  );

  const composer = page.locator('[data-slot="pin-composer"]');
  await leg.step(
    "Comment on the first line",
    async () => {
      // A tap where the line is: in Comment mode the comment layer lies
      // over the page and takes the tap (as the person's finger lands).
      const line = await preview.getByText(LEAD).boundingBox();
      if (!line) {
        unmet("the first line has no box in the preview");
      }
      await pressAt(preview, {
        x: line.x + line.width * 0.3,
        y: line.y + line.height / 2,
      });
      await composer.waitFor({ timeout: 10_000 });
      await composer.getByRole("combobox").fill(words);
      await composer
        .getByRole("button", { name: "Comment", exact: true })
        .click();
      await composer.waitFor({ state: "detached", timeout: 10_000 });
    },
    async () => {
      const heard = await eventually(
        "the session is sent the comment by itself",
        () =>
          fleet.seen.find(
            (one) =>
              one.tools && one.last.includes(NOTICE) && one.last.includes(words)
          ),
        Boolean,
        DELIVERY_MS
      );
      // The line it was pinned on travels with it.
      expect(
        "the comment names the line it was pinned on",
        (heard?.last ?? "").includes(LEAD),
        (heard?.last ?? "").slice(0, 600)
      );
      await shows(
        page
          .getByRole("log", { name: transcriptWords.transcript })
          .getByText(`Comments on ${PAGE}`),
        `the session's “Comments on ${PAGE}” line`
      );
    }
  );
}

const journey: Journey = {
  name: "j7-comments",
  flow: "Previews and comments: open a preview, comment on it, the agent receives it by itself",
  respond: (seen: Seen) =>
    seen.tools && seen.last.includes(NOTICE)
      ? say("Read your comment; putting the version first.")
      : say("Ready."),
  leg: walk,
};

export default journey;
