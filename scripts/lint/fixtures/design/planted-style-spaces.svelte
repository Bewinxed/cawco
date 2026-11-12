<!--
  Planted mistake for house/no-style-underscore-spaces (scripts/lint/
  fixtures/expected.txt): Tailwind's underscore spelling of a space in a
  style attribute and a style: directive; beside them real spaces in a
  style, which the rule leaves alone.
-->
<div style="--col-w: calc(var(--spacing)_*_26)"></div>
<div style:--cols={"auto calc(var(--spacing)_*_13) minmax(0, 1fr)"}></div>
<div style="--col-w: calc(var(--spacing) * 26)"></div>
