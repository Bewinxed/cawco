/**
 * What a session is called when nobody named it: its first user message,
 * cleaned. One implementation, because two would drift — the hub derives a
 * title from the first message it sees so `/api/instances` already carries the
 * name, and the dashboard derives one from the transcript it loads. If those
 * two cleanings disagreed by a character the label would visibly change under
 * the reader the moment the transcript arrived, which is the exact flash
 * deriving it on the hub is meant to remove.
 */

/** How long a title derived from a first message runs before it is cut. */
export const TITLE_LIMIT = 80;

const COMMAND_ECHO =
  /<command-(?:message|name)>([\s\S]*?)<\/command-(?:message|name)>/;
const ANY_TAG = /<[^>]+>/g;
const WHITESPACE_RUN = /\s+/g;
/**
 * The attached files' lines (core `attachedFileLine`) and all after them: a
 * turn carries them after its typed words. Matched from the first one to the
 * end, not line by line, because a harness's session list reports its first
 * prompt folded onto one line and cut short (claude's `firstPrompt`).
 */
const ATTACHED_TAIL = /\s*Attached file: [~/][\s\S]*$/;

/**
 * A session's first message as a title. A slash command's first message is the
 * harness echo, which wraps the invocation in `<command-message>` /
 * `<command-name>` — show the command, not the raw XML. Anything else has its
 * markup stripped and is folded onto one line. A session another session
 * started or delegated to is named by its caller, so it never gets here.
 */
export function deriveTitleFromFirstMessage(raw: string): string {
  const command = COMMAND_ECHO.exec(raw)?.[1]?.trim();
  // A file's line names where the machine put it, not what the session is about.
  const typed = raw.replace(ATTACHED_TAIL, "");
  const cleaned = (command ?? typed.replace(ANY_TAG, " "))
    .replace(WHITESPACE_RUN, " ")
    .trim();
  return cleaned.slice(0, TITLE_LIMIT);
}
