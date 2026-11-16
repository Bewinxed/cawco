/**
 * The one-time pass that renames the artifact kind `sheet` to `component` in
 * the stored sends' artifact notices, as migration 0255 renamed it in the
 * artifacts table. A notice's tag carries its artifact's kind (core
 * injected.ts `markerTag`), and the notices sent while `sheet` was a kind
 * still say `kind=sheet`: core's reader takes only a kind in
 * `ARTIFACT_KINDS`, so it read none of them, and a transcript drew each as
 * the person's words (the `artifact-notice-drawn` law). It runs once, as the
 * hub starts (`data_migrations`, db `migrateSendsOnce`), after the stored
 * sends are tagged (db/tag-markers.ts); only the tag changes, the agent's
 * sentence stays as it was sent.
 */

import type { ArtifactKind } from "@cawco/core/artifact-kinds";
import { markerTag, readMarkerTag } from "@cawco/core/injected";
import type { NeutralUserMessage } from "@cawco/core/session-messages";
import { rewriteSendText } from "./tag-markers";

/** The kind a sheet is now (migration 0255). */
const SHEET_IS: ArtifactKind = "component";

/** `text` with its artifact notice's tag naming a component; null for any other text. */
const renamed = (text: string): string | null => {
  const tag = readMarkerTag(text);
  return tag?.kind.startsWith("artifact-") && tag.fields.kind === "sheet"
    ? `${markerTag(tag.kind, { ...tag.fields, kind: SHEET_IS })}${tag.rest}`
    : null;
};

/** A stored send whose artifact notice names a sheet, naming a component; null when it names none. */
export const componentStoredSend = (
  body: NeutralUserMessage
): NeutralUserMessage | null => rewriteSendText(body, renamed);
