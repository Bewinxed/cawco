/**
 * Everything said to and by Caw is his thread's record, on every surface
 * (caw.ts `personSent`, `answerUnreplied`; server.ts `deliverSend`;
 * thread-repair.ts). On a scratch fleet (real hub, agent and sessiond;
 * Claude Code against the mock model), the built dashboard at the desk and
 * the built app on an iPhone simulator, in order:
 *
 * a. Web: your words in the thread's own composer land in thread_messages,
 *    the page shows the thread working (its Stop) while his turn runs, and
 *    his thread_reply lands in the thread.
 * a. App path: words sent to Caw's session (the socket `send` the app's
 *    composer and a push's Reply use) land in the thread under the send's
 *    uuid, wake him with the thread's words, the thread reads working, and
 *    his reply lands.
 * b. A turn your words woke that ends without thread_reply: what he said in
 *    plain text is his message in the thread, from the web and the app path.
 * c. His question parked in the thread, then your words beside it: the card
 *    stays parked (needs-you) and nothing is dismissed; your words are in
 *    the thread, waiting. Web: the composer's question minimized, then
 *    written. App (the simulator): written in Caw's session under the card,
 *    which is still there after. Answered in the app, he reads both and
 *    each answer lands.
 * d. The repair: a thread under the owner's thread's id whose words went to
 *    Caw's session alone (sent while his session was no project's lead, as
 *    the app's went before) is written in once as the hub restarts, in
 *    order, at their times, with the hub's note; a second restart adds
 *    nothing.
 *
 *   bash apps/apple/scripts/build-both.sh ios
 *   bun scripts/probe-kit/run.ts caw-threads
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, ROOT, type Spec } from "../kit";

const CAW = "You are Caw";
const REPLY = "mcp__cawco__thread_reply";
const ASK = "AskUserQuestion";
const THREAD_ID = /thread ([0-9a-f-]{36})/;
const QUESTION = "PROBE-VOICE: which voice?";
/** The owner's thread (thread-repair.ts `REPAIRED_THREAD`). */
const REPAIRED = "ad5f8277-a861-4110-9089-b8d423699beb";
const REPAIR_NOTE = "Hub · thread repaired";
const OWNER_WORDS =
  "PROBE-PLAIN-OLD https://x.com/hectorserrranoo/status/2108260769603486100?s=46 read this video";
const AXE = "/opt/homebrew/bin/axe";
const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
  device: "iPhone 16 Pro",
};
const TRAILING_SLASH = /\/$/;
const PLAIN = /PROBE-PLAIN-([A-Z]+)/g;
const WAKE_BODY = /\):\n\n([\s\S]*?)\n\nAnswer with thread_reply/g;
const SLOW_REPLY = /PROBE-REPLY-([A-Z]+)/g;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const tool = (name: string, input: object, everyMs = 5): Reply => ({
  everyMs,
  words: [],
  tool: { name, input },
});
/** Calls `name`, loading it with ToolSearch first when it is deferred. */
const call = (
  request: Seen,
  name: string,
  input: object,
  everyMs = 5
): Reply => {
  if (request.toolNames.includes(name)) {
    return tool(name, input, everyMs);
  }
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};
/** The one-shot calls made, by key. */
const made = new Set<string>();
/** The `PROBE-PLAIN-X` asks answered, by X. */
const answeredPlain = new Set<string>();

/**
 * Caw's side, by the newest event: `PROBE-REPLY-X` answers with a slow
 * thread_reply (a turn of ~9 s), `PROBE-PLAIN-X` in slow plain words and no
 * thread_reply, `PROBE-ASK` with his question.
 */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (!request.all.includes(CAW)) {
    return text("ok");
  }
  const wake = request.last;
  const thread = THREAD_ID.exec(wake)?.[1] ?? "";
  // A thread's wake names the thread by its title first: your words are
  // what stands between its "):" and "Answer with thread_reply".
  // Prompts queued behind a turn may be read as one: each body counts.
  const bodies = [...wake.matchAll(WAKE_BODY)].map((m) => m[1]).join("\n");
  const event = bodies || wake;
  const replying = [...event.matchAll(SLOW_REPLY)].at(-1)?.[1];
  if (replying) {
    if (made.has(`reply ${replying}`)) {
      return text("Sent.");
    }
    const reply = call(
      request,
      REPLY,
      { thread, body: `PROBE-REPLY-${replying} done` },
      1500
    );
    if (reply.tool?.name === REPLY) {
      made.add(`reply ${replying}`);
    }
    return reply;
  }
  // Every plain ask not yet answered, wherever the turn read it: words sent
  // beside his question reach the model mid-turn, after its answer, as a
  // `system` message ("The user sent a new message while you were working"),
  // which `last` and `all` (user messages only) do not carry; the request's
  // own body does.
  const plain = [
    ...new Set([...request.body.matchAll(PLAIN)].map((m) => m[1] ?? "")),
  ].filter((tag) => tag && !answeredPlain.has(tag));
  if (plain.length > 0) {
    for (const tag of plain) {
      answeredPlain.add(tag);
    }
    return {
      everyMs: 800,
      words: plain.flatMap((tag, i) => [
        i ? ". " : "",
        "Plain ",
        "answer ",
        tag ?? "",
      ]),
    };
  }
  if (event.includes("PROBE-ASK")) {
    if (made.has("ask")) {
      return text("Noted your pick.");
    }
    made.add("ask");
    return tool(ASK, {
      questions: [
        {
          question: QUESTION,
          header: "Voice",
          multiSelect: false,
          options: [
            { label: "Plain", description: "Say it plainly." },
            { label: "Warm", description: "Say it warmly." },
          ],
        },
      ],
    });
  }
  return text("ok");
};

interface Row {
  answer: string | null;
  author: string;
  body: string;
  created_at: number;
  id: string;
  note_title: string | null;
}
interface Ask {
  instanceId: string;
  machineId: string;
  payload: {
    input: Record<string, unknown>;
    threadId?: string;
    toolName: string;
  };
  requestId: string;
}
interface Node {
  frame?: { x: number; y: number; width: number; height: number };
  id?: string;
  label?: string;
}

/** {@link until}, whose reading is there once it is accepted. */
async function got<T>(
  label: string,
  read: () => T | undefined | Promise<T | undefined>,
  accept: (value: T | undefined) => boolean,
  ms: number
): Promise<T> {
  const value = await until(label, read, accept, ms);
  if (value === undefined) {
    throw new Error(`${label}: nothing was read`);
  }
  return value;
}

async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || out.trim()}`);
  }
  return out;
}

function appPath(): string {
  if (process.env.PROBE_IOS_APP) {
    return process.env.PROBE_IOS_APP;
  }
  const home = process.env.HOME ?? "";
  const top = ROOT.replace(TRAILING_SLASH, "");
  const name = top === join(home, "cockpit") ? "main" : top.split("/").at(-1);
  return join(
    process.env.XDG_CACHE_HOME ?? join(home, "Library", "Caches"),
    "cawco-apple",
    name ?? "main",
    "DerivedData/Build/Products/Debug-iphonesimulator/CawCo.app"
  );
}

/** What a failed run leaves in its out folder: the mock's last asks, every thread's rows, the hub's log. */
const evidence = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  await mkdir(kit.out, { recursive: true });
  await writeFile(
    join(kit.out, "seen.json"),
    JSON.stringify(
      fleet.seen.slice(-12).map((s) => ({
        afterTool: s.afterTool,
        last: s.last.slice(-400),
        tools: s.toolNames.filter((n) => n.includes("cawco") || n === ASK),
      })),
      null,
      2
    )
  );
  await writeFile(
    join(kit.out, "requests.json"),
    JSON.stringify(
      fleet.seen.slice(-3).map((s) => {
        const { messages } = JSON.parse(s.body) as { messages?: unknown[] };
        return (messages ?? []).slice(-3);
      }),
      null,
      2
    )
  );
  await writeFile(
    join(kit.out, "rows.json"),
    JSON.stringify(
      fleet.query(
        "SELECT thread_id, author, body, note_title, answer, created_at FROM thread_messages ORDER BY created_at"
      ),
      null,
      2
    )
  );
  await writeFile(
    join(kit.out, "sends.json"),
    JSON.stringify(
      {
        sends: fleet.query(
          "SELECT uuid, instance_id, state, reason, owed IS NOT NULL AS owed, accepted_at, substr(body, 1, 200) AS body FROM sent_messages ORDER BY accepted_at"
        ),
        turns: fleet.query("SELECT * FROM lead_turns"),
        leads: fleet.query(
          "SELECT id, status, turn_open_at, turn_ended_at FROM instances WHERE role = 'lead'"
        ),
      },
      null,
      2
    )
  );
  await writeFile(join(kit.out, "sessiond.log"), await fleet.logs("sessiond"));
  await writeFile(join(kit.out, "hub.log"), await fleet.logs("hub"));
  await writeFile(join(kit.out, "agent.log"), await fleet.logs("agent"));
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  try {
    await steps(kit, fleet);
  } catch (error) {
    await evidence(kit, fleet).catch(() => undefined);
    throw error;
  }
};

const steps = async (kit: Kit, fleet: KitFleet) => {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const home = fleet.env.HOME as string;
  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`git init -q -b main && echo caw > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Caw threads",
    machineId: MACHINE,
    cwd: src,
    caw: true,
  });
  const started = await fleet.api<{ thread: { id: string } }>(
    `/api/projects/${project.id}/threads`,
    { body: "PROBE-REPLY-HELLO hello" }
  );
  const { id: threadId } = started.thread;
  const lead = await got(
    "Caw's session",
    () =>
      fleet.query<{ lead_instance_id: string | null }>(
        "SELECT lead_instance_id FROM projects WHERE id = ?",
        project.id
      )[0]?.lead_instance_id ?? undefined,
    Boolean,
    180_000
  );

  const rows = (thread = threadId) =>
    fleet.query<Row>(
      "SELECT id, author, body, note_title, answer, created_at FROM thread_messages WHERE thread_id = ? ORDER BY created_at, id",
      thread
    );
  const said = (author: string, words: string, thread = threadId) =>
    until(
      `${author} “${words}” in the thread`,
      () => rows(thread).find((r) => r.author === author && r.body === words),
      Boolean,
      120_000
    );
  /** His message that says `words`, among whatever else it says. */
  const saidAmong = (words: string) =>
    until(
      `caw “…${words}…” in the thread`,
      () => rows().find((r) => r.author === "caw" && r.body.includes(words)),
      Boolean,
      120_000
    );
  const statusOf = async () =>
    (
      await fleet.api<{ id: string; status: string }[]>(
        `/api/projects/${project.id}/threads`
      )
    ).find((t) => t.id === threadId)?.status;
  /** Every status the thread reads while `during` runs, polled. */
  const statuses = async (during: Promise<unknown>): Promise<Set<string>> => {
    const seen = new Set<string>();
    let over = false;
    const ended = () => {
      over = true;
    };
    during.then(ended, ended);
    while (!over) {
      // biome-ignore lint/performance/noAwaitInLoops: one read at a time, in order
      const [now] = await Promise.all([statusOf(), Bun.sleep(150)]);
      seen.add(now ?? "none");
    }
    // Its failure is the spec's.
    await during;
    return seen;
  };
  const pending = () => fleet.api<Ask[]>("/api/pending");
  const dismissed = () =>
    rows().filter((r) => r.answer?.includes('"dismissed"')).length;
  /**
   * His turn over: the mock reads only a turn's opening words, so the next
   * words go once the last turn has ended (words read mid-turn are the
   * hub's to place, and are, but the mock cannot see them).
   */
  const idle = () =>
    until("the thread ready", statusOf, (read) => read === "ready", 120_000);
  await said("caw", "PROBE-REPLY-HELLO done");
  await idle();
  kit.check("Caw started and answered the first thread", true);

  // ── a. web: the thread's own composer ───────────────────────────────
  const base = await fleet.dashboard();
  const page: Page = await kit.page("desk");
  const FIELD = 'textarea[aria-label="Message the project"]';
  await open(page, `${base}/session/thread:${threadId}`, FIELD, 90_000);
  const stopShown = page
    .locator('button[aria-label="Stop the agent"]')
    .waitFor({ timeout: 30_000 })
    .then(
      () => true,
      () => false
    );
  await page.fill(FIELD, "PROBE-REPLY-WEB from the web");
  await page.keyboard.press("Enter");
  const webYou = await said("you", "PROBE-REPLY-WEB from the web");
  const webSeen = await statuses(said("caw", "PROBE-REPLY-WEB done"));
  kit.check(
    "a web: your words land in the thread, the page shows it working, his reply lands",
    Boolean(webYou) && (await stopShown) && webSeen.has("working"),
    `statuses ${[...webSeen].join(",")}`
  );

  // ── a. app path: the socket send to his session ─────────────────────
  await idle();
  const appUuid = await fleet.send(lead, "PROBE-REPLY-APP from the app");
  const appYou = await said("you", "PROBE-REPLY-APP from the app");
  const appSeen = await statuses(said("caw", "PROBE-REPLY-APP done"));
  const [wake] = fleet.query<{ body: string }>(
    "SELECT body FROM sent_messages WHERE uuid = ?",
    appUuid
  );
  kit.check(
    "a app path: your words land in the thread under the send's uuid, wake him with the thread's words, it reads working, his reply lands",
    appYou?.id === appUuid &&
      !!wake?.body.includes("You wrote in the thread") &&
      !!wake?.body.includes('"kind":"system"') &&
      appSeen.has("working"),
    `row ${appYou?.id}; wake ${wake?.body.slice(0, 120)}; statuses ${[...appSeen].join(",")}`
  );

  // ── b. a turn that ends without thread_reply ────────────────────────
  await idle();
  await fleet.send(lead, "PROBE-PLAIN-B from the app");
  const plainApp = await said("caw", "Plain answer B");
  await idle();
  await fleet.api(`/api/projects/${project.id}/threads/${threadId}/messages`, {
    body: "PROBE-PLAIN-W from the web",
  });
  const plainWeb = await said("caw", "Plain answer W");
  kit.check(
    "b: a turn that ends without thread_reply leaves its plain text in the thread (app path and web)",
    Boolean(plainApp && plainWeb)
  );

  // ── c. his question, then your words beside it ──────────────────────
  await idle();
  await fleet.api(`/api/projects/${project.id}/threads/${threadId}/messages`, {
    body: "PROBE-ASK which voice should we use",
  });
  const asked = await got(
    "his question parked",
    async () =>
      (await pending()).find(
        (a) => a.payload.toolName === ASK && a.payload.threadId === threadId
      ),
    Boolean,
    120_000
  );
  /** Whether the thread's page shows his question. */
  const cardShown = () =>
    page
      .getByText(QUESTION)
      .first()
      .waitFor({ timeout: 20_000 })
      .then(
        () => true,
        () => false
      );
  const shownBefore = await cardShown();
  // The thread composer's own route (ThreadPane `sayInThread`).
  await fleet.api(`/api/projects/${project.id}/threads/${threadId}/messages`, {
    body: "PROBE-PLAIN-CW beside the card",
  });
  await said("you", "PROBE-PLAIN-CW beside the card");
  await Bun.sleep(2000);
  const webStill = (await pending()).some(
    (a) => a.requestId === asked.requestId
  );
  const webStatus = await statusOf();
  const shownAfter = await cardShown();
  kit.check(
    "c web: your words beside his question land in the thread; the card stays parked and on the page, needs-you, nothing dismissed",
    webStill &&
      shownBefore &&
      shownAfter &&
      webStatus === "needs-you" &&
      dismissed() === 0,
    `parked ${webStill}; on the page ${shownBefore}→${shownAfter}; status ${webStatus}; dismissed ${dismissed()}`
  );

  const app = appPath();
  if (kit.check("the app is built", existsSync(app), app)) {
    let sim: MacSim | undefined;
    try {
      sim = await macSim(SIM);
      const { udid } = sim;
      await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
      await sh(`xcrun simctl install ${udid} "${app}"`);
      const tree = async (): Promise<Node[]> => {
        const out: Node[] = [];
        const walk = (node: Record<string, unknown>) => {
          out.push({
            id: node.AXUniqueId as string | undefined,
            label: (node.AXLabel ?? node.label) as string | undefined,
            frame: node.frame as Node["frame"],
          });
          for (const kid of (node.children as
            | Record<string, unknown>[]
            | undefined) ?? []) {
            walk(kid);
          }
        };
        const roots = JSON.parse(
          await sh(`${AXE} describe-ui --udid ${udid}`)
        ) as Record<string, unknown>[];
        for (const root of roots) {
          walk(root);
        }
        return out;
      };
      const find = (id: string) =>
        got(
          `${id} on the phone`,
          async () => (await tree()).find((n) => n.id === id),
          Boolean,
          60_000
        );
      const tap = async (node: Node) => {
        const f = node.frame;
        if (!f) {
          throw new Error(`nothing to tap for ${node.id}`);
        }
        await sh(
          `${AXE} tap -x ${Math.round(f.x + f.width / 2)} -y ${Math.round(f.y + f.height / 2)} --udid ${udid}`
        );
      };
      await until(
        "the app launched",
        () =>
          sh(
            `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${lead} >/dev/null`
          ).then(() => true),
        Boolean,
        60_000
      );
      const card = await find("prompt-answer");
      kit.check("c app: his question's card stands in his session", !!card);
      await tap(await find("steer-message"));
      await Bun.sleep(800);
      await sh(`${AXE} type 'PROBE-PLAIN-CI from the phone' --udid ${udid}`);
      await tap(await find("send-steer"));
      const phoneYou = await said("you", "PROBE-PLAIN-CI from the phone");
      await Bun.sleep(2000);
      const phoneStill = (await pending()).some(
        (a) => a.requestId === asked.requestId
      );
      const cardStill = (await tree()).some((n) => n.id === "prompt-answer");
      const phoneStatus = await statusOf();
      kit.check(
        "c app: words written under the card land in the thread; the card stays, parked and shown, needs-you, nothing dismissed",
        !!phoneYou &&
          phoneStill &&
          cardStill &&
          phoneStatus === "needs-you" &&
          dismissed() === 0,
        `parked ${phoneStill}; card shown ${cardStill}; status ${phoneStatus}; dismissed ${dismissed()}`
      );
      // Answered on the phone: a choice, then Answer.
      await tap(await find("prompt-option-1-1"));
      await tap(await find("prompt-answer"));
    } finally {
      await sim?.release();
    }
  } else {
    await fleet.post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "permission.answer",
      machineId: asked.machineId,
      sessionId: asked.instanceId,
      payload: {
        instanceId: asked.instanceId,
        requestId: asked.requestId,
        method: "resolvePermission",
        args: [
          asked.requestId,
          {
            behavior: "allow",
            // core's `answeredQuestionInput`: the input with its answers.
            updatedInput: {
              ...asked.payload.input,
              answers: { [QUESTION]: "Plain" },
            },
          },
        ],
      },
    });
  }
  const answeredRow = await until(
    "your answer in the thread",
    () => rows().find((r) => r.answer?.includes('"answered"')),
    Boolean,
    60_000
  );
  const cw = await saidAmong("Plain answer CW");
  kit.check(
    "c: answered, he reads what you wrote beside it, and his answer lands",
    Boolean(answeredRow && cw) && dismissed() === 0
  );
  if (existsSync(app)) {
    kit.check(
      "c app: what you wrote on the phone is read and answered in the thread",
      Boolean(await saidAmong("Plain answer CI"))
    );
  }

  // ── d. the owner's thread, repaired once ────────────────────────────
  const now = Date.now();
  fleet.write(
    "INSERT INTO project_threads (id, project_id, title, setup, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    REPAIRED,
    project.id,
    "Which voice should Caw&Co's posts use?",
    now - 60_000,
    now
  );
  fleet.write(
    "INSERT INTO thread_messages (id, thread_id, author, body, question, answer, created_at) VALUES (?, ?, 'you', '', ?, ?, ?)",
    crypto.randomUUID(),
    REPAIRED,
    JSON.stringify({
      questions: [
        {
          question: "Which voice should Caw&Co's posts use?",
          header: "Voice",
          multiSelect: false,
          options: [
            { label: "Plain", description: "" },
            { label: "Warm", description: "" },
          ],
        },
      ],
    }),
    JSON.stringify({ outcome: "dismissed" }),
    now
  );
  // As before the change: his session is no project's lead, so the send
  // goes into it raw, and he answers there.
  fleet.write(
    "UPDATE projects SET lead_instance_id = NULL WHERE id = ?",
    project.id
  );
  await Bun.sleep(1200);
  const oldUuid = await fleet.send(lead, OWNER_WORDS);
  await until(
    "his raw answer to the old send",
    () => fleet.seen.some((s) => s.last.includes("PROBE-PLAIN-OLD") && s.tools),
    Boolean,
    120_000
  );
  await until(
    "the old send read and his turn over",
    () => fleet.sendRow(oldUuid)?.state,
    (state) => state === "read",
    60_000
  );
  await Bun.sleep(5000);
  fleet.write(
    "UPDATE projects SET lead_instance_id = ? WHERE id = ?",
    lead,
    project.id
  );
  const missedBefore = rows(REPAIRED).length;
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await until(
    "the repair note",
    () => rows(REPAIRED).find((r) => r.note_title === REPAIR_NOTE),
    Boolean,
    120_000
  );
  const repaired = rows(REPAIRED);
  const sentAt = fleet.query<{ accepted_at: number }>(
    "SELECT accepted_at FROM sent_messages WHERE uuid = ?",
    oldUuid
  )[0]?.accepted_at;
  const shape = repaired.map((r) => r.note_title ?? r.author);
  kit.check(
    "d: the words that missed the thread are written in once, in order, at their times, with the hub's note",
    missedBefore === 1 &&
      shape.join(",") === `you,you,caw,${REPAIR_NOTE}` &&
      repaired[1]?.body === OWNER_WORDS &&
      repaired[1]?.created_at === sentAt &&
      repaired[2]?.body === "Plain answer OLD" &&
      (repaired[2]?.created_at ?? 0) >= (sentAt ?? Number.POSITIVE_INFINITY),
    repaired
      .map(
        (r) =>
          `${new Date(r.created_at).toISOString()} ${r.note_title ?? r.author}: ${(r.body || r.answer || "").slice(0, 80)}`
      )
      .join(" | ")
  );
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  await Bun.sleep(8000);
  kit.check(
    "d: a second restart adds nothing",
    rows(REPAIRED).length === repaired.length,
    `${rows(REPAIRED).length} rows`
  );
  await writeFile(
    join(kit.out, "threads.json"),
    JSON.stringify({ thread: rows(), repaired: rows(REPAIRED) }, null, 2)
  );
};

export default { name: "caw-threads", run } satisfies Spec;
