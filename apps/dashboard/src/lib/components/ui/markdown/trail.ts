/** One streamed chunk's fade: where its words start in the text, and when it began. */
export interface Chunk {
  /** Its first word's offset in the rendered text. */
  from: number;
  /** When its fade began (document timeline, ms). */
  start: number;
}

/**
 * What a streaming message has drawn: the fades of its chunks, oldest first,
 * and how much of its text was on screen. The streaming render writes it; the
 * settled render of the same message reads it, and plays on the fades that
 * were still running instead of cutting them.
 */
export interface Trail {
  chunks: Chunk[];
  drawn: number;
}
