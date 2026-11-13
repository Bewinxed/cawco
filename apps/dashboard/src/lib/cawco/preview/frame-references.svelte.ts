/**
 * A framed page's `cawco:` references answered (core reference-faces.ts):
 * the page names the references its words draw, and this says each one's
 * face as the dashboard reads it now (references.ts `referenceFace`), again
 * whenever one changes; the page's press on one opens it as its chip
 * pressed here opens (`followReference`), from the panel of `here`. Its
 * host hands it every message heard from its own frame ({@link heard}).
 *
 * The registry loads on the first message that names a reference: the
 * artifact's own tab never reaches the conversation's code
 * (page-imports-check.ts), and a page that names none never loads it.
 */
import { REFERENCE_FACES } from "@cawco/core/reference-faces";
import { untrack } from "svelte";
import { previewOpenReference, previewReferences } from "./wire";

type Registry = typeof import("../references");

let loading: Promise<Registry> | null = null;
const registry = (): Promise<Registry> => {
  loading ??= import("../references");
  return loading;
};

export class FrameReferences {
  #hrefs = $state.raw<string[]>([]);
  #registry = $state.raw<Registry | null>(null);
  /** The faces last said, as JSON: the same faces are not said twice. */
  #said = "";
  readonly #post: (message: object) => void;
  readonly #here: () => string | undefined;

  /** Made where a component starts: its faces are said while it stands. */
  constructor(post: (message: object) => void, here: () => string | undefined) {
    this.#post = post;
    this.#here = here;
    $effect(() => {
      const read = this.#registry;
      const hrefs = this.#hrefs;
      if (!read || hrefs.length === 0) {
        return;
      }
      const faces = Object.fromEntries(
        hrefs.map((href) => [href, read.referenceFace(href)])
      );
      const said = JSON.stringify(faces);
      if (said === this.#said) {
        return;
      }
      this.#said = said;
      untrack(() => this.#post({ type: REFERENCE_FACES, faces }));
    });
  }

  /** Whether `data`, heard from the frame, was its references or an ask to open one: taken and answered. */
  heard(data: unknown): boolean {
    const hrefs = previewReferences(data);
    if (hrefs) {
      // A page that names them again (loaded again, or a host's new hello) hears every face again.
      this.#said = "";
      this.#hrefs = hrefs;
      if (hrefs.length > 0) {
        registry().then((read) => {
          this.#registry = read;
        });
      }
      return true;
    }
    const opening = previewOpenReference(data);
    if (!opening) {
      return false;
    }
    registry()
      .then((read) => read.followReference(opening.href, this.#here()))
      .then((refused) =>
        this.#post({ jsonrpc: "2.0", id: opening.id, result: refused })
      );
    return true;
  }
}
