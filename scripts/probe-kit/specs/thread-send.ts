/**
 * Writing to a project's Caw answers at once, whatever Caw's state; a send
 * the hub never heard says so in the composer's words, with Send again and
 * the words kept. On a scratch fleet (real hub, agent and sessiond; Claude
 * Code against the mock model) with one account, read from the hub's answers
 * and, for the composer, the built dashboard at the desk:
 *
 * (b) A thread's first message (Caw's session not started yet) and a
 *     message while Caw's account is at its limit each answer 2xx within
 *     2 s, and the message is in the thread.
 * (c) In the thread's composer, a send whose request never reaches the hub
 *     (the browser's own "Failed to fetch") shows the composer's error line
 *     in the error formula, never the browser's words; Send again stands on
 *     it; the words are back in the field; Send again sends them once the
 *     hub answers. With the hub stopped, the dashboard's `/api` proxy
 *     answers 502 in the same words, marked as its own.
 *
 *   bun scripts/probe-kit/run.ts thread-send
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  HUB_UNREACHABLE,
  HUB_UNREACHABLE_HEADER,
} from "../../../apps/dashboard/src/lib/cawco/hub-read";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { COMPOSER, type Kit, open, type Spec } from "../kit";

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** The thread's note for a wake that did not go out: what, why, the words kept, the way back. */
const NOT_WOKEN =
  /^noted: Caw hasn't read your message: .+\. Your message is kept in this thread\. Write again to wake him with it\.$/;

/** The hub's lines about Caw and the limit, for a failed check to show. */
const LIMIT_LINE = /\[at-limit\]|\[caw\]|limit/;

/** When the probe's account resets, while the mock refuses it at its limit. */
let limitedUntil: number | undefined;

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (limitedUntil !== undefined && limitedUntil > Date.now()) {
    return { everyMs: 5, words: [], refuse: { resetsAt: limitedUntil } };
  }
  return text("ok");
};

interface Said {
  message: { id: string; body: string };
  thread: { id: string };
}

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
    name: "Thread send",
    machineId: MACHINE,
    cwd: src,
    caw: true,
  });
  /** A timed POST: its status, its answer, how long it took. */
  const post = async (path: string, body: object) => {
    const at = Date.now();
    const response = await fetch(`${fleet.base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const said = (await response.json().catch(() => null)) as Said | null;
    return { status: response.status, said, ms: Date.now() - at };
  };
  const inThread = (thread: string, words: string) =>
    fleet
      .api<{ messages: { body: string }[] }>(
        `/api/projects/${project.id}/threads/${thread}`
      )
      .then((read) => read.messages.some((one) => one.body === words));

  // (b) The first message, Caw's session not started yet.
  const first = await post(`/api/projects/${project.id}/threads`, {
    body: "FIRST-WORDS hello",
  });
  kit.check(
    `(b) a thread's first message answers ${first.status} in ${first.ms} ms, Caw not started`,
    first.status >= 200 && first.status < 300 && first.ms < 2000
  );
  const threadId = first.said?.thread.id ?? "";
  kit.check(
    "(b) the first message is in its thread",
    await inThread(threadId, "FIRST-WORDS hello")
  );
  // His first turn answered, or the thread's word that his wake did not go
  // out: inside a CawCo workspace his place's boundary refuses his start
  // (caw-threads.ts), and that refusal is the thread's to say.
  const woke = await until(
    "Caw's first turn answered, or the thread saying he was not woken",
    async () => {
      if (fleet.seen.some((one) => one.all.includes("FIRST-WORDS"))) {
        return "answered";
      }
      const read = await fleet.api<{
        messages: { body?: string; noteTitle?: string }[];
      }>(`/api/projects/${project.id}/threads/${threadId}`);
      const note = read.messages.find(
        (one) => one.noteTitle === "Caw · not woken"
      );
      return note ? `noted: ${note.body ?? ""}` : "";
    },
    Boolean,
    180_000
  );
  if (woke !== "answered") {
    kit.check(
      "(b) a wake that did not go out is said in the thread: what, why, the words kept, the way back",
      NOT_WOKEN.test(woke),
      woke
    );
    console.log(
      "… Caw cannot start inside this workspace's boundary: the at-limit half of (b) runs on a host (caw-threads.ts says the same)."
    );
  }
  const leadId =
    fleet.query<{ lead_instance_id: string | null }>(
      "SELECT lead_instance_id FROM projects WHERE id = ?",
      project.id
    )[0]?.lead_instance_id ?? "";

  // (b) Caw's account at its limit: his turn is refused and he is held.
  if (woke === "answered") {
    limitedUntil = Date.now() + 4 * 60 * 60_000;
    await post(`/api/projects/${project.id}/threads/${threadId}/messages`, {
      body: "LIMIT-WAKE",
    });
    const held = await until(
      "Caw held at his account's limit",
      () =>
        fleet.query<{ instance_id: string }>(
          "SELECT instance_id FROM limit_holds WHERE instance_id = ?",
          leadId
        )[0],
      Boolean,
      120_000
    ).catch(() => undefined);
    kit.check("(b) Caw's session is held at his account's limit", !!held);
    if (!held) {
      console.log(
        (await fleet.logs("hub"))
          .split("\n")
          .filter((one) => one.includes(leadId) || LIMIT_LINE.test(one))
          .slice(-40)
          .join("\n")
      );
    }
  }
  const atLimit = await post(
    `/api/projects/${project.id}/threads/${threadId}/messages`,
    { body: "WHILE-AT-LIMIT" }
  );
  kit.check(
    `(b) a later message answers ${atLimit.status} in ${atLimit.ms} ms${woke === "answered" ? ", Caw held at his limit" : ", Caw's start refused"}`,
    atLimit.status >= 200 && atLimit.status < 300 && atLimit.ms < 2000
  );
  kit.check(
    "(b) that message is in its thread",
    await inThread(threadId, "WHILE-AT-LIMIT")
  );
  limitedUntil = undefined;

  // (c) The composer, a send the hub never hears.
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  await open(page, `${base}/session/thread:${threadId}`, COMPOSER);
  const route = `**/api/projects/${project.id}/threads/${threadId}/messages`;
  await page.route(route, (request) => request.abort("failed"));
  const field = page.locator(COMPOSER).first();
  await field.fill("KEEP-THESE-WORDS");
  await field.press("Enter");
  const line = page.locator(".send-error");
  await line.waitFor({ timeout: 15_000 }).catch(() => undefined);
  const said = ((await line.textContent().catch(() => "")) ?? "")
    .replace(/\s+/g, " ")
    .trim();
  kit.check(
    "(c) the failed send says the dashboard couldn't reach the hub, in the composer's line",
    said.includes("couldn't reach the hub") &&
      !said.includes("Failed to fetch"),
    said
  );
  const again = line.getByRole("button", { name: "Send again" });
  kit.check("(c) Send again stands on the line", (await again.count()) === 1);
  kit.check(
    "(c) the words are back in the field",
    (await field.textContent()) === "KEEP-THESE-WORDS",
    (await field.textContent()) ?? ""
  );
  await page.unroute(route);
  await again.click();
  const sent = await until(
    "(c) Send again delivers the words",
    () => inThread(threadId, "KEEP-THESE-WORDS"),
    Boolean,
    30_000
  ).catch(() => false);
  kit.check("(c) Send again sends the kept words once the hub answers", sent);

  // (c) The real proxy with the hub stopped: its own 502, in the same words.
  await fleet.stop("hub");
  const proxied = await fetch(`${base}/api/threads`);
  kit.check(
    "(c) with the hub stopped, the dashboard's proxy answers 502 marked as its own, in the one wording",
    proxied.status === 502 &&
      proxied.headers.get(HUB_UNREACHABLE_HEADER) === "1" &&
      (await proxied.text()) === HUB_UNREACHABLE,
    `${proxied.status}`
  );
};

export default { name: "thread-send", run } satisfies Spec;
