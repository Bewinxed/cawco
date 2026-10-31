<script lang="ts" module>
  /**
   * A decision page's Caw on a fault face (fault/caw.ts): the kit's still
   * pictures of him in the page's scheme, as the page's head draws him
   * (Decisions.svelte), `needs-you`, then `trying` once the rebuild threw
   * again. Beside a line's words he stands whole at the line's size, from
   * the kit's small picture: the kit has no picture of his head.
   */
  import darkNeedsYou from "../../../../../../../packages/hub/skills/decision-page/kit/caw/dark-needs-you.webp";
  import darkNeedsYouSmall from "../../../../../../../packages/hub/skills/decision-page/kit/caw/dark-needs-you-56.webp";
  import darkTrying from "../../../../../../../packages/hub/skills/decision-page/kit/caw/dark-trying.webp";
  import darkTryingSmall from "../../../../../../../packages/hub/skills/decision-page/kit/caw/dark-trying-56.webp";
  import lightNeedsYou from "../../../../../../../packages/hub/skills/decision-page/kit/caw/light-needs-you.webp";
  import lightNeedsYouSmall from "../../../../../../../packages/hub/skills/decision-page/kit/caw/light-needs-you-56.webp";
  import lightTrying from "../../../../../../../packages/hub/skills/decision-page/kit/caw/light-trying.webp";
  import lightTryingSmall from "../../../../../../../packages/hub/skills/decision-page/kit/caw/light-trying-56.webp";
  import { scheme } from "./scheme.svelte.js";

  /** Each scheme's pictures: whole at 320px, and small at 56px for a line. */
  const STILLS = {
    dark: {
      needsYou: [darkNeedsYou, darkNeedsYouSmall],
      trying: [darkTrying, darkTryingSmall],
    },
    light: {
      needsYou: [lightNeedsYou, lightNeedsYouSmall],
      trying: [lightTrying, lightTryingSmall],
    },
  } as const;

  const stillOf = (pose: import("../../fault/caw").FaultCawPose): string =>
    STILLS[scheme.now === "dark" ? "dark" : "light"][
      pose.again ? "trying" : "needsYou"
    ][pose.head ? 1 : 0];

  export { stillCaw };
</script>

{#snippet stillCaw(pose: import("../../fault/caw").FaultCawPose)}
  <img
    alt=""
    class="block"
    height={pose.size}
    src={stillOf(pose)}
    width={pose.size}
  />
{/snippet}
