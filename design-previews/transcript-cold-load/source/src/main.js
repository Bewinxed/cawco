// The page's load runs first, before anything mounts. It stands for the
// session page's server `load`: that reads the reader's place from its
// cookie (`cookies.get("cawco-place")`) and returns the window read as an
// un-awaited promise, which SvelteKit streams to the page as it resolves.
// The shell is drawn at once with the veil up; the promise lands the rows
// when it does.
import { mount } from "svelte";
import App from "./App.svelte";
import { SESSION, load } from "./hub.js";
import { readPlace } from "./place.js";
import "./app.css";

const place = readPlace(SESSION);
const loading = load(place);

mount(App, {
  target: document.getElementById("app"),
  props: { loading, align: place ? "top" : "bottom" },
});
