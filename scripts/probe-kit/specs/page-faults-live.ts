/**
 * What an HTML decision page meets as it draws reaches the agent that wrote
 * it, on a real fleet: the live hub's artifacts service keeps it
 * (`pageFault`, `meta.faults`) and the session's own `artifact_read`
 * says it. The web probe `page-faults` proves the browser's half against
 * the hub's route and rules alone; this proves them end to end.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model, which calls the hub's MCP tools as each PROBE-CALL message
 * says), the session publishes an HTML page whose script calls
 * `cawcoDials("Card", …)` with a spring control beside a number and throws
 * as it loads. A browser opens it by the session's `artifact_browse`
 * address, as given, on the session's preview origin, where the overlay
 * injected into it reports what it met to the origin's error path (core
 * `PREVIEW_ERRORS_PATH`). Then:
 *
 * 0. The address opens as given, from where the run stands, inside a
 *    workspace's boundary too: its entry answers 302 and the page's own
 *    document 200. (The scratch hub binds loopback; its address named the
 *    machine's hostname, which srt's proxy refused inside a workspace,
 *    "403 … resolved to a loopback address", hub dashboard-url.ts
 *    `composedHost`.)
 * 1. Within 30 s, the session's `artifact_read` names the spring dial, its
 *    kind and that it is not drawn, at the page's revision now.
 * 2. The same read names the thrown error, its line in the page as served
 *    and the line's words.
 * 3. The session revises the page (`artifact_update` with HTML that draws
 *    only the number dial and throws nothing); the browser takes the
 *    revision in place. The session's `artifact_read` at the new revision
 *    names no fault: the old revision's are gone from the read.
 *
 *   bun scripts/probe-kit/run.ts page-faults-live
 */

import type { PageFault } from "../../../packages/core/src/page-faults";
import {
  PREVIEW_ENTER_PATH,
  PREVIEW_ERRORS_PATH,
} from "../../../packages/core/src/preview/routes";
import { artifactToolWords } from "../../../packages/core/src/words/artifact-tools";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { ToolCalls } from "../../tool-calls";
import type { Kit, Spec } from "../spec";

const CREATE = "mcp__cawco__artifact_create";
const UPDATE = "mcp__cawco__artifact_update";
const READ = "mcp__cawco__artifact_read";
const BROWSE = "mcp__cawco__artifact_browse";
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/u;
const ANSWERED_URL = /"url":"([^"]+)"/u;
/** The revision a read names: its first line's (presenters/artifacts.ts `artifactReadWords`). */
const READ_REVISION = /, revision (\d+)\./u;
const THROWN = "probe: the live page broke as it loaded";
/** How long the overlay's reports have to reach the hub's read. Our call. */
const HEARD_MS = 30_000;

/** The page: a number dial and a spring dial in one panel, and a throw as it loads; `fixed`, the number alone and no throw. */
const pageHtml = (fixed: boolean) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>A page that breaks</title>
<style>{{KIT_CSS}}</style>
{{DIALS}}
</head>
<body>
<h1>A page that ${fixed ? "draws" : "breaks"}</h1>
<div id="card" style="width: 120px; height: 60px; background: #268bd2"></div>
<script>
window.cawcoDials("Card", ${fixed ? "{ radius: [12, 0, 32] }" : '{ radius: [12, 0, 32], bounce: { type: "spring", stiffness: 300 } }'});
</script>
${fixed ? "" : `<script>\nthrow new Error("${THROWN}");\n</script>`}
</body>
</html>`;

/** The spring dial as the panel reads it (core dial-config.ts `unread`). */
const SPRING: PageFault = {
  kind: "dial",
  panel: "Card",
  path: "bounce",
  control: '{type: "spring"}',
};

const calls = new ToolCalls();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  return calls.reply(request) ?? text("ok");
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

  const session = await fleet.spawn("claude", "Page faults", fleet.repo);
  const created = await calls.call(fleet, session, CREATE, {
    response_format: "detailed",
    kind: "page",
    does: "judge",
    title: "A page that breaks",
    ask: "Judge the card's dials",
    name: "page-faults-live",
    html: pageHtml(false),
  });
  const id = String(created).match(ANSWERED_ID)?.[1];
  if (!id) {
    kit.check("0: the page is made", false, String(created).slice(0, 400));
    return;
  }
  const browsed = await calls.call(fleet, session, BROWSE, {
    id,
    response_format: "detailed",
  });
  const url = String(browsed).match(ANSWERED_URL)?.[1];
  if (!url) {
    kit.check(
      "0: artifact_browse answers the page's address",
      false,
      String(browsed).slice(0, 400)
    );
    return;
  }
  const read = async () =>
    String(await calls.call(fleet, session, READ, { id }));
  const revisionOf = (words: string) =>
    Number(words.match(READ_REVISION)?.[1] ?? Number.NaN);

  const tab = await kit.page("desk", { ignoreHTTPSErrors: true });
  // The page as served: its thrown line is found in it, as the browser counts lines.
  let served = "";
  tab.on("response", (response) => {
    if (response.request().resourceType() === "document") {
      response
        .text()
        .then((text) => {
          if (text.includes(THROWN)) {
            served = text;
          }
        })
        .catch(() => undefined);
    }
  });
  /** What the page sent to its origin's error path, and what it said in its console: the reads' words when a check fails. */
  const reported: string[] = [];
  tab.on("request", (request) => {
    if (request.url().endsWith(PREVIEW_ERRORS_PATH)) {
      reported.push(request.postData() ?? "");
    }
  });
  const consoled: string[] = [];
  tab.on("console", (message) => consoled.push(message.text()));
  // The address as artifact_browse gave it, from where the run stands (inside
  // a workspace's boundary too): its entry and the page's own document.
  const answered: string[] = [];
  tab.on("response", (response) => {
    if (response.request().resourceType() === "document") {
      answered.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
  const opened = await tab
    .goto(url, { waitUntil: "load" })
    .then((response) => response?.status() ?? 0)
    .catch((error: Error) => error.message.split("\n")[0] ?? "");
  const pagePath = `/__cawco/page/${id}/`;
  kit.check(
    "0: the artifact_browse address opens as given: its entry 302, then the page's own document 200",
    answered[0] === `302 ${PREVIEW_ENTER_PATH}` &&
      answered.includes(`200 ${pagePath}`) &&
      opened === 200,
    `opened ${url}: ${opened}; documents: ${answered.join(", ")}`
  );
  const trail = () =>
    `opened ${url} → ${tab.url()}; reported ${reported.length}: ${reported.join(" | ").slice(0, 800)}; console: ${consoled.slice(-6).join(" | ").slice(0, 600)}`;

  const dialWords = artifactToolWords.pageFault(SPRING);
  const first = await until(
    "artifact_read naming the spring dial and the thrown error",
    read,
    (words) => words.includes(dialWords) && words.includes(THROWN),
    HEARD_MS
  ).catch(() => read());
  const revision = revisionOf(first);
  kit.check(
    "1: the session's artifact_read names the spring dial, its kind and that it is not drawn, at the page's revision now",
    first.includes(artifactToolWords.faultsHead(revision)) &&
      first.includes(dialWords),
    `${first}\n${trail()}`
  );

  const thrownLine =
    served.split("\n").findIndex((line) => line.includes(THROWN)) + 1;
  // The error's line and, under it, the line's own words: both hold the thrown words.
  const thrownSaid = first.split("\n").filter((line) => line.includes(THROWN));
  kit.check(
    "2: the same read names the thrown error, its line in the page as served and the line's words",
    thrownLine > 0 &&
      thrownSaid.length === 2 &&
      thrownSaid[0]?.includes(`line ${thrownLine},`) === true,
    `thrown at line ${thrownLine} of the page as served; read: ${first}`
  );

  await calls.call(fleet, session, UPDATE, { id, html: pageHtml(true) });
  const after = await until(
    "artifact_read at the revised page's revision",
    read,
    (words) => revisionOf(words) > revision,
    HEARD_MS
  ).catch(() => read());
  // The browser takes the revision in place; anything it met there would be read now.
  await tab.waitForTimeout(5000);
  const settled = await read();
  kit.check(
    "3: revised, the session's artifact_read at the new revision names no fault: the old revision's are gone",
    revisionOf(settled) > revision &&
      !settled.includes(dialWords) &&
      !settled.includes(THROWN) &&
      !settled.includes(artifactToolWords.faultsHead(revisionOf(settled))),
    `revision ${revision} → ${revisionOf(after)}; read: ${settled}`
  );
  await tab.close();
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "page-faults-live",
  run,
};
export default spec;
