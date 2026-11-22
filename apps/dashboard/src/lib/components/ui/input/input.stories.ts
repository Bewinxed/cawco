/**
 * The kit's Input (Component Story Format 3, live components), mounted as
 * itself: empty with its placeholder, filled, a path typed exactly, a
 * number, refused and disabled. The meta's args are every story's; a
 * story's own args are what it changes.
 */
import Input from "./input.svelte";

export default {
  title: "Kit/Input",
  component: Input,
  args: {
    "aria-label": "Project name",
    placeholder: "Name the project",
  },
};

/** Waiting for a name. */
export const Empty = {};

/** A name typed in. */
export const Filled = { args: { value: "Cockpit release 0.42" } };

/** A path, typed exactly in the code face. */
export const Path = {
  args: {
    "aria-label": "Folder",
    face: "mono",
    value: "~/cockpit/apps/dashboard",
  },
};

/** A number in its narrow field. */
export const Count = {
  args: {
    "aria-label": "Sessions at once",
    field: "number",
    value: "4",
    type: "number",
  },
};

/** A name the hub refused. */
export const Refused = {
  args: { value: "cockpit/", "aria-invalid": true },
};

/** A field that can't be changed here. */
export const Disabled = {
  args: { value: "obelisk-of-light", disabled: true },
};
