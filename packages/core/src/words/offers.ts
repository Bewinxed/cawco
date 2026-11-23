/**
 * Two offers (Projects §2 "Caw suggests, you escalate", §5.7 design
 * systems): "make this a project" over a plain session's composer, and the
 * design-system offer's row in Needs you with Build / Not now, for the
 * dashboard and the native app alike.
 *
 * `bun run words` writes these into the app as `Words.Offers`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const offerWords = {
  /** An offer answered, refused by the hub: what came of it, said after the hub's sentence (`hubRefusal`). */
  nothingChangedThen: "so nothing changed. Try again.",
  // ── "Make this a project" (transcript/ProjectOffer.svelte) ──
  offerLabel: "Make this session a project",
  joinedLabel: "Joined a project",
  /** Where the offer stood, once answering joined a project that already was. */
  joined: (name: string, filed: number) =>
    filed > 0
      ? `Joined ${name}, with ${filed} proposed ${filed === 1 ? "task" : "tasks"} from the plan.`
      : `Joined ${name}.`,
  openProject: (name: string) => `Open ${name}`,
  putAway: "Put this away",
  notNow: "Not now",
  createProject: "Create project",
  makingProject: "Making project…",

  // ── The design-system offer in Needs you (home/NeedsCard.svelte) ──
  designTitle: "Design system",
  /** Its line: what it asks, with what a build would read listed ("a, b and c"), or nothing. */
  designLine: (from: string) =>
    from.length > 0
      ? `This work needs a design system. Build one from ${from}?`
      : "This work needs a design system. Build one?",
  build: "Build",
  filing: "Filing…",
  notNowPending: "Not now…",
  /** What was answered: Build filed the task. */
  filed: "Filed",
  open: "Open",
};
