/**
 * A framed page's links answered (core reference-faces.ts `PageLinks`):
 * the `cawco:` references its program's words name, and the artifacts its
 * Canvas and Preview pieces show. They are the product's, as the hub read
 * them off the program it checked and keeps (`artifactLinks`), for the
 * artifact its host says it frames. Nothing the frame says adds to them;
 * what the frame says only asks for them to be read again (its load, a
 * change to its doc, which a revision is). An artifact that keeps no
 * program has none, so its frame is said no faces and opens nothing here.
 *
 * Each reference has its face said to the frame as the dashboard reads it
 * now (references.ts `referenceFace`), again whenever one changes. The
 * frame's two asks to open are answered on one path ({@link heard}): a
 * reference opens as its chip pressed here opens (`followReference`), an
 * artifact where a chip of it opens (`openReference`), from the panel of
 * `here`; a reference or an artifact outside the page's links is refused
 * with a sentence.
 *
 * The registry loads once the page names a reference, and the opener on a
 * press: the artifact's own tab never reaches the conversation's code
 * (page-imports-check.ts), and a page that names none never loads it.
 */
import { type PageLinks, REFERENCE_FACES } from "@cawco/core/reference-faces";
import { decisionsWords } from "@cawco/core/words/decisions";
import { untrack } from "svelte";
import { artifactLinks } from "../artifact-api";
import { previewOpenArtifact, previewOpenReference } from "./wire";

type Registry = typeof import("../references");

let loading: Promise<Registry> | null = null;
const registry = (): Promise<Registry> => {
  loading ??= import("../references");
  return loading;
};

/** What the frame says that asks for the links to be read again: its overlay joined, its doc changed. */
const READ_AGAIN = new Set(["cawco:ready", "cawco:doc"]);

/** An ask of the frame's to open something: what it names, whether the page links to it, the refusal if not, and the open. */
interface Opening {
  id: number | string;
  linked: (links: PageLinks) => boolean;
  open: () => Promise<string | null>;
  refusal: string;
}

export class FrameLinks {
  /** The page's links, for the artifact they were read for. */
  #links = $state.raw<(PageLinks & { artifact: string }) | null>(null);
  #registry = $state.raw<Registry | null>(null);
  /** The faces last said, as JSON: the same faces are not said twice. */
  #said = "";
  /** Whether a read of the links is out, and whether another was asked meanwhile. */
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
      const links = this.#links;
      if (!(read && links) || links.artifact !== this.#artifact()) {
        return;
      }
      const faces = Object.fromEntries(
        links.references.map((href) => [href, read.referenceFace(href)])
      );
      const said = JSON.stringify(faces);
      if (said === this.#said) {
        return;
      }
      this.#said = said;
      untrack(() => this.#post({ type: REFERENCE_FACES, faces }));
    });
  }

  /** Reads the links again for the artifact framed now; a read asked while one is out runs once it ends. */
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
      const links = await artifactLinks(artifact);
      // A frame loaded again hears every face again.
      this.#said = "";
      this.#links = { ...links, artifact };
      if (links.references.length > 0) {
        this.#registry = await registry();
      }
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      console.error(`[cawco] reading ${artifact}'s links failed: ${why}`);
    } finally {
      this.#reads.out = false;
    }
    if (this.#reads.again) {
      this.#reads.again = false;
      await this.#read();
    }
  }

  /** The frame's ask to open something, as one shape; null when `data` is none. */
  #opening(data: unknown): Opening | null {
    const reference = previewOpenReference(data);
    if (reference) {
      return {
        id: reference.id,
        linked: (links) => links.references.includes(reference.href),
        refusal: decisionsWords.referenceNotOnPage,
        open: async () =>
          (await registry()).followReference(reference.href, this.#here()),
      };
    }
    const artifact = previewOpenArtifact(data);
    if (artifact) {
      return {
        id: artifact.id,
        linked: (links) => links.artifacts.includes(artifact.artifact),
        refusal: decisionsWords.artifactNotOnPage,
        open: async () =>
          (await import("../reference-open.svelte")).openReference(
            artifact.artifact,
            { top: true },
            this.#here()
          ),
      };
    }
    return null;
  }

  /**
   * Whether `data`, heard from the frame, was an ask to open a reference or
   * an artifact: answered, opened only when the page's links hold it. Its
   * load and its doc's changes read the links again, and are left for the
   * host to hear too.
   */
  heard(data: unknown): boolean {
    const type = (data as { type?: unknown } | null)?.type;
    if (typeof type === "string" && READ_AGAIN.has(type)) {
      this.#read();
      return false;
    }
    const opening = this.#opening(data);
    if (!opening) {
      return false;
    }
    const links = this.#links;
    const answer = (result: string | null) =>
      this.#post({ jsonrpc: "2.0", id: opening.id, result });
    if (
      !links ||
      links.artifact !== this.#artifact() ||
      !opening.linked(links)
    ) {
      answer(opening.refusal);
      return true;
    }
    opening.open().then(answer);
    return true;
  }
}
