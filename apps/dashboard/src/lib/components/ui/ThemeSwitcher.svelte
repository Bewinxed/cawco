<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import Tip from "$lib/components/ui/tooltip/tip.svelte";
  import { IconMoon, IconSun } from "$lib/icons";
  import { theme, toggleTheme } from "$lib/theme.svelte";

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
      <span class="icon-swap size-4">
        <span data-active={isDark}><IconMoon class="size-4" /></span>
        <span data-active={!isDark}><IconSun class="size-4" /></span>
      </span>
    </Button>
  {/snippet}
</Tip>
