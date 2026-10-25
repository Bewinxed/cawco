<script lang="ts">
  // Checked: Solar's check-read, its two ticks without the squircle Solar
  // ships them in (DESIGN.md, The Solar Duotone Rule; the owner, 10-24: "u
  // need to draw similar style icons that are without their containers"), its
  // paths verbatim: the leading tick at full ink, the second at half.
  import type { SVGAttributes } from "svelte/elements";

  let { ...rest }: SVGAttributes<SVGSVGElement> = $props();
</script>

<svg
  aria-hidden="true"
  height="1.2em"
  viewBox="0 0 24 24"
  width="1.2em"
  xmlns="http://www.w3.org/2000/svg"
  {...rest}
>
  <g fill="currentColor">
    <path
      d="M14.581 9.47431C14.843 9.15343 14.7952 8.68097 14.4743 8.41903C14.1534 8.15709 13.681 8.20487 13.419 8.52574L8.28574 14.814L6.58102 12.7257C6.31908 12.4049 5.84662 12.3571 5.52574 12.619C5.20487 12.881 5.15709 13.3534 5.41903 13.6743L7.70474 16.4743C7.84718 16.6488 8.0605 16.75 8.28574 16.75C8.51098 16.75 8.7243 16.6488 8.86673 16.4743L14.581 9.47431Z"
    />
    <path
      d="M18.581 9.47431C18.843 9.15344 18.7952 8.68098 18.4743 8.41903C18.1534 8.15709 17.681 8.20486 17.419 8.52573L12.2514 14.8559C12.0385 14.7803 11.7939 14.8014 11.5901 14.9345C11.2432 15.1609 11.1456 15.6256 11.372 15.9724L11.6575 16.4099C11.7883 16.6103 12.0068 16.7362 12.2457 16.749C12.4846 16.7617 12.7153 16.6597 12.8666 16.4743L18.581 9.47431Z"
      opacity=".5"
    />
  </g>
</svg>
