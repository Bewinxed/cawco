/**
 * A folder preview opened at a file no overlay can reach (a PDF, an image,
 * plain text) shows that file in the session's panel and keeps showing it,
 * however long it stays open; the dashboard page never errors out because
 * of it (the owner, 2026-11-11: "the pdf opens for a bit then after 5
 * seconds the whole page errors out").
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), for each of a PDF, a PNG and a plain-text file in a folder,
 * made the session's last artifact so its panel shows it, at 1440 and at
 * 390 (where the panel is the phone's sheet), the session's page is opened
 * and watched for WATCH_MS:
 *
 * 1. the panel's frame stands throughout, loaded at the file's own address
 *    and answered with the file's own type;
 * 2. no state stands in for the file once its frame has loaded: no cover,
 *    no "didn't load" and no down page (`data-slot="down"`);
 * 3. the page throws nothing (`pageerror`), logs no console error, and
 *    never turns to the route's error page.
 *
 * Then a decision page whose option shows the PDF's preview (`Preview`,
 * dashboard decisions host Preview.svelte), the session's last artifact,
 * at 1440:
 *
 * 4. the Preview stands drawn at its shape within EMBED_SHOWN_MS of the
 *    panel's frame, its wait gone: a file draws itself, and no overlay in
 *    it ever says its app showed something (core `EMBED_DRAWN`).
 *
 *   bun scripts/probe-kit/run.ts folder-documents
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { hubRequest } from "../../../packages/core/src/hub-request";
import { shellWords } from "../../../packages/core/src/words/shell";
import type { Reply } from "../../scratch-fleet";
import { type Kit, kitsOwnMessage, open, type Spec, type View } from "../kit";

/** The artifact panel's frame (PreviewPane). */
const FRAME = 'iframe[title="Preview"]';
/** How long the page is watched once the frame stands. The brief's: more than 10 s. */
const WATCH_MS = 12_000;
/** A decision page's Preview of a folder's file, drawn. Our call: its ping is asked each second once its frame loaded; its `DRAW_MS` is 30 s. */
const EMBED_SHOWN_MS = 15_000;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** A one-page PDF saying `words`, its cross-reference table at the offsets it has. */
const pdf = (words: string): Uint8Array => {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    (() => {
      const stream = `BT /F1 24 Tf 72 760 Td (${words}) Tj ET`;
      return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    })(),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
};

/** A 2×2 PNG, coral. */
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg=="
  ),
  (char) => char.charCodeAt(0)
);

const FILES = [
  {
    kind: "pdf",
    title: "Droid holder roles",
    name: "droid-holder-roles-2026-11.pdf",
    type: "application/pdf",
    bytes: pdf("Droid holder roles, November 2026"),
  },
  {
    kind: "image",
    title: "Holder sketch",
    name: "holder-sketch.png",
    type: "image/png",
    bytes: PNG,
  },
  {
    kind: "text",
    title: "Holder notes",
    name: "holder-notes.txt",
    type: "text/plain",
    bytes: new TextEncoder().encode(
      "Holder roles for November: Mira keeps the rota, Tomas the spares.\n"
    ),
  },
] as const;

const VIEWS: View[] = ["desk", "phone"];

/** What the pane draws over or in place of the frame now: its cover, a down page, the error route. */
const standsIn = (page: Page) =>
  page.evaluate((errorTitle) => {
    const seen = (el: Element | null) =>
      !!el && (el as HTMLElement).getClientRects().length > 0;
    return {
      down: [...document.querySelectorAll('[data-slot="down"]')]
        .filter(seen)
        .map((el) => (el as HTMLElement).innerText.replace(/\s+/gu, " "))
        .join(" | "),
      errorPage: document.title.startsWith(errorTitle),
      frame: document.querySelectorAll('iframe[title="Preview"]').length,
      // The pane's cover still over the frame, where the pane is drawn.
      covered: [
        ...document.querySelectorAll('[data-slot="cover"]:not([data-ready])'),
      ].filter(seen).length,
    };
  }, shellWords.somethingWentWrong);

/** Legs 1 to 3: the session's page at `view`, its panel showing `file`, watched for {@link WATCH_MS}. */
const watchFile = async (
  kit: Kit,
  sessionAt: string,
  file: (typeof FILES)[number],
  view: View
) => {
  const page = await kit.page(view, { pdfViewer: true });
  const thrown: string[] = [];
  const logged: string[] = [];
  page.on("pageerror", (error) =>
    thrown.push((error.stack ?? error.message).slice(0, 600))
  );
  page.on("console", (message) => {
    if (message.type() === "error" && !kitsOwnMessage(message.text())) {
      logged.push(message.text().slice(0, 300));
    }
  });
  const served = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/${file.name}` &&
      response.request().resourceType() === "document",
    { timeout: 60_000 }
  );
  await open(page, sessionAt, FRAME);
  const answer = await served.catch(() => null);
  const answeredAs = answer?.headers()["content-type"] ?? "none";
  // The pane's load and its PAGE_SILENT_MS run inside the watch.
  const reads: Awaited<ReturnType<typeof standsIn>>[] = [];
  const end = performance.now() + WATCH_MS;
  while (performance.now() < end) {
    reads.push(
      await standsIn(page).catch(() => ({
        down: "unread",
        errorPage: false,
        frame: 0,
        covered: 0,
      }))
    );
    await Bun.sleep(500);
  }
  const last = reads.at(-1);
  const covered = (last?.covered ?? 1) > 0;
  // The file as the panel draws it, for a person to look at.
  await page.screenshot({
    path: join(kit.out, `${file.kind}-${view}.png`),
  });
  // Chrome's PDF viewer draws the PDF in a frame of its own inside the preview's.
  const viewer =
    file.kind === "pdf"
      ? page
          .frames()
          .some((frame) => frame.url().startsWith("chrome-extension://"))
      : true;
  kit.check(
    `${file.kind} @${view}: 1: the panel's frame stands for ${WATCH_MS} ms, loaded at the file's own address, answered as ${file.type}`,
    reads.every((one) => one.frame > 0) &&
      answeredAs.startsWith(file.type) &&
      viewer,
    JSON.stringify({
      frames: reads.map((one) => one.frame).join(","),
      answeredAs,
      ...(file.kind === "pdf" ? { pdfViewer: viewer } : {}),
    })
  );
  kit.check(
    `${file.kind} @${view}: 2: nothing stands in for the loaded file: no cover, no didn't-load or down page`,
    !covered && reads.every((one) => one.down === ""),
    JSON.stringify({
      covered: last?.covered,
      down: [...new Set(reads.map((one) => one.down))].filter(Boolean),
    })
  );
  kit.check(
    `${file.kind} @${view}: 3: the page throws nothing, logs no console error and never turns to the error page`,
    thrown.length === 0 &&
      logged.length === 0 &&
      !reads.some((one) => one.errorPage) &&
      !last?.errorPage,
    JSON.stringify({
      thrown,
      logged,
      errorPage: reads.some((one) => one.errorPage),
    })
  );
  await page.close();
};

/** Leg 4: the session's page at the desk, its panel showing a decision page whose Preview is the PDF's. */
const watchEmbed = async (kit: Kit, sessionAt: string) => {
  const page = await kit.page("desk", { pdfViewer: true });
  await open(page, sessionAt, FRAME);
  const embed = page
    .frameLocator(FRAME)
    .first()
    .locator("[data-slot=media] iframe[data-slot=embed]")
    .first();
  /** The Preview's shape as it reads now: `waiting` until it stands drawn. */
  const shapeNow = () =>
    embed.getAttribute("data-shape", { timeout: 1000 }).catch(() => null);
  const attached = await embed
    .waitFor({ state: "attached", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  let shape: string | null = null;
  const end = performance.now() + EMBED_SHOWN_MS;
  while (attached && performance.now() < end) {
    shape = await shapeNow();
    if (shape && shape !== "waiting") {
      break;
    }
    await Bun.sleep(250);
  }
  await page.screenshot({ path: join(kit.out, "pdf-decision-desk.png") });
  kit.check(
    `pdf on a decision page: 4: its Preview stands drawn at its shape within ${EMBED_SHOWN_MS} ms, its wait gone`,
    attached && shape !== null && shape !== "waiting",
    JSON.stringify({ attached, shape })
  );
  await page.close();
};

const run = async (kit: Kit) => {
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
  const session = await fleet.spawn("claude", "Holder roles", fleet.repo);
  const dir = join(kit.out, "folder");
  await mkdir(dir, { recursive: true });
  for (const file of FILES) {
    await Bun.write(join(dir, file.name), file.bytes);
  }

  const made: Record<string, string> = {};
  for (const file of FILES) {
    // Made last, so the session's panel shows it.
    const artifact = await fleet.api<{ id: string }>(
      hubRequest("POST /api/instances/:id/artifacts", {
        path: { id: session },
        body: {
          kind: "preview",
          does: "judge",
          title: file.title,
          ask: "Read the holder roles",
          name: `holder-${file.kind}`,
          dir,
          path: `/${file.name}`,
        },
      })
    );
    made[file.kind] = artifact.id;
    for (const view of VIEWS) {
      await watchFile(kit, `${base}/session/${session}`, file, view);
    }
  }

  // 4. The PDF's preview on a decision page, made last so the panel shows it.
  await fleet.api(
    hubRequest("POST /api/instances/:id/artifacts", {
      path: { id: session },
      body: {
        kind: "page",
        does: "pick",
        title: "Holder roles to keep",
        ask: "Pick the roles to keep",
        name: "holder-roles-pick",
        program: `root = Decisions("Holder roles to keep", [roles])
roles = Decision("roles", "Do the November roles stand?", [keep, redo], "Read the roles.", [], [], false, null, "behaviour")
keep = Option("keep", "Keep them", "As written.", true, [doc], "Nothing to redo.")
redo = Option("redo", "Write them again", "A new list.", false, [], "Another round.")
doc = Preview("${made.pdf}", "The November roles")`,
      },
    })
  );
  await watchEmbed(kit, `${base}/session/${session}`);
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "folder-documents",
  run,
};
export default spec;
