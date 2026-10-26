/**
 * The server's render reads the hub only through its loads' `event.fetch`;
 * a read a component's render path makes (a `$derived`, a getter in markup,
 * an `{#await}`) is the browser's, after hydration, against its own origin
 * (b7b510dbb's rule, session-names.svelte.ts). A relative `fetch` on the
 * server has no origin: adapter-node throws `fetch() URL is invalid`, and
 * `vite dev` throws SvelteKit's `ssr_fetch_relative_url` out of the render.
 *
 *   bun scripts/probe-kit/run.ts web ssr-hub-reads
 *
 * One conversation, `/session/<id>`, loaded cold from the dev server against
 * a stub hub that answers its transcript page, so its rows render on the
 * server. Each leg reads the server's log across that cold load (no
 * `ssr_fetch_relative_url`, no `fetch() URL is invalid`, no 500), finds its
 * surface in the server's HTML, and then holds the browser to the read:
 *
 * - artifact chips (artifact-names.svelte.ts `artifactNamed`,
 *   `artifactMarks`): an agent's message names an artifact
 *   (`cawco:artifact/<id>`) and a pin on it (`cawco:pin/<id>/1`). The
 *   server draws both links by their written labels (references.ts: an
 *   artifact not named yet is its label); the browser asks the hub for the
 *   artifact (`GET /api/artifacts/<id>`) and its pins, draws both chips, and
 *   the artifact's takes the hub's name.
 * - artifact read again: a second artifact in the same message, whose first
 *   read the hub refuses (503), is not taken as gone. The browser says why
 *   in one console line (`[cawco] reading artifact <id> failed: …`) and
 *   keeps nothing, so the message's next draw asks again: the stub holds the
 *   first artifact's answer until the refusal is out, and that answer
 *   landing redraws the message. The chip takes the hub's name on the
 *   second read, with no reload.
 * - sent captions (ToolGroup.svelte `captionText`): a `send_to_user` call
 *   attached a lone `.vtt` file. The server draws the row, the file
 *   waiting; the browser reads it through the hub
 *   (`/api/agents/<machine>/media`) and draws its thumb, never the Shot a
 *   refused read draws.
 */
import { readFile } from "node:fs/promises";
import type {
  TranscriptBlock,
  TranscriptPage,
} from "../../../../packages/core/src/transcript-types";
import type { Kit, Spec } from "../../kit";

const SESSION = "5e5a1c0d-7b2e-4f6a-9c1d-2b3a4c5d6e7f";
const MACHINE = "ssr-machine";
const ARTIFACT = "art-ssr-launch-plan";
const ARTIFACT_LABEL = "PROBE-label-written";
const ARTIFACT_NAME = "PROBE-launch-plan-named-by-hub";
/** The artifact whose first read the hub refuses. */
const FLAKY = "art-ssr-refused-once";
const FLAKY_LABEL = "PROBE-flaky-label-written";
const FLAKY_NAME = "PROBE-flaky-named-on-second-read";
const VTT_PATH = "/home/probe/clips/PROBE-captions.vtt";
const VTT_WORDS = "PROBE-caption-line-read-by-browser";
const AGENT_WORDS = "PROBE-agent-message-rendered-on-server";

const at = "2026-10-22T12:00:00.000Z";
const block = (
  id: string,
  type: TranscriptBlock["type"],
  content: string,
  extra: Partial<TranscriptBlock> = {}
): TranscriptBlock => ({
  id,
  instanceId: SESSION,
  type,
  content,
  timestamp: at,
  ...extra,
});

const PAGE: TranscriptPage = {
  blocks: [
    block("u1", "user", "Show me the plan and the captions."),
    block(
      "a1",
      "assistant",
      `${AGENT_WORDS}: see [${ARTIFACT_LABEL}](cawco:artifact/${ARTIFACT}) and [its first pin](cawco:pin/${ARTIFACT}/1), then [${FLAKY_LABEL}](cawco:artifact/${FLAKY}).`
    ),
    block("t1", "tool.use", "", {
      toolCallId: "call-send",
      metadata: {
        toolName: "mcp__cawco__send_to_user",
        toolInput: { message: "The captions", attachments: [VTT_PATH] },
        toolStatus: "success",
        toolResult: "sent",
      },
    }),
  ],
  branches: [],
  cursor: null,
  where: {
    cwd: "/home/probe",
    harness: "claude",
    machineId: MACHINE,
    sessionKey: "probe-ssr",
  },
};

/** What the stub hub was asked, in order, each tagged with the phase it came in. */
interface Asked {
  path: string;
  phase: "server" | "browser";
}

/**
 * A hub that answers this conversation's reads and refuses every other
 * (503), its socket taken and echoed as the benches' stand-in does, so the
 * page stays connecting and raises no banner.
 */
function stubHub(asked: Asked[], phase: () => Asked["phase"]): string {
  let flakyReads = 0;
  const refused = Promise.withResolvers<void>();
  const hub = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    fetch: (request, server) => {
      if (server.upgrade(request)) {
        return;
      }
      const url = new URL(request.url);
      const path = `${url.pathname}${url.search}`;
      asked.push({ path, phase: phase() });
      if (url.pathname === `/api/instances/${SESSION}/transcript`) {
        return Response.json(PAGE);
      }
      if (url.pathname === `/api/artifacts/${FLAKY}`) {
        flakyReads += 1;
        if (flakyReads === 1) {
          setTimeout(refused.resolve, 0);
          return new Response("PROBE-hub-busy", { status: 503 });
        }
        return Response.json({
          id: FLAKY,
          instanceId: SESSION,
          kind: "page",
          name: FLAKY_NAME,
          shown: false,
        });
      }
      if (url.pathname === `/api/artifacts/${ARTIFACT}`) {
        // Answered once the refusal is out: its landing is the next draw.
        return refused.promise.then(() =>
          Response.json({
            id: ARTIFACT,
            instanceId: SESSION,
            kind: "page",
            name: ARTIFACT_NAME,
            shown: false,
          })
        );
      }
      if (url.pathname === `/api/instances/${SESSION}/artifacts/comments`) {
        return Response.json({ artifacts: [{ id: ARTIFACT, pins: [] }] });
      }
      if (
        url.pathname === `/api/agents/${MACHINE}/media` &&
        url.searchParams.get("path") === VTT_PATH
      ) {
        return new Response(
          `WEBVTT\n\n00:00.000 --> 00:01.000\n${VTT_WORDS}\n`,
          {
            headers: { "content-type": "text/vtt" },
          }
        );
      }
      return new Response("no hub", { status: 503 });
    },
    websocket: {
      idleTimeout: 0,
      message: (socket, message) => {
        socket.send(message);
      },
    },
  });
  hub.unref();
  return `http://127.0.0.1:${hub.port}`;
}

/** The dev server's stderr from now on (kit.ts `serve`), as lines. */
async function serverLog(base: string): Promise<() => Promise<string[]>> {
  const file = `${process.env.TMPDIR ?? ".probe"}/probe-kit/vite-dev-${new URL(base).port}.err.log`;
  const read = () => readFile(file).catch(() => Buffer.alloc(0));
  const from = (await read()).length;
  return async () =>
    (await read()).subarray(from).toString("utf8").split("\n").filter(Boolean);
}

/** A line of the server's log that is this failure. */
const RELATIVE_FETCH =
  /ssr_fetch_relative_url|fetch\(\) URL is invalid|relative URL/u;

interface Cold {
  html: string;
  /** The server's log lines that are a relative fetch failing. */
  relative: string[];
  status: number;
}

const spec: Spec = {
  group: "The hub and machines",
  name: "ssr-hub-reads",
  async run(kit: Kit) {
    const asked: Asked[] = [];
    let phase: Asked["phase"] = "server";
    const base = await kit.benchFor(stubHub(asked, () => phase));
    // Warm the dev server's module graph on another route, so the cold load
    // below is the conversation's first server render, not vite's first compile.
    await fetch(`${base}/session`).catch(() => undefined);

    // The cold load: the server's render alone, as a reload's document request.
    const said = await serverLog(base);
    const response = await fetch(`${base}/session/${SESSION}`, {
      headers: { accept: "text/html" },
    });
    const cold: Cold = {
      status: response.status,
      html: await response.text(),
      relative: [],
    };
    // A rejection the render left behind is logged a moment after it answers.
    await Bun.sleep(500);
    cold.relative = (await said()).filter((line) => RELATIVE_FETCH.test(line));
    const coldDetail = JSON.stringify({
      status: cold.status,
      relative: cold.relative.slice(0, 3),
    });

    phase = "browser";
    const page = await kit.page("desk", { engine: "chromium" });
    const consoleLines: string[] = [];
    page.on("console", (message) => {
      consoleLines.push(message.text());
    });
    await page.goto(`${base}/session/${SESSION}`, {
      waitUntil: "domcontentloaded",
    });

    // artifact chips
    const chipNamed = await page
      .waitForFunction(
        ([id, name]) =>
          document
            .querySelector(`[data-artifact-chip="${id}"]`)
            ?.getAttribute("title") === name,
        [ARTIFACT, ARTIFACT_NAME] as const,
        { timeout: 20_000 }
      )
      .then(
        () => true,
        () => false
      );
    const pinChip = await page
      .locator(`[data-pin-chip="${ARTIFACT}/1"]`)
      .count();
    const artifactReads = asked.filter((one) =>
      one.path.startsWith(`/api/artifacts/${ARTIFACT}`)
    );
    const pinReads = asked.filter((one) =>
      one.path.startsWith(`/api/instances/${SESSION}/artifacts/comments`)
    );
    kit.check(
      "artifact chips: loaded cold, the server renders the agent's message and its artifact link's label with no relative fetch in its log; the browser asks the hub for the artifact and its pins, and the chip takes the hub's name",
      cold.status === 200 &&
        cold.relative.length === 0 &&
        cold.html.includes(AGENT_WORDS) &&
        cold.html.includes(ARTIFACT_LABEL) &&
        chipNamed &&
        pinChip > 0 &&
        artifactReads.length > 0 &&
        artifactReads.every((one) => one.phase === "browser") &&
        pinReads.length > 0 &&
        pinReads.every((one) => one.phase === "browser"),
      JSON.stringify({
        cold: JSON.parse(coldDetail),
        inHtml: {
          words: cold.html.includes(AGENT_WORDS),
          label: cold.html.includes(ARTIFACT_LABEL),
        },
        chipNamed,
        pinChip,
        artifactReads,
        pinReads,
      })
    );

    // artifact read again
    const flakyNamed = await page
      .waitForFunction(
        ([id, name]) =>
          document
            .querySelector(`[data-artifact-chip="${id}"]`)
            ?.getAttribute("title") === name,
        [FLAKY, FLAKY_NAME] as const,
        { timeout: 20_000 }
      )
      .then(
        () => true,
        () => false
      );
    const flakyReads = asked.filter((one) =>
      one.path.startsWith(`/api/artifacts/${FLAKY}`)
    );
    const failedLines = consoleLines.filter((line) =>
      line.startsWith(`[cawco] reading artifact ${FLAKY} failed: `)
    );
    kit.check(
      "artifact read again: the hub refuses the second artifact's first read (503); the browser says why in one line and keeps nothing, the next draw asks again, and its chip takes the hub's name with no reload",
      flakyReads.length === 2 &&
        flakyReads.every((one) => one.phase === "browser") &&
        failedLines.length === 1 &&
        flakyNamed,
      JSON.stringify({ flakyReads, failedLines, flakyNamed })
    );

    // sent captions
    // The read's answer is the file's thumb (DocThumb); a refused one is a
    // Shot naming the file missing.
    const thumbRead = await page
      .locator(
        `[data-slot="shots"] button[data-slot="doc"][aria-label="Open ${VTT_PATH.split("/").at(-1)}"]`
      )
      .waitFor({ timeout: 20_000 })
      .then(
        () => true,
        () => false
      );
    const mediaReads = asked.filter((one) =>
      one.path.startsWith(`/api/agents/${MACHINE}/media`)
    );
    kit.check(
      "sent captions: loaded cold, the server renders the send_to_user row and its captions file with no relative fetch in its log; the browser reads the file through the hub and draws its thumb",
      cold.status === 200 &&
        cold.relative.length === 0 &&
        cold.html.includes('data-slot="shots"') &&
        thumbRead &&
        mediaReads.length > 0 &&
        mediaReads.every((one) => one.phase === "browser"),
      JSON.stringify({
        cold: JSON.parse(coldDetail),
        shotsInHtml: cold.html.includes('data-slot="shots"'),
        thumbRead,
        mediaReads,
      })
    );
    await page.close();
  },
};
export default spec;
