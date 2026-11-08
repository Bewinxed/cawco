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
const TITLE_LIMIT = 80;

const COMMAND_OPEN = /<command-(?:message|name)>/u;
const COMMAND_CLOSE = /<\/command-(?:message|name)>/gu;

/**
 * What the harness echo of a slash command wraps: from the first
 * `<command-message>` or `<command-name>` to the nearest closing tag of
 * either after it. The same as
 * `/<command-(?:message|name)>([\s\S]*?)<\/command-(?:message|name)>/u`'s
 * first capture, in one pass: when the first opening tag has no close after
 * it no later one has either, so an unclosed tag ends the search. That
 * pattern scanned to the end from every unclosed opening tag, quadratic in
 * their number.
 */
const commandEcho = (raw: string): string | undefined => {
  const open = COMMAND_OPEN.exec(raw);
  if (!open) {
    return undefined;
  }
  const from = open.index + open[0].length;
  COMMAND_CLOSE.lastIndex = from;
  const close = COMMAND_CLOSE.exec(raw);
  return close ? raw.slice(from, close.index) : undefined;
};
const ANY_TAG = /<[^>]+>/gu;
const WHITESPACE_RUN = /\s+/gu;
/**
 * Where the attached files' and pictures' lines (core `attachedFileLine`,
 * `attachedPictureLine`) begin: a turn carries them after its typed words.
 * Everything from the first one to the end goes, not line by line, because a
 * harness's session list reports its first prompt folded onto one line and
 * cut short (claude's `firstPrompt`).
 */
const ATTACHED_MARK = /Attached (?:file: [~/]|picture: picture-[a-f0-9])/u;

/**
 * `raw` without its attached lines and the whitespace before them. Found as
 * the first mark, then the whitespace ahead of it trimmed: the same cut as
 * `/\s*Attached …[\s\S]*$/u` (`trimEnd` strips exactly `\s`), in one pass.
 * That pattern tried `\s*` from every space of a run and backtracked over
 * the rest of it, quadratic in the run: 100k spaces held the hub 2–4 s.
 */
const withoutAttached = (raw: string): string => {
  const at = raw.search(ATTACHED_MARK);
  return at === -1 ? raw : raw.slice(0, at).trimEnd();
};

/**
 * A session's first message as a title. A slash command's first message is the
 * harness echo, which wraps the invocation in `<command-message>` /
 * `<command-name>` — show the command, not the raw XML. Anything else has its
 * markup stripped and is folded onto one line. A session another session
 * started or delegated to is named by its caller, so it never gets here.
 */
export function deriveTitleFromFirstMessage(raw: string): string {
  const command = commandEcho(raw)?.trim();
  // A file's or picture's line names what rode with the words, not what the session is about.
  const typed = withoutAttached(raw);
  const cleaned = (command ?? typed.replace(ANY_TAG, " "))
    .replace(WHITESPACE_RUN, " ")
    .trim();
  return cleaned.slice(0, TITLE_LIMIT);
}
