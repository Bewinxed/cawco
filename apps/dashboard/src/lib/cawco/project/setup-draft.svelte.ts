/**
 * Caw's setup draft as the project's page draws it in the board's place
 * (SetupDraft; decision page `onboarding-first-minutes`, card
 * `draft-where`, the person's pick "As the board it becomes"). The draft is
 * the setup page he writes (the decision page `setup`, a `Setup` in its
 * program, `decisions/setup/page.oui` in the project's folder): this reads
 * that program for what he drafted, joins the page's own doc for what the
 * person has kept over it (`aim`, `stages`, `delegates`, as the page's
 * `cawco.set` keeps them, hub setup.ts), keeps each change there, and sends
 * the page for Set up. Nothing is written into the project before that
 * send: the hub applies it and Caw writes stages.md from it.
 *
 * The program is read again whenever the page changes (its `updatedAt` in
 * the project's decisions list), so stages he adds as he drafts appear.
 */

import spec from "@cawco/core/decisions-spec";
import {
  createParser,
  type ElementNode,
  type LibraryJSONSchema,
} from "@openuidev/lang-core";
import { sendDecision } from "#lib/cawco/decisions/decisions-api.js";
import {
  type ArtifactDoc,
  joinArtifact,
} from "#lib/cawco/preview/artifact-doc.js";
import {
  draftedOf,
  type SetupDelegate,
  type SetupDrafted,
  type Stage,
  stageOf,
  storedStages,
} from "#lib/cawco/project/setup-stage.js";
import { folderRawHref } from "#lib/cawco/project-tasks.js";
import { failureWords } from "#lib/platform/hub-read.js";
import { newestRead } from "#lib/platform/newest-read.js";

/** The setup page, as the project's decisions list names it. */
export interface SetupPageRow {
  artifactId: string | null;
  updatedAt: number;
  writer: { instanceId: string } | null;
}

/** The setup page's program in the project's folder (hub decision-program.ts `PROGRAM_FILE`). */
const PROGRAM = "decisions/setup/page.oui";

const parser = createParser(spec.schema as LibraryJSONSchema, spec.root);

const isElement = (value: unknown): value is ElementNode =>
  typeof value === "object" &&
  value !== null &&
  (value as { type?: unknown }).type === "element";

/** The program's one Setup, its props as data, and the ids of the cards beside it; null when it has no Setup. */
function setupIn(
  program: string
): { drafted: SetupDrafted; cards: string[] } | null {
  const seen = new Set<unknown>();
  const find = (node: unknown): ElementNode | null => {
    if (!node || typeof node !== "object" || seen.has(node)) {
      return null;
    }
    seen.add(node);
    if (isElement(node) && node.typeName === "Setup") {
      return node;
    }
    for (const value of Object.values(
      isElement(node) ? node.props : (node as Record<string, unknown>)
    )) {
      const found = Array.isArray(value)
        ? value.map(find).find(Boolean)
        : find(value);
      if (found) {
        return found;
      }
    }
    return null;
  };
  const { root } = parser.parse(program);
  const setup = find(root);
  // The cards beside it: every Decision in the program, read whole.
  const cards: string[] = [];
  seen.clear();
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object" || seen.has(node)) {
      return;
    }
    seen.add(node);
    if (isElement(node) && node.typeName === "Decision") {
      const { id } = node.props as { id?: unknown };
      if (typeof id === "string") {
        cards.push(id);
      }
    }
    for (const value of Object.values(
      isElement(node) ? node.props : (node as Record<string, unknown>)
    )) {
      if (Array.isArray(value)) {
        value.forEach(walk);
      } else {
        walk(value);
      }
    }
  };
  walk(root);
  return setup
    ? {
        drafted: draftedOf(setup.props as Record<string, unknown>),
        cards: [...new Set(cards)],
      }
    : null;
}

export class SetupDraftSource {
  /** What he drafted, as his program says; null until it is read. */
  drafted = $state<SetupDrafted | null>(null);
  /** The ids of the page's cards beside the draft (`account`, `routines`, `what-moves`). */
  cards = $state<string[]>([]);
  /** What the person kept over it on the page, by key. */
  kept = $state<Record<string, unknown>>({});
  /** Why the draft could not be read or kept, in the hub's words; null when it was. */
  problem = $state<string | null>(null);
  /**
   * The setup page is one the board can't draw: made before setups were
   * drafted on the board, it has no program, or its program holds no Setup.
   */
  stale = $state(false);
  /** Set up is on its way. */
  sending = $state(false);

  #doc: ArtifactDoc | null = null;
  #joined: string | null = null;
  readonly #read = newestRead();

  /** The draft as the person sees it: what they kept over what he drafted. */
  get aim(): string {
    const kept = this.kept.aim;
    return typeof kept === "string" ? kept : (this.drafted?.aim ?? "");
  }
  get stages(): Stage[] {
    const kept = this.kept.stages;
    return Array.isArray(kept)
      ? kept.map((one) => stageOf(one as Record<string, unknown>))
      : (this.drafted?.stages ?? []);
  }
  /** The delegate types it proposes, less those the person removed. */
  get delegates(): SetupDelegate[] {
    const kept = this.kept.delegates;
    const all = this.drafted?.delegates ?? [];
    return Array.isArray(kept)
      ? all.filter((one) => kept.includes(one.id))
      : all;
  }

  /** Reads the page again for its row (call on every list change); null: no page yet. */
  async follow(projectId: string, page: SetupPageRow | null): Promise<void> {
    if (!(page?.artifactId && page.writer)) {
      this.leave();
      this.drafted = null;
      this.cards = [];
      this.stale = false;
      return;
    }
    if (this.#joined !== page.artifactId) {
      this.leave();
      this.#joined = page.artifactId;
      this.#doc = joinArtifact(
        page.writer.instanceId,
        page.artifactId,
        (view) => {
          this.kept = Object.fromEntries(
            Object.entries(view.choices).map(([key, entry]) => [
              key,
              entry.value,
            ])
          );
        },
        () => undefined,
        (why) => {
          this.problem = why;
        }
      );
    }
    const newest = this.#read.next();
    try {
      const response = await fetch(folderRawHref(projectId, PROGRAM));
      // No program: a page from before the Setup, built as HTML alone.
      const missing = response.status === 404;
      if (!(response.ok || missing)) {
        throw new Error(
          `The setup page's program did not read (${response.status}).`
        );
      }
      const read = missing ? null : setupIn(await response.text());
      if (newest()) {
        this.drafted = read?.drafted ?? null;
        this.cards = read?.cards ?? [];
        this.stale = read === null;
        this.problem = null;
      }
    } catch (error) {
      if (newest()) {
        this.problem = failureWords(error);
      }
    }
  }

  /** Keeps a change of the person's on the page; the hub writes nothing into the project yet. */
  keep(key: "aim" | "stages" | "delegates", value: unknown): void {
    const stored = key === "stages" ? storedStages(value as Stage[]) : value;
    this.kept = { ...this.kept, [key]: stored };
    const problem = this.#doc?.keep(key, stored) ?? null;
    if (problem) {
      this.problem = problem;
    }
  }

  /** Set up: the page sent, which the hub applies and Caw writes the project from. */
  async send(projectId: string, artifactId: string): Promise<boolean> {
    this.sending = true;
    try {
      await sendDecision(projectId, "setup", artifactId);
      this.problem = null;
      return true;
    } catch (error) {
      this.problem = failureWords(error);
      return false;
    } finally {
      this.sending = false;
    }
  }

  leave(): void {
    this.#doc?.destroy();
    this.#doc = null;
    this.#joined = null;
  }
}
