/**
 * What an HTML decision page meets as it draws reaches the agent that wrote
 * it, through `artifact_read` (core page-faults.ts). No fleet: one origin
 * serves the page as the hub does (built by `buildDecisionPage`, the overlay
 * injected with its artifact's doc as `servePage` seeds it, the decision
 * host's files, and the preview origin's error path answered by the hub's
 * own route, `takeErrorReport`), and what that route hands on is kept in the
 * artifact's doc by the rule the hub keeps it by (`faultsWith`, artifacts
 * service `pageFault`) and said by `artifact_read`'s presenter from what the
 * read takes of it (`faultsAt`, service `faultsOf`).
 *
 * The page writes `cawcoDials("Card", …)` with a spring control beside a
 * number, and throws as it loads. On Chromium:
 *
 * 1. The overlay's report of the spring dial reaches the hub's error route
 *    within 30 s, and `artifact_read` names the dial, its kind and that it
 *    is not drawn; the number dial beside it is drawn.
 * 2. The thrown error reaches it too, and `artifact_read` names its message
 *    and its line in the page as served, the line's words with it.
 * 3. One channel: both came by the preview origin's error path (core
 *    `PREVIEW_ERRORS_PATH`), the one a decision program's host reports to.
 *
 *   bun scripts/probe-kit/run.ts web page-faults
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getMeta, setMeta } from "../../../../packages/core/src/doc-meta";
import {
  faultsAt,
  faultsWith,
  type PageFault,
  type PageFaultReport,
} from "../../../../packages/core/src/page-faults";
import {
  OVERLAY_PATH,
  PREVIEW_ERRORS_PATH,
} from "../../../../packages/core/src/preview/routes";
import { artifactToolWords } from "../../../../packages/core/src/words/artifact-tools";
import { createArtifactDocs } from "../../../../packages/hub/src/artifacts/docs";
import type { ArtifactRead } from "../../../../packages/hub/src/artifacts/shapes";
import { takeErrorReport } from "../../../../packages/hub/src/dashboard-errors";
import type { ArtifactsDb } from "../../../../packages/hub/src/db/artifacts";
import { decisionHostFile } from "../../../../packages/hub/src/decision-host";
import { buildDecisionPage } from "../../../../packages/hub/src/decision-page";
import { DECISION_ASSETS } from "../../../../packages/hub/src/decision-program";
import type { HubLifetimeShape } from "../../../../packages/hub/src/lifetime";
import { artifactReadWords } from "../../../../packages/hub/src/presenters/artifacts";
import {
  injectOverlay,
  OVERLAY_KEY,
  overlayResponse,
} from "../../../../packages/preview/src/proxy";
import type { Kit, Spec } from "../../kit";

const ID = "5f0c2a8e-7d41-4f3b-9a6e-2c1d8b4e7f90";
const REVISION = 3;
const THROWN = "probe: the page broke as it loaded";
/** How long the overlay has to report both faults. Our call. */
const HEARD_MS = 30_000;

const SOURCE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>A page that breaks</title>
<style>{{KIT_CSS}}</style>
{{DIALS}}
</head>
<body>
<h1>A page that breaks</h1>
<div id="card" style="width: 120px; height: 60px; background: #268bd2"></div>
<script>
window.cawcoDials("Card", { radius: [12, 0, 32], bounce: { type: "spring", stiffness: 300 } });
</script>
<script>
throw new Error("${THROWN}");
</script>
</body>
</html>`;

/** The spring dial as the panel reads it (core dial-config.ts `unread`). */
const SPRING: PageFault = {
  kind: "dial",
  panel: "Card",
  path: "bounce",
  control: '{type: "spring"}',
};

const run = async (kit: Kit) => {
  const built = await buildDecisionPage(SOURCE, {
    image: async () => undefined,
    mockup: async () => undefined,
  });
  if (!("html" in built)) {
    kit.check(
      "the page builds",
      false,
      "problem" in built ? built.problem : built.response.detail
    );
    return;
  }
  const docs = createArtifactDocs({
    db: {
      append: () => undefined,
      updateCount: () => 0,
      compact: () => undefined,
      updates: () => [],
    } as unknown as ArtifactsDb,
    lifetime: {
      every: () => ({}),
      after: () => ({}),
      cancel: () => undefined,
    } as unknown as HubLifetimeShape,
  });
  docs.transact(ID, "hub", (doc) => setMeta(doc, "revision", REVISION));
  const served = injectOverlay(built.html, { artifact: ID, ...docs.seed(ID) });
  /** Every report the route handed on, and the paths they came by. */
  const reports: PageFaultReport[] = [];
  const paths = new Set<string>();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === OVERLAY_PATH) {
        return overlayResponse(
          [],
          request.headers.get("accept-encoding"),
          url.searchParams.get(OVERLAY_KEY)
        );
      }
      if (url.pathname === PREVIEW_ERRORS_PATH) {
        paths.add(url.pathname);
        // As the hub's preview origin takes it (preview.ts `serveSession`), kept as its service keeps it.
        return takeErrorReport(request, (report) => {
          reports.push(report);
          if (report.artifact !== ID) {
            return;
          }
          const kept = faultsWith(
            getMeta(docs.doc(ID), "faults"),
            report.revision,
            report.fault
          );
          if (kept) {
            docs.transact(ID, "hub", (doc) => setMeta(doc, "faults", kept));
          }
        });
      }
      if (url.pathname.startsWith(DECISION_ASSETS)) {
        return (
          (await decisionHostFile(
            url.pathname.slice(DECISION_ASSETS.length)
          )) ?? new Response("Not found", { status: 404 })
        );
      }
      if (url.pathname === "/") {
        return new Response(served, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("Not found", { status: 404 });
    },
  });
  try {
    const page = await kit.page("desk", { theme: "light" });
    await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: "load" });
    const deadline = Date.now() + HEARD_MS;
    const faults = () => faultsAt(getMeta(docs.doc(ID), "faults"), REVISION);
    while (
      Date.now() < deadline &&
      !(
        faults().some((one) => one.kind === "dial") &&
        faults().some((one) => one.kind === "error")
      )
    ) {
      await page.waitForTimeout(200);
    }
    const drawnRows = await page.evaluate(
      () =>
        document
          .querySelector("cawco-dials")
          ?.shadowRoot?.querySelectorAll("[data-dial-row]").length ?? 0
    );
    await page.close();

    const read: ArtifactRead = {
      id: ID,
      kind: "page",
      name: "page-faults",
      title: "A page that breaks",
      revision: REVISION,
      pageHash: null,
      sentAt: null,
      seq: 1,
      state: {},
      ...(faults().length > 0 ? { faults: faults() } : {}),
    };
    const said = artifactReadWords(read);
    const words = typeof said === "string" ? said : said.text;
    writeFileSync(join(kit.out, "artifact-read.txt"), `${words}\n`);

    kit.check(
      "1: artifact_read names the spring dial, its kind and that it is not drawn; the number dial beside it is drawn",
      words.includes(artifactToolWords.pageFault(SPRING)) && drawnRows > 0,
      `${drawnRows} dial row(s) drawn; read: ${words}`
    );

    // The one line of the page that holds the thrown words.
    const thrownLine =
      served.split("\n").findIndex((line) => line.includes(THROWN)) + 1;
    const error = faults().find(
      (one): one is Extract<PageFault, { kind: "error" }> =>
        one.kind === "error" && one.message.includes(THROWN)
    );
    kit.check(
      "2: artifact_read names the thrown error, its line in the page as served and the line's words",
      !!error &&
        error.line === thrownLine &&
        error.source?.includes(THROWN) === true &&
        words.includes(artifactToolWords.pageFault(error)),
      `thrown at line ${thrownLine}; kept: ${JSON.stringify(error ?? null)}`
    );

    kit.check(
      "3: one channel: both came by the preview origin's error path, the one a program's host reports to",
      [...paths].join(",") === PREVIEW_ERRORS_PATH &&
        reports.length >= 2 &&
        reports.every(
          (one) => one.artifact === ID && one.revision === REVISION
        ),
      `paths: ${[...paths].join(",")}; ${reports.length} report(s)`
    );
  } finally {
    await server.stop(true);
  }
};

const spec: Spec = {
  name: "page-faults",
  group: "Previews, pages and comments",
  run,
};
export default spec;
