/**
 * One bundle, two kinds of document: the page the owner picks on, and each
 * frame it shows (`?frame=desk|bar|phone`), a document of its own at the
 * frame's real size, so every component measures and lays out as it does in
 * the app and the page only scales the frame's box. Stretched states
 * (`&fill=…`, `&stage=opening`) are reached by address alone, for the sweep.
 */
import "./guard";
import "../src/app.css";
import { mount } from "svelte";
import BarFrame from "./BarFrame.svelte";
import DeskFrame from "./DeskFrame.svelte";
import type { Count, Fill, Pull, Stage } from "./fixtures";
import Page from "./Page.svelte";
import PhoneFrame from "./PhoneFrame.svelte";

// The app's theme, as its layout sets it: the OS's.
const dark = matchMedia("(prefers-color-scheme: dark)");
const themed = () =>
  document.documentElement.classList.toggle("dark", dark.matches);
themed();
dark.addEventListener("change", themed);

const query = new URLSearchParams(location.search);
const frame = query.get("frame");
const fill = (query.get("fill") ?? "typical") as Fill;
const count = (query.get("count") ?? "none") as Count;
const target = document.body;

if (frame === "desk") {
  document.documentElement.dataset.frame = "desk";
  mount(DeskFrame, {
    target,
    props: {
      stage: (query.get("stage") ?? "closed") as Stage,
      fill,
      count,
      query: query.get("q") ?? "",
    },
  });
} else if (frame === "bar") {
  document.documentElement.dataset.frame = "bar";
  mount(BarFrame, { target, props: { count } });
} else if (frame === "phone") {
  document.documentElement.dataset.frame = "phone";
  mount(PhoneFrame, {
    target,
    props: {
      pull: (query.get("pull") ?? "closed") as Pull,
      fill,
      query: query.get("q") ?? "",
    },
  });
} else {
  mount(Page, { target });
}
