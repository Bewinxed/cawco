<script lang="ts">
  /**
   * Attach's menu (AttachButton, where a session can draw) with Find in it
   * (frame, shaping only): the way into find for a pointer and a finger.
   */
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconArtifactCanvas, IconPaperclip, IconSearch } from "#lib/icons.js";

  let { onfind }: { onfind: () => void } = $props();
</script>

<DropdownMenu.Content align="end" side="top">
  <DropdownMenu.Item>
    <IconPaperclip />
    <span>Files and photos</span>
  </DropdownMenu.Item>
  <DropdownMenu.Item>
    <IconArtifactCanvas />
    <span>Draw</span>
    <DropdownMenu.Shortcut>⌘⇧D</DropdownMenu.Shortcut>
  </DropdownMenu.Item>
  <DropdownMenu.Item onSelect={onfind}>
    <IconSearch />
    <span>Find</span>
    <DropdownMenu.Shortcut>⌘F</DropdownMenu.Shortcut>
  </DropdownMenu.Item>
</DropdownMenu.Content>
