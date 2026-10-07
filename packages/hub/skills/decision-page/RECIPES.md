# Card recipes

The page is a ledger of decisions for a visual reader. Every card is one line of why, then how the options would look, then the options to pick. Detail folds away. The classes are base.css's; page.tpl.html has a card of each kind to copy.

## Decision card (one pick)

```html
<article class="dec" id="voice">
  <header><span class="did">D1</span><h3>How should the launch post sound?</h3><span class="state" data-for="voice">Not picked</span></header>
  <p class="why">One sentence: what is true today and why it needs deciding.</p>
  <div class="show">
    <figure class="pane look"><span class="cap">How it would look</span>{{MK:voice}}</figure>
    <figure class="pane mech"><span class="cap">How it works</span><pre class="v">…</pre></figure>
  </div>
  <div class="opts" role="radiogroup" aria-label="D1 Launch post tone" data-cawco-choice="voice">
    <button class="opt" type="button" role="radio" aria-checked="false" data-option="calm"><b>Calm and exact</b><span>Numbers first.</span><span class="tag">Recommended</span></button>
    <button class="opt" type="button" role="radio" aria-checked="false" data-option="warm"><b>Warm and personal</b><span>One story.</span></button>
  </div>
  <div class="foot">
    <details class="more"><summary>Details</summary><div class="in"><p>…</p></div></details>
    <label class="note">Note <textarea data-cawco-note="voice" rows="1" placeholder="Anything to add"></textarea></label>
  </div>
</article>
```

- `data-cawco-choice` on the group names the choice; `data-option` on each button names the option. Clicking picks; clicking the picked option again clears it. The bridge sets `data-cawco-picked` and `aria-checked` (or `aria-pressed`), and base.css draws the coral ring from that alone. Do not write your own click handler for picks.
- `.state[data-for="<id>"]` is the card's "Not picked / Picked" word; the template's script keeps it current.
- `.show.solo` when there is only "How it would look"; leave `.show` out entirely when words are enough.
- Mark at most one option `Recommended` (`.tag`), and a costly one `.tag.warn` ("Costly"). Say why in the option's `<span>`, in five words or so.

## Several picks

```html
<div class="opts" aria-label="D2 Launch channels" data-cawco-choice="channels" data-cawco-multi>
  <button class="opt" type="button" aria-pressed="false" data-option="x"><b>X</b><span>Thread from the brand account.</span></button>
  …
</div>
```

`data-cawco-multi` on the group: each click toggles that option; the pick is the list.

## Variants as the options

When the options are pictures (two hero designs, three logos), the variant itself is the option: put `data-cawco-choice` and `data-option` on the same element, one per variant, all with the same choice id.

```html
<figure class="pane look opt" data-cawco-choice="hero" data-option="a" tabindex="0" role="button" aria-pressed="false">{{MK:hero-a}}</figure>
<figure class="pane look opt" data-cawco-choice="hero" data-option="b" tabindex="0" role="button" aria-pressed="false">{{MK:hero-b}}</figure>
```

## Notes

`<textarea data-cawco-note="<choice id>">` (or an `<input>`) saves as the operator types, after a short pause, under that choice. A note needs no pick; a pick needs no note.

## Dials

A value that is not one of a few options (a density, a hue, a spacing scale) is a dial: `cawco.set("density", 0.4)` from the control's own `input` handler. Any JSON, up to 4,000 characters; `null` clears it. Read back with `cawco.picks().dials`.

## The page's bar

`.dp-bar` at the foot: Caw, "n of m picked", a progress bar, and Send picks (`cawco.send()`), which sends the session that published the page one message with every pick. The pane above the preview has the same Send picks button. Send only goes when something changed since the last send.

## Script API

All of it is `window.cawco`, which CawCo's preview overlay provides (the template carries a local stand-in for a page opened outside CawCo):

| Call | What it does | MCP Apps method |
| --- | --- | --- |
| `cawco.choose(id, option)` | Pick one option; `null` clears; an array picks several | `ui/update-model-context` |
| `cawco.note(id, text)` | The note on a choice | `ui/update-model-context` |
| `cawco.set(key, value)` | A dial, any JSON | `ui/update-model-context` |
| `cawco.on("picks", fn)` | Called now and on every change with `{ picks, dials }`; answers an unsubscribe | |
| `cawco.on("sent", fn)` | Called when a send went | |
| `cawco.send(text?)` | One message to the session, from a click or key press only | `ui/message` |
| `cawco.picks()` | The picks as last known | |

Bounds: ids and keys up to 100 characters, options up to 200, 50 options per pick, notes up to 2,000 characters, 500 choices and 100 dials per page. Anything past them is not kept.

## Words

The page is the operator's, in CawCo's voice (WORDS.md): calm, precise, sentence case, no exclamation marks, no emoji. Card titles are questions. Options are short noun phrases. Buttons are verb + object.
