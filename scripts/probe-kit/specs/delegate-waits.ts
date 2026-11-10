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
 *     the agent registers. A third proposal parks then: its note is kept for
 *     the parent, owed, and reaches it once as the agent comes back and
 *     registers.
 * (h) An ask that ends while its parent reads `unknown`: agent killed and
 *     hub restarted again, the person declines the third proposal. Its end
 *     note is kept for the parent, owed, and reaches it once as the agent
 *     registers.
 * (i) A browser ask open across a hub restart: its call ends with the hub,
 *     and the next start drops the mark push kept of it (db `ask_pushes`),
 *     while a proposal parked again keeps its own, and its parent hears,
 *     once, that the ask ended with a hub restart.
 * (j) A browser ask taken over when the hub restarts: the take-over took it
 *     off every screen, its call still waiting; the next start drops its
 *     mark and its parent hears, once, that it ended with the restart.
 * (l) A harness's own permission prompt from a delegate in default mode,
 *     routed to the parent: the parent answers it, and hears no end of its
 *     own answer; a second is left unanswered as the parent goes to rest, is
 *     the person's now (told once), and the person's answer is told once.
 * (n) A routed prompt withdrawn: its delegate is stopped while the prompt
 *     waits on the parent; the parent hears once that it was withdrawn.
 * (m) A parent that ends: the person stops it while its delegate's prompt
 *     is routed to it. The stop ends the delegate first (tree-stops.ts), so
 *     the prompt is withdrawn and the parent hears so once, before its own
 *     end, and nothing after.
 * (k) A notice that fails: the parent's machine stays away past its window
 *     after a hub start while a fourth proposal parks, so the note kept for
 *     the parent fails. It is the hub's word, not the delegate's: the
 *     delegate is told nothing of it.
 *
 *   bun scripts/probe-kit/run.ts delegate-waits
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RESOLVE_PERMISSION } from "../../../packages/core/src/ask-tools";
import type { Sending } from "../../../packages/core/src/sending";
import { browserAskWords } from "../../../packages/core/src/words/browser";
import { delegateWaitWords } from "../../../packages/core/src/words/delegates";
import { askCollapseId } from "../../../packages/hub/src/notifications";
import type { ToolArgs, ToolName } from "../../../packages/hub/src/tool-args";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { doorOf, liveBrowser, servedSite } from "../gated-pages";
import { answerText, hubAt, payloadOf } from "../hub";
import { type Phone, standInPhone } from "../phone";
import type { Kit, KitFleet, Spec } from "../spec";

/** Every request the mock was asked with a tool list, in order. */
const heard: Seen[] = [];
/** The words that make the prompting delegate (l) call Bash, which its harness asks about. */
const PROMPT_TAG = `PROBE-WAITS-PROMPT-${crypto.randomUUID().slice(0, 8)}`;
/** The prompting delegates' asks already made, by the words that asked them. */
const prompted = new Set<string>();
const respond = (request: Seen): Reply => {
  if (request.tools) {
    heard.push(request);
  }
  // Each `PROMPT_TAG <word>` a delegate reads makes it call Bash once,
  // whether it starts a turn or joins one mid-way.
  const asked = request.tools
    ? [...request.all.matchAll(new RegExp(`${PROMPT_TAG} (\\w+)`, "gu"))]
        .map((match) => match[0])
        .find((words) => !prompted.has(words))
    : undefined;
  if (asked) {
    prompted.add(asked);
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: {
          command: "touch waits-prompt.txt",
          description: "Touch a file",
        },
      },
    };
  }
  return { everyMs: 5, words: ["ok"] };
};

/** The asked page's origin: a site on loopback the run serves (gated-pages.ts `servedSite`). */
let ORIGIN = "";
/**
 * The waiting delegate's page on {@link ORIGIN} opened through its door and
 * driven, as its browser tool would: a `browser_ask` is refused while it
 * has none (agent shield.ts `askedPage`). Set as the run makes the delegate.
 */
let openAsked: () => Promise<void> = () => Promise.resolve();
const REASON = `Clear the probe's CAPTCHA ${crypto.randomUUID().slice(0, 8)}`;
/** The tag every delegate-wait notice opens with (core injected.ts `delegateWaitNotice`). */
const WAIT_TAG = "[cawco:delegate-wait";
const HELLO = `PROBE-WAITS-HELLO-${crypto.randomUUID().slice(0, 8)}`;

interface Parked {
  instanceId?: string;
  payload?: unknown;
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

const callAs = async <N extends ToolName, const A>(
  fleet: KitFleet,
  as: string,
  name: N,
  args: Sending<A, ToolArgs<N>>,
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
  const project = await fleet.api((hub) =>
    hub.api.projects.post({
      name: "Delegate waits",
      machineId: MACHINE,
      cwd: src,
    })
  );
  const inProject = { projectId: project.id };
  const parent = await fleet.spawn("claude", "Waits parent", src, inProject);
  /**
   * A delegate of the parent titled `title`, working in `cwd`: a work item
   * in a workspace of its own, as `delegate` writes them, renamed through
   * the hub so its board reads the row these writes made (the hub hears
   * its own connection's writes alone, db `instance_changes`).
   */
  /** Each seeded delegate's workspace, by its instance id: its door's id. */
  const workspaces = new Map<string, string>();
  const seeded = async (
    title: string,
    cwd: string,
    extra: object = {}
  ): Promise<string> => {
    const child = await fleet.spawn("claude", "Delegate", cwd, {
      ...inProject,
      ...extra,
    });
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
    const renamed = await hubAt(fleet.base)
      .api.instances({ id: child })
      .patch({ title });
    if (renamed.error !== null) {
      throw new Error(
        `${title}'s rename: ${renamed.status} ${answerText(renamed)}`
      );
    }
    workspaces.set(child, workspace);
    return child;
  };
  const delegate = await seeded("Waits delegate", src);
  const site = servedSite("Waits sign-in");
  ORIGIN = site.origin;
  const browser = await liveBrowser(fleet, `project:${project.id}`, MACHINE);
  openAsked = async () => {
    const door = await doorOf(
      fleet,
      workspaces.get(delegate) ?? "",
      project.id
    );
    try {
      await door.open(`${ORIGIN}/sign-in`);
    } finally {
      door.close();
    }
  };
  check(
    "the project's browser is live on the local host, for the delegate's page",
    browser?.state === "live",
    JSON.stringify(browser)
  );

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
  const waitsSent = (): number =>
    sendsOf(fleet, parent, delegateWaitWords.waitsLine("Waits delegate"));
  await openAsked();
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
      (await fleet.api((hub) => hub.api.pending.get())).find(
        (one) => one.instanceId === delegate && payloadOf(one).browserAsk
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
    "(a) a delegate whose parent ended its turn calls browser_ask: the ask waits on the person, and the parent is woken with the note, once, that its delegate waits on the person, its origin and reason",
    !!parked && !!waits && waitsSent() === 1,
    `pending: ${parked ? `${parked.requestId} ${payloadOf({ payload: payloadOf(parked).browserAsk }).key}` : "none"}; the parent's sends of the wait: ${waitsSent()}; the parent's requests since: ${
      heard
        .slice(before)
        .map((one) => one.last.slice(0, 200))
        .join(" | ") || "none"
    }`
  );
  if (!(parked?.requestId && payloadOf(parked).browserAsk)) {
    return;
  }
  const { requestId } = parked;
  const key = String(payloadOf({ payload: payloadOf(parked).browserAsk }).key);

  // (b) The parent cannot answer it in the person's place.
  const refused = await callAs(fleet, parent, "answer_delegate", {
    target: delegate,
    requestId,
    deny: true,
  });
  const still = (await fleet.api((hub) => hub.api.pending.get())).some(
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
  const tookSent = (): number =>
    sendsOf(fleet, parent, delegateWaitWords.tookOverLine("Waits delegate"));
  const took = await fleet
    .api((hub) =>
      hub.api.browsers({ key }).takeover.post({
        requestId,
        machineId: MACHINE,
      })
    )
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
    "(c) the person takes the browser over: the parent hears so, once",
    took === "taken" && !!taken && tookSent() === 1,
    `take-over: ${took}; the parent's sends of it: ${tookSent()}; the parent's requests since: ${
      heard
        .slice(beforeTake)
        .map((one) => one.last.slice(0, 200))
        .join(" | ") || "none"
    }`
  );

  // (d) The person hands it back.
  const beforeBack = heard.length;
  const backSent = (): number =>
    sendsOf(fleet, parent, delegateWaitWords.endedLine("Waits delegate"));
  const back = await fleet
    .api((hub) =>
      hub.api.browsers({ key }).handback.post({ machineId: MACHINE })
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
    "(d) the person hands the browser back: the delegate's call answers it was handed back, and the parent hears so, once",
    back.error === undefined &&
      answered.includes(browserAskWords.handedBack(back.origin)) &&
      !!handed &&
      backSent() === 1,
    `hand-back: ${back.error ?? `on ${back.origin}`}; the call answered: ${answered.slice(0, 300)}; the parent's sends of it: ${backSent()}; the parent's requests since: ${
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
    const put = await hubAt(fleet.base)
      .api.projects({ id: project.id })
      .folder.file.put({ path, content });
    if (put.error !== null) {
      throw new Error(`the person's ${path}: ${put.status} ${answerText(put)}`);
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
        (await fleet.api((hub) => hub.api.pending.get())).find(
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
      (await fleet.api((hub) => hub.api.pending.get())).some(
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

  const third = await legsAfter({
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
  if (third) {
    await legsLast({
      check,
      delegate,
      fleet,
      first: proposal.requestId,
      parent,
      third,
    });
    const prompter = await seeded("Prompting delegate", src, {
      permissionMode: "default",
    });
    await legsHub({ check, delegate, designer, fleet, key, parent, prompter });
    // Each of (n) and (m) has a delegate of its own: (l)'s turns at rest
    // count as quiet ones, and the third fails its item (work-items.ts
    // `QUIET_TURNS`).
    await legEnds({
      check,
      fleet,
      parent,
      withdrawer: await seeded("Withdrawn prompter", src, {
        permissionMode: "default",
      }),
      other: await seeded("Other prompter", src, {
        permissionMode: "default",
      }),
    });
  }
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

/** Legs (f) and (g); the third proposal, for (h). */
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
}: After) => {
  // (f) The person's phone: the first proposal pushed once, across the
  // restart. A push of an ask goes under its collapse id, or leads a
  // burst's push carrying its request id.
  const pushesOf = (requestId: string): number =>
    phone
      .pushes()
      .filter(
        (one) =>
          one.collapseId === askCollapseId(requestId) ||
          (payloadOf(one).cawco as { requestId?: string } | undefined)
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
  await fleet.api((hub) =>
    hub.api.browsers({ key }).stop.post({
      machineId: MACHINE,
    })
  );
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
  const owedThen = owedOf(fleet, parent, waitsLine);
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
    "(g) a parent read unknown as its delegate's proposal parks has its note kept for it, owed, and is told once when its machine registers",
    status === "unknown" &&
      !!thirdAsk &&
      whileUnknown === 1 &&
      owedThen === 1 &&
      toldAfter === 1 &&
      woken > 0,
    `the parent after the hub's start: ${status}; design_write: ${third.text.slice(0, 200)}; pending: ${thirdAsk?.requestId ?? "none"}; its sends of the wait while unknown: ${whileUnknown} (owed: ${owedThen}), after the register: ${toldAfter}; woken: ${woken}`
  );
  return thirdAsk;
};

/** How many sends to `to` carry a notice titled `line`, and of them those still owed. */
const sendsOf = (fleet: KitFleet, to: string, line: string): number =>
  fleet.query<{ n: number }>(
    "SELECT count(*) AS n FROM sent_messages WHERE instance_id = ? AND instr(body, ?) > 0",
    to,
    encodeURIComponent(line)
  )[0]?.n ?? 0;
const owedOf = (fleet: KitFleet, to: string, line: string): number =>
  fleet.query<{ n: number }>(
    "SELECT count(*) AS n FROM sent_messages WHERE instance_id = ? AND owed IS NOT NULL AND instr(body, ?) > 0",
    to,
    encodeURIComponent(line)
  )[0]?.n ?? 0;

/** Whether push holds its mark of ask `requestId` (db `ask_pushes`). */
const pushMarked = (fleet: KitFleet, requestId: string): boolean =>
  fleet.query<{ n: number }>(
    "SELECT count(*) AS n FROM ask_pushes WHERE request_id = ?",
    requestId
  )[0]?.n === 1;

/** Legs (h) and (i). */
const legsLast = async ({
  check,
  delegate,
  fleet,
  first,
  parent,
  third,
}: {
  check: Kit["check"];
  delegate: string;
  fleet: KitFleet;
  first: string;
  parent: string;
  third: Parked;
}): Promise<void> => {
  // (h) An end while the parent reads unknown.
  const endedLine = delegateWaitWords.endedLine("Design delegate");
  await until(
    "(h) the parent awake and at rest",
    () => fleet.instance(parent),
    (row) => row?.status === "running" && row.turn_open_at === null,
    120_000
  );
  const before = sendsOf(fleet, parent, endedLine);
  const heardBefore = heard.length;
  await fleet.stop("agent", "SIGKILL");
  await fleet.stop("hub", "SIGKILL");
  fleet.launch("hub");
  await fleet.hubUp();
  const status = fleet.instance(parent)?.status ?? "gone";
  await until(
    "(h) the third proposal parked again",
    async () =>
      (await fleet.api((hub) => hub.api.pending.get())).some(
        (one) => one.requestId === third.requestId
      ),
    Boolean,
    60_000
  ).catch(() => false);
  await fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "permission.answer",
    machineId: MACHINE,
    sessionId: third.instanceId,
    payload: {
      instanceId: third.instanceId,
      requestId: third.requestId,
      method: RESOLVE_PERMISSION,
      args: [third.requestId, { behavior: "deny", message: "Not this one" }],
    },
  });
  const gone = await until(
    "(h) the third proposal declined",
    async () =>
      !(await fleet.api((hub) => hub.api.pending.get())).some(
        (one) => one.requestId === third.requestId
      ),
    Boolean,
    60_000
  ).catch(() => false);
  const whileUnknown = sendsOf(fleet, parent, endedLine) - before;
  const owedThen = owedOf(fleet, parent, endedLine);
  fleet.launch("agent");
  await fleet.agentUp();
  const woken = await until(
    "(h) the parent woken with the end",
    () =>
      heard
        .slice(heardBefore)
        .filter(
          (one) => one.last.includes(WAIT_TAG) && one.last.includes(endedLine)
        ).length,
    (n) => n > 0,
    120_000
  ).catch(() => 0);
  const told = sendsOf(fleet, parent, endedLine) - before;
  check(
    "(h) an ask that ends while its parent reads unknown has its end note kept for the parent, owed, and told once when its machine registers",
    status === "unknown" &&
      gone &&
      whileUnknown === 1 &&
      owedThen === 1 &&
      woken === 1 &&
      told === 1,
    `the parent after the hub's start: ${status}; declined: ${gone}; its end notes while unknown: ${whileUnknown} (owed: ${owedThen}); after the register: ${told}; woken: ${woken}`
  );

  // (i) A browser ask open across a restart leaves no push mark behind.
  await until(
    "(i) the parent awake",
    () => fleet.instance(parent)?.status ?? "",
    (now) => now === "running",
    120_000
  );
  await openAsked();
  const asking = callAs(
    fleet,
    delegate,
    "browser_ask",
    { origin: ORIGIN, reason: `${REASON} again` },
    600_000
  ).catch(() => undefined);
  const browserAsk = await until(
    "(i) the second browser ask waiting on the person",
    async () =>
      (await fleet.api((hub) => hub.api.pending.get())).find(
        (one) => one.instanceId === delegate && payloadOf(one).browserAsk
      ),
    Boolean,
    60_000
  ).catch(() => undefined);
  const marked =
    !!browserAsk?.requestId && pushMarked(fleet, browserAsk.requestId);
  await fleet.stop("hub", "SIGKILL");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  await asking;
  const dropped = browserAsk?.requestId
    ? await until(
        "(i) the browser ask's push mark dropped",
        () => !pushMarked(fleet, browserAsk.requestId ?? ""),
        Boolean,
        60_000
      ).catch(() => false)
    : false;
  const kept = pushMarked(fleet, first);
  const endedOnce = browserAsk?.requestId
    ? await hubEndTold(fleet, parent, browserAsk.requestId)
    : { sends: 0, woken: 0 };
  check(
    "(i) a browser ask open across a hub restart leaves no push mark behind, while a proposal parked again keeps its own, and its parent hears once that it ended with the restart",
    marked && dropped && kept && endedOnce.sends === 1 && endedOnce.woken > 0,
    `the browser ask: ${browserAsk?.requestId ?? "none"}; marked before the restart: ${marked}; dropped after it: ${dropped}; the first proposal's mark kept: ${kept}; the parent's notes that it ended with the hub: ${endedOnce.sends}, woken: ${endedOnce.woken}`
  );
};

/**
 * (l) A harness's own prompt, routed to the parent: answered by the parent,
 * no end note follows; routed again and the parent put to sleep at rest, it
 * is the person's now, told once, and the person's answer is told once.
 */
const legRouted = async ({
  check,
  fleet,
  parent,
  prompter,
}: {
  check: Kit["check"];
  fleet: KitFleet;
  parent: string;
  prompter: string;
}): Promise<void> => {
  const title = "Prompting delegate";
  const ended = (): number =>
    sendsOf(fleet, parent, delegateWaitWords.endedLine(title));
  const personsNow = (): number =>
    sendsOf(fleet, parent, delegateWaitWords.personsNowLine(title));
  /** The prompter's Bash prompt routed to the parent, none of `known`. */
  const routed = (known: readonly string[]) =>
    until(
      "(l) the prompt routed to the parent",
      async () =>
        (await fleet.api((hub) => hub.api.pending.get())).find(
          (one) =>
            one.instanceId === prompter &&
            payloadOf(one).routedTo === "parent" &&
            !known.includes(one.requestId ?? "")
        ),
      Boolean,
      120_000
    ).catch(() => undefined);
  const gone = (requestId: string) =>
    until(
      "(l) the prompt settled",
      async () =>
        !(await fleet.api((hub) => hub.api.pending.get())).some(
          (one) => one.requestId === requestId
        ),
      Boolean,
      60_000
    ).catch(() => false);
  await until(
    "(l) the parent awake",
    () => fleet.instance(parent)?.status ?? "",
    (now) => now === "running",
    120_000
  );
  await fleet.send(prompter, `${PROMPT_TAG} one`);
  const first = await routed([]);
  const answered = first?.requestId
    ? await callAs(fleet, parent, "answer_delegate", {
        target: prompter,
        requestId: first.requestId,
      })
    : undefined;
  const settledOne = first?.requestId ? await gone(first.requestId) : false;
  const endsAfterOwn = ended();
  check(
    "(l) a prompt routed to the parent and answered by it settles, and the parent is told no end of its own answer",
    !!first && !answered?.refused && settledOne && endsAfterOwn === 0,
    `routed: ${first?.requestId ?? "none"}; answer_delegate: ${answered?.text.slice(0, 200) ?? "none"}; settled: ${settledOne}; end notes: ${endsAfterOwn}`
  );
  await until(
    "(l) the parent at rest",
    () => fleet.instance(parent)?.turn_open_at ?? null,
    (open) => open === null,
    120_000
  );
  await fleet.send(prompter, `${PROMPT_TAG} two`);
  const second = await routed([first?.requestId ?? ""]);
  await until(
    "(l) the parent at rest with the ask",
    () => fleet.instance(parent)?.turn_open_at ?? null,
    (open) => open === null,
    120_000
  );
  const slept = await asleep(fleet, parent);
  const toldNow = await until(
    "(l) the parent told the prompt is the person's now",
    personsNow,
    (n) => n > 0,
    120_000
  ).catch(() => personsNow());
  if (second?.requestId) {
    await fleet.post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "permission.answer",
      machineId: MACHINE,
      sessionId: prompter,
      payload: {
        instanceId: prompter,
        requestId: second.requestId,
        method: RESOLVE_PERMISSION,
        args: [second.requestId, { behavior: "allow" }],
      },
    });
  }
  const settledTwo = second?.requestId ? await gone(second.requestId) : false;
  const endTold = await until(
    "(l) the parent told the person's answer",
    ended,
    (n) => n > 0,
    120_000
  ).catch(() => ended());
  check(
    "(l) a routed prompt the parent left unanswered as it went to rest is the person's now, told once; the person approves it, and the parent is told that once",
    !!second &&
      slept === "sleeping" &&
      toldNow === 1 &&
      settledTwo &&
      endTold === 1 &&
      personsNow() === 1,
    `routed: ${second?.requestId ?? "none"}; the parent: ${slept}; told it is the person's now: ${personsNow()}; settled: ${settledTwo}; end notes: ${endTold}`
  );
};

/** The newest Bash prompt of `of` routed to its parent, none of `known`. */
const routedOf = (fleet: KitFleet, of: string, known: readonly string[] = []) =>
  until(
    "a prompt routed to the parent",
    async () =>
      (await fleet.api((hub) => hub.api.pending.get())).find(
        (one) =>
          one.instanceId === of &&
          payloadOf(one).routedTo === "parent" &&
          !known.includes(one.requestId ?? "")
      ),
    Boolean,
    120_000
  ).catch(() => undefined);

/** Legs (n) and (m). */
const legEnds = async ({
  check,
  fleet,
  other,
  parent,
  withdrawer,
}: {
  check: Kit["check"];
  fleet: KitFleet;
  other: string;
  parent: string;
  withdrawer: string;
}): Promise<void> => {
  // (n) Withdrawn: its delegate stopped while the prompt waits.
  const endedLine = delegateWaitWords.endedLine("Withdrawn prompter");
  await until(
    "(n) the parent awake",
    () => fleet.instance(parent)?.status ?? "",
    (now) => now === "running",
    180_000
  );
  const before = sendsOf(fleet, parent, endedLine);
  await fleet.send(withdrawer, `${PROMPT_TAG} three`);
  const third = await routedOf(fleet, withdrawer);
  await fleet.stopSession(withdrawer);
  const withdrawn = await until(
    "(n) the parent told the prompt was withdrawn",
    () =>
      fleet.query<{ n: number }>(
        "SELECT count(*) AS n FROM sent_messages WHERE instance_id = ? AND instr(body, ?) > 0 AND instr(body, ?) > 0",
        parent,
        encodeURIComponent(endedLine),
        delegateWaitWords.withdrawn
      )[0]?.n ?? 0,
    (n) => n > 0,
    120_000
  ).catch(() => 0);
  check(
    "(n) a routed prompt withdrawn as its delegate is stopped: the parent hears once that it was withdrawn",
    !!third &&
      withdrawn === 1 &&
      sendsOf(fleet, parent, endedLine) - before === 1,
    `routed: ${third?.requestId ?? "none"}; withdrawn notes: ${withdrawn}; end notes since: ${sendsOf(fleet, parent, endedLine) - before}`
  );

  // (m) The parent ended by the person's Stop, which ends its delegates
  // first (tree-stops.ts): the waiting delegate's prompt is withdrawn, the
  // parent hears so once before it ends, and nothing after.
  const otherEnded = delegateWaitWords.endedLine("Other prompter");
  await fleet.send(other, `${PROMPT_TAG} four`);
  const routed = await routedOf(fleet, other);
  await fleet.stopSession(parent);
  await until(
    "(m) the parent stopped",
    () => fleet.instance(parent)?.status ?? "",
    (now) => now === "stopped",
    180_000
  );
  const total = (): number =>
    fleet.query<{ n: number }>(
      "SELECT count(*) AS n FROM sent_messages WHERE instance_id = ?",
      parent
    )[0]?.n ?? 0;
  const atStop = total();
  const told = sendsOf(fleet, parent, otherEnded);
  const gone = routed?.requestId
    ? !(await fleet.api((hub) => hub.api.pending.get())).some(
        (one) => one.requestId === routed.requestId
      )
    : false;
  // The other's item ends with the tree: anything said to the parent after
  // its stop would be a send to an ended session.
  await until(
    "(m) the other's item ended",
    () =>
      fleet.query<{ state: string }>(
        "SELECT w.state FROM work_items w JOIN instances i ON i.work_item_id = w.id WHERE i.id = ?",
        other
      )[0]?.state ?? "",
    (state) => ["cancelled", "done", "failed"].includes(state),
    120_000
  ).catch(() => "");
  check(
    "(m) a parent the person stops ends its waiting delegate first: the prompt is withdrawn, the parent hears so once, and nothing after its end",
    !!routed && gone && told === 1 && total() === atStop,
    `routed: ${routed?.requestId ?? "none"}; gone: ${gone}; the parent's notes that it ended: ${told}; its sends since its stop: ${total() - atStop}`
  );
};

/**
 * The parent's sends saying ask `requestId` ended with a hub restart (their
 * tag names the ask), once one has woken it; and the requests it woke.
 */
const hubEndTold = async (
  fleet: KitFleet,
  parent: string,
  requestId: string
): Promise<{ sends: number; woken: number }> => {
  const sends = (): number =>
    fleet.query<{ n: number }>(
      "SELECT count(*) AS n FROM sent_messages WHERE instance_id = ? AND instr(body, ?) > 0 AND instr(body, ?) > 0",
      parent,
      `request=${requestId}`,
      delegateWaitWords.endedWithHub
    )[0]?.n ?? 0;
  const woken = (): number =>
    heard.filter(
      (one) =>
        one.last.includes(`request=${requestId}`) &&
        one.last.includes(delegateWaitWords.endedWithHub)
    ).length;
  await until(
    `the parent woken with ${requestId.slice(0, 8)}'s end`,
    woken,
    (n) => n > 0,
    120_000
  ).catch(() => 0);
  return { sends: sends(), woken: woken() };
};

/** Legs (j) and (k). */
const legsHub = async ({
  check,
  delegate,
  designer,
  fleet,
  key,
  parent,
  prompter,
}: {
  check: Kit["check"];
  delegate: string;
  designer: string;
  fleet: KitFleet;
  key: string;
  parent: string;
  prompter: string;
}): Promise<void> => {
  // (j) Taken over when the hub restarts.
  await until(
    "(j) the parent awake",
    () => fleet.instance(parent)?.status ?? "",
    (now) => now === "running",
    120_000
  );
  await openAsked();
  const asking = callAs(
    fleet,
    delegate,
    "browser_ask",
    { origin: ORIGIN, reason: `${REASON} taken` },
    600_000
  ).catch(() => undefined);
  const ask = await until(
    "(j) the third browser ask waiting on the person",
    async () =>
      (await fleet.api((hub) => hub.api.pending.get())).find(
        (one) => one.instanceId === delegate && payloadOf(one).browserAsk
      ),
    Boolean,
    60_000
  ).catch(() => undefined);
  const requestId = ask?.requestId ?? "";
  const took = ask
    ? await fleet
        .api((hub) =>
          hub.api.browsers({ key }).takeover.post({
            requestId,
            machineId: MACHINE,
          })
        )
        .then(
          () => "taken",
          (error: unknown) =>
            error instanceof Error ? error.message : String(error)
        )
    : "no ask";
  const markedTaken = !!ask && pushMarked(fleet, requestId);
  await fleet.stop("hub", "SIGKILL");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  await asking;
  const ended = ask
    ? await hubEndTold(fleet, parent, requestId)
    : { sends: 0, woken: 0 };
  const dropped = ask
    ? await until(
        "(j) the taken ask's push mark dropped",
        () => !pushMarked(fleet, requestId),
        Boolean,
        60_000
      ).catch(() => false)
    : false;
  check(
    "(j) a browser ask taken over when the hub restarts keeps its push mark through the take-over; the next start drops it, and its parent hears once that it ended with the restart",
    took === "taken" &&
      markedTaken &&
      dropped &&
      ended.sends === 1 &&
      ended.woken > 0,
    `take-over: ${took}; marked while taken: ${markedTaken}; dropped after the restart: ${dropped}; the parent's notes that it ended with the hub: ${ended.sends}, woken: ${ended.woken}`
  );
  await fleet
    .api((hub) =>
      hub.api.browsers({ key }).handback.post({
        machineId: MACHINE,
      })
    )
    .catch(() => undefined);
  await fleet.api((hub) =>
    hub.api.browsers({ key }).stop.post({
      machineId: MACHINE,
    })
  );

  await legRouted({ check, fleet, parent, prompter });

  // (k) A note kept for an away parent fails: the delegate is told nothing.
  const waitsLine = delegateWaitWords.waitsLine("Design delegate");
  const undelivered = (): number =>
    fleet.query<{ n: number }>(
      "SELECT count(*) AS n FROM sent_messages WHERE instance_id = ? AND instr(body, ?) > 0",
      designer,
      "[cawco:undelivered"
    )[0]?.n ?? 0;
  const before = undelivered();
  const failedNotes = (): number =>
    fleet.query<{ n: number }>(
      "SELECT count(*) AS n FROM sent_messages WHERE instance_id = ? AND state = 'failed' AND instr(body, ?) > 0",
      parent,
      encodeURIComponent(waitsLine)
    )[0]?.n ?? 0;
  const failedBefore = failedNotes();
  await fleet.stop("agent", "SIGKILL");
  await fleet.stop("hub", "SIGKILL");
  fleet.launch("hub");
  await fleet.hubUp();
  await callAs(fleet, designer, "design_write", {
    files: [{ path: "references/fourth.md", content: `${REASON} fourth\n` }],
    why: "The probe's fourth change to the design system",
  });
  // The window a hub's start gives every machine (core handover.ts
  // `hub-start`: an update's trial and the reconnecting window, four
  // minutes) ends, and what was kept for the away machine fails.
  const failed = await until(
    "(k) the note kept for the away parent failed",
    () => failedNotes() - failedBefore,
    (n) => n > 0,
    420_000
  ).catch(() => failedNotes() - failedBefore);
  const told = undelivered() - before;
  fleet.launch("agent");
  await fleet.agentUp();
  check(
    "(k) a note kept for a parent whose machine stays away past its window fails, and the delegate is told nothing of it: it is the hub's word, not the delegate's",
    failed === 1 && told === 0,
    `the parent's failed notes of the wait: ${failed}; the delegate's undelivered notices since: ${told}`
  );
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "delegate-waits",
  run,
};

export default spec;
