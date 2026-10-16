/**
 * J7, previews and comments: a session shows a page; the person opens it,
 * pins a comment on what they mean and writes in it, and the session
 * receives it by itself (artifacts/service.ts `deliverMarks`: one delivery
 * after a quiet period, no Send to press).
 *
 * The page is the session's own, made through the hub's artifact API as
 * `artifact_create` makes one. The outcome is read from the model: it is
 * asked with the comments notice and the person's words.
 */
import type { Seen } from "../../scratch-fleet";
import type { KitFleet } from "../kit";
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
/** The quiet period, then the hub's send, the agent and the harness's request. */
const DELIVERY_MS = 45_000;

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

  // The preview's mode: Interact, Comment, Draw.
  const comment = page
    .getByRole("tablist", { name: "Preview mode" })
    .getByRole("tab", { name: "Comment" })
    .filter({ visible: true });
  await leg.step(
    "Turn on Comment",
    () => comment.click(),
    () =>
      eventually(
        "Comment is the preview's mode",
        () => comment.getAttribute("aria-selected"),
        (selected) => selected === "true"
      )
  );

  const card = page.getByRole("textbox").filter({ visible: true }).last();
  await leg.step(
    "Pin a comment on the first line and write in it",
    async () => {
      // A tap where the line is: in Comment mode the comment layer lies
      // over the page and takes the tap (as the person's finger lands).
      const line = await preview.getByText(LEAD).boundingBox();
      if (!line) {
        unmet("the first line has no box in the preview");
      }
      await page.mouse.click(
        line.x + line.width * 0.3,
        line.y + line.height / 2
      );
      await card.waitFor({ timeout: 10_000 });
      await card.fill(words);
      await page.getByRole("button", { name: "Reply" }).click();
      await page.keyboard.press("Escape");
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
          .getByRole("log", { name: "Session transcript" })
          .getByText(`Comments on ${PAGE}`),
        `the session's “Comments on ${PAGE}” line`
      );
    }
  );
}

const journey: Journey = {
  name: "j7-comments",
  flow: "Previews and comments: open a preview, pin a comment, the agent receives it",
  respond: (seen: Seen) =>
    seen.tools && seen.last.includes(NOTICE)
      ? say("Read your comment; putting the version first.")
      : say("Ready."),
  leg: walk,
};

export default journey;
