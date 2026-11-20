/**
 * Layout 1: two independent columns, 820 px. Files and locations over Task
 * list; AI account over Finished code over Codebases and big files; 24 px
 * between sections; Task list as one-line rows, its sync facts in three
 * tiers.
 * The card as it opens on a 1024×768 laptop, hung from the project's head
 * over the stand-in hub, with four folders and GitHub Issues connected
 * (card-layout.ts; Gemini's proposal, 2026-11-20).
 */
import { layoutArgs, liveStores } from "./live-story";
import ProjectDetailsLive from "./project-details-live.svelte";

export default {
  title: "Project details/Layouts/Two columns",
  component: ProjectDetailsLive,
  args: layoutArgs("two-columns"),
  parameters: { viewport: 1024 },
};

/** My project's details on a 1024×768 laptop, laid out in two columns. */
export const Live = { beforeEach: liveStores };
