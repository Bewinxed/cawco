/**
 * Briefer documents (core fleet.ts `MemoryScope.briefer`): guidance for
 * writing a brief, which reaches the session that calls `delegate` and never
 * the delegate. A delegate call whose delegate a briefer document is about
 * (its type and model, `briefTakes`) is held once, before anything starts,
 * when the calling session has not read that document at its current text
 * since its start or its last compaction: the call answers with the guide,
 * and the same call made again goes out. A compaction of the caller
 * (`compact_boundary`, which Claude Code, OpenCode and pi each send live)
 * forgets what it was handed, so its next such call hands the guide again.
 *
 * What a session was handed is kept in the hub's database
 * (`memory_briefings`), so a hub restart does not hand it twice.
 */
import type { BriefTarget, NeutralMessage } from "@cawco/core";
import { briefTakes } from "@cawco/core";
import type { DbShape } from "./db";

/** The delegate a brief is for, in a few words. */
const targetWords = (target: BriefTarget): string =>
  target.delegateType
    ? `a ${target.delegateType} delegate (${target.model})`
    : `a delegate on ${target.model}`;

/**
 * The guide `callerId` has not read for a delegate `target` describes, as
 * the call's answer, recorded as handed now; nothing when it has read every
 * one at its current text.
 */
export const briefingFor = (
  db: Pick<
    DbShape,
    "briefingsHanded" | "handBriefings" | "listFleetMemoryDocs"
  >,
  callerId: string,
  target: BriefTarget
): string | undefined => {
  const handed = db.briefingsHanded(callerId);
  const unread = db
    .listFleetMemoryDocs()
    .filter(
      (doc) =>
        briefTakes(doc.scope, target) && handed.get(doc.path) !== doc.hash
    );
  if (unread.length === 0) {
    return undefined;
  }
  db.handBriefings(
    callerId,
    unread.map(({ path, hash }) => ({ path, hash }))
  );
  const guides = unread
    .map(
      ({ path, content }) =>
        `Contents of the fleet's memory document ${path} (briefing guidance):\n\n${content.trim()}`
    )
    .join("\n\n");
  return `Not started yet: the fleet keeps guidance for briefing ${targetWords(target)}, and this session has not read it since it started or last compacted. Read it, rewrite the brief where it applies, then make the delegate call again: the same call goes out. Nothing was started.\n\n${guides}`;
};

/**
 * A frame of a session: a compaction forgets the briefer documents it was
 * handed, since its context no longer holds them.
 */
export const briefingsObserve = (
  db: Pick<DbShape, "forgetBriefings">,
  instanceId: string,
  frame: NeutralMessage
): void => {
  if (frame.type === "system" && frame.subtype === "compact_boundary") {
    db.forgetBriefings(instanceId);
  }
};
