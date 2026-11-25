<script lang="ts">
  /**
   * A section's states file's frame: what it wraps stands in its section's
   * card (SettingsSection) on the 4px base the Settings view wears, at one
   * column's width, as the view draws it. A story's decorator mounts it
   * (section-frame.ts `inSettingsCard`); the app never does.
   */
  import { settingsViewWords as words } from "@cawco/core/words/settings-view";
  import type { Snippet } from "svelte";
  import type { SectionId } from "./changes";
  import SettingsSection from "./SettingsSection.svelte";

  let { section, children }: { section: SectionId; children: Snippet } =
    $props();
</script>

<div class="max-w-137 p-space-4">
  <SettingsSection id={section} state="settled" title={words.sections[section]}>
    {@render children()}
  </SettingsSection>
</div>
