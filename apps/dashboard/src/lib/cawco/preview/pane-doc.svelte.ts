/**
 * The artifact's live document as this pane holds it: its pins beside the page's own, the writes the hub refused, and the state of the links to the hub.
 */
import {
  keepAside,
  type Pin,
  pinHeld,
  type RefusedReplies,
  type RefusedWrites,
  type ThreadEntry,
  withKeptReplies,
} from "@cawco/core/comments/model";
import { pinProblem } from "@cawco/core/comments/validate";
import { artifactWords } from "@cawco/core/words/artifacts";
import { untrack } from "svelte";
import { z } from "zod";
import { ThreadEntrySchema } from "#lib/cawco/stored-shapes.js";
import { graceWhile } from "#lib/platform/grace-while.svelte.js";
import { readJson, unstore, writeJson } from "#lib/platform/storage.js";
import {
  holdArtifact,
  noteArtifact,
  releaseArtifact,
} from "../artifact-names.svelte";
import {
  type ArtifactDoc,
  type ArtifactView,
  type DocSync,
  joinArtifact,
  LINK_DOWN_MS,
  type ListHold,
} from "./artifact-doc";
import type { PaneNotice } from "./pane-notice.svelte";
import type { PaneSubject } from "./pane-subject.svelte";
import { enterPreviews } from "./pass";
import type { PreviewFrame } from "./preview-frame.svelte";
import type { PreviewReach } from "./preview-reach.svelte";

const refusedKey = (id: string) => `cawco-refused-replies:${id}`;
const sendRefusedKey = (id: string) => `cawco-refused-send:${id}`;
/** `said` as the page's refused replies, each part checked: what isn't one is left out. */
export function pageRepliesOf(said: unknown): RefusedReplies {
  if (!said || typeof said !== "object" || Array.isArray(said)) {
    return {};
  }
  const kept: RefusedReplies = {};
  for (const [pin, one] of Object.entries(said)) {
    const { entries, why, resolved, deleted } = (one ?? {}) as {
      deleted?: unknown;
      entries?: unknown;
      resolved?: unknown;
      why?: unknown;
    };
    if (typeof why !== "string" || !Array.isArray(entries)) {
      continue;
    }
    const valid = entries.filter(
      (entry): entry is ThreadEntry =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as ThreadEntry).id === "string" &&
        typeof (entry as ThreadEntry).text === "string" &&
        (entry as ThreadEntry).by === "person"
    );
    // Its delete, or its resolve or reopen, the hub refused, beside its replies.
    const act = {
      ...(typeof resolved === "boolean" ? { resolved } : {}),
      ...(deleted === true ? { deleted: true as const } : {}),
    };
    if (valid.length > 0 || Object.keys(act).length > 0) {
      kept[pin] = { entries: valid, why, ...act };
    }
  }
  return kept;
}
/** What closed the page's link, as the page said it (artifact.ts `closedBecause`). */
export const lostWhy = (error: unknown): string =>
  typeof error === "string" ? error : "The page's link to the hub closed.";
export interface PaneDocDeps {
  readonly instanceId: () => string;
  readonly paneNotice: PaneNotice;
  readonly paneSubject: PaneSubject;
  readonly previewFrame: PreviewFrame;
  readonly previewReach: PreviewReach;
  readonly writeLooks: () => void;
}
export class PaneDoc {
  readonly #deps: PaneDocDeps;

  /*
   * The page keeps its own state (Projects spec §5.10): the overlay joins
   * the artifact's live document itself, on the path `cawco:hello` names.
   * The pane joins the same doc too (artifact-doc.ts): the pins' threads,
   * which the rail and the thread read and the person writes. The person's
   * comments, replies, resolves, ink and picks go to the session on their
   * Send (the hub's artifacts/service.ts `send`).
   */
  view = $state.raw<ArtifactView | null>(null);

  doc: ArtifactDoc | null = null;

  /**
   * Pins the page's doc holds that the pane's doesn't yet, as the page last
   * said them (`cawco:pin-open`'s pin, a write's result): one made while the
   * page's link to the hub is down reaches the pane's doc only through the
   * hub. The card and the list read them beside the pane's own, and their
   * words, resolve and delete go through the page ({@link onlyOnPage}).
   */
  pagePins = $state.raw<Record<string, Pin>>({});

  /**
   * The person's writes on a pin the hub refused (artifact-doc.ts
   * `refusedBy`, core `lostWrites`), by pin: each reply as written, a
   * resolve or reopen, a delete, and the hub's reason. Kept on the device
   * apart from the doc, as the page keeps its refused comments (overlay
   * artifact.ts `keepRefused`), and said on the pin where it was made, not
   * sent, with the reason and Try again (`retryPin`), its replies in
   * their thread where they stood. A reload keeps them.
   */
  refusedReplies = $state.raw<RefusedReplies>({});

  /**
   * Send all the hub refused: the note it went with and the hub's reason,
   * said in the rail's note where it was pressed (CommentRail `sendRefused`),
   * the held comments still held and the note as written, ready to send
   * again. Kept on the device; a reload keeps it.
   */
  sendRefused = $state.raw<{ note: string; why: string } | null>(null);

  /**
   * The person's writes on a pin the hub refused that the page keeps (its
   * replies, resolve or reopen and delete, written through the page, as the
   * app writes them: overlay artifact.ts `refusedReplies`), by pin, as the
   * page last said them
   * (`cawco:page-pins`). Drawn in their thread beside the pane's own, with
   * the reason and Try again, which the page writes again
   * (`cawco:resend-pin`).
   */
  pageReplies = $state.raw<RefusedReplies>({});

  readonly pins = $derived.by(() => {
    const held = (this.view?.pins ?? []).map((pin) => {
      const thread = withKeptReplies(pin.thread, [
        ...(this.refusedReplies[pin.id]?.entries ?? []),
        ...(this.pageReplies[pin.id]?.entries ?? []),
      ]);
      return thread === pin.thread ? pin : { ...pin, thread };
    });
    const known = new Set(held.map((pin) => pin.id));
    const more = Object.values(this.pagePins).filter(
      (pin) => !known.has(pin.id)
    );
    return more.length > 0
      ? [...held, ...more].sort((a, b) => a.number - b.number)
      : held;
  });

  /** Whether pin `id` stands only in the page's doc yet: written through the page's own messages, as the app's are. */
  readonly onlyOnPage = (id: string) =>
    id in this.pagePins && !this.view?.pins.some((pin) => pin.id === id);

  /** Words sent through the page, kept until it says they were written: a refusal puts them back in the field. */
  readonly pageWords = new Map<string, string>();

  /** Whether the pane holds the doc yet: until it does, no count or list reads as none. */
  docSync = $state<DocSync>({ state: "reading" });

  /** The first sync has outlasted `--dur-wait-grace`: the list's skeleton stands in (The Real Wait Rule). */
  readonly readingLong = graceWhile(() => this.docSync.state === "reading");

  /** What the Comments list stands on: quiet inside the grace, then reading, the pins once held, or why they weren't. */
  readonly listHold = $derived.by<ListHold>(() => {
    switch (this.docSync.state) {
      case "synced":
      case "lost":
        return "ready";
      case "failed":
        return { failed: this.docSync.why };
      case "reading":
        break;
    }
    return this.readingLong.current ? "reading" : "quiet";
  });

  /** The page's doc's link to the hub, as the page says it (`cawco:sync`): what closed it, while it stands lost. */
  pageLost = $state<string | null>(null);

  readonly pageIsLost = $derived(this.pageLost !== null);

  /** The page's link was lost to silence (overlay artifact.ts `Link.silent`): its silence was the grace. */
  pageSilent = $state(false);

  /** The page's link has stood lost {@link LINK_DOWN_MS} from its first close, whatever each close said, or was lost to silence. */
  pageDown = $state(false);

  /**
   * The comments aren't reaching the agent: the page's link or the pane's
   * has stood lost {@link LINK_DOWN_MS} (the pane's own is graced in
   * artifact-doc.ts), or fell silent (core doc-link.ts `SILENT_MS`), so a
   * drop y-websocket reopens says nothing; what
   * closed it, word for word. What the person marks meanwhile is kept on
   * the device (artifact-doc.ts, overlay artifact.ts).
   */
  readonly linkDown = $derived(
    (this.pageDown ? this.pageLost : null) ??
      (this.docSync.state === "lost" ? this.docSync.why : null)
  );

  /** Try again on the comments' links: the pane's socket opened again now, and the page's through a new entry. */
  relink = () => {
    this.doc?.retry();
    this.enterAgain(true);
  };

  /**
   * The head's line under the name (the artifact panel's surface brief, Artifact panel): the ask the
   * session gave it, carried by the panel's frame, so it stands from the
   * first frame in every state from on its way to failed; once the person's
   * Send is in and the session has not changed the artifact or its ask since
   * (the doc's `sentAt` past its `revisedAt`), "Sent to <session>", so
   * nothing reads as asked of them.
   */
  readonly headLine = $derived.by(() =>
    this.view?.sentAt &&
    (!this.view.revisedAt || this.view.sentAt > this.view.revisedAt)
      ? artifactWords.sentTo(this.#deps.paneSubject.ownerName)
      : (this.#deps.paneSubject.artifact?.ask ?? "")
  );

  /**
   * The head's Comments count: the rail's Open tab, every pin not resolved,
   * a moved one too, as the hub counts them. Drawn only above 0 (The Earned
   * Count Rule), only while the rail is shut (its Open tab says it while it
   * stands), and 0 until the doc is held, so a count not read yet is never
   * drawn.
   */
  readonly openCount = $derived(
    this.docSync.state === "synced"
      ? this.pins.filter((pin) => !pin.resolvedAt).length
      : 0
  );

  /** The comments the person holds to send together (core `pinHeld`): Send all's count. */
  readonly heldCount = $derived(this.pins.filter(pinHeld).length);

  /** Send all: every held comment and reply let go in one write with the note; the hub's next delivery carries them (core `sendHeld`). */
  readonly sendHeldNow = (note: string): string | null => {
    if (!this.doc) {
      return "The pane lost the page's document, so nothing was sent. Reload, then send again.";
    }
    const refused = this.doc.sendHeld(note);
    // Gone to the hub: a refusal of it comes back (`keepRefused`).
    if (refused === null && this.#deps.paneSubject.artifactId) {
      this.keepSendRefused(this.#deps.paneSubject.artifactId, null);
    }
    return refused;
  };

  /**
   * What Send sends (the artifact panel's surface brief, How comments reach the session): each pick
   * since the last Send. The person's comments go by themselves. Drawn only
   * above 0.
   */
  readonly unsentCount = $derived(
    this.view
      ? Object.values(this.view.choices).filter(
          (entry) => !this.view?.sentAt || entry.at > this.view.sentAt
        ).length
      : 0
  );
  constructor(deps: PaneDocDeps) {
    this.#deps = deps;
    $effect(() => {
      if (!this.pageIsLost) {
        this.pageDown = false;
        return;
      }
      if (this.pageSilent) {
        this.pageDown = true;
        return;
      }
      const said = setTimeout(() => {
        this.pageDown = true;
      }, LINK_DOWN_MS);
      return () => clearTimeout(said);
    });
    // The page's link stood down: its socket's own backoff goes on, carrying a
    // pass entered once in the spell, whatever ended the one it loaded with.
    $effect(() => {
      if (this.pageDown) {
        untrack(() => this.enterAgain(false));
      }
    });
    $effect(() => {
      const id = this.#deps.paneSubject.artifactId;
      const session = this.#deps.instanceId();
      // A browser keeps nothing in a doc: no pins, no ink, no picks (§5.11, "Private").
      if (!id || this.#deps.paneSubject.isBrowser) {
        return;
      }
      this.docSync = { state: "reading" };
      this.pageLost = null;
      this.pageSilent = false;
      this.pagePins = {};
      this.pageReplies = {};
      this.pageWords.clear();
      this.refusedReplies = readJson(
        refusedKey(id),
        z.record(
          z.string(),
          z.object({
            entries: z.array(ThreadEntrySchema),
            why: z.string(),
            resolved: z.boolean().optional(),
            deleted: z.literal(true).optional(),
          })
        ),
        {}
      );
      this.sendRefused = readJson(
        sendRefusedKey(id),
        z.object({ note: z.string(), why: z.string() }).nullable(),
        null
      );
      const joined = joinArtifact(
        session,
        id,
        (next) => {
          this.view = next;
          // A chip naming this artifact, a pin or a card of it reads it live from here.
          holdArtifact(id, { pins: next.pins, choices: next.choices });
          // A pin the pane's doc holds now is its own from here on: the page's
          // copy goes, so a later delete or take-back there never brings it back.
          const held = new Set(next.pins.map((pin) => pin.id));
          if (Object.keys(this.pagePins).some((pinId) => held.has(pinId))) {
            this.pagePins = Object.fromEntries(
              Object.entries(this.pagePins).filter(
                ([pinId]) => !held.has(pinId)
              )
            );
          }
        },
        (sync) => {
          this.docSync = sync;
        },
        // The hub didn't keep a write of the pane's: said where the page's own
        // refusals are, and the person's words in it kept aside in their thread.
        (why, lost) => {
          this.#deps.paneNotice.say({ message: why, again: null });
          this.keepRefused(id, why, lost);
        }
      );
      this.doc = joined;
      this.view = null;
      return () => {
        // A look waiting on its ping is written before its doc goes (the pane laid out again, closed, another artifact).
        this.#deps.writeLooks();
        joined.destroy();
        releaseArtifact(id);
        this.doc = null;
      };
    });
    // What this pane holds names itself to the chips that name it: no chip asks the hub for it.
    $effect(() => {
      const shown = this.#deps.paneSubject.artifact;
      if (shown) {
        noteArtifact(shown.id, {
          instanceId: this.#deps.instanceId(),
          kind: shown.kind,
          name: shown.name,
          title: shown.title,
        });
      }
    });
  }

  /** `next` as the pane keeps it, on the device too. */
  keepReplies(id: string, next: RefusedReplies) {
    this.refusedReplies = next;
    if (Object.keys(next).length > 0) {
      writeJson(refusedKey(id), next);
    } else {
      unstore("local", refusedKey(id));
    }
  }

  /** `next` as the pane keeps it, on the device too. */
  keepSendRefused(id: string, next: { note: string; why: string } | null) {
    this.sendRefused = next;
    if (next) {
      writeJson(sendRefusedKey(id), next);
    } else {
      unstore("local", sendRefusedKey(id));
    }
  }

  /** A refusal's writes the hub doesn't hold, each kept aside with its reason where it was made. */
  keepRefused(id: string, why: string, lost: RefusedWrites) {
    const next = keepAside(this.refusedReplies, lost, why);
    this.keepReplies(id, next);
    if (lost.sendHeld) {
      this.keepSendRefused(id, { note: lost.sendHeld.note, why });
    }
  }

  /** Pin `id` as the page says it now (a valid pin), or gone from it (null). */
  pageSays(id: string, now: unknown) {
    const { [id]: _was, ...rest } = this.pagePins;
    this.pagePins =
      now !== null && pinProblem(now) === null && (now as Pin).id === id
        ? { ...rest, [id]: now as Pin }
        : rest;
  }

  /**
   * The page's socket opened again through the entry a frame's load takes
   * (preview/pass.ts): the lock refuses a socket whose pass ended or was
   * replaced since the page loaded (hub preview.ts `atTheLock`, a 401 the
   * browser says only as code 1006), and only a new entry gives the browser
   * a pass its next open carries, with no reload. `said`: the person asked
   * (Try again), so an entry the hub won't give is the failure band.
   */
  async enterAgain(said: boolean) {
    const origin = this.#deps.previewReach.paneOrigin;
    if (!origin) {
      return;
    }
    const refused = await enterPreviews(origin, performance.now());
    if (refused && said) {
      this.#deps.paneNotice.say({
        message: `The hub didn't give this preview a pass: ${refused}`,
        again: null,
      });
    }
    this.#deps.previewFrame.post({ type: "cawco:reconnect" });
  }
}
