<!--
  Planted mistake for house/control-owns-surface (scripts/lint/fixtures/
  expected.txt): a control drawing its own edge and its own hover fill;
  beside it a control that takes looks, which the rule leaves alone.
-->
<button class="control inset-ring-red hover:bg-ui" type="button"></button>
<button class="control control-danger text-red" type="button"></button>
