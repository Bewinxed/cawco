/**
 * What a session's details card and header ask its machine: the context
 * window's reading, the commands behind `/`, the MCP servers; each asked only
 * of a harness that said it can answer, and the settings the session
 * confirmed written back to its row.
 */

import type { Bounded } from "@cawco/core/bounded";
import type { HarnessCapabilities } from "@cawco/core/harness";
import type { HarnessKind, PermissionMode } from "@cawco/core/harness/kinds";
import { hubRequest } from "@cawco/core/hub-request";
import type { ControlPayload } from "@cawco/core/protocol";
import { CONTROL_SUPPORTED_COMMANDS } from "@cawco/core/session/controls";
import type {
  McpServerStatus,
  SupportedCommands,
} from "@cawco/core/session-messages";
import { unhandled } from "@cawco/core/unhandled";
import { machineFaultWords } from "@cawco/core/words/machine-names";
import { untrack } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { CONTROL_TIMEOUT_MS } from "#lib/config.js";
import { hubFetch, failureWords as messageOf } from "#lib/platform/hub-read.js";
import { newId } from "#lib/platform/id.js";
import { askMachine, didntAnswer } from "../hub/control";
import { send } from "../hub/socket.svelte";
import { answeredCommands } from "../slash-commands";
import {
  boardState,
  instanceIndex,
  machineConnected,
  machineName,
} from "./board.svelte";
import {
  type ContextUsage,
  type SessionState,
  session,
} from "./sessions.svelte";

/**
 * Writes back a setting the session has confirmed, so the next cold load starts
 * from what it is running rather than from what this browser once asked for.
 * Only what the row does not already say — an init repeats itself every turn.
 */
export async function persistSettings(
  instanceId: string,
  settings: {
    permissionMode?: PermissionMode;
    model?: string;
  }
): Promise<void> {
  const row = instanceIndex.byId.get(instanceId);
  if (!row) {
    return;
  }

  const patch: typeof settings = {};
  if (
    settings.permissionMode &&
    settings.permissionMode !== row.permissionMode
  ) {
    patch.permissionMode = settings.permissionMode;
  }
  if (settings.model && settings.model !== row.model) {
    patch.model = settings.model;
  }
  if (Object.keys(patch).length === 0) {
    return;
  }

  try {
    const response = await hubFetch(
      hubRequest("PATCH /api/instances/:id", {
        path: { id: instanceId },
        body: patch,
      })
    );
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
  } catch (error) {
    // The session is already answering this way; only the row is behind, and
    // the next init will try again — nothing the reader needs to act on.
    console.error(`[cawco] persisting ${instanceId} settings failed:`, error);
  }
}

/** Sessions whose details card stands now, by how many: their settings' failures are its to say. */
export const detailsOpen = new SvelteMap<string, number>();

/** Marks `sessionId`'s details card as standing, until the returned release. */
export function holdDetails(sessionId: string): () => void {
  // Called from the card's effect: the count is written, never tracked there.
  untrack(() => {
    detailsOpen.set(sessionId, (detailsOpen.get(sessionId) ?? 0) + 1);
  });
  return () =>
    untrack(() => {
      const left = (detailsOpen.get(sessionId) ?? 1) - 1;
      if (left > 0) {
        detailsOpen.set(sessionId, left);
      } else {
        detailsOpen.delete(sessionId);
      }
    });
}

/** The yes-or-no capabilities a harness reports (`HarnessCapabilities`). */
type HarnessCapability = {
  [K in keyof HarnessCapabilities]: HarnessCapabilities[K] extends boolean
    ? K
    : never;
}[keyof HarnessCapabilities];

/**
 * Whether a session's harness does what `capability` names, as its machine
 * reported it. A harness that reported no is never asked the control that
 * capability backs, and neither is one whose report has not come: its answer
 * would be read as one it never gave (a harness reporting
 * `supportedCommands: false` answered the ask with nothing, and the menu's
 * `.map` threw on it).
 */
export const harnessCan = (
  where: { harness: HarnessKind | null; machineId: string },
  capability: HarnessCapability
): boolean =>
  boardState.machines
    .find((entry) => entry.machineId === where.machineId)
    ?.harnesses?.find((entry) => entry.harness === where.harness)?.capabilities[
    capability
  ] === true;

/** How many surfaces in this tab draw each session's context reading now, by instance id. */
export const contextShown = new Map<string, number>();

/**
 * A surface that draws `instanceId`'s context reading (the details card,
 * SessionDetails; the peek's meter, PeekPane) says so for as long as it is
 * mounted: a turn's or a compaction's end reads it again only while one does
 * (applyFacts). The surface reads it once itself as it first shows it.
 * Answers the surface's let-go.
 */
export function showContext(instanceId: string): () => void {
  contextShown.set(instanceId, (contextShown.get(instanceId) ?? 0) + 1);
  return () => {
    const left = (contextShown.get(instanceId) ?? 1) - 1;
    if (left > 0) {
      contextShown.set(instanceId, left);
    } else {
      contextShown.delete(instanceId);
    }
  };
}

/**
 * What one context read found: the reading it took, or why it took none
 * (null when the harness reports no context at all).
 */
export type ContextRead =
  | { kind: "read"; usage: ContextUsage }
  | { kind: "unread"; why: string | null };

/** The context read in flight for each session, by instance id: a second asker joins it. */
const contextReads = new Map<string, Promise<ContextRead>>();

/**
 * How full the session's context window is, straight from the SDK — the same
 * reading `/context` shows, so the dock never has to estimate it from token
 * counts it saw go past. A `Query` method, so only a live session can answer;
 * a dead one keeps its last number rather than dropping to zero, which would
 * read as "empty" when it means "nobody asked". Answers what this read found,
 * for an asker that writes the figure down (session-export.ts); one asked
 * while a read is in flight joins that read.
 */
export function refreshContext(
  instanceId: string,
  machineId: string
): Promise<ContextRead> {
  const inFlight = contextReads.get(instanceId);
  if (inFlight) {
    return inFlight;
  }
  // Not asked of a machine that isn't back: the last reading stands.
  if (!machineConnected(machineId)) {
    return Promise.resolve({
      kind: "unread",
      why: machineFaultWords(machineName(machineId), "offline"),
    });
  }
  const target = session(instanceId);
  if (!harnessCan({ machineId, harness: target.harness }, "contextUsage")) {
    return Promise.resolve({ kind: "unread", why: null });
  }
  const reading = readContext(target, machineId).finally(() =>
    contextReads.delete(instanceId)
  );
  contextReads.set(instanceId, reading);
  return reading;
}

/** {@link refreshContext}'s one read, kept on the session as it lands. */
async function readContext(
  target: SessionState,
  machineId: string
): Promise<ContextRead> {
  const { instanceId } = target;
  target.contextPending = true;
  const requestId = newId();
  const payload: ControlPayload = {
    instanceId,
    requestId,
    method: "getContextUsage",
    args: [],
  };
  try {
    const read = await askMachine<{
      totalTokens: number;
      maxTokens: number;
      percentage: number;
      categories: { name: string; tokens: number; color: string }[];
    }>(machineId, requestId, CONTROL_TIMEOUT_MS, () =>
      send({ verb: "control", machineId, instanceId, requestId, payload })
    );
    switch (read.kind) {
      case "unanswered":
        // The last reading stands; the details say why it is not newer, and
        // the next turn's end asks again (applyFacts).
        target.contextError = didntAnswer(machineId, read, {
          missed: "this session didn't report its context",
          again: "It's asked again when its turn ends.",
        });
        return { kind: "unread", why: target.contextError };
      case "answered":
        break;
      default:
        unhandled("read", read);
    }
    const usage = read.value;
    const context: ContextUsage = {
      totalTokens: usage.totalTokens,
      maxTokens: usage.maxTokens,
      percentage: usage.percentage,
      // "Free space" is the remainder, not a consumer: showing it as a slice
      // would make every session look mostly full of nothing.
      categories: usage.categories.filter((row) => row.name !== "Free space"),
      readAt: Date.now(),
    };
    target.context = context;
    target.contextError = null;
    return { kind: "read", usage: context };
  } catch (cause) {
    // A session that cannot answer keeps the last reading; the reason is kept
    // beside it so the details can say why rather than "not reported".
    target.contextError = messageOf(cause);
    return { kind: "unread", why: target.contextError };
  } finally {
    target.contextPending = false;
  }
}

/**
 * A refusal because the session is in custody — being handed back after an
 * agent restart. Expected for a moment, and the next ask gets through, so it
 * is not an error to log or to show.
 */
const isCustodyRefusal = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("(custody)");

/**
 * The menu asks the session what it has every time the reader opens it,
 * throttled to once per three seconds. Init and `commands_changed` are the
 * free prefill. Not asked of a machine that isn't back: the names held stand.
 */
export async function refreshCommands(
  instanceId: string,
  machineId: string
): Promise<void> {
  const target = session(instanceId);
  if (
    target.commandsPending ||
    Date.now() - target.commands.at < 3000 ||
    !machineConnected(machineId) ||
    !harnessCan({ machineId, harness: target.harness }, "supportedCommands")
  ) {
    return;
  }
  target.commandsPending = true;

  const request = <T>(method: string): Promise<Bounded<T>> => {
    const requestId = newId();
    const payload: ControlPayload = {
      instanceId,
      requestId,
      method,
      args: [],
    };
    return askMachine<T>(machineId, requestId, CONTROL_TIMEOUT_MS, () =>
      send({ verb: "control", machineId, instanceId, requestId, payload })
    );
  };
  try {
    const read = await request<SupportedCommands>(CONTROL_SUPPORTED_COMMANDS);
    switch (read.kind) {
      case "unanswered":
        // The menu keeps what it last heard; the next open asks again.
        console.warn(
          `[cawco] supportedCommands on ${instanceId}: ${didntAnswer(machineId, read, { missed: "this session didn't list its commands", again: "The menu asks again when it next opens." })}`
        );
        return;
      case "answered":
        break;
      default:
        unhandled("read", read);
    }
    Object.assign(target.commands, answeredCommands(read.value));
  } catch (error) {
    if (!isCustodyRefusal(error)) {
      console.error(
        `[cawco] supportedCommands on ${instanceId} failed:`,
        error
      );
    }
  } finally {
    target.commands.at = Date.now();
    target.commandsPending = false;
  }
}

/** The bare `mcpServerStatus` call; what the caller does with a refusal differs. */
function askMcp(
  instanceId: string,
  machineId: string
): Promise<Bounded<McpServerStatus[]>> {
  const requestId = newId();
  const payload: ControlPayload = {
    instanceId,
    requestId,
    method: "mcpServerStatus",
    args: [],
  };
  return askMachine<McpServerStatus[]>(
    machineId,
    requestId,
    CONTROL_TIMEOUT_MS,
    () => send({ verb: "control", machineId, instanceId, requestId, payload })
  );
}

/**
 * Which MCP servers this session runs, so a tool card can name the server a
 * call went to (transcript/ToolGroup). `mcpServerStatus` is a Query method, so
 * only a live session answers. A refused ask stores `[]` rather than staying
 * null: null is what re-triggers the asking effect, and a machine that
 * refuses must not be asked in a loop. One nobody answered in time stays
 * null, not known: the next time the session goes live it is asked again. A
 * machine that isn't back is not asked, and the null stays for when it is.
 */
export async function loadMcpServers(
  instanceId: string,
  machineId: string
): Promise<void> {
  const target = session(instanceId);
  if (
    target.mcp !== null ||
    target.mcpPending ||
    !machineConnected(machineId)
  ) {
    return;
  }
  if (!harnessCan({ machineId, harness: target.harness }, "mcpStatus")) {
    return;
  }
  target.mcpPending = true;

  try {
    const read = await askMcp(instanceId, machineId);
    switch (read.kind) {
      case "unanswered":
        console.warn(
          `[cawco] mcpServerStatus on ${instanceId}: ${didntAnswer(machineId, read, { missed: "this session didn't list its MCP servers", again: "It's asked again the next time the session goes live." })}`
        );
        break;
      case "answered":
        target.mcp = read.value;
        break;
      default:
        unhandled("read", read);
    }
  } catch (error) {
    if (!isCustodyRefusal(error)) {
      console.error(`[cawco] mcpServerStatus on ${instanceId} failed:`, error);
    }
    target.mcp = [];
  } finally {
    target.mcpPending = false;
  }
}
