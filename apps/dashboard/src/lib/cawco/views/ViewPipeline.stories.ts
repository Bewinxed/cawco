/**
 * The Pipeline's sheet (project redesign): today's view, one recessed row
 * per stage with a bar of its count, then the two answers the advisor left
 * to the owner, each its own pick: the run order (ViewPipelineRunOrder:
 * what runs now, what comes next and what it waits on) or the tab removed
 * (the board's column heads already count each stage). Desk at the pane's
 * width on a 1440 screen, then a phone.
 */
import PageRoom from "../project/preview/PageRoom.svelte";
import {
  DATES,
  STAGES,
  sessionNameOf,
  TASKS,
} from "../tasks/preview/tidewater";
import PipelineRemovedFixture from "./preview/PipelineRemovedFixture.svelte";
import ViewPipeline from "./ViewPipeline.svelte";
import ViewPipelineRunOrder from "./ViewPipelineRunOrder.svelte";

const DESK = { viewport: 1180 };
const PHONE = { viewport: "phone" };
const room = () => ({ Component: PageRoom, props: {} });
const phoneRoom = () => ({ Component: PageRoom, props: { phone: true } });

const runOrder = {
  component: ViewPipelineRunOrder,
  args: {
    tasks: TASKS,
    dateOf: (id: string) => DATES[id] ?? null,
    hrefOf: (id: string) => `?task=${id}`,
    nameOf: sessionNameOf,
  },
};

export default {
  title: "Project redesign/Pipeline",
  component: ViewPipeline,
  args: { stages: STAGES.stages, tasks: TASKS },
};

/** Desk · Today: a bar per stage scaled to the largest, its kind in code, its count. */
export const Today = { decorators: [room], parameters: DESK };
/** Phone · Today. */
export const TodayPhone = { decorators: [phoneRoom], parameters: PHONE };

/** Desk · Run order: working first, then waiting on you, then stuck, then next; a waiting task under the one it waits on; done folded. */
export const RunOrder = { ...runOrder, decorators: [room], parameters: DESK };
/** Phone · Run order: each row on two lines, the title whole. */
export const RunOrderPhone = {
  ...runOrder,
  decorators: [phoneRoom],
  parameters: PHONE,
};

/** Desk · Removed: no Pipeline tab; the board's column heads count each stage. */
export const Removed = {
  component: PipelineRemovedFixture,
  args: {},
  parameters: DESK,
};
/** Phone · Removed. */
export const RemovedPhone = {
  component: PipelineRemovedFixture,
  args: {},
  parameters: PHONE,
};
