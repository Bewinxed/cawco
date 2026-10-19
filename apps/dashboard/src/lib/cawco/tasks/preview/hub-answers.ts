/**
 * A sheet's stand-in for the two hub reads the task pane makes of its own
 * accord (a task's file, its history): TaskPane reads its task by id rather
 * than taking it as a prop, so its sheet answers those reads from the
 * tidewater fixtures, as the hub would. Every other request goes out as it
 * would. Installed once, by the fixture that mounts the pane.
 */
import { historyOf, PROJECT, TASKS, viewOf } from "./tidewater";

const TASK = new RegExp(
  `/api/projects/${PROJECT}/tasks/(tsk-\\d+)(/history)?$`
);

let installed = false;

export function answerTaskReads(): void {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;
  const ownFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      location.href
    );
    const task = url.pathname.match(TASK);
    const id = task?.[1];
    if (id && TASKS.some((each) => each.id === id)) {
      return Promise.resolve(
        new Response(
          JSON.stringify(task?.[2] ? historyOf(id) : viewOf(id)),
          { headers: { "content-type": "application/json" } }
        )
      );
    }
    return ownFetch(input, init);
  };
}
