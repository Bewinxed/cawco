<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMoon, IconSun } from "#lib/icons.js";
  import { theme, toggleTheme } from "#lib/theme.svelte.js";

  const themeLabels = {
    light: "Light mode",
    dark: "Dark mode",
    system: "System",
  };

  const isDark = $derived(theme.resolved === "dark");
  const label = $derived(themeLabels[theme.current] || "Light mode");
</script>

<Tip {label}>
  {#snippet children(tip)}
    <Button
      {...tip}
      aria-label={label}
      onclick={toggleTheme}
      size="icon-sm"
      variant="ghost"
    >
      <span class="icon-swap size-icon-md">
        <span data-active={isDark}><IconMoon class="size-icon-md" /></span>
        <span data-active={!isDark}><IconSun class="size-icon-md" /></span>
      </span>
    </Button>
  {/snippet}
</Tip>
