<script lang="ts">
  /**
   * The project ⋯ menu's upstream choice (ProjectHead): Other people's
   * repositories, opening onto its three answers. Same as the fleet names
   * the fleet's answer under it (unanswered reads as allowed, as the gate
   * judges it); the other two are the project's own. `onchange` gets the
   * project's new answer, null for the fleet's.
   */
  import { UPSTREAM_WORDS } from "@cawco/core/upstream-guard";
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
    posts: boolean | null;
    /** The fleet's answer; null while nobody has answered it, undefined until the hub's is read. */
    fleet: boolean | null | undefined;
    onchange: (posts: boolean | null) => void;
    open?: boolean;
  } = $props();

  const value = $derived.by(() => {
    if (posts === null) {
      return "fleet";
    }
    return posts ? "on" : "off";
  });
  const fleetWords = $derived(
    fleet === false ? UPSTREAM_WORDS.keepOff : UPSTREAM_WORDS.allow
  );

  function choose(next: string): void {
    const chosen = next === "fleet" ? null : next === "on";
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
      <DropdownMenu.RadioItem value="off"
        >{UPSTREAM_WORDS.keepOff}</DropdownMenu.RadioItem
      >
      <DropdownMenu.RadioItem value="on"
        >{UPSTREAM_WORDS.allow}</DropdownMenu.RadioItem
      >
    </DropdownMenu.RadioGroup>
  </DropdownMenu.SubContent>
</DropdownMenu.Sub>
