/**
 * Type definitions for flow visualization
 * Provides type safety for node data across all flow components
 */

import type { TranscriptBranch } from "@cawco/core";
import type { Message } from "#lib/cawco/types.js";

/**
 * A subagent branch, as both the chat view's branch card and the flow view draw
 * it: the hub's branch (`TranscriptBranch`), its blocks, and the text it is
 * streaming right now.
 */
export type SubagentState = TranscriptBranch & {
  messages: Message[];
  /** Partial assistant text, between `stream_event`s and the final message. */
  streaming: string;
};

// ============================================================
// Node Data Types
// ============================================================

// ============================================================
// Typed Node Definitions
// ============================================================

// ============================================================
// Message Grouping Types
// ============================================================

// ============================================================
// Flow Data Types
// ============================================================

// ============================================================
// Layout Types
// ============================================================

// ============================================================
// Component Props Types
// ============================================================

// ============================================================
// Viewport Types
// ============================================================
