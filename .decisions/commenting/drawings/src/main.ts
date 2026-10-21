import { mount } from "svelte";
import "./drawings.css";
import App from "./App.svelte";

const target = document.getElementById("app");
if (target) {
  mount(App, { target });
}
