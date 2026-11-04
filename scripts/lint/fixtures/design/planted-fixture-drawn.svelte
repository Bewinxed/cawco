<!--
  Planted mistake for house/follows-props (scripts/lint/fixtures/expected.txt):
  a fixture with no states file beside it that a states file names as its
  `component` (planted-fixture.stories.ts), seeding its state from a prop.
-->
<script lang="ts">
  import { untrack } from "svelte";

  let { routes: first = {} } = $props();

  let routes = $state(untrack(() => ({ ...first })));
</script>

<p>{Object.keys(routes).length}</p>
