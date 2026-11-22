/**
 * The kit's Drawer (Component Story Format 3, live components) in a frame of
 * its own (drawer-fixture): the phone's bottom sheet open at its head. The
 * meta's args are every story's.
 */
import DrawerFixture from "./drawer-fixture.svelte";

export default {
  title: "Kit/Drawer",
  component: DrawerFixture,
  args: {
    title: "Move this session",
    rows: ["To studio-mac", "To nimbus-build-02", "To a new workspace"],
    height: 300,
  },
  parameters: { viewport: "phone" },
};

/** Open, asking where a session moves. */
export const Open = {};
