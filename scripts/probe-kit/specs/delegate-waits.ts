/**
 * While a delegate waits on the person, its parent knows, and hears how it
 * ended (hub delegate-waits.ts), whatever door the ask came in by. The
 * owner's case of 2026-11-05: a parent that ended its turn quietly never
 * heard that its delegate's `browser_ask` waited on him.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), in a project: a parent and its delegate, the delegate's work
 * item seeded on the hub's own rows (a held workspace, its item and the
 * session's link to both, as files-reached seeds them), so no boundary is
 * cut and the spec runs inside a workspace.
 *
 * (a) The parent ends its turn. The delegate calls `browser_ask`: the ask
 *     waits on the person (`/api/pending`), and the parent is woken with the
 *     note that its delegate waits on the person, naming the page's origin
 *     and the reason.
 * (b) The parent's `answer_delegate` of that ask, with `deny`, is refused in
 *     the words saying only the person answers it, and the ask still waits.
 * (c) The person takes the browser over: the parent hears so.
 * (d) The person hands the browser back: the parent hears so, with the
 *     page's origin, and the delegate's call answers that it was handed back.
 *
 *   bun scripts/probe-kit/run.ts delegate-waits
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { browserAskWords } from "../../../packages/core/src/words/browser";
import { delegateWaitWords } from "../../../packages/core/src/words/delegates";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** Every request the mock was asked with a tool list, in order. */
const heard: Seen[] = [];
const respond = (request: Seen): Reply => {
  if (request.tools) {
    heard.push(request);
  }
  return { everyMs: 5, words: ["ok"] };
};

const ORIGIN = "https://example.com";
const REASON = `Clear the probe's CAPTCHA ${crypto.randomUUID().slice(0, 8)}`;
/** The tag every delegate-wait notice opens with (core injected.ts `delegateWaitNotice`). */
const WAIT_TAG = "[cawco:delegate-wait";
const HELLO = `PROBE-WAITS-HELLO-${crypto.randomUUID().slice(0, 8)}`;

interface Parked {
  instanceId?: string;
  payload: { browserAsk?: { key: string }; toolName?: string };
  requestId?: string;
}

/** The newest request the parent was woken with that carries a notice holding every one of `words`. */
const noticeHolding = (
  from: number,
  words: readonly string[]
): Seen | undefined =>
  heard
    .slice(from)
    .find(
      (one) =>
        one.all.includes(WAIT_TAG) &&
        words.every((word) => one.all.includes(word))
    );

const callAs = async (
  fleet: KitFleet,
  as: string,
  name: string,
  args: Record<string, unknown>,
  timeoutMs?: number
) =>
  await toolWords(
    {
      base: fleet.base,
      id: as,
      credential: await fleet.sessionCredential(as),
    },
    name,
    args,
    timeoutMs ? { timeoutMs } : {}
  );

const run = async (kit: Kit) => {
  const { check } = kit;
  const fleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`sh -c ${"git init -q -b main && echo waits > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Delegate waits",
    machineId: MACHINE,
    cwd: src,
  });
  const inProject = { projectId: project.id };
  const parent = await fleet.spawn("claude", "Waits parent", src, inProject);
  const delegate = await fleet.spawn("claude", "Delegate", src, inProject);

  // The delegate: a work item in a workspace of its own, as `delegate`
  // writes them, the parent its parent.
  const now = Date.now();
  const workspace = crypto.randomUUID();
  const item = crypto.randomUUID();
  fleet.write(
    "INSERT INTO workspaces (id, machine_id, repo_root, path, branch, state, created_by_instance_id, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
    workspace,
    MACHINE,
    src,
    join(fleet.sandbox, `ws-${workspace.slice(0, 8)}`),
    `ws/${workspace.slice(0, 8)}`,
    parent,
    now
  );
  fleet.write(
    "INSERT INTO work_items (id, workspace_id, parent_instance_id, instance_id, brief, title, harness, state, project_id, created_at) VALUES (?, ?, ?, ?, ?, ?, 'claude', 'running', ?, ?)",
    item,
    workspace,
    parent,
    delegate,
    "Get past the CAPTCHA.",
    "Waits delegate",
    project.id,
    now
  );
  fleet.write(
    "UPDATE instances SET parent_instance_id = ?, work_item_id = ? WHERE id = ?",
    parent,
    item,
    delegate
  );
  // Renamed through the hub, so its board reads the row these writes made
  // (the hub hears its own connection's writes alone, db `instance_changes`).
  const renamed = await fetch(`${fleet.base}/api/instances/${delegate}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Waits delegate" }),
  });
  if (!renamed.ok) {
    throw new Error(
      `the delegate's rename: ${renamed.status} ${await renamed.text()}`
    );
  }

  // (a) The parent's turn ends quietly; then its delegate asks the person.
  await fleet.send(parent, HELLO);
  await until(
    "the parent's turn over",
    () => ({
      asked: heard.some((one) => one.all.includes(HELLO)),
      open: fleet.instance(parent)?.turn_open_at ?? null,
    }),
    (read) => read.asked && read.open === null,
    120_000
  );
  const before = heard.length;
  const call = callAs(
    fleet,
    delegate,
    "browser_ask",
    { origin: ORIGIN, reason: REASON },
    900_000
  );
  const parked = await until(
    "(a) the browser ask waiting on the person",
    async () =>
      (await fleet.api<Parked[]>("/api/pending")).find(
        (one) => one.instanceId === delegate && one.payload.browserAsk
      ),
    Boolean,
    60_000
  ).catch(() => undefined);
  const waits = await until(
    "(a) the parent woken with its delegate's wait",
    () =>
      noticeHolding(before, [
        delegateWaitWords.waitsLine("Waits delegate"),
        ORIGIN,
        REASON,
      ]),
    Boolean,
    120_000
  ).catch(() => undefined);
  check(
    "(a) a delegate whose parent ended its turn calls browser_ask: the ask waits on the person, and the parent is woken with the note that its delegate waits on the person, its origin and reason",
    !!parked && !!waits,
    `pending: ${parked ? `${parked.requestId} ${parked.payload.browserAsk?.key}` : "none"}; the parent's requests since: ${
      heard
        .slice(before)
        .map((one) => one.last.slice(0, 200))
        .join(" | ") || "none"
    }`
  );
  if (!(parked?.requestId && parked.payload.browserAsk)) {
    return;
  }
  const { requestId } = parked;
  const { key } = parked.payload.browserAsk;

  // (b) The parent cannot answer it in the person's place.
  const refused = await callAs(fleet, parent, "answer_delegate", {
    target: delegate,
    requestId,
    deny: true,
  });
  const still = (await fleet.api<Parked[]>("/api/pending")).some(
    (one) => one.requestId === requestId
  );
  check(
    "(b) the parent's answer_delegate deny of the browser ask is refused, saying only the person answers it, and the ask still waits",
    refused.refused &&
      refused.text.includes(delegateWaitWords.refused) &&
      still,
    `${refused.status} ${refused.text.slice(0, 400)}; still pending: ${still}`
  );

  // (c) The person takes the browser over.
  const beforeTake = heard.length;
  const took = await fleet
    .api<unknown>(`/api/browsers/${encodeURIComponent(key)}/takeover`, {
      requestId,
      machineId: MACHINE,
    })
    .then(
      () => "taken",
      (error: unknown) =>
        error instanceof Error ? error.message : String(error)
    );
  const taken = await until(
    "(c) the parent told of the take-over",
    () =>
      noticeHolding(beforeTake, [
        delegateWaitWords.tookOverLine("Waits delegate"),
        REASON,
      ]),
    Boolean,
    120_000
  ).catch(() => undefined);
  check(
    "(c) the person takes the browser over: the parent hears so",
    took === "taken" && !!taken,
    `take-over: ${took}; the parent's requests since: ${
      heard
        .slice(beforeTake)
        .map((one) => one.last.slice(0, 200))
        .join(" | ") || "none"
    }`
  );

  // (d) The person hands it back.
  const beforeBack = heard.length;
  const back = await fleet
    .api<{ origin: string | null }>(
      `/api/browsers/${encodeURIComponent(key)}/handback`,
      { machineId: MACHINE }
    )
    .then(
      (said) => ({ origin: said.origin, error: undefined }),
      (error: unknown) => ({
        origin: null,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  const answered = await call.then(
    (said) => said.text,
    (error: unknown) =>
      `failed: ${error instanceof Error ? error.message : String(error)}`
  );
  const handed = await until(
    "(d) the parent told of the hand-back",
    () =>
      noticeHolding(beforeBack, [
        delegateWaitWords.handedBack(back.origin),
        REASON,
      ]),
    Boolean,
    120_000
  ).catch(() => undefined);
  check(
    "(d) the person hands the browser back: the delegate's call answers it was handed back, and the parent hears so",
    back.error === undefined &&
      answered.includes(browserAskWords.handedBack(back.origin)) &&
      !!handed,
    `hand-back: ${back.error ?? `on ${back.origin}`}; the call answered: ${answered.slice(0, 300)}; the parent's requests since: ${
      heard
        .slice(beforeBack)
        .map((one) => one.last.slice(0, 200))
        .join(" | ") || "none"
    }`
  );
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "delegate-waits",
  run,
};

export default spec;
