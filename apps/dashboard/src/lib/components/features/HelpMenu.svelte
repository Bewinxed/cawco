<script lang="ts">
  import type { AvailableCommand } from "@whiffle/core";
  import { Tabs } from "bits-ui";
  import { quintOut } from "svelte/easing";
  import { fly } from "svelte/transition";
  import { buttonVariants } from "$lib/components/ui/button";
  import { IconChevronRight } from "$lib/icons";
  import { cn } from "$lib/utils";

  interface Props {
    commands: AvailableCommand[];
    onClose?: () => void;
    version: string;
  }

  let { version, commands, onClose }: Props = $props();

  type Tab = "general" | "commands" | "custom-commands";
  let activeTab = $state<Tab>("general");

  const tabs: Tab[] = ["general", "commands", "custom-commands"];
  const tabLabels: Record<Tab, string> = {
    general: "General",
    commands: "Commands",
    "custom-commands": "Custom commands",
  };

  // Ghost by default, the `outline` look once bits marks the trigger active.
  const triggerClass = cn(
    buttonVariants({ variant: "ghost", size: "sm" }),
    "h-6 px-2 text-meta",
    "data-[state=active]:border data-[state=active]:bg-background data-[state=active]:shadow-2xs",
    // Outranks the flat active background, the way `outline`'s hover outranked its own.
    "data-[state=active]:hover:bg-accent data-[state=active]:hover:text-accent-foreground",
    "dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:hover:bg-input/50"
  );

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose?.();
    }
  }

  // Filter commands by type
  const builtinCommands = $derived(
    commands.filter((c) => c.type === "builtin")
  );
  const customCommands = $derived(commands.filter((c) => c.type === "custom"));
  const skillCommands = $derived(commands.filter((c) => c.type === "skill"));
  const mcpCommands = $derived(commands.filter((c) => c.type === "mcp"));

  // Shortcuts data - matches Claude CLI
  const shortcuts = [
    { key: "!", description: "for bash mode" },
    { key: "/", description: "for commands" },
    { key: "@", description: "for file paths" },
    { key: "&", description: "for background" },
  ];

  const keyboardShortcuts = [
    { key: "double tap esc", description: "to clear input" },
    { key: "ctrl + o", description: "for verbose output" },
    { key: "ctrl + t", description: "to show todos" },
    { key: "tab", description: "to toggle thinking" },
    { key: "ctrl + _", description: "to undo" },
    { key: "ctrl + z", description: "to suspend" },
  ];
</script>

<svelte:window onkeydown={handleKeydown} />

<Tabs.Root
  class="font-mono text-label bg-background border border-border rounded-[var(--radius-md)] overflow-hidden"
  loop
  onValueChange={(value) => {
    activeTab = value as Tab;
  }}
  value={activeTab}
>
  <!-- Header with tabs -->
  <div
    class="flex items-center gap-4 px-4 py-2 bg-accent text-accent-foreground border-b border-border"
  >
    <span class="text-foreground font-medium">Claude Code v{version}</span>
    <Tabs.List
      aria-label="Help sections"
      class="flex items-center gap-1 text-muted-foreground"
    >
      {#each tabs as tab, i (tab)}
        <Tabs.Trigger class={triggerClass} value={tab}>
          {tabLabels[tab]}
        </Tabs.Trigger>
        {#if i < tabs.length - 1}
          <span class="text-muted-foreground/50">|</span>
        {/if}
      {/each}
    </Tabs.List>
    <span class="text-muted-foreground text-meta ml-auto">(← → to cycle)</span>
  </div>

  <!-- Content -->
  <div class="p-4 min-h-[200px]">
    <Tabs.Content value="general">
      {#key activeTab}
        <!-- Shortcuts section -->
        <div
          class="space-y-4"
          in:fly={{ x: 8, duration: 200, easing: quintOut }}
        >
          <h3 class="text-muted-foreground text-meta uppercase tracking-wide">
            Shortcuts
          </h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
            <!-- Left column: prefix shortcuts -->
            <div class="space-y-1">
              {#each shortcuts as shortcut (shortcut.key)}
                <div class="flex items-center gap-2">
                  <span class="text-primary font-medium w-4 text-center"
                    >{shortcut.key}</span
                  >
                  <span class="text-muted-foreground"
                    >{shortcut.description}</span
                  >
                </div>
              {/each}
            </div>

            <!-- Right column: keyboard shortcuts -->
            <div class="space-y-1">
              {#each keyboardShortcuts as shortcut (shortcut.key)}
                <div class="flex items-center gap-2">
                  <span class="text-muted-foreground">{shortcut.key}</span>
                  <span class="text-muted-foreground"
                    >{shortcut.description}</span
                  >
                </div>
              {/each}
            </div>
          </div>

          <!-- vim mode indicator (if applicable) -->
          <div class="pt-2 border-t border-border/50">
            <span class="text-muted-foreground text-meta">? for shortcuts</span>
          </div>
        </div>
      {/key}
    </Tabs.Content>

    <Tabs.Content value="commands">
      {#key activeTab}
        <!-- Built-in commands list -->
        <div
          class="space-y-3"
          in:fly={{ x: 8, duration: 200, easing: quintOut }}
        >
          <h3 class="text-muted-foreground text-meta uppercase tracking-wide">
            Built-in Commands
          </h3>

          <div class="space-y-1">
            {#each builtinCommands as cmd (cmd.name)}
              <div class="flex items-start gap-2 group">
                <span class="text-primary font-medium">{cmd.name}</span>
                {#if cmd.description}
                  <span class="text-muted-foreground">-</span>
                  <span class="text-muted-foreground">{cmd.description}</span>
                {/if}
              </div>
            {/each}
          </div>

          {#if skillCommands.length > 0}
            <div class="pt-2 mt-2 border-t border-border/50">
              <h3
                class="text-muted-foreground text-meta uppercase tracking-wide mb-2"
              >
                Skills
              </h3>
              <div class="space-y-1">
                {#each skillCommands as cmd (cmd.name)}
                  <div class="flex items-start gap-2 group">
                    <span class="text-primary font-medium">{cmd.name}</span>
                    {#if cmd.description}
                      <span class="text-muted-foreground">-</span>
                      <span class="text-muted-foreground"
                        >{cmd.description}</span
                      >
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if mcpCommands.length > 0}
            <div class="pt-2 mt-2 border-t border-border/50">
              <h3
                class="text-muted-foreground text-meta uppercase tracking-wide mb-2"
              >
                MCP Tools
              </h3>
              <div class="space-y-1">
                {#each mcpCommands as cmd (cmd.name)}
                  <div class="flex items-start gap-2 group">
                    <span class="text-warning font-medium">{cmd.name}</span>
                    {#if cmd.description}
                      <span class="text-muted-foreground">-</span>
                      <span class="text-muted-foreground"
                        >{cmd.description}</span
                      >
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/key}
    </Tabs.Content>

    <Tabs.Content value="custom-commands">
      {#key activeTab}
        <!-- Custom commands list -->
        <div
          class="space-y-3"
          in:fly={{ x: 8, duration: 200, easing: quintOut }}
        >
          <h3 class="text-muted-foreground text-meta uppercase tracking-wide">
            Custom Commands
          </h3>

          {#if customCommands.length === 0}
            <div class="text-muted-foreground py-4">
              <p>No custom commands defined.</p>
              <p class="mt-2 text-meta">
                Create custom commands by adding
                <code class="bg-accent text-accent-foreground px-1 rounded"
                  >.md</code
                >
                files to:
              </p>
              <p class="text-meta mt-1">
                <code class="bg-accent text-accent-foreground px-1 rounded"
                  >.claude/commands/</code
                >
              </p>
            </div>
          {:else}
            <div class="space-y-1">
              {#each customCommands as cmd (cmd.name)}
                <div class="flex items-start gap-2 group">
                  <IconChevronRight
                    class="w-3 h-3 text-muted-foreground mt-1 shrink-0"
                  />
                  <span class="text-success font-medium">{cmd.name}</span>
                  {#if cmd.description}
                    <span class="text-muted-foreground">-</span>
                    <span class="text-muted-foreground">{cmd.description}</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/key}
    </Tabs.Content>
  </div>

  <!-- Footer -->
  <div
    class="px-4 py-2 border-t border-border bg-accent/50 text-foreground text-meta flex items-center justify-between"
  >
    <span>
      Press
      <kbd class="px-1 py-0.5 bg-card border border-border rounded text-meta"
        >←</kbd
      >
      <kbd class="px-1 py-0.5 bg-card border border-border rounded text-meta"
        >→</kbd
      >
      to switch tabs
    </span>
    <span
      >Press
      <kbd class="px-1 py-0.5 bg-card border border-border rounded text-meta"
        >Esc</kbd
      >
      to close</span
    >
  </div>
</Tabs.Root>
