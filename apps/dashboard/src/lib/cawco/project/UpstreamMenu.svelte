<script lang="ts">
  /**
   * The project ⋯ menu's upstream choice (ProjectHead): Other people's
   * repositories, opening onto its four answers. Same as the fleet names
   * the fleet's answer under it (unanswered reads as allowed, as the gate
   * judges it); the other three are the project's own: keep off, ask me
   * first (each post waits in Needs you), let them post. `onchange` gets
   * the project's new answer, null for the fleet's.
   */
  import {
    UPSTREAM_POSTS,
    UPSTREAM_WORDS,
    type UpstreamPosts,
    upstreamPostsWords,
  } from "@cawco/core/upstream-guard";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconShield } from "#lib/icons.js";

  let {
    posts,
    fleet,
    onchange,
    open = $bindable(false),
  }: {
    /** The project's own answer; null while it takes the fleet's. */
    posts: UpstreamPosts | null;
    /** The fleet's answer; null while nobody has answered it, undefined until the hub's is read. */
    fleet: UpstreamPosts | null | undefined;
    onchange: (posts: UpstreamPosts | null) => void;
    open?: boolean;
  } = $props();

  const value = $derived(posts ?? "fleet");
  const fleetWords = $derived(upstreamPostsWords(fleet ?? "on"));

  function choose(next: string): void {
    const chosen = (UPSTREAM_POSTS as readonly string[]).includes(next)
      ? (next as UpstreamPosts)
      : null;
    if (chosen !== posts) {
      onchange(chosen);
    }
  }
</script>

<DropdownMenu.Sub bind:open>
  <DropdownMenu.SubTrigger>
    <IconShield />
    <span>{UPSTREAM_WORDS.title}</span>
  </DropdownMenu.SubTrigger>
  <DropdownMenu.SubContent width="wide">
    <DropdownMenu.RadioGroup onValueChange={choose} {value}>
      <!-- The fleet's answer under it, in meta ink: the row reads as
           "Same as the fleet", never as a second copy of the one below. -->
      <DropdownMenu.RadioItem value="fleet">
        <span class="flex min-w-0 flex-col" data-box>
          <span>{UPSTREAM_WORDS.inherit}</span>
          <span class="type-meta text-ink-muted">{fleetWords}</span>
        </span>
      </DropdownMenu.RadioItem>
      {#each UPSTREAM_POSTS as answer (answer)}
        <DropdownMenu.RadioItem value={answer}
          >{upstreamPostsWords(answer)}</DropdownMenu.RadioItem
        >
      {/each}
    </DropdownMenu.RadioGroup>
  </DropdownMenu.SubContent>
</DropdownMenu.Sub>
