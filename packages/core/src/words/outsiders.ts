/**
 * An outsider's held words in Caw's Needs you (home/NeedsCard.svelte; hub
 * outsiders.ts): someone who isn't a collaborator on the repository, or
 * is outside the Linear workspace, opened or commented on an item no task
 * links, and the project holds what they write until the person lets it
 * through or drops it.
 */
export const outsiderWords = {
  /** Its title: who wrote it and the item it is on. */
  title: (ref: string, actor: string) => `${actor} on ${ref}`,
  /** Its line: their first line, as data, after how many of theirs are held there when more than one. */
  line: (firstLine: string, count: number) => {
    const quoted = firstLine.length > 0 ? `“${firstLine}”` : "";
    if (count > 1) {
      return quoted ? `${count} held: ${quoted}` : `${count} held`;
    }
    return quoted;
  },
  /** Lets their words through: routed as anyone's, a session reading them as data. */
  letThrough: "Let through",
  lettingThrough: "Letting through…",
  /** Drops their words: nothing starts for them. */
  drop: "Drop",
  dropping: "Dropping…",
} as const;
