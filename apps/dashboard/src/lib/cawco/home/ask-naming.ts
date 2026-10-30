/**
 * How Needs you names a parked ask (home-state.svelte.ts `needs`), apart from
 * the fleet store so its sheet (NeedsCard.stories.ts) names one the same way.
 */
import type { PermissionPresentation } from "@cawco/core/permission-presentation";

/**
 * An ask's title and second line: a held post by its own title over where it
 * goes (owner/repo#n); any other ask by `titled` (its session or who
 * asked) over what it asks.
 */
export const askNaming = (
  presentation: PermissionPresentation,
  titled: () => string
): { ask: string; title: string } =>
  presentation.post
    ? { title: presentation.post.title, ask: presentation.post.target }
    : { title: titled(), ask: presentation.summary };
