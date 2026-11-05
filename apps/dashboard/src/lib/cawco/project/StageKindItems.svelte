<!--
  A stage's kind, as radio items of the house menu it stands in: the six
  kinds the board knows (core STAGE_KINDS), in words.
-->
<script lang="ts">
  import type { StageKind } from "@cawco/core/views";
  import { STAGE_KINDS } from "@cawco/core/views";
  import { setupPageWords as words } from "@cawco/core/words/onboarding";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";

  let {
    kind,
    onkind,
  }: {
    kind: StageKind;
    onkind: (next: StageKind) => void;
  } = $props();
</script>

<DropdownMenu.RadioGroup
  onValueChange={(next) => {
    const picked = STAGE_KINDS.find((one) => one === next);
    if (picked && picked !== kind) {
      onkind(picked);
    }
  }}
  value={kind}
>
  {#each STAGE_KINDS as one (one)}
    <DropdownMenu.RadioItem value={one}>
      <span>{words.kinds[one]}</span>
    </DropdownMenu.RadioItem>
  {/each}
</DropdownMenu.RadioGroup>
