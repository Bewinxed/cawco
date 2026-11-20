/**
 * Option 1, Governed canvas: hyucksfield's project page in the app's shell,
 * each standing fact on the part of the page it governs (its places by its
 * name, its account in Caw's seat, Who decides beside what waits, its task
 * home and its landing on the views strip), each opening its one subject.
 * The live story (governed-canvas-live) answers every change through a
 * stand-in hub; its dials set what the hub says of the project and how it
 * answers.
 */
import { hubAs } from "#lib/cawco/hub-stand-in.js";
import { STATES } from "#lib/cawco/views/routines-fixture.js";
import GovernedCanvasLive from "./governed-canvas-live.svelte";

export default {
  title: "Project details/Option 1: Governed canvas",
  component: GovernedCanvasLive,
  args: { situation: "As it stands", answer: "Takes it", view: "board" },
  decorators: [hubAs("connected", STATES.on)],
  parameters: { viewport: 1440 },
};

/** hyucksfield on an ordinary day: where it lives, who decides, where its tasks and finished work go, all on the page. */
export const GovernedCanvas = {};
