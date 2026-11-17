/**
 * The lifecycle points a fleet hook attaches to, Claude Code's names for
 * them (core hooks.ts). A leaf, which the harness descriptors read (core
 * harness/descriptor.ts `hooks`).
 */

/** Every lifecycle point a hook can attach to. */
export type HookEvent =
  | "SessionStart"
  | "Setup"
  | "InstructionsLoaded"
  | "UserPromptSubmit"
  | "UserPromptExpansion"
  | "MessageDisplay"
  | "PreToolUse"
  | "PermissionRequest"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "PostToolBatch"
  | "PermissionDenied"
  | "Notification"
  | "SubagentStart"
  | "SubagentStop"
  | "TaskCreated"
  | "TaskCompleted"
  | "Stop"
  | "StopFailure"
  | "TeammateIdle"
  | "ConfigChange"
  | "CwdChanged"
  | "DirectoryAdded"
  | "FileChanged"
  | "WorktreeCreate"
  | "WorktreeRemove"
  | "PreCompact"
  | "PostCompact"
  | "SessionEnd"
  | "Elicitation"
  | "ElicitationResult";
