/**
 * Type definitions for flow visualization
 * Provides type safety for node data across all flow components
 */

import type { Edge, Node } from "@xyflow/svelte";
import type { Message } from "$lib/whiffle/types";

/**
 * A subagent branch, as both the chat view's branch card and the flow view draw
 * it. Produced by `frames.ts` from the `parent_tool_use_id` that forwarded
 * subagent messages carry, and moved by the `task_*` system messages.
 */
export interface SubagentState {
  completedAt?: Date;
  description?: string;
  error?: string;
  instanceId: string;
  isBackground?: boolean;
  /** When the last branch event arrived, for recency sorting. */
  lastEventAt?: Date;
  lastToolName?: string;
  messages: Message[];
  /** Model that answered (wire id from assistant frames), or the requested alias until the first frame arrives. */
  model?: string;
  /** Parent subagent's toolUseId, for nested branches. */
  parentSubagentId?: string;
  result?: string;
  startedAt: Date;
  status: "starting" | "running" | "complete" | "error";
  /** Partial assistant text, between `stream_event`s and the final message. */
  streaming: string;
  subagentType: string;
  /** `agentProgressSummaries`' present-tense line, when enabled. */
  summary?: string;
  /** The task the `task_*` progress messages report under. */
  taskId?: string;
  /** The Task tool.use id that spawned this subagent. */
  toolUseId: string;
}

// ============================================================
// Node Data Types
// ============================================================

/** Base data all flow nodes share */
export interface BaseNodeData {
  /** Primary content to display */
  content?: string;
  /** Estimated height for layout */
  height?: number;
  /** Instance ID for context */
  instanceId: string;
  /** Index signature for svelte-flow compatibility */
  [key: string]: unknown;
}

/** Data for user message nodes */
export interface UserNodeData extends BaseNodeData {
  message: Message;
}

/** Data for assistant message nodes */
export interface AssistantNodeData extends BaseNodeData {
  isStreaming?: boolean;
  message?: Message;
  messages?: Message[];
  model?: string;
}

/** Data for tool nodes */
export interface ToolNodeData extends BaseNodeData {
  expanded?: boolean;
  isStreaming?: boolean;
  messages: Message[];
}

/** Data for subagent nodes */
export interface SubagentNodeData extends BaseNodeData {
  branchColor?: string;
  depth?: number;
  messages?: Message[];
  subagent?: SubagentState;
  subagents?: SubagentState[];
}

/** Data for system message nodes */
export interface SystemNodeData extends BaseNodeData {
  message?: Message;
}

/** Union type for all node data */
export type FlowNodeData =
  | UserNodeData
  | AssistantNodeData
  | ToolNodeData
  | SubagentNodeData
  | SystemNodeData;

// ============================================================
// Typed Node Definitions
// ============================================================

export type UserNode = Node<UserNodeData, "user">;
export type AssistantNode = Node<AssistantNodeData, "assistant">;
export type ToolNode = Node<ToolNodeData, "tool">;
export type SubagentNode = Node<SubagentNodeData, "subagent">;
export type SystemNode = Node<SystemNodeData, "system">;

export type FlowNode =
  | UserNode
  | AssistantNode
  | ToolNode
  | SubagentNode
  | SystemNode;

// ============================================================
// Message Grouping Types
// ============================================================

/** A single message that stands alone */
export interface SingleMessageGroup {
  index: number;
  message: Message;
  type: "single";
}

/** A group of consecutive tool messages */
export interface ToolMessageGroup {
  messages: Message[];
  startIndex: number;
  type: "tool_group";
}

/** A group of subagent spawn messages */
export interface SubagentMessageGroup {
  messages: Message[];
  startIndex: number;
  type: "subagent_group";
}

/** Union type for message groups */
export type MessageGroup =
  | SingleMessageGroup
  | ToolMessageGroup
  | SubagentMessageGroup;

// ============================================================
// Flow Data Types
// ============================================================

/** Complete flow data with nodes and edges */
export interface FlowData {
  edges: Edge[];
  nodes: Node[];
}

/** Options for flow transformation */
export interface FlowTransformOptions {
  /** ID of currently streaming tool */
  streamingToolId?: string;
  /** Map of tool use IDs to subagent states */
  subagents?: Map<string, SubagentState>;
}

// ============================================================
// Layout Types
// ============================================================

export type ZoomMode = "compact" | "expanded";
export type ZoomLevel = "overview" | "summary" | "detail";

/** Options for dagre layout */
export interface LayoutOptions {
  /** Layout direction: TB (top-bottom) or LR (left-right) */
  direction?: "TB" | "LR";
  /** Horizontal spacing between nodes */
  nodeSep?: number;
  /** Default node width */
  nodeWidth?: number;
  /** Vertical spacing between ranks (rows) */
  rankSep?: number;
  /** Zoom mode affects spacing */
  zoomMode?: ZoomMode;
}

// ============================================================
// Component Props Types
// ============================================================

/** Props for FlowView component */
export interface FlowViewProps {
  instanceId: string;
}

// ============================================================
// Viewport Types
// ============================================================

export interface ViewportBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}
