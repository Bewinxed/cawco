<script lang="ts">
  /**
   * Every address the device answers at, each ready to open, and to copy
   * where this dashboard has a clipboard (https or localhost; at the plain
   * word the browser grants none, so Copy is not offered and the address
   * selects whole on a press instead). The short word is plain http; the
   * long name is https once the network issues certificates. On NetBird
   * the bare word needs its admin's search domain first, and says so.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { UseClipboard } from "#lib/hooks/use-clipboard.svelte.js";
  import { IconCopy, IconExternal, IconLock } from "#lib/icons.js";
  import type { AddressTray } from "./tray.svelte";

  let { tray }: { tray: AddressTray } = $props();

  /**
   * Copy is the same kit button as Open beside it (size, variant, its icon
   * slot and label), so the two stand on one box and one baseline; it says
   * Copied on the row it copied.
   */
  const clipboard = new UseClipboard();
  let copied = $state<string | null>(null);
  function copy(address: string): void {
    copied = address;
    clipboard.copy(address);
  }
  const copyLabel = (address: string): string => {
    if (copied !== address || clipboard.status === undefined) {
      return "Copy";
    }
    return clipboard.status === "success" ? "Copied" : "Copy failed";
  };

  const rows = $derived([
    {
      address: tray.short,
      secure: false,
      waits: tray.bareWordWorks
        ? null
        : `Needs ${tray.facts.domain} as a search domain`,
    },
    {
      address: tray.longAddress,
      secure: tray.longAddress.startsWith("https"),
      waits: null,
    },
  ]);
</script>

<!-- biome-ignore-start lint/a11y/noRedundantRoles : WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list). -->
<ul
  class="m-0 grid list-none overflow-hidden rounded-well border border-border-well bg-surface-well p-0"
  data-slot="address-list"
  role="list"
>
  <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
  {#each rows as row (row.address)}
    <li
      class="flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1 border-b border-b-border-hairline py-space-1 ps-space-3 pe-space-1 last:border-b-0"
      data-waits={row.waits ? "" : undefined}
    >
      <span class="mark-line flex min-w-0 flex-1 items-center gap-space-1">
        {#if row.secure}
          <IconLock
            aria-label="Secure"
            class="size-icon-sm flex-none text-status-done-ink"
          />
        {/if}
        <code
          class="min-w-0 type-code whitespace-nowrap text-ink-strong select-all data-waits:text-ink-muted"
          data-waits={row.waits ? "" : undefined}>{row.address}</code
        >
      </span>
      {#if row.waits}
        <span class="type-meta text-ink-muted">{row.waits}</span>
      {:else}
        <span class="flex flex-none items-center gap-space-1">
          <Button
            data-address-open
            href={row.address}
            icon={IconExternal}
            label="Open"
            rel="noopener"
            size="xs"
            target="_blank"
            variant="ghost"
          />
          {#if tray.overHttps}
            <Button
              data-address-copy
              icon={IconCopy}
              label={copyLabel(row.address)}
              onclick={() => copy(row.address)}
              size="xs"
              variant="ghost"
            />
          {/if}
        </span>
      {/if}
    </li>
  {/each}
</ul>
