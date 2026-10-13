import type { ArtifactKind, PreviewSource } from "@cawco/core";
import { pathLeaf, resultField } from "@cawco/core/tool-presentation";

/** A short name for where a preview's page is, for the panel's head. */
export const previewPlace = (source: PreviewSource): string => {
  if ("page" in source) {
    return source.page;
  }
  return "dir" in source ? pathLeaf(source.dir) : `localhost:${source.port}`;
};

/** The artifact a call made or showed (`artifact_create`, `artifact_show`), as its tool row names it. */
export interface CalledArtifact {
  id: string;
  kind?: ArtifactKind;
  name?: string;
}

const UUID = /^[0-9a-f-]{36}$/;

/**
 * The artifact a call names: `artifact_show`'s `id`, or the one
 * `artifact_create` answered with; undefined until the call has one.
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
    // A result that is not the hub's JSON (a refusal's sentence) names no artifact.
  }
};
