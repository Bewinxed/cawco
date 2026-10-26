/**
 * The panel changes what it shows only when the person asks, or when the
 * agent shows something new: an agent taking an artifact away never brings a
 * different one forward (owner: "when u deleted the preview the preview pane
 * switched to another preview so as a user i'm thinking u need someting from
 * me on that view"). On a scratch fleet, at the API: the agent's moves are
 * its own MCP tools on the mock model, the person's are the routes the
 * dashboard calls, and what the panel shows is the hub's word
 * (`artifacts/status`, each row's `shown`). No view is open, so each show
 * waits out its 10 s for one; nothing here reads a picture.
 *
 * (a) The person opens A over a newer X; the agent shows B and deletes it:
 *     the panel closes, A does not come back, and the delete answers null.
 *     Only the person's own open, or an agent's show with its ask, brings
 *     an artifact forward.
 * (b) The person closes the panel; the agent shows G and deletes it: the
 *     panel is closed, and the delete answers null.
 * (c) The person has C in front (newest, over X and A) and Removes it: the
 *     panel shows the next newest, X, as closing a tab does.
 * (d) The agent updates A while X is in front: the panel still shows X.
 * (e) The agent deletes three artifacts, one by its whole id, one by its
 *     eight-character handle, one by its name: each answer names the
 *     artifact it removed (its name and whole id) and is no refusal, and
 *     the session's list is one shorter each time. A delete naming nothing
 *     the session has, and one of an artifact already removed, is refused
 *     naming what it asked (never a 500), and the list keeps its length.
 * (f) The session's own `mcp__cawco__artifact_delete` by an eight-character
 *     id, read as the words an agent reads: "Removed <name> (<kind> <whole
 *     id>)." once, the list one shorter. The same call again (what a second
 *     session deleting the same artifacts seconds later sends) is refused
 *     naming the id, never a 500, and removes nothing.
 */
import type { Reply, Seen } from "../../scratch-fleet";
import { until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const UPDATE = "mcp__cawco__artifact_update";
const DELETE = "mcp__cawco__artifact_delete";
const COMMAND = /PROBE-CALL:(\d+)/gu;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/u;
const ANSWERED_SHOWING = /"showing":(null|\{"id":"([0-9a-f-]{36})")/u;

const pageOf = (heading: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${heading}</title></head><body><h1>${heading}</h1></body></html>`;

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
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
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
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
  const session = await fleet.spawn("claude", "Panel holds", fleet.repo);
  const at = `${fleet.base}/api/instances/${encodeURIComponent(session)}`;

  let sent = 0;
  /**
   * The agent's own tool call, through the mock model: its answer as the
   * session read it, the hub's record unless `words` (what an agent reads).
   */
  const agent = async (
    tool: string,
    input: object,
    words = false
  ): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, {
      name: tool,
      // The hub's record of the answer, which this spec reads (mcp-tool.ts).
      input: words ? input : { response_format: "detailed", ...input },
    });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };
  const make = async (name: string): Promise<string> => {
    const said = await agent(CREATE, {
      kind: "page",
      does: "judge",
      ask: "Judge this page: pin anything that reads wrong",
      name,
      html: pageOf(name),
    });
    const id = said.match(ANSWERED_ID)?.[1];
    if (!id) {
      throw new Error(`artifact_create ${name} answered no id: ${said}`);
    }
    return id;
  };
  /** The agent's artifact_delete: the id its `showing` names, null for nothing, undefined when unread. */
  const agentDeletes = async (id: string) => {
    const said = await agent(DELETE, { id });
    const match = said.match(ANSWERED_SHOWING);
    return { said, showing: match ? (match[2] ?? null) : undefined };
  };
  /** The person's press as the dashboard sends it (artifact-api.ts `showArtifact`). */
  const personShows = async (id: string) => {
    const response = await fetch(`${at}/artifacts/${id}/show`, {
      method: "POST",
    });
    await response.text();
  };
  /** The person's Remove in the panel's menu (artifact-api.ts `removeArtifact`). */
  const personRemoves = async (id: string) => {
    const response = await fetch(`${at}/artifacts/${id}`, {
      method: "DELETE",
    });
    return (await response.json()) as { showing: { id: string } | null };
  };
  /** The person's Close (artifact-api.ts `deletePreview`). */
  const personCloses = async () => {
    await (await fetch(`${at}/preview`, { method: "DELETE" })).text();
  };
  /** What the session's panel shows now, by the hub: an id, or null. */
  const panel = async (): Promise<string | null> => {
    const rows = await fleet.api<{ id: string; shown: boolean }[]>(
      `/api/instances/${encodeURIComponent(session)}/artifacts/status`
    );
    return rows.find((row) => row.shown)?.id ?? null;
  };
  const label = (
    known: Record<string, string>,
    id: string | null | undefined
  ) =>
    id === null
      ? "nothing"
      : (Object.entries(known).find(([, one]) => one === id)?.[0] ??
        String(id));

  const a = await make("alpha");
  const x = await make("xray");
  await personShows(a);
  const opened = await panel();
  kit.check(
    "setup: the person's press puts A in front over the newer X",
    opened === a,
    `panel shows ${label({ A: a, X: x }, opened)}`
  );

  // (a)
  const b = await make("beta");
  const shownB = await panel();
  const deletedB = await agentDeletes(b);
  const afterB = await panel();
  const ids = { A: a, X: x, B: b };
  kit.check(
    "(a) the agent shows B over the person's A, deletes B: the panel closes, nothing comes forward",
    shownB === b && afterB === null,
    `before the delete ${label(ids, shownB)}, after ${label(ids, afterB)}`
  );
  kit.check(
    "(a) artifact_delete answers null",
    deletedB.showing === null,
    `showing ${label(ids, deletedB.showing)}: ${deletedB.said.slice(0, 160)}`
  );

  // (b)
  await personCloses();
  const closed = await panel();
  const g = await make("gamma");
  const shownG = await panel();
  const deletedG = await agentDeletes(g);
  const afterG = await panel();
  const all = { ...ids, G: g };
  kit.check(
    "(b) with the panel closed, the agent shows G and deletes it: the panel is closed",
    closed === null && shownG === g && afterG === null,
    `closed ${label(all, closed)}, shown ${label(all, shownG)}, after ${label(all, afterG)}`
  );
  kit.check(
    "(b) artifact_delete answers null",
    deletedG.showing === null,
    `showing ${label(all, deletedG.showing)}: ${deletedG.said.slice(0, 160)}`
  );

  // (c)
  const c = await make("charlie");
  await personShows(c);
  const front = await panel();
  const removed = await personRemoves(c);
  const afterC = await panel();
  const withC = { ...all, C: c };
  kit.check(
    "(c) the person Removes C, in front of X and A: the panel shows the next newest, X",
    front === c && afterC === x && removed.showing?.id === x,
    `before ${label(withC, front)}, after ${label(withC, afterC)}, answered ${label(withC, removed.showing?.id ?? null)}`
  );

  // (d)
  const updated = await agent(UPDATE, { id: a, html: pageOf("alpha again") });
  const afterUpdate = await panel();
  kit.check(
    "(d) the agent updates A, hidden: the panel still shows X",
    afterUpdate === x,
    `after ${label(withC, afterUpdate)}; update said ${updated.slice(0, 120)}`
  );

  // (e)
  const listed = async (): Promise<string[]> =>
    (
      await fleet.api<{ id: string }[]>(
        `/api/instances/${encodeURIComponent(session)}/artifacts`
      )
    ).map((row) => row.id);
  const ways: [string, string, (id: string, name: string) => string][] = [
    ["its whole id", "delta", (id) => id],
    ["its eight-character handle", "echo", (id) => id.slice(0, 8)],
    ["its name", "foxtrot", (_id, name) => name],
  ];
  let gone = "";
  for (const [way, name, written] of ways) {
    // biome-ignore lint/performance/noAwaitInLoops: one artifact made and deleted at a time, the list read around each
    const id = await make(name);
    gone = written(id, name);
    const before = await listed();
    const said = await agent(DELETE, { id: written(id, name) });
    const after = await listed();
    kit.check(
      `(e) artifact_delete by ${way} answers the artifact it removed (${name}, ${id}), and the list loses it alone`,
      said.includes(id) &&
        said.includes(name) &&
        ANSWERED_SHOWING.test(said) &&
        !after.includes(id) &&
        after.length === before.length - 1,
      `${said.slice(0, 300)} | listed ${before.length} before, ${after.length} after`
    );
  }
  for (const [what, asked] of [
    ["naming nothing the session has", "0badc0de"],
    ["of one already removed, by its name", gone],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one miss at a time, the list read around each
    const before = await listed();
    const missed = await agent(DELETE, { id: asked });
    const after = await listed();
    kit.check(
      `(e) artifact_delete ${what} removes nothing and is refused naming what it asked, never the hub's own fault`,
      !ANSWERED_SHOWING.test(missed) &&
        missed.includes(asked) &&
        !missed.includes("internal-server-error") &&
        after.length === before.length,
      `${missed.slice(0, 300)} | listed ${before.length} before, ${after.length} after`
    );
  }

  // (f) The canvas-tree session's call, as it made it: its own
  // mcp__cawco__artifact_delete by an eight-character id, read as words.
  const golf = await make("golf");
  const short = golf.slice(0, 8);
  const beforeGolf = await listed();
  const removedGolf = await agent(DELETE, { id: short }, true);
  const afterGolf = await listed();
  kit.check(
    "(f) the session's own artifact_delete by an eight-character id answers its removal once, by name and whole id, and the list loses it alone",
    removedGolf.startsWith(`Removed golf (page ${golf}).`) &&
      removedGolf.split("Removed ").length === 2 &&
      !afterGolf.includes(golf) &&
      afterGolf.length === beforeGolf.length - 1,
    `${removedGolf.slice(0, 300)} | listed ${beforeGolf.length} before, ${afterGolf.length} after`
  );
  // The same call again, as a second session deleting the same artifacts
  // seconds later made it (23cb5219's deletes before f4665d25's, 07:56Z).
  const again = await agent(DELETE, { id: short }, true);
  const afterAgain = await listed();
  kit.check(
    "(f) the same call again is refused naming the id, never a 500, and removes nothing",
    !again.startsWith("Removed") &&
      again.includes(short) &&
      !again.includes("internal-server-error") &&
      afterAgain.length === afterGolf.length,
    `${again.slice(0, 300)} | listed ${afterGolf.length} before, ${afterAgain.length} after`
  );
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "artifact-delete-panel",
  run,
};
export default spec;
