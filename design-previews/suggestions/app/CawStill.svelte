<!--
  Caw's still at a size: by day his day still, by night his still drawn on
  the paper rim (the Caw panel preview's caw-ready pair), so his near-black
  body stands clear of the night's near-black ground. His 28px head mark at
  night takes the still whose rim is grown to a device pixel there
  (night-mark.py). The theme shows one.
-->
<script lang="ts">
  let { size, class: className = "" }: { size: number; class?: string } = $props();
</script>

<img
  alt=""
  class="{className} caw-still day"
  height={size}
  src="caw/caw-ready-day.png"
  width={size}
/><img
  alt=""
  class="{className} caw-still night"
  height={size}
  src="caw/caw-ready-night{size < 48 ? '-mark' : ''}.png"
  width={size}
/>
