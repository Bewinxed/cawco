/**
 * Tie tasks to a tracker (Component Story Format 3, live components): the
 * Standing card's face for keeping tasks in GitHub Issues or Linear. Pick
 * the connection, the repository or team, and for GitHub the Project that
 * carries stages, then Tie.
 */
import {
  KEPT_HERE,
  TIE_GITHUB,
  TIE_LINEAR,
  TIE_NO_CONNECTION,
  TIE_NO_STAGES,
  TIE_READING,
  TIE_REFUSED,
} from "./fixtures/records";
import { AT_REST, type StoryPlay, seedStores } from "./fixtures/stories";
import StandingCardInShell from "./standing-card-in-shell.svelte";

export default {
  title: "Project details/Tie tasks",
  component: StandingCardInShell,
  args: { ...AT_REST, face: "tie", tracker: KEPT_HERE },
  beforeEach: seedStores,
  parameters: { viewport: 1440 },
};

/** Tying to GitHub Issues: this project's repository, its stages on Atlas site roadmap. */
export const TieGithub = {
  from: "KeptHere",
  play: async ({ update }: StoryPlay) => {
    await update({ face: "tie", tie: TIE_GITHUB });
  },
};

/** The connections and repositories are still being read. */
export const ReadingConnections = { args: { tie: TIE_READING } };

/** No connection can serve GitHub yet, and where to add one. */
export const NoConnection = { args: { tie: TIE_NO_CONNECTION } };

/** The connection may not read Projects: no stages on GitHub, issues still sync. */
export const NoProjectStages = { args: { tie: TIE_NO_STAGES } };

/** GitHub refused the tie: its words, every choice kept. */
export const TieRefused = { args: { tie: TIE_REFUSED } };

/** Tying to Linear: a team in place of a repository, and no Project. */
export const TieLinear = { args: { tie: TIE_LINEAR } };
