<!--
  OpenCode's published square logo (https://opencode.ai/brand, "logo light
  square" and "logo dark square": opencode-logo-{light,dark}-square.svg under
  packages/console/app/src/asset/brand in anomalyco/opencode). The two files
  are one shape in two colourings, so `light-dark()` picks the colouring for
  the theme. The colours are the brand's, not tokens.
-->
<svg aria-hidden="true" fill="none" viewBox="0 0 300 300">
  <!-- The glyph is 240 wide in its 300 square, inset 30 from the left. -->
  <g transform="translate(30)">
    <path class="core" d="M180 240H60V120H180V240Z" />
    <path
      class="frame"
      d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z"
      fill-rule="evenodd"
    />
  </g>
</svg>

<style>
  .core {
    fill: light-dark(#cfcecd, #4b4646);
  }
  .frame {
    fill: light-dark(#211e1e, #f1ecec);
  }
</style>
