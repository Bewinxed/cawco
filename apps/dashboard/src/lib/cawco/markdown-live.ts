/**
 * The live fleet markdown reads (markdown-fleet.ts): references drawn by
 * the dashboard's registry (references.ts), whose chips read the store, and
 * the skill chip. The app's hosts provide it: the app's layout, a project
 * view's page, and an artifact's pane once its comment kit has loaded.
 */
import type { MarkdownFleet } from "./markdown-fleet";
import { referenceOf } from "./references";
import SkillChip from "./SkillChip.svelte";

export const liveMarkdown: MarkdownFleet = { referenceOf, SkillChip };
