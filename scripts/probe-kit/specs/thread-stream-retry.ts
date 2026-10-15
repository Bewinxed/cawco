/**
 * A thread with Caw, on a scratch fleet (real hub, agent and sessiond;
 * Claude Code against the mock model) and the built dashboard at the desk:
 *
 * B. Your words that do not wake him are typed data in the thread, and Try
 *    again wakes him with them. The project's checkout is moved away before
 *    his first start, so the start fails on its machine: the thread keeps
 *    your words and a `not-woken` note whose `notWoken` names your message,
 *    `could-not-start` and the machine's words, with no prose body; the
 *    page shows the reason and Try again under the note. The checkout put
 *    back, Try again on the page wakes him: one row of yours, one reply.
 * A. His words stream into the thread. While his turn answers, the
 *    thread's live row shows his words before his reply lands in
 *    thread_messages; once it lands the page has exactly one row with his
 *    reply. Both for the Try again wake (B) and for words written in the
 *    thread's own composer.
 *
 * Caw starts in his own place's boundary, whose scratch dir is a link under
 * the machine's temp root that a CawCo workspace may not write: run it on a
 * host, outside any workspace (inside one his start fails with EPERM, so
 * only B's first half can pass there).
 *
 *   bun scripts/probe-kit/run.ts thread-stream-retry
 */
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

const CAW = "You are Caw";
const STREAM = /PROBE-STREAM-([A-Z]+)/g;
const FIELD = 'textarea[aria-label="Message the project"]';
/** His words, one every 350 ms: about 4 s of streaming. */
const SENTENCE = (tag: string) => [
  "Streamed ",
  "answer ",
  `${tag} `,
  "goes ",
  "word ",
  "by ",
  "word ",
  "into ",
  "the ",
  "thread",
  ".",
];
const replyOf = (tag: string) => SENTENCE(tag).join("");

/** The `PROBE-STREAM-X` asks answered, by X. */
const answered = new Set<string>();

/** Caw's side: each `PROBE-STREAM-X` he has not answered, in slow plain words and no thread_reply. */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Probe title"] };
  }
  if (!request.all.includes(CAW)) {
    return { everyMs: 5, words: ["ok"] };
  }
  const tags = [
    ...new Set([...request.all.matchAll(STREAM)].map((m) => m[1] ?? "")),
  ].filter((tag) => tag && !answered.has(tag));
  if (tags.length === 0) {
    return { everyMs: 5, words: ["ok"] };
  }
  for (const tag of tags) {
    answered.add(tag);
  }
  return { everyMs: 350, words: tags.flatMap(SENTENCE) };
};

interface Row {
  author: string;
  body: string;
  event: string | null;
  id: string;
}

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  try {
    await steps(kit, fleet);
  } finally {
    await writeFile(
      join(kit.out, "rows.json"),
      JSON.stringify(
        fleet.query(
          "SELECT thread_id, author, body, note_title, event, created_at FROM thread_messages ORDER BY created_at"
        ),
        null,
        2
      )
    ).catch(() => undefined);
    await writeFile(join(kit.out, "hub.log"), await fleet.logs("hub")).catch(
      () => undefined
    );
    await writeFile(
      join(kit.out, "agent.log"),
      await fleet.logs("agent")
    ).catch(() => undefined);
  }
};

/**
 * Watches the page while his turn answers `tag`, until his reply is in
 * thread_messages: whether the thread's live row showed some of his words
 * and not yet all of them while the hub had no reply of his. Then, once
 * the page has settled, how many rows carry the reply, how many replies and
 * how many of your rows the thread keeps.
 */
async function streamed(
  page: Page,
  fleet: KitFleet,
  threadId: string,
  tag: string,
  yours: string
) {
  const reply = replyOf(tag);
  const rows = () =>
    fleet.query<Row>(
      "SELECT id, author, body, event FROM thread_messages WHERE thread_id = ? ORDER BY created_at, id",
      threadId
    );
  const replies = () =>
    rows().filter((r) => r.author === "caw" && r.body.includes(reply));
  let partial = "";
  const deadline = Date.now() + 120_000;
  while (replies().length === 0 && Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: one reading at a time, in order
    const live = await page.evaluate(
      (words) =>
        [...document.querySelectorAll<HTMLElement>('[data-row^="live:"]')]
          .map((node) => node.innerText)
          .find((text) => text.includes(words)) ?? "",
      `Streamed answer ${tag}`
    );
    // Read before the hub's reply: the words were on the page while it had none.
    if (live && !live.includes(reply) && replies().length === 0) {
      partial ||= live;
    }
    await Bun.sleep(100);
  }
  await Bun.sleep(1500);
  const onPage = await page.evaluate(
    (words) =>
      [...document.querySelectorAll<HTMLElement>("[data-row]")].filter((node) =>
        node.innerText.includes(words)
      ).length,
    reply
  );
  return {
    partial,
    onPage,
    replies: replies().length,
    yours: rows().filter((r) => r.author === "you" && r.body === yours).length,
  };
}

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
  await Bun.$`mkdir -p ${src}`.quiet();
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`git init -q -b main && echo caw > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Thread stream",
    machineId: MACHINE,
    cwd: src,
    caw: true,
  });

  // ── B. his first start fails on its machine ─────────────────────────
  const away = `${src}.away`;
  await rename(src, away);
  const ONE = "PROBE-STREAM-ONE hello";
  const started = await fleet.api<{
    message: { id: string };
    thread: { id: string };
  }>(`/api/projects/${project.id}/threads`, { body: ONE });
  const threadId = started.thread.id;
  const youId = started.message.id;
  const note = await until(
    "the not-woken note",
    () =>
      fleet
        .query<Row>(
          "SELECT id, author, body, event FROM thread_messages WHERE thread_id = ? AND author = 'event'",
          threadId
        )
        .find((r) => r.event?.includes('"not-woken"')),
    Boolean,
    120_000
  );
  const event = JSON.parse(note?.event ?? "{}") as {
    notWoken?: { message?: string; reason?: string; words?: string };
  };
  kit.check(
    "B: a wake that fails is a typed not-woken note naming your message, no prose",
    event.notWoken?.message === youId &&
      event.notWoken.reason === "could-not-start" &&
      !!event.notWoken.words &&
      note?.body === "",
    JSON.stringify({ body: note?.body, event })
  );

  const base = await fleet.dashboard();
  const page: Page = await kit.page("desk");
  await open(page, `${base}/session/thread:${threadId}`, FIELD, 90_000);
  const chip = page.locator("[data-not-woken]");
  await chip.waitFor({ timeout: 30_000 });
  const tryAgain = chip.getByRole("button", { name: "Try again" });
  kit.check(
    "B: the page shows the not-woken reason and Try again under the note",
    (await chip.getAttribute("data-not-woken")) === "could-not-start" &&
      (await chip.innerText()).includes(event.notWoken?.words ?? "\u0000") &&
      (await tryAgain.isVisible()),
    await chip.innerText()
  );

  // The cause cleared: the checkout is back.
  await rename(away, src);
  await tryAgain.click();
  const one = await streamed(page, fleet, threadId, "ONE", ONE);
  kit.check(
    "B: Try again wakes him with your words: one row of yours, one reply",
    one.yours === 1 && one.replies === 1,
    JSON.stringify(one)
  );
  kit.check(
    "A: his words stream into the thread before his reply lands, and one row carries it after",
    one.partial !== "" && one.onPage === 1,
    JSON.stringify(one)
  );
  await until(
    "the thread ready",
    async () =>
      (
        await fleet.api<{ id: string; status: string }[]>(
          `/api/projects/${project.id}/threads`
        )
      ).find((t) => t.id === threadId)?.status,
    (status) => status === "ready",
    60_000
  );

  // ── A. words from the thread's own composer ─────────────────────────
  const TWO = "PROBE-STREAM-TWO again";
  await page.fill(FIELD, TWO);
  await page.keyboard.press("Enter");
  const two = await streamed(page, fleet, threadId, "TWO", TWO);
  kit.check(
    "A: words from the composer: his words stream in before his reply lands, one reply row after",
    two.partial !== "" &&
      two.onPage === 1 &&
      two.replies === 1 &&
      two.yours === 1,
    JSON.stringify(two)
  );
};

export default { name: "thread-stream-retry", run } satisfies Spec;
