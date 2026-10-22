<script lang="ts">
  /**
   * Route: the one question that decides how a machine comes in, whether
   * the hub can sign in to it over SSH, with what each answer asks of the
   * person. Shown only when the entry point implied no route. A choice
   * turns the page to Reach on that route; the draft keeps it (the hub's).
   */
  import type { InstallRoute } from "@cawco/core";
  import { connect } from "./installs.svelte";

  const ROUTES: { route: InstallRoute; name: string; says: string }[] = [
    {
      route: "ssh",
      name: "Yes, over SSH",
      says: "The hub signs in and installs. It needs an address, maybe a password once.",
    },
    {
      route: "command",
      name: "No, by a command",
      says: "You run one line in a terminal on it. It needs an address it can reach the hub on.",
    },
  ];
</script>

<fieldset class="m-0 flex min-w-0 flex-col gap-space-3 border-0 p-0">
  <legend class="m-0 mb-space-3 p-0 type-body text-ink-strong">
    Can the hub sign in to it over SSH?
  </legend>
  <div class="grid grid-cols-2 gap-space-3">
    {#each ROUTES as choice (choice.route)}
      <button
        type="button"
        data-route={choice.route}
        class="select-none flex min-w-0 flex-col items-start gap-space-1 rounded-md border border-border-control bg-surface-raised p-space-4 text-start transition-control hover:bg-surface-hover press-tint focus-inset"
        onclick={() => connect.chooseRoute(choice.route)}
      >
        <span class="type-label text-ink-strong">{choice.name}</span>
        <span class="type-meta text-pretty text-ink-muted">{choice.says}</span>
      </button>
    {/each}
  </div>
</fieldset>
