/**
 * The field a phone's keyboard types into while the person drives a browser
 * (BrowserView): a textarea of the view's own, since a phone raises its
 * keyboard only for a field that edits text, focused inside the person's
 * tap. "We (Apple) … do not want programmatic focus to bring up the keyboard
 * when … the programmatic focus was not invoked in response to a user
 * gesture" (bugs.webkit.org/show_bug.cgi?id=195884).
 *
 * What the keyboard did is read from the field's value, never from its key
 * events: an on-screen keyboard sends no key for a word it autocorrects, a
 * suggestion picked, dictation or a swipe, and Android's sends
 * `Unidentified` for most keys. Each change is the difference between what
 * the field held and what it holds now: the characters removed before the
 * caret, then the ones typed after them. noVNC types the same way ("Compare
 * the old string with the new to account for text-corrections or other input
 * that modify existing text", novnc/noVNC app/ui.js `keyInput`), and so does
 * Apache Guacamole's text input (guacTextInput.js). A composition (an IME's
 * marked text, Android's word in progress) is typed as it changes and put
 * right as it commits, on both hosts alike: neko has no composition to set,
 * and CDP's `Input.imeSetComposition` would have to follow the field's marked
 * range, which Android moves back over a word already typed.
 *
 * The field always starts with a few newlines ({@link SINK_PAD}), so a
 * Backspace with nothing typed still removes something and says so, as
 * Guacamole pads its field with characters "so there is something to delete
 * with backspace". A newline, not Guacamole's zero-width space: a word never
 * spans a line, so autocorrect, which the person keeps, never reaches into
 * the pad (a zero-width space is a format character, which word breaking
 * passes over).
 */

/** What the field holds when nothing has been typed. */
export const SINK_PAD = "\n\n\n\n";

/** Past this many characters, the field starts again at the next space, so it never grows. */
export const SINK_MOST = 64;

/** A field ending at a space: where it may start again without cutting a word autocorrect still reads. */
export const SINK_AT_SPACE = /\s$/u;

/** What the keyboard typed: characters removed before the caret, then the text typed (a newline is Enter). */
export interface Typed {
  back: number;
  text: string;
}

/** What changed from `was` to `now`, by code point (an emoji is one character to delete). */
export const typedBetween = (was: string, now: string): Typed => {
  const before = [...was];
  const after = [...now];
  let same = 0;
  while (
    same < before.length &&
    same < after.length &&
    before[same] === after[same]
  ) {
    same += 1;
  }
  return { back: before.length - same, text: after.slice(same).join("") };
};

/**
 * Where a key pressed in the field goes: `field`, typed into the field and
 * read from its value (a character, Backspace, a key an IME is composing
 * with, a dead key); `enter`, typed as Enter; `key`, sent to the browser as
 * the key itself (arrows, Tab, Escape, a modifier, a shortcut).
 */
export const sinkKeyRole = (
  event: KeyboardEvent
): "field" | "enter" | "key" => {
  if (
    event.isComposing ||
    event.key === "Process" ||
    event.key === "Unidentified" ||
    event.key === "Dead"
  ) {
    return "field";
  }
  if (event.ctrlKey || event.metaKey) {
    return "key";
  }
  if (event.key === "Enter") {
    return "enter";
  }
  return event.key === "Backspace" || [...event.key].length === 1
    ? "field"
    : "key";
};
