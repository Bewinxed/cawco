<script lang="ts">
  import OwnToolsSection from "#lib/cawco/config/own-tools/OwnToolsSection.svelte";
  import { boardStore } from "#lib/cawco/stores/board.svelte.js";
  import {
    chooseOwnTool,
    ownToolsStore,
  } from "#lib/cawco/stores/own-tools.svelte.js";
</script>

<OwnToolsSection
  chosen={ownToolsStore.read ? ownToolsStore.shown : null}
  faults={{
    helpers: ownToolsStore.faultOf("helpers"),
    stepLists: ownToolsStore.faultOf("stepLists"),
  }}
  onchoose={chooseOwnTool}
  phases={{
    helpers: ownToolsStore.phaseOf("helpers"),
    stepLists: ownToolsStore.phaseOf("stepLists"),
  }}
  running={boardStore.runningInstances.length}
  unread={ownToolsStore.unread}
/>
