# Renderer CHECK in ClipPathClipper::HasCompositeClipPathAnimation after a composited clip-path + translate animation is displaced and collected

Ready to file at https://issues.chromium.org (component Blink>Animation, or
Blink>Paint). Nothing has been filed.

## Summary

Suppose one Web Animation animates `clip-path` and `translate` (or
`transform`) together, and a second animation of the same move property
starts on the same element while the first runs. The first animation is
taken off the compositor. Its element's clip-path paint status stays
`kComposited`. `NativePaintWorkletData` holds the animation only as a
`WeakMember`, so after a garbage collection the status says "composited"
but the animation is gone. The element's next pre-paint then fails
`CHECK(GetClipPathAnimation(layout_object))` and the renderer dies with
SIGTRAP (exit code 133).

Every step is deterministic: 10 of 10 tabs crash.

## Versions reproduced

| Build | Channel / source | Mode | Result |
| --- | --- | --- | --- |
| Google Chrome 156.0.8078.47 | Stable, `google-chrome-stable_current_amd64.deb` from dl.google.com, downloaded and unpacked 2026-10-24 | headless (`--headless`, driven by Playwright) | 5 of 5 tabs crashed with `--expose-gc`, and 5 of 5 with CDP `HeapProfiler.collectGarbage` then Repaint; `crashed, code 133` |
| Chrome for Testing 156.0.8078.4 (full `chrome`) | Playwright 1.64.1's chromium-1248 | headless | 5 of 5 crashed, `crashed, code 133` |
| chrome-headless-shell 156.0.8078.4 | Playwright 1.64.1's chromium_headless_shell-1248 | headless shell | 10 of 10 crashed, `crashed, code 133` |

OS: Linux x86_64 (Ubuntu, kernel 7.0.0). Stable Chrome was not run in a
visible window: the machine that ran these has no display it could open a
window on. Every stable run was in headless mode, which uses the same
renderer code.

## Steps

1. `google-chrome --user-data-dir=/tmp/clip-repro --js-flags=--expose-gc repro.html`
   (`repro.html` is beside this file and has no dependencies).
2. The page runs by itself and the tab crashes within half a second.
   Without `--expose-gc`, the page stops before step 4 and says so. Press
   "Collect garbage" in DevTools' Memory panel (the same as CDP
   `HeapProfiler.collectGarbage`), then press the page's Repaint button.

The page does the following:

```js
const el = document.getElementById("el");            // a 200×100 div
// 1. one effect that moves and cuts: composited, status kComposited
el.animate([
  { translate: "0 20px", clipPath: "inset(10px -8px -8px)" },
  { translate: "0 0",    clipPath: "inset(0px -8px -8px)" },
], { duration: 200 });
await frames(3);
// 2. a second animation of the same move property on the same element
el.animate([{ translate: "0 -5px" }, { translate: "0 0" }],
           { duration: 150, composite: "add" });         // replace mode crashes too
await frames(30);                                         // both finish; no script holds either
// 3. a full GC (V8's gc() also collects the Blink heap; CDP HeapProfiler.collectGarbage works too)
gc();
// 4. any paint-property update of the element
el.style.width = "201px";                                 // or an ancestor's transform
```

**Expected:** the status line reads "survived: the renderer did not crash".

**Actual:** the tab crashes (Aw, Snap!, error code 5). The renderer exits
on SIGTRAP and the DevTools `Target.targetCrashed` event reports
`crashed, code 133`.

## Narrowing (chrome-headless-shell 156.0.8078.4, 3–10 runs each)

- Crashes every time:
  - `{translate, clipPath}` followed by a second `translate` animation (composite `add` or `replace`);
  - `{transform, clipPath}` followed by a second `transform` animation.
- Never crashes:
  - `clipPath` alone followed by `translate`;
  - `{transform, clipPath}` followed by `translate`;
  - `{opacity, clipPath}` followed by `opacity`;
  - `{translate, clipPath}` followed by `opacity`;
  - `translate` and `clipPath` as two separate effects on the same timing, followed by `translate`;
  - cancel, `finish()`, `fill: forwards`, replaced animations, reverse, `setKeyframes`, `effect = null`, and an element hidden or detached mid-run.
- No GC means no crash within the test's window. GC timing is why the crash
  in a real app is intermittent.

## The CHECK

At tag 156.0.8078.4 (and 156.0.8078.47), `third_party/blink/renderer/core/paint/clip_path_clipper.cc:300`, in
`ClipPathClipper::HasCompositeClipPathAnimation`:

```cpp
  switch (status) {
    case CompositedPaintStatus::kComposited:
      CHECK(GetClipPathAnimation(layout_object));   // line 300
      return true;
```

`GetClipPathAnimation` returns
`ClipPathPaintDefinition::GetAnimationIfCompositable`, which returns
`ElementAnimations::PaintWorkletClipPathAnimation()`. That is
`clip_path_npw_data_->GetAnimation()`, read from
`third_party/blink/renderer/core/animation/native_paint_worklet_data.h:92`:

```cpp
  WeakMember<Animation> animation_;
```

`NativePaintWorkletData::SetStatus` (native_paint_worklet_data.cc) clears
`animation_` only when the status moves to `kNotComposited` or
`kNoAnimation`. Nothing resets `kComposited` when the displaced animation
finishes off the compositor. So once the animation is collected, the
status and the animation disagree.

Chromium main is identical as of 2026-10-24:
- `HasCompositeClipPathAnimation`'s body is byte-identical to the tag's
  (the CHECK is at line 304 on main);
- `native_paint_worklet_data.h` is byte-identical.

## Stack (chrome-headless-shell 156.0.8078.4, BuildID 575b1111c1a9e2b1328996d87e9195d2e2a380e5, stripped)

Three crash dumps from the field and the repro under gdb all stop at
the same instruction. These are offsets in the binary, mapped by
disassembly and by the binary's trace strings:

| Frame | Offset | What it is |
| --- | --- | --- |
| #0 | `+0x2b9e9e3` | the `ud2` after `int3` of the CHECK's crash pad. Reached from `0x2b8a624` (`cmp $0x2` = `kComposited`, `call 0xa1d48d0` = `GetClipPathAnimation`, `test %rax,%rax`, null → pad). The function holds the strings "FallbackClipPathAnimationIfNecessary" and "../../third_party/blink/renderer/core/paint/clip_path_clipper.cc", so it is the paint property tree builder with `HasCompositeClipPathAnimation` inlined. A second inlined copy of the same CHECK pads at `+0x2b9e9e6`; the repro hits it when the trigger is a change to the element's own `opacity` or `transform`. |
| #1 | `+0x2b6b7b1` | `PrePaintTreeWalk::WalkInternal` (NOINLINE), returning from the property-tree update |
| #2 | `+0x2b6a534` | `PrePaintTreeWalk::Walk(const LayoutObject&, …)`, the call to `WalkInternal` |
| #3–#26 | `+0x2b6a70c` ×24 | `Walk` recursing down the layout tree (it calls itself at `0x2b6a707`) |
| #27 | `+0x2b67e0b` | `PrePaintTreeWalk::WalkTree` / frame walk |
| … | `+0x2e2f7d3`, `+0x2e2e14b`, `+0x2e2bbe1` | the document lifecycle update |
| … | `+0x3d984e3`, `+0x3d97056` | `ProxyMain::BeginMainFrame` (cc/trees/proxy_main.cc strings) |

In one field dump the lifecycle update came from a mouse move instead:
`+0x488da93` (`EventHandler::handleMouseMoveEvent`) → `+0x4889120`
(`LayoutView::HitTest`) → the same pre-paint frames.

Under gdb (`--no-zygote --renderer-cmd-prefix="gdb -batch -ex run …"`),
the repro's renderer stops with `SIGTRAP` at pc
`0x5555580f29e3` with the binary mapped at `0x555555554000`. That is
`+0x2b9e9e3`, matching frame #0 of the field dumps.

## Workaround (what the affected app does)

Never animate `clip-path` in one effect together with `transform`,
`translate`, `scale` or `rotate`. Run the cut as its own animation on the
same timing; the motion looks identical.
