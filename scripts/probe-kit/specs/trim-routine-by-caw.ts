/**
 * Caw turns the hub's unused skills and servers routine on: the empty
 * Routines page's chip puts its ask in his composer, and when the person
 * sends it Caw turns the hub's routine on rather than writing a second one
 * (hub routines.ts `trimOff`, `turnTrimOn`).
 *
 * On an in-process hub (hub-in-process.ts) over a scratch database, Caw's
 * calls go through his own door (`/api/delegation/call/:instanceId`, his
 * minted credential), in two projects with no routine:
 *
 * - a. `routine_list` names the hub's routine, off, and how to turn it on,
 *   in a project whose person pressed Not now on the page's suggestion as
 *   in one that never answered it.
 * - b. Any change to it but `enabled: true` alone is refused in words that
 *   say to turn it on first, and makes nothing.
 * - c. `routine_update` with `enabled: true` on its name turns it on as the
 *   page's Turn on does: the routine made, target `trim`, on, the answer
 *   recorded as on, and the page no longer suggests it.
 * - d. Once on, `routine_list` lists it as a routine and no longer names it
 *   off.
 *
 *   bun scripts/probe-kit/run.ts trim-routine-by-caw
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hubRequest } from "../../../packages/core/src/hub-request";
import { machinePath } from "../../../packages/core/src/machine-path";
import {
  routinesWords,
  routineToolWords,
} from "../../../packages/core/src/words/routines";
import { type ToolSession, toolWords } from "../../lib/tool-call";
import type { Kit, Spec } from "../kit";

const MACHINE = "probe-trim-machine";
const NAME = routinesWords.trimName;
/** What routine_list says of it while it is off. */
const OFF_LINE = routineToolWords.trimOff(NAME);
/** What routine_update refuses any other change with. */
const FIRST = routineToolWords.trimFirst(NAME);

const run = async (
  kit: Kit,
  scratch: string,
  serve: (handle: (request: Request) => Promise<Response>) => string
): Promise<void> => {
  const { check } = kit;
  const { hubInProcess } =
    await import("../../../packages/hub/scripts/hub-in-process");
  const { db, hub } = await hubInProcess(
    join(scratch, "hub", "hub.db"),
    join(scratch, "home")
  );
  const { createSessionIdentities } =
    await import("../../../packages/hub/src/session-identity");
  const identities = createSessionIdentities(db);
  db.upsertAgent({
    machineId: MACHINE,
    hostname: `${MACHINE}.local`,
    os: "linux",
    auth: "unknown",
  });
  const base = serve((request) => hub.handle(request));

  /** A project with no routine, and Caw's conversation in it. */
  const projectWithCaw = (name: string, slug: string) => {
    const projectId = crypto.randomUUID();
    const path = `/home/probe/src/${slug}`;
    db.createProject({
      id: projectId,
      name,
      checkout: {
        machineId: MACHINE,
        path: machinePath("/home/probe", path, MACHINE),
      },
      remote: null,
    });
    const sessionId = crypto.randomUUID();
    db.openInstance({
      id: sessionId,
      machineId: MACHINE,
      cwd: machinePath("/home/probe", path, MACHINE),
      sessionId: crypto.randomUUID(),
      harness: "claude",
      origin: "person",
      projectId,
      title: `${name}'s conversation`,
      kind: "mainline",
      permissionMode: "bypassPermissions",
      model: "model-a",
    });
    const session: ToolSession = {
      base,
      id: sessionId,
      credential: identities.mint(sessionId),
    };
    return { projectId, session };
  };
  const trimRows = (projectId: string) =>
    db.routines.list(projectId).filter((row) => row.target === "trim");

  // (a) Listed off, answered or not.
  const fresh = projectWithCaw("Trim probe", "trim-probe");
  const waved = projectWithCaw("Waved probe", "waved-probe");
  db.trim.answer(waved.projectId, "dismissed");
  const listed = await toolWords(fresh.session, "routine_list", {});
  check(
    "a: routine_list names the hub's routine off, and how to turn it on",
    !listed.refused && listed.text.includes(OFF_LINE),
    listed.text
  );
  const listedWaved = await toolWords(waved.session, "routine_list", {});
  check(
    "a: it names it after the person pressed Not now too",
    !listedWaved.refused && listedWaved.text.includes(OFF_LINE),
    listedWaved.text
  );

  // (b) Any other change is refused until it is on.
  const reschedule = await toolWords(fresh.session, "routine_update", {
    id: NAME,
    cron: "0 8 * * 2",
  });
  const withMore = await toolWords(fresh.session, "routine_update", {
    id: NAME,
    enabled: true,
    keep: false,
  });
  check(
    "b: a change to it before it is on is refused, saying to turn it on first, and makes nothing",
    reschedule.refused &&
      reschedule.text.includes(FIRST) &&
      withMore.refused &&
      withMore.text.includes(FIRST) &&
      trimRows(fresh.projectId).length === 0,
    `${reschedule.text} | ${withMore.text}`
  );

  // (c) enabled: true on its name turns it on, as Turn on does.
  const turned = await toolWords(fresh.session, "routine_update", {
    id: NAME.toLowerCase(),
    enabled: true,
  });
  const rows = trimRows(fresh.projectId);
  check(
    "c: enabled: true on its name makes the hub's routine, on, and answers it",
    !turned.refused &&
      turned.text.includes(NAME) &&
      rows.length === 1 &&
      rows[0]?.enabled === true &&
      rows[0]?.createdBy === "hub",
    `${turned.text}; rows ${JSON.stringify(rows.map((row) => ({ enabled: row.enabled, by: row.createdBy })))}`
  );
  const offer = await hub.handle(
    new Request(
      `http://127.0.0.1${hubRequest("GET /api/projects/:id/trim-routine", { path: { id: fresh.projectId } }).path}`
    )
  );
  const { offered } = (await offer.json()) as { offered?: boolean };
  check(
    "c: the answer is recorded as on, and the page no longer suggests it",
    db.trim.answerOf(fresh.projectId) === "on" && offered === false,
    `answer ${db.trim.answerOf(fresh.projectId)}; offered ${offered}`
  );

  // (d) Once on, it is a routine like the others.
  const after = await toolWords(fresh.session, "routine_list", {});
  check(
    "d: once on, routine_list lists it and no longer names it off",
    !after.refused &&
      after.text.includes("1 routine") &&
      after.text.includes(NAME) &&
      !after.text.includes(OFF_LINE),
    after.text
  );
};

export default {
  group: "The hub and machines",
  name: "trim-routine-by-caw",
  ownProcess:
    "its in-process hub (hub-in-process.ts) reads CAWCO_DB_PATH and HOME once, as the hub's modules load",
  run: async (kit: Kit) => {
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "trim-routine-by-caw-")
    );
    let served: ReturnType<typeof Bun.serve> | undefined;
    try {
      await run(kit, scratch, (handle) => {
        served = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handle });
        return `http://127.0.0.1:${served.port}`;
      });
    } finally {
      served?.stop(true);
      await rm(scratch, { recursive: true, force: true });
    }
  },
} satisfies Spec;
