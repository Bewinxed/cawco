/**
 * A stream's text cut into lines, in time proportional to the text received,
 * however long one line is.
 *
 * The obvious framer appends each chunk to what is pending and searches the
 * whole of it for "\n" again: a line that arrives in k chunks is scanned (and,
 * as a JavaScript string, flattened) k times, which is quadratic in its
 * length. A child that writes one 64 MB line in 64 KB pipe reads costs ~1,000
 * scans of up to 64 MB on the loop that reads it. Here only the new chunk is
 * searched, the pieces of the unfinished line are kept as they came, and they
 * are joined once, when its "\n" arrives.
 *
 * Opaque about content: a line is the text between two "\n", with nothing
 * stripped ("\r" included).
 */
export class LineSplitter {
  /** The unfinished line's pieces, in arrival order. */
  #pieces: string[] = [];

  /** The lines `chunk` completes, in order, each without its "\n". */
  push(chunk: string): string[] {
    const lines: string[] = [];
    let start = 0;
    let nl = chunk.indexOf("\n");
    while (nl >= 0) {
      const tail = chunk.slice(start, nl);
      if (this.#pieces.length > 0) {
        this.#pieces.push(tail);
        lines.push(this.#pieces.join(""));
        this.#pieces = [];
      } else {
        lines.push(tail);
      }
      start = nl + 1;
      nl = chunk.indexOf("\n", start);
    }
    if (start < chunk.length) {
      this.#pieces.push(start === 0 ? chunk : chunk.slice(start));
    }
    return lines;
  }

  /** Whether an unfinished line is waiting for its "\n". */
  get pending(): boolean {
    return this.#pieces.length > 0;
  }

  /** The unfinished line, given up: what came after the last "\n". The splitter is empty again. */
  end(): string {
    const rest = this.#pieces.join("");
    this.#pieces = [];
    return rest;
  }
}
