# Card recipes

Every card is an `<article class="dp-card" id="<id>">`. The bridge does the picking: a click on a `[data-option]` inside a `[data-cawco-choice]` stores the pick in the hub and the hub's answer marks it (`data-cawco-picked`, `aria-pressed`). `kit/page.js` keeps the progress, each card's state line and notes in step. Copy is calm, short and sentence case; option labels are what the person gets, not "Option A".

## One pick

```html
<article class="dp-card" id="lead">
  <header><h2>Who leads the project?</h2><span class="dp-state" data-dp-state="lead">Not picked</span></header>
  <p class="dp-why">Today: you write every brief.</p>
  <div class="dp-opts" data-cawco-choice="lead" role="group" aria-label="Who leads the project">
    <button class="dp-opt" type="button" data-option="you"><b>You</b><span>You write every brief.</span></button>
    <button class="dp-opt" type="button" data-option="caw"><b>Caw, woken by events</b><span>Board tools, no edit tools.</span><span class="dp-tag">Recommended</span></button>
  </div>
  <label class="dp-note">Note<textarea data-dp-note="lead" rows="1" placeholder="Anything to add"></textarea></label>
</article>
```

A second click on the picked option clears it.

## Several picks

Add `data-cawco-multiple` to the `[data-cawco-choice]` element; each click toggles one option. The state line reads "3 picked".

## How it would look

Put a figure between the why and the options; two side by side for "look" and "how it works", or `dp-show solo` for one:

```html
<div class="dp-show">
  <figure class="dp-pane"><figcaption>How it would look</figcaption>{{MK:lead-look}}</figure>
  <figure class="dp-pane"><figcaption>How it works</figcaption><pre>…</pre></figure>
</div>
```

`{{MK:<id>}}` is `mockups/<id>.html`, inlined when the hub builds the page ([CONTRACT.md](CONTRACT.md)).

## Dials

For values the person tunes rather than picks (a radius, a colour, a spring), keep `{{DIALS}}` in the page's head and create a panel after the page's own script:

```html
<div id="sample" class="dp-pane">Sample card</div>
<script>
  cawcoDials("Card", { radius: [12, 0, 32], accent: "#e65d46" })
    .subscribe((v) => { document.getElementById("sample").style.borderRadius = v.radius + "px"; });
</script>
```

`cawcoDials(name, config, options)` takes DialKit's config ([control types](https://github.com/joshpuckett/dialkit#controls)) and returns its controller. Values go to the hub under the one id `dials` (`{ Card: { radius: 16, … } }`), restored on reload and revision; `read_choices` returns them as that entry's `value`. A set value stops at 2,000 characters of JSON, so keep panels small. Leave `{{DIALS}}` out of pages without dials: it adds about 330 KiB.

## The bridge, from your own script

`window.cawco` is there whenever CawCo shows the page:

- `cawco.choose(id, option | [options] | null)` — the same as clicks.
- `cawco.note(id, text)` — the card's note.
- `cawco.set(key, value)` — any JSON value under a key of its own.
- `cawco.send(text?)` — sends the picks to the session as one message, your text below them.
- `cawco.on("picks", (picks) => …)` — the stored picks now and after every change: `{ [id]: { options, note, value, pageHash, at } }`. Returns a function that stops listening.

Each returns a promise that settles when the hub has kept the change. Underneath they are MCP Apps messages (`ui/update-model-context`, `ui/message`, `tools/call` → `read_choices`).

Bounds: ids and options up to 200 characters with no spaces at either end, 50 options per multiple pick, notes up to 2,000 characters, 500 ids per page.
