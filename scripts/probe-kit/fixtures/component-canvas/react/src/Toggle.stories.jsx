import { Toggle } from "./Toggle";

export default { title: "Kit/Toggle", component: Toggle };

/** Off: the knob at the start. */
export const Off = { args: { on: false } };

/** On: the knob slides across and the track fills. */
export const On = {
  args: { on: true },
  from: "Off",
  play: async ({ update }) => {
    await update({ on: true });
  },
};
