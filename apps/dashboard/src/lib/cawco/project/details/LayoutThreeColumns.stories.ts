/**
 * Layout 2: three columns, 940 px. Files and locations over Codebases and
 * big files; AI account over Finished code; Task list alone; 28 px between
 * sections; Finished code and Task list as rows.
 * The card as it opens on a 1024×768 laptop, hung from the project's head
 * over the stand-in hub, with four folders and GitHub Issues connected
 * (card-layout.ts; Gemini's proposal, 2026-11-20).
 */
import { layoutArgs, liveStores } from "./live-story";
import ProjectDetailsLive from "./project-details-live.svelte";

export default {
  title: "Project details/Layouts/Three columns",
  component: ProjectDetailsLive,
  args: layoutArgs("three-columns"),
  parameters: { viewport: 1024 },
};

/** My project's details on a 1024×768 laptop, laid out in three columns. */
export const Live = { beforeEach: liveStores };
