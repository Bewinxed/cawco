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
 * (e) The delegate's `design_write` to the project's design system is a
 *     proposal waiting on the person: the parent is woken with one note. The
 *     parent goes to sleep and the hub restarts (SIGKILL, as a crash does);
 *     the proposal is parked again as the hub starts (design-system.ts
 *     `start`), and the parent gets no second note: a wait is told once,
 *     however often the hub restarts while it stands.
 * (f) The person's phone (a stand-in Cawrier, one phone paired) was pushed
 *     that proposal once before the restart, and is not pushed it again by
 *     its parking after it: a second proposal's push, which goes behind any
 *     push of the first, lands, and the first has still been pushed once.
 * (g) A parent read `unknown` as the ask parks: the machine's agent is
 *     killed and the hub restarts, so every live row reads `unknown` until
 *     the agent registers. A third proposal parks then, and its parent is
 *     not told; the agent comes back and registers, and the parent is told
 *     of it, once.
 *
 *   bun scripts/probe-kit/run.ts delegate-waits
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { browserAskWords } from "../../../packages/core/src/words/browser";
import { delegateWaitWords } from "../../../packages/core/src/words/delegates";
import { askCollapseId } from "../../../packages/hub/src/notifications";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { type Phone, standInPhone } from "../phone";

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

/** Asks `id` to sleep (again every 15 s: a machine refuses one not at rest) until its row reads sleeping. */
const asleep = async (fleet: KitFleet, id: string): Promise<string> => {
  let askedAt = 0;
  return await until(
    `${id.slice(0, 8)} asleep`,
    async () => {
      const status = fleet.instance(id)?.status ?? "";
      if (status !== "sleeping" && Date.now() - askedAt > 15_000) {
        askedAt = Date.now();
        await fleet.control(id, "sleep");
      }
      return status;
    },
    (status) => status === "sleeping",
    120_000
  ).catch(() => fleet.instance(id)?.status ?? "gone");
};

const run = async (kit: Kit) => {
  const { check } = kit;
  const fleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  // Before the hub starts: it reads where Cawrier is as it starts.
  const phone = standInPhone(fleet);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  await phone.pair();
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
  /**
   * A delegate of the parent titled `title`, working in `cwd`: a work item
   * in a workspace of its own, as `delegate` writes them, renamed through
   * the hub so its board reads the row these writes made (the hub hears
   * its own connection's writes alone, db `instance_changes`).
   */
  const seeded = async (title: string, cwd: string): Promise<string> => {
    const child = await fleet.spawn("claude", "Delegate", cwd, inProject);
    const now = Date.now();
    const workspace = crypto.randomUUID();
    const item = crypto.randomUUID();
    fleet.write(
      "INSERT INTO workspaces (id, machine_id, repo_root, path, branch, state, created_by_instance_id, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
      workspace,
      MACHINE,
      cwd,
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
      child,
      "Do your part.",
      title,
      project.id,
      now
    );
    fleet.write(
      "UPDATE instances SET parent_instance_id = ?, work_item_id = ? WHERE id = ?",
      parent,
      item,
      child
    );
    const renamed = await fetch(`${fleet.base}/api/instances/${child}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!renamed.ok) {
      throw new Error(
        `${title}'s rename: ${renamed.status} ${await renamed.text()}`
      );
    }
    return child;
  };
  const delegate = await seeded("Waits delegate", src);

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

  // (e) A design proposal's wait, across a restart: told once. The system
  // is the person's, in the project's folder (written as they write it),
  // and a second delegate of the parent works there.
  for (const [path, content] of [
    ["design/manifest.json", `${JSON.stringify({ sources: {}, files: {} })}\n`],
    ["design/DESIGN.md", "# Waits\n"],
  ] as const) {
    const put = await fetch(
      `${fleet.base}/api/projects/${project.id}/folder/file`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, content }),
      }
    );
    if (!put.ok) {
      throw new Error(
        `the person's ${path}: ${put.status} ${await put.text()}`
      );
    }
  }
  const folder = join(fleet.sandbox, "hub", "projects", project.id);
  const designer = await seeded("Design delegate", folder);
  const beforeDesign = heard.length;
  const waitsLine = delegateWaitWords.waitsLine("Design delegate");
  /** The parent's requests since (e) began that a design wait note woke. */
  const designNotes = () =>
    heard
      .slice(beforeDesign)
      .filter(
        (one) => one.last.includes(WAIT_TAG) && one.last.includes(waitsLine)
      );
  const proposed = await callAs(fleet, designer, "design_write", {
    files: [{ path: "references/waits.md", content: `${REASON}\n` }],
    why: "The probe's change to the design system",
  });
  /** The design proposal waiting on the person that is none of `known`. */
  const newProposal = (what: string, known: readonly string[]) =>
    until(
      what,
      async () =>
        (await fleet.api<Parked[]>("/api/pending")).find(
          (one) =>
            one.requestId?.startsWith("dp-") && !known.includes(one.requestId)
        ),
      Boolean,
      60_000
    ).catch(() => undefined);
  const proposal = await newProposal(
    "(e) the design proposal waiting on the person",
    []
  );
  const first = await until(
    "(e) the parent's note of the proposal",
    () => designNotes(),
    (told) => told.length > 0,
    120_000
  ).catch(() => []);
  check(
    "(e) the delegate's design_write is a proposal waiting on the person, and its parent is woken with a note that it waits",
    !!proposal && first.length === 1,
    `design_write: ${proposed.text.slice(0, 300)}; pending: ${proposal?.requestId ?? "none"}; notes: ${first.length}`
  );
  if (!proposal?.requestId) {
    return;
  }
  await until(
    "(e) the parent's turn over",
    () => fleet.instance(parent)?.turn_open_at ?? null,
    (open) => open === null,
    120_000
  );
  const slept = await asleep(fleet, parent);
  await fleet.stop("hub", "SIGKILL");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  const again = await until(
    "(e) the proposal parked again after the restart",
    async () =>
      (await fleet.api<Parked[]>("/api/pending")).some(
        (one) => one.requestId === proposal.requestId
      ),
    Boolean,
    60_000
  ).catch(() => false);
  // The hub tells a parent as it parks the ask, so by the time the proposal
  // is parked again any second note is among the parent's sends.
  const waitSends = (): number =>
    fleet.query<{ n: number }>(
      "SELECT count(*) AS n FROM sent_messages WHERE instance_id = ? AND instr(body, ?) > 0",
      parent,
      encodeURIComponent(waitsLine)
    )[0]?.n ?? 0;
  const sends = waitSends();
  const notes = designNotes();
  check(
    "(e) the parent asleep and the hub restarted, the proposal is parked again and the parent gets no second note",
    slept === "sleeping" && again && sends === 1 && notes.length === 1,
    `the parent before the restart: ${slept}; parked again: ${again}; the parent's sends of its wait: ${sends}; notes since (e): ${notes.length}; the parent's requests since: ${
      heard
        .slice(beforeDesign)
        .map((one) => one.last.slice(0, 160))
        .join(" | ") || "none"
    }`
  );

  await legsAfter({
    check,
    designer,
    fleet,
    first: proposal.requestId,
    key,
    newProposal,
    parent,
    phone,
    waitSends,
    waitsLine,
  });
};

/** What legs (f) and (g) work with, as (e) left it. */
interface After {
  check: Kit["check"];
  designer: string;
  /** The first proposal's request id. */
  first: string;
  fleet: KitFleet;
  /** The project's browser, which (c) started. */
  key: string;
  newProposal: (
    what: string,
    known: readonly string[]
  ) => Promise<Parked | undefined>;
  parent: string;
  phone: Phone;
  /** The parent's sends of the design delegate's wait, so far. */
  waitSends: () => number;
  waitsLine: string;
}

/** Legs (f) and (g). */
const legsAfter = async ({
  check,
  designer,
  fleet,
  first,
  key,
  newProposal,
  parent,
  phone,
  waitSends,
  waitsLine,
}: After): Promise<void> => {
  // (f) The person's phone: the first proposal pushed once, across the
  // restart. A push of an ask goes under its collapse id, or leads a
  // burst's push carrying its request id.
  const pushesOf = (requestId: string): number =>
    phone
      .pushes()
      .filter(
        (one) =>
          one.collapseId === askCollapseId(requestId) ||
          (one.payload.cawco as { requestId?: string } | undefined)
            ?.requestId === requestId
      ).length;
  await callAs(fleet, designer, "design_write", {
    files: [{ path: "references/second.md", content: `${REASON} second\n` }],
    why: "The probe's second change to the design system",
  });
  const second = await newProposal("(f) the second proposal", [first]);
  const secondPushed = second?.requestId
    ? await until(
        "(f) the second proposal pushed",
        () => pushesOf(second.requestId ?? ""),
        (n) => n > 0,
        120_000
      ).catch(() => 0)
    : 0;
  const firstPushes = pushesOf(first);
  check(
    "(f) the person's phone was pushed the first proposal once: its parking again after the restart pushes nothing, while a later proposal's push lands",
    secondPushed > 0 && firstPushes === 1,
    `the first's pushes: ${firstPushes}; the second's: ${secondPushed}; every push: ${phone.ids().join(", ") || "none"}`
  );

  // (g) A parent `unknown` as the ask parks is told once its machine registers.
  // The browser (c) started is stopped first: its agent is killed below, and
  // a Chromium whose agent died is left running.
  await fleet.api(`/api/browsers/${encodeURIComponent(key)}/stop`, {
    machineId: MACHINE,
  });
  await until(
    "(g) the parent at rest",
    () => fleet.instance(parent)?.turn_open_at ?? null,
    (open) => open === null,
    120_000
  );
  // Awake again, so the hub's start reads it `unknown`, not asleep.
  await fleet.send(parent, `${HELLO}-again`);
  await until(
    "(g) the parent awake and at rest",
    () => fleet.instance(parent),
    (row) => row?.status === "running" && row.turn_open_at === null,
    120_000
  );
  const beforeUnknown = waitSends();
  const heardBefore = heard.length;
  await fleet.stop("agent", "SIGKILL");
  await fleet.stop("hub", "SIGKILL");
  fleet.launch("hub");
  await fleet.hubUp();
  const status = fleet.instance(parent)?.status ?? "gone";
  const third = await callAs(fleet, designer, "design_write", {
    files: [{ path: "references/third.md", content: `${REASON} third\n` }],
    why: "The probe's third change to the design system",
  });
  const thirdAsk = await newProposal("(g) the third proposal", [
    first,
    second?.requestId ?? "",
  ]);
  const whileUnknown = waitSends() - beforeUnknown;
  fleet.launch("agent");
  await fleet.agentUp();
  const toldAfter = await until(
    "(g) the parent told once its machine registered",
    () => waitSends() - beforeUnknown,
    (n) => n > 0,
    120_000
  ).catch(() => waitSends() - beforeUnknown);
  const woken = await until(
    "(g) the parent woken with the note",
    () =>
      heard
        .slice(heardBefore)
        .filter(
          (one) => one.last.includes(WAIT_TAG) && one.last.includes(waitsLine)
        ).length,
    (n) => n > 0,
    120_000
  ).catch(() => 0);
  check(
    "(g) a parent read unknown as its delegate's proposal parks is not told then, and is told once when its machine registers",
    status === "unknown" &&
      !!thirdAsk &&
      whileUnknown === 0 &&
      toldAfter === 1 &&
      woken > 0,
    `the parent after the hub's start: ${status}; design_write: ${third.text.slice(0, 200)}; pending: ${thirdAsk?.requestId ?? "none"}; its sends of the wait while unknown: ${whileUnknown}, after the register: ${toldAfter}; woken: ${woken}`
  );
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "delegate-waits",
  run,
};

export default spec;
