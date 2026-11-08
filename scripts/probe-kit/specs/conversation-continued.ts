/**
 * The person's words reach the project's newest conversation, and a
 * Continue moves the conversation's role (the owner's card "What a trigger
 * wakes", 2026-11-07; hub caw.ts `say`, db `adoptChildren`, server.ts
 * `toContinuation`); a standing conversation over its token cap is
 * compressed before the person's words reach it (caw.ts `warmed`).
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model). A project made with Caw; the person's words (Ask Caw for a
 * view) start its conversation, which the person Continues in a new
 * session.
 *
 * - e1. After the Continue the project's row names the continuation as its
 *   conversation (what ledProjects and every surface read).
 * - e2. The person's message sent to the continued source goes to the
 *   continuation and is read there.
 * - e3. The person's next words from another place (Ask Caw for a view)
 *   reach the continuation; the source is sent nothing.
 * - f. With the conversation's context past its token cap (half of its
 *   model's window), the person's words first compress it (a continuation
 *   the hub asks, as it was over its cap) and reach the new session, which
 *   the project names; the over-cap session is sent nothing.
 *
 * Before (2026-11-08) the project's row went on naming the continued
 * source: the person's words to it were refused with "Continued in …", and
 * nothing ever compressed a conversation for its size.
 *
 *   bun scripts/probe-kit/run.ts conversation-continued
 */
import { hubRequest } from "../../../packages/core/src/hub-request";
import { handlerWords } from "../../../packages/core/src/words/handlers";
import { MACHINE, MODEL, type Reply, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** A context past the cap: 900k tokens on a 1M window (core `STANDING_CONTEXT_SHARE`, half). */
const OVER_CAP_TOKENS = 900_000;
const WINDOW_TOKENS = 1_000_000;

/** The sends that carry `marker`, by the session each went to and how they stand. */
const sendsWith = (fleet: KitFleet, marker: string) =>
  fleet.query<{ instance_id: string; state: string }>(
    "SELECT instance_id, state FROM sent_messages WHERE body LIKE ?",
    `%${marker}%`
  );

/** The send carrying `marker` read, its row; else what there is. */
const readWith = (fleet: KitFleet, marker: string, ms = 180_000) =>
  until(
    `${marker} read`,
    () => sendsWith(fleet, marker),
    (rows) => rows.some((row) => row.state === "read"),
    ms
  ).catch(() => sendsWith(fleet, marker));

/** The person's words from the views strip: the session that took them, or why not. */
const askView = async (
  fleet: KitFleet,
  projectId: string,
  text: string
): Promise<{ instanceId?: string; refused?: string }> => {
  try {
    return await fleet.api<{ instanceId: string }>(
      hubRequest("POST /api/projects/:id/view-requests", {
        path: { id: projectId },
        body: { text },
      })
    );
  } catch (error) {
    return { refused: error instanceof Error ? error.message : String(error) };
  }
};

/** The session the project names as its conversation. */
const named = async (fleet: KitFleet, projectId: string) =>
  (
    await fleet.api<{ instanceId: string | null }>(
      hubRequest("GET /api/projects/:id/caw", { path: { id: projectId } })
    )
  ).instanceId;

const spec: Spec = {
  group: "The hub and machines",
  name: "conversation-continued",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const project = await fleet.api<{ id: string }>(
      hubRequest("POST /api/projects", {
        body: {
          name: "Garden office",
          machineId: MACHINE,
          cwd: fleet.repo,
          caw: true,
        },
      })
    );
    await fleet.api(
      hubRequest("PATCH /api/projects/:id/caw", {
        path: { id: project.id },
        body: { mode: "bypassPermissions", model: MODEL.claude },
      })
    );

    const first = await askView(
      fleet,
      project.id,
      "CC-VIEW: show me the open tasks."
    );
    const source = first.instanceId ?? "";
    await readWith(fleet, "CC-VIEW");
    const continued = await fleet.api<{ targetInstanceId?: string }>(
      hubRequest("POST /api/instances/:id/continue", {
        path: { id: source },
        body: {
          asksOnly: true,
          target: {
            harness: "claude",
            model: MODEL.claude,
            permissionMode: "bypassPermissions",
          },
        },
      })
    );
    const target = continued.targetInstanceId ?? "";
    await until(
      "the continuation running",
      () => fleet.instance(target)?.status,
      (status) => status === "running",
      240_000
    ).catch(() => undefined);

    // e1. The project names the continuation.
    const now = await until(
      "the project naming the continuation",
      () => named(fleet, project.id),
      (id) => id === target,
      60_000
    ).catch(() => named(fleet, project.id));
    check(
      "e1: after the person's Continue, the project's row names the continuation as its conversation",
      !!target && now === target,
      `source ${source}; continuation ${target}; the project names ${now}`
    );

    // e2. The person's message to the source reaches the continuation.
    await fleet.send(source, "CC-HUMAN: are you there?");
    const human = await readWith(fleet, "CC-HUMAN", 60_000);
    check(
      "e2: the person's message to the continued source goes to the continuation and is read there",
      human.some((row) => row.state === "read" && row.instance_id === target),
      `sends ${JSON.stringify(human)}; continuation ${target}`
    );

    // e3. Their words from elsewhere reach the continuation.
    const again = await askView(
      fleet,
      project.id,
      "CC-AGAIN: and a view of the spend."
    );
    const words = await readWith(fleet, "CC-AGAIN", 60_000);
    check(
      "e3: the person's next words from another place reach the continuation, the source sent nothing",
      again.instanceId === target &&
        words.some(
          (row) => row.state === "read" && row.instance_id === target
        ) &&
        words.every((row) => row.instance_id !== source),
      `asked ${JSON.stringify(again)}; sends ${JSON.stringify(words)}`
    );

    // f. Over its token cap, it is compressed before the words reach it.
    // Its last turn's result is in first, so nothing writes its context after.
    await until(
      "the continuation's turn over",
      () => fleet.instance(target),
      (row) => !row?.turn_open_at,
      60_000
    ).catch(() => undefined);
    await Bun.sleep(3000);
    fleet.write(
      "UPDATE instances SET model = ?, context_tokens = ? WHERE id = ?",
      MODEL.claude,
      OVER_CAP_TOKENS,
      target
    );
    fleet.write(
      "INSERT OR REPLACE INTO claude_context_windows (model, context_window, observed_at) VALUES (?, ?, ?)",
      MODEL.claude,
      WINDOW_TOKENS,
      Date.now()
    );
    const cold = await askView(
      fleet,
      project.id,
      "CC-CAP: what is left to do?"
    );
    const [job] = fleet.query<{ asked_by: string; target_instance_id: string }>(
      "SELECT asked_by, target_instance_id FROM continuations WHERE source_instance_id = ? ORDER BY rowid DESC",
      target
    );
    const fresh = job?.target_instance_id ?? "";
    const capped = await readWith(fleet, "CC-CAP");
    const names = await named(fleet, project.id);
    check(
      "f: a conversation past its token cap is compressed before the person's words reach it: the hub's continuation, the words read by the new session, which the project names; the over-cap one is sent nothing",
      !!job &&
        job.asked_by.includes('"cold"') &&
        job.asked_by.includes(handlerWords.overCapLead) &&
        cold.instanceId === fresh &&
        names === fresh &&
        capped.some(
          (row) => row.state === "read" && row.instance_id === fresh
        ) &&
        capped.every((row) => row.instance_id !== target),
      `job ${JSON.stringify(job)}; asked ${JSON.stringify(cold)}; sends ${JSON.stringify(capped)}; the project names ${names}`
    );
  },
};

export default spec;
