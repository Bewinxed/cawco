/**
 * What a stage's refusals are, apart from the stage itself: the stage
 * (stage.ts) throws them, its place's clone (stage-clone.ts) too, and a
 * preview's listener (preview.ts) tells them apart to name the hop that is
 * down.
 */

/** What `artifact_create` and the agent are told when a sheet cannot run, and why. */
export class StageRefusal extends Error {}

/**
 * A stage refused because the workspace it runs in is not on this machine
 * any more (archived, discarded), or the folder a place names went with
 * one (stage-clone.ts `stageCloneOf`): nothing here can start its server
 * again, so its preview says its workspace is gone (core `PreviewDown`
 * `gone`), never that the way to it failed (agent preview.ts `staged`,
 * `pinged`).
 */
export class WorkspaceNotHere extends StageRefusal {}
