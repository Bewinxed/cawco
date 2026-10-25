/**
 * A press moment's runs on one clock: each one started at the same moment of
 * the document's timeline, so they begin, run and land together (one start,
 * one duration, one easing). The probe reads them so, held and sought on the
 * DevTools Animation domain.
 */
export function oneClock(runs) {
  const now = document.timeline.currentTime;
  for (const run of runs) {
    run.startTime = now;
  }
  return Promise.all(runs.map((run) => run.finished.catch(() => undefined)));
}

/** The live region's line once a press has put the words in the box (the designer's cross-cutting copy). */
export const IN_THE_BOX = "In the message box, ready to edit";

/** The first words of a starter, as a person typing it has them so far. */
export const typedOf = (text) => text.split(" ").slice(0, 3).join(" ");

/** The words in the field, its caret after them. */
export function putIn(field, words) {
  if (!field) {
    return;
  }
  field.value = words;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.focus({ preventScroll: true });
  field.setSelectionRange(words.length, words.length);
}
