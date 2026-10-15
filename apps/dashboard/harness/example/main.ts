/**
 * The harness's worked example: the session list's folder tabs
 * (ui/fluid-tabs, `variant="folder"`), on one density axis against today's,
 * in their two real gesture branches (the root's `travel`, null at rest),
 * with the lean on dials and the swipe on a timeline clip.
 */
import { preview } from "../preview.svelte";
import Example from "./Example.svelte";

preview(
  {
    title: "Folder tabs: how dense the row stands",
    width: 480,
    variants: [
      {
        heading: "Density",
        entries: [
          { id: "today", label: "Today" },
          { id: "compact", label: "Compact" },
          { id: "airy", label: "Airy" },
        ],
      },
    ],
    states: [
      {
        heading: "Gesture",
        entries: [
          { id: "rest", label: "At rest" },
          { id: "swipe", label: "Mid-swipe" },
        ],
      },
    ],
    dials: ["Tabs"],
    timelines: ["Swipe"],
  },
  Example
);
