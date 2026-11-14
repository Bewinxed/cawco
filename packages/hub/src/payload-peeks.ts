/**
 * What the hub reads of an envelope's payload, which it otherwise passes on
 * unread: a named string field ({@link peek}), and the conversation a spawn
 * resumes ({@link peekResume}).
 */

/**
 * The hub routes on envelope fields and is otherwise payload-opaque (NEW.md
 * §6); `hostname`/`os`/`tools` on register, `cwd`/`options.resume`/`scratch`/
 * `projectId`/`title`/`permissionMode`/`model` on spawn, `discard` on stop,
 * `kind` on a frame, `method`/`args` on a control and a `control_result`'s
 * `result` are the sanctioned peeks.
 */
export const peek = (payload: unknown, key: string): string | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
};

/**
 * The session a `spawn` resumes, so the instance row records what it re-opened.
 * A fork is the exception: it *reads* the origin conversation but creates a new
 * one, so claiming the origin's id here would trip openInstance's
 * one-conversation-one-row guard. Left blank, the fork's own init frame stamps
 * the real id via noteInstanceSession.
 */
export const peekResume = (payload: unknown): string | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const { resume } = payload as { resume?: unknown };
  if (typeof resume !== "object" || resume === null) {
    return undefined;
  }
  if ((resume as { fork?: unknown }).fork) {
    return undefined;
  }
  const key = (resume as { sessionKey?: unknown }).sessionKey;
  return typeof key === "string" ? key : undefined;
};
