<!--
  OpenCode's own marks, one per theme, switched by `light-dark()` like the
  rest of the app's colour: each theme's shapes are transparent in the other.
  Light keeps the favicon's dark tile (https://opencode.ai/favicon.svg). That
  tile vanishes into a dark surface, so dark draws the tile-less glyph OpenCode
  publishes for dark backgrounds (https://opencode.ai/brand, "logo dark
  square": packages/console/app/src/asset/brand/opencode-logo-dark-square.svg
  in anomalyco/opencode). The colours are the brand's, not tokens.
-->
<svg aria-hidden="true" fill="none" viewBox="0 0 512 512">
  <rect class="day tile" height="512" width="512" />
  <path class="day core" d="M320 224V352H192V224H320Z" />
  <path
    class="day frame"
    clip-rule="evenodd"
    d="M384 416H128V96H384V416ZM320 160H192V352H320V160Z"
    fill-rule="evenodd"
  />
  <!-- The dark mark's own 300-unit square, glyph inset 30 from the left. -->
  <g transform="scale(1.70667) translate(30)">
    <path class="night core" d="M180 240H60V120H180V240Z" />
    <path
      class="night frame"
      d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z"
      fill-rule="evenodd"
    />
  </g>
</svg>

<style>
  .day.tile {
    fill: light-dark(#131010, transparent);
  }
  .day.core {
    fill: light-dark(#5a5858, transparent);
  }
  .day.frame {
    fill: light-dark(#fff, transparent);
  }
  .night.core {
    fill: light-dark(transparent, #4b4646);
  }
  .night.frame {
    fill: light-dark(transparent, #f1ecec);
  }
</style>
