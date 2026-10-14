/**
 * An artifact's responses reach its session as one event the session reads
 * with its tools, never as the person's words (artifacts/service.ts `send`,
 * server.ts `signalResponses`). The owner's case: one question on a decision
 * page, its note edited, Send — and the busy session was queued three
 * "I changed my picks" / "I sent my picks" bubbles, the note's last Return a
 * literal `\n` in each.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), the decision kit's own card in the desk's panel, the session
 * busy in a turn whose answer the mock streams a word a second (a workspace's
 * boundary lets Claude Code's Bash write nothing, so no slow tool runs there),
 * read from the hub's own records (`sent_messages`), the transcript's DOM and
 * the agent's tool answer:
 *
 * 0. Steps 1–4 all run inside that turn.
 * 1. Picking an option and editing the card's note twice, each ending on a
 *    Return, sends the session nothing.
 * 2. The page's Send: exactly one pending send to the session, of the system
 *    origin `artifact`, its words the responses notice; no person's send.
 *    The panel's head then reads "Send", no count.
 * 3. A third note edit and a second Send while that one waits: still one
 *    pending event, from the first one's `since`; the first is `replaced`.
 * 4. The transcript draws it as one line: "Responses on <page>", "waiting for
 *    the agent"; the words the agent reads ("artifact_read") are nowhere on
 *    screen, and no row of the person's holds it.
 * 5. Once the busy turn ends the agent reads it and calls artifact_read with
 *    the id and `since` it names: the answer holds the pick and the final
 *    note as typed, its inner line break kept and no Return at its end.
 * 6. The line then says "read".
 * 7. A pick after that makes the panel's head read "Send 1".
 *
 *   bun scripts/probe-kit/run.ts artifact-responses
 */
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, ROOT, type Spec, settle } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const READ = "mcp__cawco__artifact_read";
const COMMAND = /PROBE-CALL:(\d+)/g;
const BUSY = "PROBE-BUSY answer slowly";
/** How long the busy turn's answer streams, s: every step of 1–4 happens inside it. */
const BUSY_S = 60;
/** The responses notice (core injected.ts `artifactResponsesNotice`): its id and since. */
const NOTICE =
  /\[CawCo\] The page "([a-z0-9-]+)" has new responses since (\d+)\. Read them with artifact_read\(\{ id: "([0-9a-f-]{36})", since: (\d+) \}\)/;
/** The id in artifact_create's answer, as the tool result carries it. */
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const NAME = "coconut-song";
/** The note as the person leaves it: two lines, the last Return still in the box. */
const FINAL_NOTE =
  "The whole point is the coconut song\nthis has nothing to do with it";

/** The kit page's example card, which the probe's own card replaces. */
const EXAMPLE_CARD =
  /<article class="dp-card" id="example">[\s\S]*?<\/article>/;

/** The kit's page with one card: the song, cover or original, and its note. */
const kitPage = (): string =>
  readFileSync(
    join(ROOT, "packages/hub/skills/decision-page/kit/page.html"),
    "utf8"
  )
    .replace(
      EXAMPLE_CARD,
      `<article class="dp-card" id="song">
    <header><h2>Which song?</h2><span class="dp-state" data-dp-state="song">Not picked</span></header>
    <div class="dp-opts" data-cawco-choice="song" role="group" aria-label="Which song?">
      <button class="dp-opt" type="button" data-option="cover"><b>The cover</b></button>
      <button class="dp-opt" type="button" data-option="original"><b>The original</b></button>
    </div>
    <label class="dp-note">Note<textarea data-dp-note="song" rows="2" placeholder="Anything to add"></textarea></label>
  </article>`
    )
    .replace("What is being decided", "The coconut song");

/** What each numbered message asks the session to call, and what it answered. */
const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
/** The agent's read of the responses: the notice it heard, then artifact_read's answer. */
const reading: {
  answer?: string;
  heard?: Seen;
  input?: { id: string; since: number };
  issued: boolean;
} = { issued: false };

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** Calls `name` with `input`, loading it through ToolSearch first when it is deferred. */
const callTool = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return { everyMs: 5, words: [], tool: { name, input } };
  }
  if (!request.toolNames.includes("ToolSearch")) {
    return text(`${name} is not offered`);
  }
  return {
    everyMs: 5,
    words: [],
    tool: {
      name: "ToolSearch",
      input: { query: `select:${name}`, max_results: 1 },
    },
  };
};

/** When the busy turn's slow answer began streaming. */
const busy: { startedAt?: number } = {};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  // The agent's read, answered: what artifact_read returned.
  if (
    reading.issued &&
    request.afterTool &&
    !reading.answer &&
    request.last.includes('"state"')
  ) {
    reading.answer = request.last;
    return text("Read the responses.");
  }
  const notice = NOTICE.exec(request.last);
  if (notice && !reading.answer) {
    reading.heard ??= request;
    reading.input = { id: notice[3], since: Number(notice[4]) };
    const reply = callTool(request, READ, reading.input);
    if (reply.tool?.name === READ) {
      reading.issued = true;
    }
    return reply;
  }
  if (request.last.includes(BUSY) && !request.afterTool) {
    // The turn runs as long as its answer streams: a word a second.
    busy.startedAt ??= Date.now();
    return {
      everyMs: 1000,
      words: Array.from({ length: BUSY_S }, (_, i) => `step ${i + 1}. `),
    };
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  const reply = callTool(request, ask.name, ask.input);
  if (reply.tool?.name === ask.name) {
    issued.add(marker);
  }
  return reply;
};

interface SendRow {
  body: string;
  origin: string;
  replacedBy: string | null;
  state: string;
  uuid: string;
}

/** The session's send records since `from` (ms), oldest first, from the hub's own table. */
const sendsOf = (dbPath: string, session: string, from: number): SendRow[] => {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db
      .query<
        {
          accepted_at: number;
          body: string | null;
          replaced_by: string | null;
          state: string;
          uuid: string;
        },
        [string]
      >(
        "SELECT uuid, state, body, replaced_by, accepted_at FROM sent_messages WHERE instance_id = ? ORDER BY accepted_at"
      )
      .all(session)
      .filter((row) => Number(row.accepted_at) >= from)
      .map((row) => {
        const body = JSON.parse(row.body ?? "{}") as {
          message?: { content?: unknown };
          origin?: { kind?: string; name?: string };
        };
        const content = body.message?.content;
        const blocks = Array.isArray(content)
          ? (content as { text?: string }[])
          : [];
        const words =
          typeof content === "string"
            ? content
            : blocks.map((block) => block.text ?? "").join("");
        return {
          uuid: row.uuid,
          state: row.state,
          replacedBy: row.replaced_by,
          origin: [body.origin?.kind, body.origin?.name]
            .filter(Boolean)
            .join(":"),
          body: words,
        };
      });
  } finally {
    db.close();
  }
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
  const session = await fleet.spawn("claude", "Responses", fleet.repo);
  const dbPath = fleet.env.CAWCO_DB_PATH ?? "";

  let sent = 0;
  const call = async (tool: string, input: object): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, { name: tool, input });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };

  // The decision page, then the session's page in the desk, the page in its
  // panel (the panel's head stands once the session has an artifact).
  const created = await call(CREATE, {
    kind: "page",
    name: NAME,
    html: kitPage(),
  });
  const id = created.match(ANSWERED_ID)?.[1];
  if (!id) {
    kit.check("the decision page is made", false, created.slice(0, 400));
    return;
  }
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  await open(page, `${base}/session/${session}`, ".artifact-trigger");
  const frame = page.frameLocator('iframe[title="Preview"]');
  await frame.locator('[data-option="cover"]').waitFor({ timeout: 60_000 });
  await until(
    "the page's bridge marking its options",
    () => frame.locator('[data-option="cover"][aria-pressed]').count(),
    (count) => count === 1,
    30_000
  );

  // The session goes busy in its slow answer.
  await fleet.send(session, BUSY);
  await until(
    "the busy turn's slow answer",
    () => busy.startedAt,
    Boolean,
    120_000
  );
  const busyAt = Date.now();

  // 1. A pick and two note edits, each ending on a Return, as typed.
  const read = () =>
    fleet.api<{
      seq: number;
      state: Record<string, { note: string | null; options: string[] }>;
    }>(`/api/instances/${session}/artifacts/${id}`);
  await frame.locator('[data-option="cover"]').click();
  const note = frame.locator('[data-dp-note="song"]');
  const typeNote = async (words: string) => {
    await note.fill("");
    await note.pressSequentially(words, { delay: 10 });
    await note.press("Enter");
    // The kit writes a note 700 ms after typing stops.
    await until(
      "the note in the hub's read",
      read,
      (kept) => kept.state.song?.note === words.trimEnd(),
      10_000
    );
  };
  await typeNote("Thr whole point is thr coconut song");
  await typeNote(
    "The whole point is the coconut song\nthis has nothing to do with jt"
  );
  const beforeSend = sendsOf(dbPath, session, busyAt);
  kit.check(
    "1: a pick and two note edits send the session nothing",
    beforeSend.length === 0,
    JSON.stringify(beforeSend.map((one) => one.body.slice(0, 80)))
  );

  // 2. The page's own Send.
  await frame.locator("[data-dp-send]").click();
  const firstSend = await until(
    "the responses event",
    () => sendsOf(dbPath, session, busyAt),
    (rows) => rows.length > 0,
    15_000
  ).catch(() => sendsOf(dbPath, session, busyAt));
  const firstEvent = firstSend.find((one) => one.origin === "system:artifact");
  kit.check(
    "2: the Send makes exactly one pending send, of origin system:artifact, its words the notice; no person's send",
    firstSend.length === 1 &&
      firstEvent?.state === "pending" &&
      NOTICE.test(firstEvent.body) &&
      !firstSend.some((one) => one.origin === "human"),
    JSON.stringify(firstSend)
  );
  // The panel's head counts only what the session has not been sent: none now.
  const sendLabel = page.locator(".preview-pane .send .send-label");
  const labelReads = (want: string) =>
    until(
      `the head reading "${want}"`,
      () => sendLabel.innerText(),
      (words) => words.trim() === want,
      10_000
    ).catch(() => sendLabel.innerText());
  const afterSend = await labelReads("Send");
  kit.check(
    "2b: once the Send is taken the panel's head reads Send, no count",
    afterSend.trim() === "Send",
    afterSend
  );

  // 3. A third edit and a second Send while it waits.
  await typeNote(FINAL_NOTE);
  await frame.locator("[data-dp-send]").click();
  const secondSend = await until(
    "the second responses event",
    () => sendsOf(dbPath, session, busyAt),
    (rows) => rows.length > 1,
    15_000
  ).catch(() => sendsOf(dbPath, session, busyAt));
  const pending = secondSend.filter((one) => one.state === "pending");
  const since = Number(NOTICE.exec(pending[0]?.body ?? "")?.[2] ?? -1);
  kit.check(
    "3: a second Send while the first waits leaves one pending event, from the first one's since; the first is replaced",
    pending.length === 1 &&
      pending[0].origin === "system:artifact" &&
      since === Number(NOTICE.exec(firstEvent?.body ?? "")?.[2] ?? -2) &&
      secondSend.find((one) => one.uuid === firstEvent?.uuid)?.state ===
        "replaced" &&
      !secondSend.some((one) => one.origin === "human"),
    JSON.stringify(secondSend)
  );

  // 4. The transcript's one line, while the agent has not read it.
  const line = page.locator("[data-artifact-responses]");
  await until(
    "the responses line",
    () => line.count(),
    (count) => count >= 1,
    15_000
  ).catch(() => 0);
  await settle(page);
  const drawn = await page.evaluate((artifact) => {
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>("[data-artifact-responses]")
    );
    const own = Array.from(
      document.querySelectorAll<HTMLElement>(".turn.you")
    ).map((row) => row.innerText);
    return {
      lines: rows.map((row) => ({
        artifact: row.dataset.artifactResponses,
        text: row.innerText.replace(/\s+/g, " ").trim(),
        name: row.querySelector("button")?.textContent ?? null,
      })),
      instruction: document.body.innerText.includes("artifact_read"),
      personHolds: own.filter(
        (words) =>
          words.includes("[CawCo]") ||
          words.includes("picks") ||
          words.includes(artifact)
      ),
    };
  }, NAME);
  kit.check(
    "4: one line, 'Responses on coconut-song' and 'waiting for the agent'; no 'artifact_read' on screen; no person's row holds it",
    drawn.lines.length === 1 &&
      drawn.lines[0].artifact === id &&
      drawn.lines[0].name === NAME &&
      drawn.lines[0].text.includes(`Responses on ${NAME}`) &&
      drawn.lines[0].text.includes("waiting for the agent") &&
      !drawn.instruction &&
      drawn.personHolds.length === 0,
    JSON.stringify(drawn)
  );
  // The busy answer still streaming, and the agent not yet told: 1–4 ran in its turn.
  const busyFor = Date.now() - (busy.startedAt ?? 0);
  kit.check(
    "0: 1–4 ran while the session was busy",
    busyFor < BUSY_S * 1000 && reading.heard === undefined,
    `${busyFor} ms into a ${BUSY_S} s answer; the notice ${reading.heard ? "already heard" : "not heard yet"}`
  );
  await page.screenshot({
    path: join(kit.out, "artifact-responses-waiting.png"),
  });

  // 5. The agent reads it once the slow tool ends.
  await until(
    "the agent's artifact_read answer",
    () => reading.answer,
    Boolean,
    (BUSY_S + 90) * 1000
  ).catch(() => undefined);
  const answer = reading.answer ?? "";
  const parsed = (() => {
    const at = answer.indexOf("{");
    try {
      return JSON.parse(answer.slice(at, answer.lastIndexOf("}") + 1)) as {
        state?: Record<string, { note: string | null; options: string[] }>;
      };
    } catch {
      return null;
    }
  })();
  kit.check(
    "5: the agent calls artifact_read with the notice's id and since, and reads the pick and the final note as typed, no Return at its end",
    reading.input?.id === id &&
      reading.input.since === since &&
      parsed?.state?.song?.options.join() === "cover" &&
      parsed.state.song.note === FINAL_NOTE,
    `heard: ${reading.heard?.last.slice(0, 240)}; called with ${JSON.stringify(reading.input)}; answered ${answer.slice(0, 400)}`
  );

  // 6. The line says the agent has read it.
  const state = line.first().locator(".hstatus");
  await until(
    "the line saying read",
    () => state.innerText(),
    (word) => word.trim() === "read",
    30_000
  ).catch(() => undefined);
  const readWord = (await state.innerText()).trim();
  kit.check(
    "6: the line then says read",
    readWord === "read" && (await line.count()) === 1,
    readWord
  );
  await page.screenshot({ path: join(kit.out, "artifact-responses-read.png") });

  // 7. A pick after the Send is counted again.
  await frame.locator('[data-option="original"]').click();
  const afterPick = await labelReads("Send 1");
  kit.check(
    "7: a later pick makes the panel's head read Send 1",
    afterPick.trim() === "Send 1",
    afterPick
  );
};

const spec: Spec = { name: "artifact-responses", run };
export default spec;
