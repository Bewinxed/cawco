/**
 * Reading a file off a machine, as a route answers it: the read, its
 * machine away (503, named, and when it is on its way back) or silent
 * (504), and the fleet's own rows those reads compare against. Each takes
 * what it reads of the hub (`ctx`) first, so a route family reads it
 * without the closure's context naming it.
 */

import type { MachineHookScript } from "@cawco/core/fleet";
import {
  READ_HOOK_SCRIPT,
  READ_MEMORY_FILE,
  READ_SKILL_FILES,
} from "@cawco/core/fleet";
import { ElysiaStatus } from "elysia";
import type { HubContext } from "./hub-context";
import type { MachineMemory, RouteSet, Unanswered } from "./machine-answers";
import { machineSkillFiles } from "./machine-answers";
import { READ_TIMEOUT_MS } from "./machine-read-timeouts";
import { refusal } from "./refusal";
import { unreachable } from "./unreachable";

/** What a machine read reads of the hub. */
export type MachineReadsContext = Pick<
  HubContext,
  "db" | "machineFault" | "machinePresence" | "readAgent" | "registry"
>;

/** The answer, read off the wire: a malformed set is no set. */
const peekMemoryFile = (result: unknown): MachineMemory => {
  if (typeof result !== "object" || result === null) {
    return null;
  }
  const { content, hash, docs } = result as {
    content?: unknown;
    hash?: unknown;
    docs?: unknown;
  };
  if (
    typeof content !== "string" ||
    typeof hash !== "string" ||
    !Array.isArray(docs)
  ) {
    return null;
  }
  const read = docs.flatMap((doc: unknown) => {
    if (typeof doc !== "object" || doc === null) {
      return [];
    }
    const { path, content: text, hash: of } = doc as Record<string, unknown>;
    return typeof path === "string" &&
      typeof text === "string" &&
      typeof of === "string"
      ? [{ path, content: text, hash: of }]
      : [];
  });
  return { content, hash, docs: read };
};

/**
 * Whether a machine that is not connected is on its way back: the ms left
 * in its reconnecting window ({@link machinePresence}, the one deadline
 * sends wait on too), 0 when it is offline now. A refused read says it as
 * its `Retry-After`, so a reader asks again once the hub's word on the
 * machine changes rather than holding "reconnecting" for good.
 */
export const reconnectingFor = (
  ctx: MachineReadsContext,
  machineId: string
): number => {
  const away = ctx.machinePresence(machineId);
  return away.kind === "reconnecting" && !ctx.registry.agent(machineId)
    ? Math.max(0, away.until - Date.now())
    : 0;
};

/**
 * A read's machine is away, as every route that reads off a machine
 * answers it: 503, the machine named (`X-Cawco-Machine`), so a reader can
 * say which one is away and hear it come back, and whether it is on its
 * way back: then `Retry-After` is when this hub stops reading it so (whole
 * seconds, rounded up, so a read then finds it offline).
 */
const awayHeaders = (
  ctx: MachineReadsContext,
  machineId: string
): Record<string, string> => {
  const left = reconnectingFor(ctx, machineId);
  return {
    "X-Cawco-Machine": machineId,
    ...(left > 0
      ? {
          "X-Cawco-Machine-State": "reconnecting",
          "Retry-After": String(Math.ceil(left / 1000)),
        }
      : {}),
  };
};

/**
 * {@link awayHeaders} put on a route's `set`, and the 503 the route
 * answers with: `words`, the read's own sentence, else the machine's
 * offline fault.
 */
export const awayStatus = (
  ctx: MachineReadsContext,
  set: RouteSet,
  machineId: string,
  words?: string
) => {
  Object.assign(set.headers, awayHeaders(ctx, machineId));
  return refusal(
    503,
    "machine-away",
    words ?? ctx.machineFault(machineId, "offline")
  );
};

/**
 * A read its machine left unanswered, as a route answers it: not
 * connected (or away past the read's deadline, {@link asRead}) is
 * {@link awayStatus}; silent, 504.
 */
export const unansweredStatus = (
  ctx: MachineReadsContext,
  set: RouteSet,
  machineId: string,
  answer: Unanswered
) =>
  answer.reason === "dead"
    ? awayStatus(ctx, set, machineId)
    : refusal(504, "machine-silent", ctx.machineFault(machineId, "silent"));

/** A skill's files read off `machineId`, or what the route answers when it could not read them. */
export const skillFilesOff = async (
  ctx: MachineReadsContext,
  machineId: string,
  args: unknown[],
  set: RouteSet
) => {
  const asked = await ctx.readAgent(
    machineId,
    READ_SKILL_FILES,
    args,
    READ_TIMEOUT_MS
  );
  switch (asked.kind) {
    case "unanswered":
      return unansweredStatus(ctx, set, machineId, asked);
    case "answered":
      break;
    default:
      throw unreachable(asked);
  }
  const answer = asked.value;
  if (!answer.ok) {
    return refusal(
      400,
      "skill-unread",
      answer.error ?? "the machine could not read the skill"
    );
  }
  return { files: machineSkillFiles(answer.result) };
};

/** A fleet hook and the copy of its script `machineId` holds, or what the route answers when either is missing. */
export const hookCopyOff = async (
  ctx: MachineReadsContext,
  body: { id: string; machineId: string },
  set: RouteSet
) => {
  const current = ctx.db.getFleetHook(body.id);
  if (!current) {
    return refusal(404, "no-hook", `the fleet keeps no hook ${body.id}`);
  }
  const read = await readMachineHookScript(ctx, body.machineId, body.id, set);
  if (read instanceof ElysiaStatus) {
    return read;
  }
  return { current, copy: read.copy };
};

/** The fleet to push to `body.machineId`, or what the route answers when that machine is not connected. */
export const pushTarget = (
  ctx: MachineReadsContext,
  body: { machineId: string }
) =>
  ctx.registry.agent(body.machineId)
    ? { config: ctx.db.fleetConfig() }
    : refusal(
        404,
        "machine-offline",
        ctx.machineFault(body.machineId, "offline")
      );

/**
 * One machine's own user CLAUDE.md, whoever wrote it. A peek is this alone,
 * adopting is this and a store, and an overwrite is this so the copy it is
 * about to destroy is kept before it goes. `set`: the asking route's, which
 * names the machine when it is away ({@link awayStatus}).
 */
/** A file a machine's agent reads for `method`, or why it could not be read. */
const readOffMachine = async <Copy>(
  ctx: MachineReadsContext,
  machineId: string,
  method: string,
  args: unknown[],
  set: RouteSet,
  copyOf: (result: unknown) => Copy,
  failed: string
) => {
  const answer = await ctx.readAgent(machineId, method, args, READ_TIMEOUT_MS);
  switch (answer.kind) {
    case "unanswered":
      return unansweredStatus(ctx, set, machineId, answer);
    case "answered":
      return answer.value.ok
        ? { copy: copyOf(answer.value.result) }
        : refusal(500, "machine-read-failed", answer.value.error ?? failed);
    default:
      throw unreachable(answer);
  }
};

export const readMachineMemory = (
  ctx: MachineReadsContext,
  machineId: string,
  set: RouteSet
) =>
  readOffMachine(
    ctx,
    machineId,
    READ_MEMORY_FILE,
    [],
    set,
    peekMemoryFile,
    "the machine could not read its memory"
  );

/**
 * One fleet hook's script as one machine has it on disk. A compare is this
 * alone; adopting is this and a store. `set` as {@link readMachineMemory}'s.
 */
export const readMachineHookScript = (
  ctx: MachineReadsContext,
  machineId: string,
  id: string,
  set: RouteSet
) =>
  readOffMachine(
    ctx,
    machineId,
    READ_HOOK_SCRIPT,
    [id],
    set,
    (result) => result as MachineHookScript | null,
    "the machine could not read the hook's script"
  );
