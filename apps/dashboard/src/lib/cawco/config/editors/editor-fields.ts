/**
 * What each config editor keeps unsaved through a reload (drafts.svelte.ts
 * `keepDraft`): its fields as the person left them. Read back from the
 * browser's store, each is parsed with its schema (stored-shapes.ts), so a
 * draft written by an older build that no longer reads is not put back.
 */
import type { Account } from "@cawco/core/accounts";
import type { DelegateType } from "@cawco/core/delegate-types";
import type { MemoryScope } from "@cawco/core/fleet";
import type { HookDraft } from "@cawco/core/hooks";
import type { Pair } from "../../fleet";
import {
  AccountFieldsSchema,
  DelegateTypeFieldsSchema,
  HookFieldsSchema,
  McpFieldsSchema,
  MemoryFieldsSchema,
  RuleDraftSchema,
  SubagentFieldsSchema,
} from "../../stored-shapes";

/** A delegate type's editor: the type, and each list as its field's text. */
export interface DelegateTypeFields {
  denyToolsText: string;
  draft: DelegateType;
  mayStartText: string;
  skillsText: string;
  startServersText: string;
  startSkillsText: string;
}

/** A hook's editor: the hook, and its command's arguments as their field's text. */
export interface HookFields {
  commandArgs: string;
  draft: HookDraft;
}

/** An MCP server's editor, a secret's value never among them: what is typed goes. */
export interface McpFields {
  argsLine: string;
  clearUrlKey: boolean;
  command: string;
  env: Pair[];
  headers: Pair[];
  /** How it runs: a package through bunx, a command, or a remote server. */
  mode: "bunx" | "command" | "remote";
  named: boolean;
  pkg: string;
  pkgArgs: string;
  projectId: string;
  serverName: string;
  transport: "http" | "sse";
  url: string;
}

/** A memory document's editor: its text, the version the edit started from, and where it is written. */
export interface MemoryFields {
  base?: string;
  scope?: MemoryScope;
  text: string;
}

/** A subagent's editor: its file's text, and the version the edit started from ("" for a new file). */
export interface SubagentFields {
  base: string;
  draft: string;
}

/** An account's editor. */
export interface AccountFields {
  hue: Account["hue"];
  neverBackup: boolean;
  nickname: string;
  /** The field's text: empty is no reserve. */
  reserve: string;
}

/** Each editor's fields as a draft of them is read back (`keepDraft`'s `shape`). */
export const EDITOR_FIELDS = {
  account: AccountFieldsSchema,
  delegateType: DelegateTypeFieldsSchema,
  hook: HookFieldsSchema,
  mcp: McpFieldsSchema,
  memory: MemoryFieldsSchema,
  rule: RuleDraftSchema,
  subagent: SubagentFieldsSchema,
};
