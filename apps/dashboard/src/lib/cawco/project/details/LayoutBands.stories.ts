/**
 * Layout 3: bands, 780 px. Files and locations beside Task list; Finished
 * code across as one strip of four, its head and line on one line; AI
 * account beside Codebases and big files; 24 px between sections.
 * The card as it opens on a 1024×768 laptop, hung from the project's head
 * over the stand-in hub, with four folders and GitHub Issues connected
 * (card-layout.ts; Gemini's proposal, 2026-11-20).
 */
import { layoutArgs, liveStores } from "./live-story";
import ProjectDetailsLive from "./project-details-live.svelte";

export default {
  title: "Project details/Layouts/Bands",
  component: ProjectDetailsLive,
  args: layoutArgs("bands"),
  parameters: { viewport: 1024 },
};

/** My project's details on a 1024×768 laptop, laid out in bands. */
export const Live = { beforeEach: liveStores };
