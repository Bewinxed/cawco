import type { ArtifactKind, PreviewSource } from "@cawco/core";
import { parseReference } from "@cawco/core/references";
import { pathLeaf, resultField } from "@cawco/core/tool-presentation";

/** A short name for where a preview's page is, for the panel's head. */
export const previewPlace = (source: PreviewSource): string => {
  if ("page" in source) {
    return source.page;
  }
  return "dir" in source ? pathLeaf(source.dir) : `localhost:${source.port}`;
};

/** The artifact a call made, showed or opened in its session's browser (`artifact_create`, `artifact_show`, `artifact_browse`), as its tool row names it. */
export interface CalledArtifact {
  id: string;
  kind?: ArtifactKind;
  name?: string;
}

const UUID = /^[0-9a-f-]{36}$/u;
/** An artifact's link in a tool's words, `[name](cawco:artifact/<id>)` (core references.ts). */
const ARTIFACT_LINK = /\[((?:[^\]\\]|\\.)*)\]\((cawco:artifact\/[^)\s]+)\)/u;
const ESCAPED = /\\(.)/gu;

/** The artifact a tool's words name by its link; undefined when they name none (a refusal). */
const linkedArtifact = (text: string): CalledArtifact | undefined => {
  const link = ARTIFACT_LINK.exec(text);
  const reference = link?.[2] ? parseReference(link[2]) : null;
  return reference && UUID.test(reference.id)
    ? { id: reference.id, name: (link?.[1] ?? "").replace(ESCAPED, "$1") }
    : undefined;
};

/**
 * The artifact a call names: `artifact_show`'s or `artifact_browse`'s whole
 * `id`, or the one its answer names: by its link in the words the agent
 * reads, or (`response_format: "detailed"`) the hub's record; undefined
 * until the call has one.
 */
export const calledArtifact = (
  input: Record<string, unknown> | undefined,
  result: unknown
): CalledArtifact | undefined => {
  if (typeof input?.id === "string" && UUID.test(input.id)) {
    return { id: input.id };
  }
  const text = resultField(result)?.text;
  if (!text) {
    return;
  }
  try {
    const answer = JSON.parse(text) as Partial<CalledArtifact>;
    return typeof answer.id === "string" && UUID.test(answer.id)
      ? {
          id: answer.id,
          ...(answer.kind ? { kind: answer.kind } : {}),
          ...(answer.name ? { name: answer.name } : {}),
        }
      : undefined;
  } catch {
    // The words the agent reads: the artifact by its link, or a refusal naming none.
    return linkedArtifact(text);
  }
};
