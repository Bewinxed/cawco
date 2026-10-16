/**
 * Caw's asks say who, where and why, stand where his turn works, and a line
 * that only reads is never asked at all (lead-gate.ts `readOnly`; caw.ts
 * `heard`, `askThread`; core permission-presentation.ts; push.ts `onAsk`).
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model) with Cawrier a local stand-in that records every push
 * (`CAWCO_CAWRIER_ORIGIN`) and one registered device whose push key is the
 * spec's own, so each push's sealed words are read here. Run it where a
 * workspace boundary can start (not inside another one).
 *
 * The owner, 2026-10-15: a notification from Caw opened a tab titled
 * "Routine · Memory curator" holding a card that read "Run: git fetch -q
 * origin 2>&1 | tail -2; for c in … · Check whether the two typecheck commits
 * are on origin/main". His turn was a delegate's report, which named no
 * thread, so his ask went to the project's newest thread: the memory
 * curator routine's, which its daily run's note had made newest.
 *
 * Project "Caw asks", Caw on, a plain-folder place CawCo makes a repository,
 * given an origin. A routine's own thread, its run's note only, stands
 * newest (as the curator's does after a run), and another session is open on
 * the fleet.
 *
 * a. In thread "main" Caw starts a delegate, its workspace cut from his
 *    place; its report wakes him (a wake no message of yours is in). He runs
 *    the owner's exact command: no ask is parked, its row ran.
 * b. In that turn, `git push origin HEAD` for "Publish the docs to origin":
 *    an ask whose presentation names Caw and the project, whose summary is
 *    his reason and whose command is the command; parked in the thread the
 *    delegate works for (main), never the routine's; on his own session
 *    (no `originInstanceId`), so on no other session's pane; and listed in
 *    `/api/pending` (Needs you). Asked, never refused: the delegate's
 *    finished workspace, cut from his place and left with a file of its own
 *    there, still stands (active or held) as he asks, and a delegate's
 *    workspace never makes his place a shared checkout (hub server.ts
 *    `sharedPlace`, lead-gate.ts rule 2).
 * c. Its push: visible title "Caw" under the project, sealed body the
 *    reason, its target thread main, whose title is your words.
 * d. Deny: origin did not move.
 * e. Caw's session keeps its title through the routine's note and his turns.
 *
 *   bun scripts/probe-kit/run.ts caw-asks
 */
import { existsSync, realpathSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const CAW = "You are Caw";
const FINISH = "mcp__cawco__finish_item";
/** Only the delegate's brief carries this. */
const CHILD = "PROBE-CHILD";
/** The delegate's headline, which its report to Caw carries. */
const REPORTED = "PROBE-REPORTED the commits are in";
/** The owner's command from his screenshot, verbatim. */
const OWNER =
  "git fetch -q origin 2>&1 | tail -2; for c in 8c2f706b9 b4924f5f9; do printf \"%s: \" $c; git branch -r --contains $c 2>/dev/null | tr '\\n' ' ' || echo \"unknown\"; echo; done; git log --oneline -1 origin/main";
const OWNER_WHY = "Check whether the two typecheck commits are on origin/main";
const PUSH = "git push origin HEAD";
const PUSH_WHY = "Publish the docs to origin";
const PROJECT = "Caw asks";

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
const bash = (command: string, description: string) =>
  useTool("Bash", { command, description });

interface Ask {
  instanceId: string;
  machineId: string;
  payload: {
    input: Record<string, unknown>;
    originInstanceId?: string;
    presentation: {
      asker: string;
      command?: string;
      project?: string;
      summary: string;
    };
    threadId?: string;
    toolName: string;
  };
  requestId: string;
}
interface CallRow {
  command: string;
  outcome: string;
}
interface PushBody {
  payload: {
    aps: { alert?: { subtitle?: string; title?: string } };
    cawco?: { kind?: string; requestId?: string; threadId?: string | null };
    e?: string;
  };
  pushType?: string;
}

/** What Caw has done: his turn your message woke, then the one the report woke. */
const played: Record<"delegated" | "pushed" | "ran", boolean> = {
  delegated: false,
  ran: false,
  pushed: false,
};
let finished = false;
/** What the delegate leaves in its workspace, uncommitted: its workspace is held, not retired, once its item ends. */
const LEFT = "PROBE-LEFT";

/** Caw: a delegate from your message; from its report, the owner's command, then the push. */
const caw = (request: Seen): Reply => {
  if (!played.delegated && request.last.includes("PROBE-ASKS")) {
    played.delegated = true;
    return useTool("mcp__cawco__delegate", {
      title: "Check the commits",
      prompt: `${CHILD}: finish your item.`,
      checks: [{ name: "Nothing to check", command: "true" }],
      lands: "none",
    });
  }
  if (!played.ran && request.all.includes(REPORTED)) {
    played.ran = true;
    return bash(OWNER, OWNER_WHY);
  }
  if (played.ran && !played.pushed) {
    played.pushed = true;
    return bash(PUSH, PUSH_WHY);
  }
  return text("ok");
};

/** The delegate: leaves a file of its own, finds finish_item, calls it once, then says ok. */
const child = (request: Seen): Reply => {
  if (finished) {
    return text("ok");
  }
  if (!request.all.includes(`${LEFT}-DONE`)) {
    return bash(
      `echo kept > ${LEFT}.txt && echo ${LEFT}-DONE`,
      "Leave a file of its own"
    );
  }
  if (!request.toolNames.includes(FINISH)) {
    return request.toolNames.includes("ToolSearch")
      ? useTool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 })
      : text(`${FINISH} is not offered`);
  }
  finished = true;
  return useTool(FINISH, { headline: REPORTED, summary: REPORTED });
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes(CAW)) {
    return caw(request);
  }
  return request.all.includes(CHILD) ? child(request) : text("ok");
};

const run = async (kit: Kit) => {
  const pushes: PushBody[] = [];
  const cawrier = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/v1/push") {
        pushes.push((await request.json()) as PushBody);
      }
      return Response.json({ ok: true });
    },
  });
  const key = crypto.getRandomValues(new Uint8Array(32));
  const opener = await crypto.subtle.importKey("raw", key, "AES-GCM", false, [
    "decrypt",
  ]);
  const sealed = async (
    push: PushBody
  ): Promise<{ body?: string; subtitle?: string; title?: string }> => {
    const bytes = Buffer.from(push.payload.e ?? "", "base64");
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.subarray(0, 12), tagLength: 128 },
      opener,
      bytes.subarray(12)
    );
    return JSON.parse(new TextDecoder().decode(plain));
  };

  const fleet = await kit.fleet(respond);
  fleet.env.CAWCO_CAWRIER_ORIGIN = `http://127.0.0.1:${cawrier.port}`;
  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    await fleet.api("/api/push/register", {
      pairingId: crypto.randomUUID(),
      secret: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
        "base64url"
      ),
      key: Buffer.from(key).toString("base64"),
      name: "Probe iPhone",
      platform: "ios",
    });
    const home = fleet.env.HOME as string;
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );

    // A plain folder CawCo makes a repository, given an origin of its own.
    const place = join(fleet.sandbox, "place");
    await mkdir(join(place, "docs"), { recursive: true });
    await writeFile(join(place, "docs", "notes.md"), "# Notes\n");
    const project = await fleet.api<{ id: string; name: string }>(
      "/api/projects",
      { name: PROJECT, machineId: MACHINE, cwd: place, caw: true }
    );
    await until(
      "the place made a repository",
      () =>
        stat(join(place, ".git", "HEAD")).then(
          () => true,
          () => false
        ),
      Boolean,
      120_000
    );
    const origin = join(fleet.sandbox, "origin.git");
    await Bun.$`git init -q --bare ${origin} && git -C ${place} remote add origin ${origin} && git -C ${place} push -q origin HEAD:main`.quiet();
    const originHead = async () =>
      (await Bun.$`git -C ${origin} for-each-ref`.quiet()).stdout.toString();
    const originBefore = await originHead();

    // Another session open on the fleet: an ask of Caw's is never on its
    // pane. Not in his place, which would make it a shared checkout, where a
    // push is refused rather than asked.
    const neighbour = await fleet.spawn("claude", "Neighbour", fleet.repo);

    // Thread "main": your words, then Caw starts a delegate.
    const opened = await fleet.api<{ thread: { id: string; title: string } }>(
      `/api/projects/${project.id}/threads`,
      { body: "PROBE-ASKS: have someone check the two typecheck commits." }
    );
    const main = opened.thread.id;
    const leadId = (await until(
      "Caw's session",
      () =>
        fleet.query<{ lead_instance_id: string | null }>(
          "SELECT lead_instance_id FROM projects WHERE id = ?",
          project.id
        )[0]?.lead_instance_id ?? undefined,
      (id): id is string => Boolean(id),
      180_000
    )) as string;
    const titleOf = () =>
      fleet.query<{ title: string | null }>(
        "SELECT title FROM instances WHERE id = ?",
        leadId
      )[0]?.title ?? null;
    await until("Caw delegated", () => played.delegated, Boolean, 180_000);
    const leadTitle = titleOf();

    // The memory curator's thread after its run: its note only, the
    // project's newest thread by far (routines.ts `note`).
    const routine = crypto.randomUUID();
    const later = Date.now() + 3_600_000;
    fleet.write(
      "INSERT INTO project_threads (id, project_id, title, setup, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
      routine,
      project.id,
      "Routine · Memory curator · 06:00",
      later,
      later
    );
    fleet.write(
      "INSERT INTO thread_messages (id, thread_id, author, body, note_title, created_at) VALUES (?, ?, 'event', '', ?, ?)",
      crypto.randomUUID(),
      routine,
      "Routine · Memory curator · 06:00",
      later
    );

    // ── a. the owner's command, from a report's wake: never asked ─────────
    let asked = 0;
    const pending = async (): Promise<Ask[]> =>
      (await fleet.api<Ask[]>("/api/pending")).filter(
        (one) => one.instanceId === leadId && one.payload.toolName === "Bash"
      );
    const watch = setInterval(() => {
      pending()
        .then((asks) => {
          asked += asks.filter(
            (one) => one.payload.presentation.command === OWNER
          ).length;
        })
        .catch(() => undefined);
    }, 250);
    const card = await until(
      "b: the card for the push",
      pending,
      (asks) => asks.some((one) => one.payload.presentation.command === PUSH),
      300_000
    ).then(
      (asks) =>
        asks.find((one) => one.payload.presentation.command === PUSH) as Ask
    );
    clearInterval(watch);
    const calls = fleet.query<CallRow>(
      "SELECT command, outcome FROM lead_calls WHERE project_id = ? ORDER BY at",
      project.id
    );
    const ownerRow = calls.find((row) => row.command === OWNER);
    kit.check(
      "a: Caw runs the owner's exact command from a report's wake with no ask",
      ownerRow?.outcome === "ran" && asked === 0,
      JSON.stringify({ ownerRow, asked })
    );

    // ── b. the push's card: who, where, why, then the command ─────────────
    // As he asks: his delegate's workspace, cut from his place, its item over.
    const delegated = fleet.query<{
      item: string;
      path: string;
      repo_root: string;
      state: string;
    }>(
      "SELECT w.path, w.repo_root, w.state, i.state AS item FROM workspaces w JOIN work_items i ON i.workspace_id = w.id WHERE i.parent_instance_id = ?",
      leadId
    );
    kit.check(
      "b: Caw's push is asked, not refused, while his finished delegate's workspace, cut from his place, stands",
      delegated.length === 1 &&
        delegated[0]?.item === "done" &&
        [place, realpathSync(place)].includes(delegated[0].repo_root) &&
        ["active", "held"].includes(delegated[0].state) &&
        existsSync(join(delegated[0].path, `${LEFT}.txt`)),
      JSON.stringify({ delegated, place })
    );
    const shown = card.payload.presentation;
    kit.check(
      "b: the card's head is Caw · the project, its sentence his reason, its command whole",
      shown.asker === "Caw" &&
        shown.project === PROJECT &&
        shown.summary === PUSH_WHY &&
        shown.command === PUSH,
      JSON.stringify(shown)
    );
    kit.check(
      "b: the ask stands in the thread the delegate works for, never the routine's, and on no other session's pane",
      card.payload.threadId === main &&
        card.payload.originInstanceId === undefined &&
        card.instanceId === leadId &&
        card.instanceId !== neighbour,
      JSON.stringify({
        thread: card.payload.threadId,
        main,
        routine,
        origin: card.payload.originInstanceId,
      })
    );

    // ── c. its push: Caw, the project, the reason; it opens main ──────────
    const push = await until(
      "c: the ask's push",
      () =>
        pushes.find(
          (one) =>
            one.payload.cawco?.kind === "ask" &&
            one.payload.cawco.requestId === card.requestId
        ),
      Boolean,
      30_000
    );
    const words = await sealed(push as PushBody);
    const target = push?.payload.cawco?.threadId ?? null;
    const targetTitle =
      fleet.query<{ title: string }>(
        "SELECT title FROM project_threads WHERE id = ?",
        target ?? ""
      )[0]?.title ?? null;
    kit.check(
      "c: the push names Caw under the project, its sealed body the reason, and opens main (your words' thread, not the routine's)",
      push?.payload.aps.alert?.title === "Caw" &&
        push.payload.aps.alert.subtitle === PROJECT &&
        words.title === "Caw" &&
        words.body === PUSH_WHY &&
        target === main &&
        targetTitle !== null &&
        !targetTitle.startsWith("Routine"),
      JSON.stringify({
        visible: push?.payload.aps.alert,
        words,
        target,
        targetTitle,
      })
    );

    // ── d. Deny: origin does not move ─────────────────────────────────────
    await fleet.post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "permission.answer",
      machineId: card.machineId,
      sessionId: card.instanceId,
      payload: {
        instanceId: card.instanceId,
        requestId: card.requestId,
        method: "resolvePermission",
        args: [card.requestId, { behavior: "deny", message: "No." }],
      },
    });
    const denied = await until(
      "d: the push's row denied",
      () =>
        fleet
          .query<CallRow>(
            "SELECT command, outcome FROM lead_calls WHERE project_id = ? AND command = ?",
            project.id,
            PUSH
          )
          .at(0),
      (row) => row?.outcome === "denied",
      60_000
    );
    kit.check(
      "d: denied, the push does not run: origin did not move",
      denied?.outcome === "denied" && (await originHead()) === originBefore,
      JSON.stringify(denied)
    );

    // ── e. Caw's session keeps its title ──────────────────────────────────
    kit.check(
      "e: Caw's session keeps its title through the routine's note and his turns",
      titleOf() === leadTitle,
      JSON.stringify({ before: leadTitle, after: titleOf() })
    );
  } finally {
    cawrier.stop(true);
  }
};

export default { name: "caw-asks", run } satisfies Spec;
