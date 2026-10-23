<script lang="ts" module>
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";

  /**
   * The screen's shape, width over height: a phone's from the bench's phone
   * (`c-bench-phone-w` by `c-bench-phone-h`), an iPad's regular width 4:3.
   */
  export const screenShape = (wide: boolean): number =>
    wide
      ? 4 / 3
      : (numberOf("--c-bench-phone-w") || 390) /
        (numberOf("--c-bench-phone-h") || 844);
</script>

<script lang="ts">
  /**
   * A stand-in for the iOS app's Project page, drawn from the dashboard's
   * own phone-width Project page parts (NeedsYouChip, TaskCardFace, the kit's
   * buttons), because no capture of the app is committed and the app is on
   * hold. Each part that stands for a view in the app's tree carries that
   * view's node (`data-node`, its class; `data-node-label`), so a tree drawn
   * over it (NodeTree) reads its boxes from what is drawn, as a tree read
   * from the app's accessibility tree would.
   *
   * `pressed` draws the Needs you filter on (the tap's state), `scheme` the
   * app's appearance, `wide` an iPad's regular width: the projects list
   * beside the page.
   */
  import NeedsYouChip from "#lib/cawco/project/NeedsYouChip.svelte";
  import TaskCardFace from "#lib/cawco/tasks/TaskCardFace.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronLeft, IconMore } from "#lib/icons.js";
  import { PICKED, WORKING } from "./fixture";

  let {
    pressed = false,
    scheme = "light",
    wide = false,
    root = $bindable(),
  }: {
    /** The Needs you filter on: the screen after the tap. */
    pressed?: boolean;
    /** The app's appearance. */
    scheme?: "light" | "dark";
    /** An iPad's regular width: the projects list beside the page. */
    wide?: boolean;
    /** The screen's box, for the tree drawn over it. */
    root?: HTMLElement;
  } = $props();

  const PROJECTS = ["CawCo iOS", "Dashboard", "Hub"];
  const noop = () => undefined;
</script>

<div
  bind:this={root}
  class={[
    "@container/app relative flex size-full min-h-0 min-w-0 overflow-hidden bg-surface-page text-ink-strong",
    scheme === "dark" ? "dark scheme-dark" : "scheme-light",
  ]}
  data-node="UIWindow"
  data-node-label="Project page"
  data-slot="app-stand-in"
>
  {#if wide}
    <nav
      aria-label="Projects"
      class="flex w-1/3 flex-none flex-col gap-space-1 border-e border-e-border-hairline bg-surface-raised p-space-2"
      data-node="UITableView"
      data-node-label="Projects"
    >
      <span class="px-space-2 py-space-1 text-ink-muted type-meta"
        >Projects</span
      >
      {#each PROJECTS as name, at (name)}
        <span
          class={[
            "truncate rounded-sm px-space-2 py-space-1 type-label",
            at === 0 ? "bg-selected-bg text-selected-ink" : "text-ink-row",
          ]}
          data-node="UITableViewCell"
          data-node-label={name}>{name}</span
        >
      {/each}
    </nav>
  {/if}
  <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-space-3 p-space-3">
    <div
      class="flex flex-none items-center gap-space-1"
      data-node="UINavigationBar"
      data-node-label="Project"
    >
      {#if !wide}
        <span data-node="UIButton" data-node-label="Back to Projects">
          <Button pad="none" size="sm" variant="ghost"
            ><IconChevronLeft /><span>Projects</span></Button
          >
        </span>
      {/if}
      <span class="flex-1"></span>
      <span data-node="UIButton" data-node-label="More">
        <Button
          aria-label="More"
          icon={IconMore}
          size="icon-sm"
          variant="ghost"
        />
      </span>
    </div>
    <h2
      class="m-0 flex-none truncate type-title"
      data-node="UILabel"
      data-node-label="CawCo iOS"
    >
      CawCo iOS
    </h2>
    <span
      class="flex flex-none *:flex-1"
      data-node={PICKED.kind}
      data-node-label={PICKED.label}
      data-node-picked
    >
      <NeedsYouChip count={3} on={pressed} ontoggle={noop} />
    </span>
    <!-- The list fills the screen to its foot; a card that would cross the
         foot wraps into a column past the screen's edge, so the screen ends
         on whole cards, never on a sliced line. -->
    <!-- mark-line: a column of a heading over task cards; no mark stands beside its words -->
    <div
      class="flex min-h-0 flex-1 flex-col flex-wrap content-start gap-space-2 overflow-hidden *:w-full"
    >
      <span
        class="border-b border-b-border-hairline pb-space-1 text-ink-muted type-label"
        data-node="UILabel"
        data-node-label="Working">Working</span
      >
      {#each WORKING as one (one.id)}
        <div
          class="grid"
          data-node="UICollectionViewCell"
          data-node-label={one.title}
        >
          <TaskCardFace
            approves={false}
            asks={false}
            failed={one.lastAttemptFailed}
            href={`#${one.id}`}
            live={one.liveAttempt}
            onclick={(event) => event.preventDefault()}
            retry={false}
            startProblem={one.startProblem}
            task={one}
            waitsOn={[]}
          />
        </div>
      {/each}
    </div>
  </div>
</div>
