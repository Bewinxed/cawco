import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { Mounts } from "./mounts.svelte.js";
import { wordsOptionsOf } from "./render.js";
import type { MarkdownInput } from "./types.js";
import { createDomRenderer } from "./words.js";

/** What an update draws. */
interface Draw {
  active: boolean;
  incomplete: boolean;
  input: MarkdownInput;
}

/** Words' fade length when `animated` names none (its documented default). */
const FADE = 180;

/**
 * Render markdown into the element this is attached to, and patch it as
 * `read()` changes: each update rewrites only what changed. `read` is read
 * in an effect, so whatever it reads is tracked; nothing needs to be kept
 * stable or memoized, and options that compare equal render nothing again.
 *
 * The element may already hold the render (`renderMarkdown`, or the
 * server's): the first update adopts it, and fades none of it.
 */
export function markdown(read: () => MarkdownInput): Attachment<HTMLElement> {
  return (root) => {
    const first = untrack(read);
    const optionsOf = wordsOptionsOf(false);
    // The comments Svelte's hydration left around the server's HTML.
    for (const node of [...root.childNodes]) {
      if (node.nodeType === Node.COMMENT_NODE) {
        node.remove();
      }
    }
    const renderer = createDomRenderer(root, optionsOf(first));
    const mounts = new Mounts(root, first.context);
    let drawn: Draw | null = null;
    /** The stream's end, held back while its last words fade in. */
    let ending: ReturnType<typeof setTimeout> | undefined;
    renderer.connect();

    /** Draw `next`: Words patches what changed, and the snippets follow. */
    const draw = (next: Draw): void => {
      const { input, active, incomplete } = next;
      const { source, animated = false, caret } = input;
      // A stream's next chunk rewrites the last block alone; anything else
      // may rewrite every one.
      mounts.hold(
        !drawn ||
          source === drawn.input.source ||
          !source.startsWith(drawn.input.source) ||
          incomplete !== drawn.incomplete ||
          active !== drawn.active
      );
      // What the element showed when it was attached never fades.
      renderer.update(
        source,
        incomplete,
        active,
        drawn ? animated : false,
        caret
      );
      mounts.settle(input);
      drawn = next;
    };

    $effect(() => {
      const input = read();
      const options = optionsOf(input);
      const { streaming = false, repair = true, animated = false } = input;
      untrack(() => {
        clearTimeout(ending);
        renderer.configure(options);
        const ends = !streaming && drawn?.active === true && animated !== false;
        // Words fades text only while its stream is active, and ends every
        // fade at once when it stops: the stream's last words are drawn
        // with it still active, so they fade in like one more chunk and
        // the fades running finish, and it stops once they have.
        draw({
          input,
          incomplete: streaming && repair,
          active: streaming || ends,
        });
        if (ends) {
          const duration =
            typeof animated === "object" ? (animated.duration ?? FADE) : FADE;
          ending = setTimeout(
            () => draw({ input, incomplete: false, active: false }),
            duration
          );
        }
      });
    });

    return () => {
      clearTimeout(ending);
      renderer.disconnect();
      mounts.destroy();
    };
  };
}
