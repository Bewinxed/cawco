<script lang="ts">
  let { title = "Approve the deploy" }: { title?: string } = $props();
</script>

<!-- A size container, as the owner's approval card is: its own width comes from its frame, never from its words. -->
<article class="approval">
  <p class="title">{title}</p>
</article>

<style>
  .approval {
    container-type: inline-size;
    padding: 12px;
    border-radius: var(--radius);
    background: light-dark(#eef2f7, #1f2630);
  }
  .title {
    margin: 0;
    font: 500 14px/1.4 system-ui, sans-serif;
  }
</style>
