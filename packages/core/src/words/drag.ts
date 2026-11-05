/**
 * What a drag says to a screen reader (the dashboard's drag/, on dnd kit's
 * Accessibility plugin): how to pick a thing up with the keys, and where it
 * is as it moves, lands or goes back. Each thing is named by what the person
 * calls it (a stage's name, a task's title, a tab's title), never by an id.
 *
 * `bun run words` writes these into the app as `Words.Drag`
 * (CawCoCore/Words.generated.swift). So a word is changed here or nowhere.
 */
export const dragWords = {
  /** Read once for anything that can be picked up. */
  instructions:
    "Press Space to pick it up. Move it with the arrow keys, Space to put it down, Escape to put it back.",
  /** A handle the keys take a thing by, where the thing is not itself a control. */
  handle: (name: string) => `Move ${name}`,
  /** What a card that is a link and moves is called (its role, said in place of "link"). */
  movableLink: "movable link",
  pickedUp: (name: string) => `Picked up ${name}.`,
  /** It stands at a new place among the others. */
  movedTo: (name: string, place: number, of: number) =>
    `${name} is at ${place} of ${of}.`,
  /** It stands at a new place in one of several lists (a board's column, a group's tabs). */
  movedToIn: (name: string, where: string, place: number, of: number) =>
    `${name} is in ${where}, at ${place} of ${of}.`,
  /** It is over somewhere it can land. */
  over: (name: string, where: string) => `${name} is over ${where}.`,
  droppedAt: (name: string, place: number, of: number) =>
    `Put ${name} down at ${place} of ${of}.`,
  droppedIn: (name: string, where: string) => `Put ${name} down in ${where}.`,
  droppedAtIn: (name: string, where: string, place: number, of: number) =>
    `Put ${name} down in ${where}, at ${place} of ${of}.`,
  /** Let go where nothing takes it, or Escape: it goes back. */
  putBack: (name: string) => `${name} went back where it was.`,
};
