# Plan layer preview

The question: when the plan opens over the conversation, what comes first?
Three variants of the plan layer (PlanPane as main draws it) over a
transcript's foot, at Desk 1440 × 900 and Phone 390 × 844, all three
drawing one sample plan.

- `page/` is the built folder to open as a folder preview. `index.html` is
  the switcher (variant, width, scheme), and `stage.html` is one pane at the
  window's own size.
- Deep links: `index.html?v=1|2|3&w=desk|phone&theme=light|dark`, and
  `stage.html?v=1|2|3&theme=…` for the pane alone (`&open=0` shows it shut).
- `src/` holds the pages. They are built from the dashboard's real
  components: PlanRing, LiveDot, the chip and button recipes,
  `floatingSurface`, `popOut`, `unfold`, `branch` and `reflow`. Fixtures
  stand in for the hub: `PlanLayer` is PlanPane, `StepTree` is PlanTree
  plus a step's wait, and the sample plan is in `sample.ts`.

Build it with `cd apps/dashboard && bunx vite build -c previews/plan-layer/vite.config.ts`.
Its proof is `bun scripts/probe-kit/run.ts plan-layer-preview`.
