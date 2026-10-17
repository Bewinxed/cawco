# Lane S09-accounts (10 of 10 files)

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges |
|---|---|---|---|---|
| DevicePanel | 12 | 0/0/0/0/0 | 0.08em (code tracking) | none |
| KeyPanel | 13 | 0/0/0/0/0 | none | none |
| OrderList | 12 | 0/0/0/0/0 | 3px list gap, 10px handle width, handle dots gradient/5px tile, 8px dot, 50% | none |
| ProviderMark | 3 | 0/2/0/0/1 | none | none |
| RebalanceNotices | 7 | 0/0/0/0/0 | none | none |
| RoutingEditor | 8 | 0/0/0/0/0 | 0.25em strategy gap | `max-width: 640px` -> max-phone: (639); `@container kinds (width < 480px)` -> @max-kinds/kinds: |
| SigninPanel | 8 | 0/0/0/0/0 | 14px warn icon; `h-[30px]` -> h-c-btn-h-sm | none |
| StrategyFigure | 1 (.stage) | 0/84/8/0/1 | stage sizes as --fig-* props (6,7,5,10,3,1.5,13,8,3,2.5,11,12,16px) | none |
| StrategyPicker | 12 | 0/0/8/0/2 | 1.5px radio border, 50%, 8px radio dot, 1px words gap, 14px forks icon, 0.995 press | `@container (width < 520px)` -> @max-decisions-520px: |
| Swatches | 5 | 0/0/0/0/1 | 26px, 4px ring, 5px focus offset | none |

Residual kind-5 declarations (verbatim):
- ProviderMark: `mask: var(--mask) center / contain no-repeat`
- StrategyFigure: `contain: layout paint`
- StrategyPicker: `transition: border-color var(--dur-fade) var(--ease-out), background-color var(--dur-fade) var(--ease-out), scale var(--dur-control) var(--ease-out)` (motion-safe)
- StrategyPicker: `background: color-mix(in oklab, var(--selected-bg) 45%, var(--surface-raised))` ([aria-checked=true])
- Swatches: `box-shadow: 0 0 0 2px var(--swatch-ground, var(--surface-raised)), 0 0 0 var(--swatch-ring) var(--c)` ([aria-checked=true])

needs transition token: `border-color var(--dur-fade) var(--ease-out), background-color var(--dur-fade) var(--ease-out), transform|scale var(--dur-control) var(--ease-out)` (StrategyPicker card, motion-safe; mixed durations).
needs variant: none.
shadcn variant: none.
shadcn/no-restyle hits: 0.

Notes for integration:
- `transform: scale(...)` on :active became `scale-(--card-press)` / `scale-(--press-scale)` per the map; the transition lists were changed from `transform` to `scale` so the press still animates (StrategyPicker residual, Swatches `motion-safe:transition-[box-shadow,scale]`).
- OrderList: li `style:transform` became `style:--carry` + `translate-y-(--carry)` (delta E); it now uses the `translate` property, not `transform`.
- StrategyPicker: script selector strings `.card` and `.order` switched to `[data-slot="strategy-picker-card"]` and `[data-slot="order"]`; `data-slot="order"` added on the unfold wrapper (it had only the class `order`). OrderList's root lost its `order` class (no rules left; no other file referenced it).
- Unused classes with no rules deleted (RoutingEditor `.pane`); DevicePanel `.well.dim` is `data-dim`; ProviderMark `.mono` is `data-mono`; OrderList `.held` is `data-held`; KeyPanel `.off` is `data-off`.
