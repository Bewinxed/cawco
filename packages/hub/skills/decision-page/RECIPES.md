# Card recipes

Every card is one question of the interview (SKILL.md, The card): an `<article class="dp-card" id="<id>">`, its why the reason for the one Recommended, each option's line what it gets and its `.dp-cost` what it costs. The bridge does the picking: a click on a `[data-option]` inside a `[data-cawco-choice]` stores the pick in the hub and the hub's answer marks it (`data-cawco-picked`, `aria-pressed`). `kit/page.js` keeps the progress, each card's state line and notes in step. Copy is calm, short and sentence case; option labels are what the person gets, not "Option A"; an icon is named in words ("Attach"), never drawn as a stand-in symbol, a check mark (✓), a key symbol (⌘ ⇧ ↵) or an emoji, which the house faces lack; arrows (← →) and dashes they draw.

## One pick

```html
<article class="dp-card" id="lead">
  <header><h2>Who leads the project?</h2><span class="dp-state" data-dp-state="lead">Not picked</span></header>
  <p class="dp-why">Caw keeps the board moving while you are away.</p>
  <div class="dp-opts" data-cawco-choice="lead" role="group" aria-label="Who leads the project">
    <button class="dp-opt" type="button" data-option="you"><b>You</b><span>Every brief in your words.</span><span class="dp-cost">Cost: nothing moves while you are away.</span></button>
    <button class="dp-opt" type="button" data-option="caw"><b>Caw, woken by events</b><span>Board tools, no edit tools.</span><span class="dp-cost">Cost: you review its briefs after the fact.</span><span class="dp-tag">Recommended</span></button>
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

## At its real size

A design the person compares (a Settings card, a panel, a phone screen) is drawn at its real width, a real-size mockup (CONTRACT.md, Layout), and placed in a frame that never scales it:

```html
<div class="dp-reals">
  <figure class="dp-pane dp-real"><figcaption><b>Desk</b><span>Settings › Addresses</span><span class="dp-real-more">· scroll sideways for the rest</span></figcaption><div class="dp-real-scroll">{{MK:settings-card}}</div></figure>
  <figure class="dp-pane dp-real"><figcaption><b>Phone</b><span>The page the QR opens</span><span class="dp-real-more">· scroll sideways for the rest</span></figcaption><div class="dp-real-scroll">{{MK:phone-ok}}</div></figure>
</div>
```

- The page's column grows to hold its widest drawing whole wherever the screen is wide enough; frames stand side by side where the card holds them and stack where it doesn't.
- A frame narrower than its drawing scrolls sideways inside itself and shows its `.dp-real-more` words; the page never scrolls sideways. On a phone the frame runs to the card's edges.
- The caption names what the person judges (where it lives, which state), never its size.
- Real-size mockups go in `dp-reals`, fluid ones in `dp-show`.

## Dials

For values the person tunes rather than picks (a radius, a colour, a spring), keep `{{DIALS}}` in the page's head and create a panel after the page's own script:

```html
<div id="sample" class="dp-pane">Sample card</div>
<script>
  cawcoDials("Card", { radius: [12, 0, 32], accent: "#e65d46" })
    .subscribe((v) => { document.getElementById("sample").style.borderRadius = v.radius + "px"; });
</script>
```

`cawcoDials(name, config, options)` takes DialKit's config ([control types](https://github.com/joshpuckett/dialkit#controls)) and returns its controller. Values go to the hub under the one id `dials`, each panel's by path (`{ Card: { radius: 16, "shadow.blur": 8 } }`), restored on reload and revision; `artifact_read` returns them as that entry's `value`. A set value stops at 2,000 characters of JSON, so keep panels small. Leave `{{DIALS}}` out of pages without dials: it adds about 330 KiB.

## The bridge, from your own script

`window.cawco` is there whenever CawCo shows the page:

- `cawco.choose(id, option | [options] | null)` — the same as clicks.
- `cawco.note(id, text)` — the card's note.
- `cawco.set(key, value)` — any JSON value under a key of its own.
- `cawco.send(text?, control?)` — the person's Send: you hear that the page has new responses, and `artifact_read` says your text beside their Send. `control` names what they pressed (`"page-send"` for the page's Send button, `"page-key"` for its ⌘/Ctrl+Enter), so the hub's journal can say it.
- `cawco.on("picks", (picks) => …)` — the stored picks now and after every change, yours included (`artifact_update`'s patches arrive here too): `{ [id]: { options, note, value, pageHash, at } }`. Returns a function that stops listening.
- `cawco.pickPlace()` — CawCo asks the person for a machine and a folder on it with its own pickers, stores the pick under `place` as `{ machineId, label, path }` and answers it, or null when they cancel. `label` is the name CawCo shows the machine by: a card names the place as "<label> — <path>".

Each returns a promise that settles when the change is in the page's artifact, which the hub keeps: the page reads and writes the artifact's document itself, so a pick made in the panel, in the page's own tab or by your `artifact_update` patch shows in every open view.

Every form field with a `name` or `id` (`input`, `select`, `textarea`, `[contenteditable]`) is kept too, under that name, with no script: a radio group, checkboxes sharing a name and a select as `options`, anything typed as `value` (written once typing pauses). Passwords, files and hidden inputs are not kept. A field keeps what was typed across a reload, and when you re-publish the page with `artifact_update({ id, html })` it morphs in place: keep each field's `name` and the person's answers, focus and scroll stay.

Bounds: ids and options up to 200 characters with no spaces at either end, 50 options per multiple pick, notes up to 2,000 characters, 500 ids per page.
