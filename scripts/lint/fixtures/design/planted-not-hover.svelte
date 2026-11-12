<!--
  Planted mistake for house/no-not-hover (scripts/lint/fixtures/
  expected.txt): Tailwind's not-hover: on an open control; beside it the
  house's unhovered:, which the rule leaves alone.
-->
<div class="data-open:not-hover:bg-surface-hover"></div>
<div class="data-open:unhovered:bg-surface-hover"></div>
