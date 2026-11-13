/**
 * A framed decision page's `cawco:` references answered (core
 * reference-faces.ts). The set is the product's: the references the page's
 * program names, as the hub read them off the program it checked and keeps
 * (`artifactReferences`), for the artifact its host says it frames. Nothing
 * the frame says adds to it; what the frame says only asks for the set to
 * be read again (its load, a change to its doc, which a revision is). An
 * artifact that keeps no program has none, so its frame is said no faces
 * and opens nothing here.
 *
 * Each reference in the set has its face said to the frame as the
 * dashboard reads it now (references.ts `referenceFace`), again whenever
 * one changes; the page's press on one opens it as its chip pressed here
 * opens (`followReference`), from the panel of `here`, and a press on any
 * destination outside the set is refused.
 *
 * The registry loads once the set names a reference: the artifact's own
 * tab never reaches the conversation's code (page-imports-check.ts), and a
 * page that names none never loads it.
 */
import { REFERENCE_FACES } from "@cawco/core/reference-faces";
import { decisionsWords } from "@cawco/core/words/decisions";
import { untrack } from "svelte";
import { artifactReferences } from "../artifact-api";
import { previewOpenReference } from "./wire";

type Registry = typeof import("../references");

let loading: Promise<Registry> | null = null;
const registry = (): Promise<Registry> => {
  loading ??= import("../references");
  return loading;
};

/** What the frame says that asks for the set to be read again: its overlay joined, its doc changed. */
const READ_AGAIN = new Set(["cawco:ready", "cawco:doc"]);

export class FrameReferences {
  /** The set, for the artifact it was read for. */
  #set = $state.raw<{ artifact: string; hrefs: string[] } | null>(null);
  #registry = $state.raw<Registry | null>(null);
  /** The faces last said, as JSON: the same faces are not said twice. */
  #said = "";
  /** Whether a read of the set is out, and whether another was asked meanwhile. */
  readonly #reads: { out: boolean; again: boolean } = {
    out: false,
    again: false,
  };
  readonly #post: (message: object) => void;
  readonly #here: () => string | undefined;
  readonly #artifact: () => string | null;

  /**
   * Made where a component starts, for the artifact `artifact` names (its
   * host's own word, never the frame's): its faces are said while it stands.
   */
  constructor(
    post: (message: object) => void,
    here: () => string | undefined,
    artifact: () => string | null
  ) {
    this.#post = post;
    this.#here = here;
    this.#artifact = artifact;
    $effect(() => {
      if (this.#artifact()) {
        untrack(() => this.#read());
      }
    });
    $effect(() => {
      const read = this.#registry;
      const set = this.#set;
      if (!(read && set) || set.artifact !== this.#artifact()) {
        return;
      }
      const faces = Object.fromEntries(
        set.hrefs.map((href) => [href, read.referenceFace(href)])
      );
      const said = JSON.stringify(faces);
      if (said === this.#said) {
        return;
      }
      this.#said = said;
      untrack(() => this.#post({ type: REFERENCE_FACES, faces }));
    });
  }

  /** Reads the set again for the artifact framed now; a read asked while one is out runs once it ends. */
  async #read(): Promise<void> {
    const artifact = this.#artifact();
    if (!artifact) {
      return;
    }
    if (this.#reads.out) {
      this.#reads.again = true;
      return;
    }
    this.#reads.out = true;
    try {
      const hrefs = await artifactReferences(artifact);
      // A frame loaded again hears every face again.
      this.#said = "";
      this.#set = { artifact, hrefs };
      if (hrefs.length > 0) {
        this.#registry = await registry();
      }
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      console.error(`[cawco] reading ${artifact}'s references failed: ${why}`);
    } finally {
      this.#reads.out = false;
    }
    if (this.#reads.again) {
      this.#reads.again = false;
      await this.#read();
    }
  }

  /**
   * Whether `data`, heard from the frame, was an ask to open a reference:
   * answered, opened only when the set holds it. Its load and its doc's
   * changes read the set again, and are left for the host to hear too.
   */
  heard(data: unknown): boolean {
    const type = (data as { type?: unknown } | null)?.type;
    if (typeof type === "string" && READ_AGAIN.has(type)) {
      this.#read();
      return false;
    }
    const opening = previewOpenReference(data);
    if (!opening) {
      return false;
    }
    const set = this.#set;
    if (
      !set?.hrefs.includes(opening.href) ||
      set.artifact !== this.#artifact()
    ) {
      this.#post({
        jsonrpc: "2.0",
        id: opening.id,
        result: decisionsWords.referenceNotOnPage,
      });
      return true;
    }
    registry()
      .then((read) => read.followReference(opening.href, this.#here()))
      .then((refused) =>
        this.#post({ jsonrpc: "2.0", id: opening.id, result: refused })
      );
    return true;
  }
}
