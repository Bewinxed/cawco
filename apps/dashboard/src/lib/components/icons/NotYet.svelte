<script lang="ts">
  // Not yet: a step or fact not reached. Solar ships its ring only round a
  // glyph (record-circle) or with a centre dot (circle-dot-dashed), and an icon
  // is the glyph alone (DESIGN.md, The Solar Duotone Rule; the owner, 10-24:
  // "u need to draw similar style icons that are without their containers").
  // This is Solar's circle-dot-dashed-linear dash path verbatim, its centre
  // dot dropped: a dotted ring, full ink, drawn like Close.svelte (24px grid,
  // 1.5 linear stroke, round caps and joins).
  import type { SVGAttributes } from "svelte/elements";

  let { ...rest }: SVGAttributes<SVGSVGElement> = $props();
</script>

<svg
  aria-hidden="true"
  fill="none"
  height="1.2em"
  viewBox="0 0 24 24"
  width="1.2em"
  xmlns="http://www.w3.org/2000/svg"
  {...rest}
>
  <path
    d="M20.3068 6.42903C19.951 5.89982 19.5392 5.39709 19.0713 4.92919C18.6034 4.4613 18.1007 4.04946 17.5715 3.69369M21.8131 13.9343C21.9357 13.3085 22 12.6618 22 12.0001C22 11.3384 21.9357 10.6917 21.8131 10.0659M17.571 20.3068C18.1002 19.951 18.6029 19.5392 19.0708 19.0713C19.5387 18.6034 19.9505 18.1007 20.3063 17.5715M10.0657 21.8131C10.6915 21.9357 11.3382 22 11.9999 22C12.6616 22 13.3083 21.9357 13.9341 21.8131M3.69321 17.571C4.04898 18.1002 4.46082 18.6029 4.92872 19.0708C5.39661 19.5387 5.89934 19.9505 6.42855 20.3063M2.18691 10.0657C2.06427 10.6915 2 11.3382 2 11.9999C2 12.6616 2.06427 13.3083 2.18691 13.9341M6.42903 3.69321C5.89982 4.04898 5.39709 4.46082 4.92919 4.92872C4.4613 5.39661 4.04946 5.89934 3.69369 6.42855M13.9343 2.18691C13.3085 2.06427 12.6618 2 12.0001 2C11.3384 2 10.6917 2.06427 10.0659 2.18691"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="1.5"
  />
</svg>
