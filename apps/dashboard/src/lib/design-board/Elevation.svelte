<script lang="ts">
  /**
   * The surface ladder in use: real surfaces (ui/elevated, the primitive every
   * kit popover, menu, dialog and sheet stands on) opened inside each other.
   * Each takes its level from the one it opens in, so the levels shown are
   * the ones the product draws, each read from the surface it stands in.
   */
  import { Elevated } from "#lib/components/ui/elevated/index.js";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
  import { IconCpu, IconFolder, IconKey } from "#lib/icons.js";
  import LevelTag from "./LevelTag.svelte";
</script>

{#snippet item(label: string, Icon: typeof IconCpu)}
  <div
    class={[
      menuItemVariants(),
      "flex items-center gap-space-2 rounded-xs px-space-2 type-label",
    ]}
  >
    <Icon class="size-icon-md" data-box />
    {label}
  </div>
{/snippet}

<div class="grid gap-space-6 @phone:grid-cols-2">
  <figure class="flex min-w-0 flex-col gap-space-2">
    <figcaption class="text-tx-2 type-meta">
      A menu from a popover over a panel
    </figcaption>
    <div class="relative rounded-lg p-space-4">
      <LevelTag />
      <p class="text-tx-2 type-meta">The page</p>
      <Elevated look="panel" class="mt-space-3">
        <LevelTag />
        <p class="type-label">Machines</p>
        <p class="text-tx-2 type-meta">A panel in the page's flow</p>
        <div class="ms-space-6 mt-space-3 w-60">
          <Elevated>
            <LevelTag />
            {@render item("obelisk-of-light", IconCpu)}
            {@render item("studio-mac", IconCpu)}
            <div class="ms-space-8 mt-space-2 w-52">
              <Elevated>
                <LevelTag />
                {@render item("Move here", IconFolder)}
                {@render item("Sign in again", IconKey)}
              </Elevated>
            </div>
          </Elevated>
        </div>
      </Elevated>
    </div>
  </figure>

  <figure class="flex min-w-0 flex-col gap-space-2">
    <figcaption class="text-tx-2 type-meta">A list from a dialog</figcaption>
    <div class="relative rounded-lg p-space-4">
      <LevelTag />
      <p class="text-tx-2 type-meta">The page</p>
      <Elevated look="dialog" class="mt-space-3">
        <LevelTag />
        <p class="type-title">Add a machine</p>
        <p class="text-tx-2 type-body">Pick where it joins from.</p>
        <div class="ms-space-6 mt-space-3 w-56">
          <Elevated>
            <LevelTag />
            {@render item("Tailnet", IconCpu)}
            {@render item("This network", IconCpu)}
          </Elevated>
        </div>
      </Elevated>
    </div>
  </figure>
</div>
