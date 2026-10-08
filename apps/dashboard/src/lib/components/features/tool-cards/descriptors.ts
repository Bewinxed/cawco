/**
 * The vocabulary every tool call is read through, for the dashboard: the one
 * set of rules in @cawco/core (tool-presentation.ts), which the native app
 * reads too, dressed in this client's glyphs and inks. Nothing about any one
 * tool is decided here; what differs between tools is the core module's data.
 */
import {
  type FileChange as CoreChange,
  describeTool as describeCore,
  faviconReachable,
  fileChanges,
  type Renderer,
  type ToolKindId,
  type ToolStatus,
  toolKind,
} from "@cawco/core/tool-presentation";
import { type FileDiffMetadata, parsePatchFiles } from "@pierre/diffs";
import type { Component } from "svelte";
import { rootDomain } from "#lib/cawco/mcp.js";
import {
  IconBook,
  IconToolCode,
  IconToolEdit,
  IconToolFiles,
  IconToolGeneric,
  IconToolMcp,
  IconToolMessage,
  IconToolNavigate,
  IconToolNotebook,
  IconToolQuestion,
  IconToolRead,
  IconToolScreen,
  IconToolSearch,
  IconToolSkill,
  IconToolTask,
  IconToolTerminal,
  IconToolTodo,
  IconToolWeb,
  IconToolWrite,
  IconWindow,
} from "#lib/icons.js";

export type ToolCallStatus = ToolStatus;
export type FamilyId = ToolKindId;

export interface ToolDescriptor {
  /** A short aside after the sentence: `background`, an MCP server's name. */
  chip?: string;
  /** The kind's ink, a `--tool-*` class: what the step is, never how it went. */
  color: string;
  /** The object's dimmer tail: a parent directory, a search scope, a summary. */
  detail?: string;
  detailIsMono: boolean;
  /** Which body an opened row shows (the kind's renderer). */
  expanded: Renderer;
  /** What came back, in one measurement. */
  fact?: string;
  factTone?: "diff";
  /** A site icon that stands in for the glyph once it loads. */
  favicon?: string;
  icon: Component;
  /** The verb, in the UI face. Empty when the object is the whole sentence. */
  label: string;
  /** What the verb acted on. */
  object?: string;
  objectIsMono: boolean;
  /** The operator's tail: the first line the call printed. */
  secondLine?: string;
}

export interface ToolFamily {
  color: string;
  icon: Component;
  id: FamilyId;
  many: string;
  /** What one call of this kind is, for a group's kind summary. */
  one: string;
}

/** This client's component for each Solar glyph the core module names. */
const GLYPHS: Record<string, Component> = {
  "code-square-bold-duotone": IconToolTerminal,
  "document-text-bold-duotone": IconToolRead,
  "pen-2-bold-duotone": IconToolEdit,
  "pen-new-square-bold-duotone": IconToolWrite,
  "magnifer-bold-duotone": IconToolSearch,
  "folder-with-files-bold-duotone": IconToolFiles,
  "global-bold-duotone": IconToolWeb,
  "bolt-bold-duotone": IconToolSkill,
  "plain-2-bold-duotone": IconToolMessage,
  "cursor-bold-duotone": IconToolScreen,
  "compass-bold-duotone": IconToolNavigate,
  "code-2-bold-duotone": IconToolCode,
  "plug-circle-bold-duotone": IconToolMcp,
  "book-bold-duotone": IconBook,
  "users-group-rounded-bold-duotone": IconToolTask,
  "checklist-bold-duotone": IconToolTodo,
  "notebook-bold-duotone": IconToolNotebook,
  "question-circle-bold-duotone": IconToolQuestion,
  "window-frame-bold-duotone": IconWindow,
  "sledgehammer-bold-duotone": IconToolGeneric,
};

/**
 * The text-ink class for each ink the core module names, written out whole:
 * Tailwind only generates the classes it finds in the source.
 */
const INKS: Record<string, string> = {
  "tool-run": "text-tool-run",
  "tool-read": "text-tool-read",
  "tool-edit": "text-tool-edit",
  "tool-write": "text-tool-write",
  "tool-search": "text-tool-search",
  "tool-web": "text-tool-web",
  "tool-skill": "text-tool-skill",
  "tool-agent": "text-tool-agent",
  "tool-mcp": "text-tool-mcp",
  "tool-plan": "text-tool-plan",
  "tool-ask": "text-tool-ask",
  "muted-foreground": "text-muted-foreground",
};

const glyph = (name: string): Component => GLYPHS[name] ?? IconToolGeneric;
const inkClass = (token: string): string =>
  INKS[token] ?? "text-muted-foreground";

/** The one classifier: the sentence and the group header both dispatch on it. */
export function familyId(toolName: string | undefined): FamilyId {
  return toolKind(toolName).id;
}

export function toolFamily(toolName: string | undefined): ToolFamily {
  const kind = toolKind(toolName);
  return {
    id: kind.id,
    icon: glyph(kind.glyph),
    color: inkClass(kind.ink),
    one: kind.one,
    many: kind.many,
  };
}

/**
 * The site's icon as the user's own hub serves it (same origin as the
 * dashboard), for a public host. No third party is ever asked.
 */
const faviconUrl = (host: string): string | undefined =>
  faviconReachable(host)
    ? `/api/favicon?host=${encodeURIComponent(host)}`
    : undefined;

/** The sentence a row reads as (@cawco/core `describeTool`). */
export function describeTool(
  toolName: string | undefined,
  input: Record<string, unknown> | undefined,
  result: string | undefined,
  status: ToolCallStatus,
  /** The configured URL's host for an MCP server segment, when the session knows it. */
  serverHost?: (server: string) => string | undefined,
  patch?: string
): ToolDescriptor {
  // An MCP endpoint sits on a subdomain (`mcp.exa.ai`) with no home page or
  // icon of its own; the site's icon lives at its root.
  const configured = (server: string) => {
    const host = serverHost?.(server);
    return host ? rootDomain(host) : undefined;
  };
  const d = describeCore(toolName, input, result, status, patch, configured);
  return {
    chip: d.chip,
    color: inkClass(d.kind.ink),
    detail: d.detail,
    detailIsMono: d.detailMono,
    expanded: d.renderer,
    fact: d.fact,
    factTone: d.factDiff ? "diff" : undefined,
    favicon: d.faviconHost ? faviconUrl(d.faviconHost) : undefined,
    icon: glyph(d.kind.glyph),
    label: d.label,
    object: d.object,
    objectIsMono: d.objectMono,
    secondLine: d.secondLine,
  };
}

/** The old and new sides a diff view needs; a patch's file as @pierre/diffs reads it. */
export interface FileChange {
  fileDiff?: FileDiffMetadata;
  filePath: string;
  newContent: string;
  oldContent: string;
}

/** The file changes a call made (@cawco/core `fileChanges`), a patch parsed for its diff view. */
export function getDiffInfo(
  input: Record<string, unknown> | undefined,
  toolName: string | undefined,
  patch?: string
): FileChange[] {
  const changes: CoreChange[] = fileChanges(input, toolName, patch);
  if (
    patch !== undefined &&
    changes.length &&
    changes.every((change) => !(change.oldContent || change.newContent))
  ) {
    return parsePatchFiles(patch).flatMap((parsed) =>
      parsed.files.map((fileDiff) => ({
        filePath: fileDiff.name,
        fileDiff,
        oldContent: "",
        newContent: "",
      }))
    );
  }
  return changes.map((change) => ({
    filePath: change.path,
    oldContent: change.oldContent,
    newContent: change.newContent,
  }));
}
