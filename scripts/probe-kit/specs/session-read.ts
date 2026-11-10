/**
 * A session's read of an artifact (`GET /api/instances/:id/artifacts/:artifact`,
 * the `artifact_read` tool's route) counts as that session hearing the
 * person's answers on it: it stamps `readSeq`, and answers the session has
 * heard settle with nothing sent to it (hub artifacts/needs.ts
 * `answersUnheard`). The artifacts probe's own read as the person muted its
 * leg 5 that way (de28a8786). The route answers that session alone (hub
 * hub-auth.ts `sessionReadOf`), and a read counts only for the state it
 * returned (needs.ts `readThrough`).
 *
 * The route's rule, no fleet:
 * (r1) `sessionReadOf` names the session for its read, and no other route
 *      of the hub's table (core hub-routes.gen.ts) at its depth, nor its
 *      other methods.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), a canvas of session S:
 * (1) the person (no credential, the hub trusting its network) is refused
 *     403, in words that name his view; main answered him S's read.
 * (2) session T's own credential is refused 403, in words saying a session
 *     reads its own; main refused it as "the person's".
 * (3) S's own credential reads it (the probes' `fleet.sessionApi`); main
 *     refused it as the person's route.
 * (4) S's `artifact_read` through the tool door (`cawco tool`, a harness's
 *     MCP) reads it.
 * (5) the person's view (`…/view`) still answers him.
 * (6) a canvas whose state holds an answer of the person's S never had (the
 *     hub restarted onto a doc and change log holding it): S's
 *     `artifact_read` returns no state, so it counts as read up to that
 *     answer, never past it
 *     (`readSeq` and `deliveredSeq` one short of its seq); main stamped
 *     both through it.
 *
 *   bun scripts/probe-kit/run.ts session-read
 */

import { Doc, encodeStateAsUpdate } from "yjs";
import { hubPath } from "../../../packages/agent/src/hub-client";
import type { ChoiceEntry } from "../../../packages/core/src/choices";
import { refusalWords } from "../../../packages/core/src/hub-refusal";
import { artifactToolWords } from "../../../packages/core/src/words/artifact-tools";
import { sessionReadOf } from "../../../packages/hub/src/hub-auth";
import { toolCall, toolRecord } from "../../lib/tool-call";
import { type Reply, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../spec";

const ROUTES = new URL(
  "../../../packages/core/src/hub-routes.gen.ts",
  import.meta.url
);
/** A route key of the hub's table: `"METHOD /path": {`. */
const ROUTE_KEY = /^\s{4}"([A-Z]+) (\/[^"]*)": \{$/gmu;
const SESSION_READ = "GET /api/instances/:id/artifacts/:artifact";
const SESSION = "6f1c0d2e-0000-4000-8000-000000000001";
const ARTIFACT = "7a2b3c4d-0000-4000-8000-000000000002";

/** Its answer: status and words. */
const asked = async (
  base: string,
  path: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; text: string }> => {
  const response = await fetch(`${base}${path}`, { headers });
  return {
    status: response.status,
    text: response.ok
      ? await response.text()
      : refusalWords(await response.text(), response.status),
  };
};

/** (r1): what `sessionReadOf` names for each route of the hub's table at the read's depth, by its key. */
const ruleLeg = async (kit: Kit) => {
  const table = await Bun.file(ROUTES).text();
  const keys = [...table.matchAll(ROUTE_KEY)].map(([, method, path]) => ({
    method: method as string,
    path: (path as string)
      .replace(":id", SESSION)
      .replace(":artifact", ARTIFACT),
    key: `${method} ${path}`,
  }));
  const named = keys.filter(
    (one) => sessionReadOf(one.method, one.path) !== null
  );
  const read = keys.find((one) => one.key === SESSION_READ);
  kit.check(
    "(r1) the session read names its session, and no other route of the hub's table names one",
    named.length === 1 &&
      named[0]?.key === SESSION_READ &&
      sessionReadOf("GET", read?.path ?? "") === SESSION &&
      sessionReadOf("HEAD", read?.path ?? "") === SESSION,
    `${keys.length} routes; naming one: ${named.map((one) => one.key).join(", ") || "none"}`
  );
};

/** The canvas's row as the hub keeps it. */
interface Row {
  delivered_seq: number;
  read_seq: number;
  seq: number;
}

const spec: Spec = {
  group: "The hub and machines",
  name: "session-read",
  run: async (kit: Kit) => {
    const { check } = kit;
    await ruleLeg(kit);

    const fleet = await kit.fleet((): Reply => ({ everyMs: 5, words: ["ok"] }));
    await fleet.up();
    const s = await fleet.spawn("claude", "Reader", fleet.repo);
    const t = await fleet.spawn("claude", "Another", fleet.repo);
    const credential = async (session: string) =>
      (await until(
        `session ${session}'s credential`,
        () => fleet.sessionCredential(session),
        (value) => value.length > 0,
        60_000
      )) as string;
    const sKey = await credential(s);
    const tKey = await credential(t);

    const made = await fleet.api((hub) =>
      hub.api
        .instances({ id: s })
        .artifacts.post({ kind: "canvas", name: "session-read", draft: true })
    );
    const { id } = made;
    const path = hubPath.api.instances({ id: s }).artifacts({ artifact: id })[
      "~path"
    ];

    const person = await asked(fleet.base, path);
    check(
      "(1) the person is refused the session's read, in words naming his view",
      person.status === 403 &&
        person.text === artifactToolWords.sessionReadRefused(path, s),
      `${person.status} ${person.text.slice(0, 300)}`
    );
    const other = await asked(fleet.base, path, {
      authorization: `Bearer ${tKey}`,
    });
    check(
      "(2) another session's credential is refused it, in words saying a session reads its own",
      other.status === 403 &&
        other.text === artifactToolWords.sessionReadOthers(path, s),
      `${other.status} ${other.text.slice(0, 300)}`
    );
    const own = await asked(fleet.base, path, {
      authorization: `Bearer ${sKey}`,
    });
    check(
      "(3) the session's own credential reads it",
      own.status === 200 && (JSON.parse(own.text) as { id?: string }).id === id,
      `${own.status} ${own.text.slice(0, 300)}`
    );
    const door = await toolRecord<{ id?: string; kind?: string }>(
      { base: fleet.base, id: s, credential: sKey },
      toolCall("artifact_read", { id })
    );
    check(
      "(4) the session's artifact_read through the tool door reads it",
      !door.refused && door.record.id === id && door.record.kind === "canvas",
      door.text.slice(0, 300)
    );
    const view = await asked(
      fleet.base,
      hubPath.api.instances({ id: s }).artifacts({ artifact: id }).view["~path"]
    );
    check(
      "(5) the person's view still answers him",
      view.status === 200,
      `${view.status} ${view.text.slice(0, 200)}`
    );

    // (6) His answer in the canvas's state, kept as his doc's update and his change.
    await fleet.stop("hub");
    const [before] = fleet.query<Row>(
      "select seq, read_seq, delivered_seq from artifacts where id = ?",
      id
    );
    const seq = (before?.seq ?? 0) + 1;
    const pick: ChoiceEntry = {
      at: new Date().toISOString(),
      note: "Keep the left one",
      options: ["left"],
      pageHash: "probe",
      value: null,
    };
    const doc = new Doc();
    doc.getMap("state").set("pick", pick);
    const update = Buffer.from(encodeStateAsUpdate(doc)).toString("hex");
    fleet.write(
      `insert into artifact_updates (artifact_id, seq, "update") values (?, ?, X'${update}')`,
      id,
      seq
    );
    fleet.write(
      "insert into artifact_changes (artifact_id, key, seq, by) values (?, 'pick', ?, 'person')",
      id,
      seq
    );
    fleet.write("update artifacts set seq = ? where id = ?", seq, id);
    fleet.launch("hub");
    await fleet.hubUp();
    const read = await toolRecord<{ state?: object }>(
      { base: fleet.base, id: s, credential: sKey },
      toolCall("artifact_read", { id })
    );
    const [after] = fleet.query<Row>(
      "select seq, read_seq, delivered_seq from artifacts where id = ?",
      id
    );
    check(
      "(6) a canvas's read returns none of its state, so it counts as read up to his answer there, not past it",
      !read.refused &&
        Object.keys(read.record.state ?? {}).length === 0 &&
        after?.seq === seq &&
        after.read_seq === seq - 1 &&
        after.delivered_seq === seq - 1,
      `his answer at seq ${seq}; before ${JSON.stringify(before)}; after ${JSON.stringify(after)}`
    );
  },
};

export default spec;
