import Throws from "./Throws.svelte";

export default { title: "Kit/Throws", component: Throws };

/** A component whose script throws as it mounts. */
export const Broken = { args: { boom: true } };
