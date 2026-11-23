/**
 * Every kind of frame (frames.ts `FramePayload`), as a set a reader checks a
 * frame off a socket against: the hub reads a machine's frames by it
 * (agent-frame.ts), a page the hub's (its socket's reader). Nothing here
 * loads anything that needs Node.
 */

import { everyOf } from "./every-of";
import type { FramePayload } from "./frames";
import { isRecord } from "./is-record";

/** Every frame's `kind`, checked to name each {@link FramePayload} kind. */
const FRAME_KINDS: ReadonlySet<string> = new Set(
  everyOf<FramePayload["kind"]>()([
    "fleet_mcp",
    "fleet_report",
    "fleet_converge",
    "preview",
    "frame",
    "send",
    "rejected",
    "held_send",
    "taken_send",
    "instances",
    "board",
    "permission_request",
    "permission_settled",
    "usage",
    "stopped",
    "asleep",
    "recovery_unavailable",
    "control_result",
    "error",
    "session_address",
    "scratch_worktree",
    "pulse",
    "work_item",
    "project_offer",
    "tasks.changed",
    "questions.moved",
    "decisions.changed",
    "blocks.changed",
    "starters.changed",
    "projects.changed",
    "hub.restart",
    "tailnet.https",
    "fleet.fetch",
    "project.cap",
    "actions",
    "hub_auth",
    "installs",
    "project.stop",
    "delegate_event",
    "fleet_watch.notices",
    "offers.waiting",
    "artifact.needs",
    "person",
    "desk_alert",
    "moves",
    "move_progress",
    "folder_move_progress",
    "command_queue",
    "stage",
    "stage-clone",
    "account_borrow",
    "browsers",
    "browser_handback",
    "passkey_advert",
    "passkey_qr",
    "browser_list",
    "passkey_status",
    "stream_relay",
    "stream_relay.journey",
    "stored",
    "catalog_moved",
  ])
);

/**
 * Whether `value` is a frame: a JSON object whose `kind` is one a
 * {@link FramePayload} names. Its other fields are its sender's, read where
 * its kind is handled: a session's own words keep their shape from the
 * harness (core agent-frame.ts).
 */
export const isFramePayload = (value: unknown): value is FramePayload =>
  isRecord(value) &&
  typeof value.kind === "string" &&
  FRAME_KINDS.has(value.kind);
