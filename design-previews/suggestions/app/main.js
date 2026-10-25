/**
 * The suggestions preview's entry (build.ts): the dashboard's stylesheet,
 * the page's own, the shared state switcher (../../state-switcher.js) with
 * the preview's groups, then the page (Preview.svelte) in its stage, the
 * dashboard's components live in it. JavaScript, as the capture stages
 * are: the dashboard's sources it reaches are typed in the dashboard's own
 * project.
 */
import "../../../apps/dashboard/src/app.css";
import "./preview.css";
import { mount } from "svelte";
import { mountStateSwitcher } from "../../state-switcher.js";
import Preview from "./Preview.svelte";
import { groupsOf } from "./states.js";

let preview;
const switcher = mountStateSwitcher({
  // The widest Where: the empty board.
  width: 725,
  axes: true,
  label: "Suggestions states",
  groups: (state) =>
    groupsOf(state.direction).map((group) => ({
      key: group.key,
      label: group.label,
      states: group.entries,
    })),
  onchange: (state) => preview?.show(state),
});
preview = mount(Preview, {
  target: switcher.stage,
  props: { initial: switcher.state },
});
