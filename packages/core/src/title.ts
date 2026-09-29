/**
 * What a session is called when nobody named it: its first user message,
 * cleaned. One implementation, because two would drift — the hub derives a
 * title from the first message it sees so `/api/instances` already carries the
 * name, and the dashboard derives one from the transcript it loads. If those
 * two cleanings disagreed by a character the label would visibly change under
 * the reader the moment the transcript arrived, which is the exact flash
 * deriving it on the hub is meant to remove.
 */

import { withoutHandoffMarker } from "./injected";

/** How long a title derived from a first message runs before it is cut. */
export const TITLE_LIMIT = 80;

const COMMAND_ECHO =
  /<command-(?:message|name)>([\s\S]*?)<\/command-(?:message|name)>/;
const ANY_TAG = /<[^>]+>/g;
const WHITESPACE_RUN = /\s+/g;

/**
 * A session's first message as a title. A slash command's first message is the
 * harness echo, which wraps the invocation in `<command-message>` /
 * `<command-name>` — show the command, not the raw XML. A session another
 * session started opens with the hand-off marker, which says who sent it, not
 * what it is for: the title is the brief after it. Anything else has its
 * markup stripped and is folded onto one line.
 */
export function deriveTitleFromFirstMessage(raw: string): string {
  const said = withoutHandoffMarker(raw);
  const command = COMMAND_ECHO.exec(said)?.[1]?.trim();
  const cleaned = (command ?? said.replace(ANY_TAG, " "))
    .replace(WHITESPACE_RUN, " ")
    .trim();
  return cleaned.slice(0, TITLE_LIMIT);
}
