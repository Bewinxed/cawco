/**
 * Tool names by what the tool does, on every harness, read off the kinds the
 * transcript draws calls by (tool-presentation.ts `TOOL_KINDS`): one list of
 * each harness's names, whoever sorts calls by what they do.
 */
import { TOOL_KINDS, type ToolKindId } from "./tool-presentation";

/** The harness tool names of these kinds, lowercased: what a call's own name is matched against. */
export const toolNamesOf = (
  ...ids: readonly ToolKindId[]
): ReadonlySet<string> =>
  new Set(
    TOOL_KINDS.filter((kind) => ids.includes(kind.id)).flatMap(
      (kind) => kind.names
    )
  );

/** The tools that change files, by every harness's name, lowercased: edits, patches, writes, notebook edits. */
export const FILE_CHANGE_TOOLS = toolNamesOf("edit", "write", "notebook");
