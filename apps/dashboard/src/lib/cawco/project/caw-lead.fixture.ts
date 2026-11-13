/**
 * Caw's seat as the page's CawLead holds it at rest, for the states files
 * that stand him over an empty page (the empty board, Decisions, Routines):
 * on, idle, nothing moving, his panel shut. `sitDownNowhere` is his outro
 * where the frame has no head to sit down in.
 */
import { conversationWords } from "@cawco/core/words/project-conversation";
import type { CawLead, SeatedLead } from "./caw-lead.svelte";

export const RESTING_LEAD: SeatedLead & Pick<CawLead, "ask"> = {
  anchor: null,
  ask: () => undefined,
  holds: true,
  inPanel: false,
  open: false,
  seat: () => () => undefined,
  sentence: conversationWords.status.ready,
  shown: true,
  status: "idle",
};

export const sitDownNowhere = () => ({ duration: 0 });
