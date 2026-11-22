# Storage and files in a design folder

A design folder's page may keep state and read the person's files, at your choice. Reach for them when the design works only with them: a list the person adds to, a draft that must outlive a reload, a board two devices share, a tool that opens a file. A page that only shows a state needs neither.

## Storage is a Yjs document

The hub keeps a **store** for the page: a Yjs document it syncs and saves, so the page's state survives reloads, other devices and your workspace going away. Pick its scope:

- **`artifact`**: this design's own. Every direction of the design shares it; key your data by direction when they must stay apart.
- **`project`**: one store shared by every design of the project the design was made in. A design made outside a project has none.

Join it with y-websocket, on the page's own origin, the scope as the room. Name the packages in the folder's `package.json` (`yjs`, `y-websocket`, `y-indexeddb`), which makes it a `dir` design:

```js
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";

const doc = new Y.Doc();
const server = `${location.origin.replace(/^http/, "ws")}/__cawco/store`;
new WebsocketProvider(server, "artifact", doc); // or "project"
new IndexeddbPersistence("artifact", doc); // offline edits, kept on this device until they sync

const todos = doc.getArray("todos");
todos.observe(() => render(todos.toArray()));
```

Everything after that is the Yjs you know: `getMap`, `getArray`, `getText`, `observe`, `transact`. Edits merge across devices and tabs; one made offline syncs when the page reconnects. The page signs in with the person's own preview pass, so there is nothing to configure.

Limits:

- A store holds at most **8 MiB**. The hub refuses a write that would take it past that, and that tab's edits from then on go unsaved (its console says `Permission denied` with the reason). Keep pictures and files out of it; keep their names and the person's choices.
- The store carries the document only: presence (`provider.awareness`) reaches no other device.
- A page reaches its own design's store and its project's, never another design's. The store goes when its design or its project is deleted.

## Files are the browser's

The page reads what the person hands it with the browser's own APIs: `<input type="file">` (`multiple`, `accept`, `webkitdirectory` for a folder), a drop on the page (`dragover` with `preventDefault()`, then `event.dataTransfer.files`), and a paste (`event.clipboardData.files`). Read each with `file.text()`, `file.arrayBuffer()` or `URL.createObjectURL(file)`. To hand a result back, offer a download (`<a download>` on a blob URL).

`showOpenFilePicker`, `showSaveFilePicker` and `showDirectoryPicker` throw in the graph: Chromium shows them only to a page on the top frame's own origin, and the design is framed from an origin of its own. Use the file input in their place.

In Comment and Draw the panel owns every drop, so the page hears drops in Interact only.
