<script lang="ts">
  /**
   * One popover surface for a row of triggers. Opening a sibling while one is
   * open glides the surface to the new trigger — position, width and height —
   * and fades the new content in, instead of closing one popover and opening
   * the next. The triggers are NsPopovers rendered anywhere inside `children`.
   *
   * A group inside another group is no surface of its own: its triggers join
   * the outer one, so a row of chips nested in a larger form (the model row's
   * tool chips in New Session) glides with the form's chips rather than
   * opening a second surface beside theirs.
   */
  import { Popover } from "bits-ui";
  import { type Snippet, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import {
    drawn,
    own,
    pressable,
  } from "#lib/components/ui/floating-presence.js";
  import {
    glidePopoverVariants,
    placementGlide,
    popoverRoom,
  } from "#lib/components/ui/glide-popover/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import PopoverRoot from "#lib/components/ui/popover/popover.svelte";
  import { whenIdle } from "#lib/platform/idle-build.svelte.js";
  import { dur, ease } from "#lib/platform/motion/curves.svelte.js";
  import { morph } from "#lib/platform/motion/morph.svelte.js";
  import { cn } from "#lib/utils.js";
  import {
    type PopoverMember,
    popoverGroup,
    popoverWidth,
    providePopoverGroup,
    screenInset,
  } from "./popover-group.svelte";

  let { children }: { children: Snippet } = $props();

  /** Its inset from the screen's edge (`screenInset`). */
  const inset = $derived(screenInset());

  const outer = popoverGroup();
  const group = outer ?? providePopoverGroup();
  const active = $derived(
    outer ? undefined : group.members.find((member) => member.open)
  );
  /** What the surface shows; it outlives `active` so the exit plays with content. */
  let shown = $state.raw<PopoverMember | undefined>(undefined);
  /** Set once the open surface retargets a sibling, cleared when it closes. */
  let morphing = $state(false);
  /** The room floating-ui leaves the surface, a frame after it says so (glide-popover `popoverRoom`). */
  let room = $state<string>();
  const roomed = popoverRoom((next) => {
    room = next;
  });

  /** The member the surface was last open on; cleared when it closes. */
  let last: PopoverMember | undefined;
  $effect.pre(() => {
    const next = active;
    if (!next) {
      morphing = false;
      last = undefined;
      return;
    }
    if (last && last !== next) {
      morphing = true;
    }
    last = next;
    shown = next;
    if (!kept.includes(next)) {
      kept = [...kept, next];
    }
  });
  /**
   * Every member the surface has shown or built ahead, its content kept
   * built while the form stands, the surface itself kept as it closes:
   * shown again, it is drawn as it was left, nothing mounted. Built again on
   * each press, the location chip's (its repository list, owner strip,
   * tabs, tooltips) held a switch to it 45–50ms and a first open 78–82ms,
   * frames dropped before the surface's glide began.
   */
  let kept = $state.raw<PopoverMember[]>([]);
  /** The kept members still in the group, in the order they were first shown. */
  const keptNow = $derived(
    kept.filter((member) => group.members.includes(member))
  );
  /**
   * The member the surface stands for: the one shown, else (before any is)
   * the first built ahead, the surface standing closed around it.
   */
  const surface = $derived(shown ?? keptNow[0]);
  // A member that builds ahead (`prebuild`) is built once the page is idle,
  // the surface standing closed around it: the first press that opens it
  // finds it built, as a second does.
  $effect(() => {
    if (outer) {
      return;
    }
    const ahead = group.members.filter(
      (member) => member.prebuild && !untrack(() => kept).includes(member)
    );
    if (ahead.length === 0) {
      return;
    }
    return whenIdle(() => {
      kept = [...kept, ...ahead.filter((member) => !kept.includes(member))];
    });
  });
  const open = $derived(active !== undefined);
  /** The wrapper's glide to a sibling's placement (glide-popover `placementGlide`). */
  const glides = placementGlide(() => morphing);

  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
  /**
   * A member's content as it is shown: on a retarget, it fades in after
   * the surface sets out, and takes the focus the way a fresh open does.
   */
  const showing = (member: PopoverMember) => (node: HTMLElement) => {
    if (shown !== member || !open) {
      return;
    }
    // What its content asks focus for (`data-autofocus`: the repository
    // search), once the surface's own focus scope has placed it.
    const asked = node.querySelector<HTMLElement>("[data-autofocus]");
    const frame = asked
      ? requestAnimationFrame(() => asked.focus())
      : undefined;
    if (!morphing) {
      return () => {
        if (frame !== undefined) {
          cancelAnimationFrame(frame);
        }
      };
    }
    if (!reduceMotion.current) {
      node.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: dur("--duration-fade"),
        delay: dur("--duration-step"),
        easing: ease("--ease-out"),
        fill: "backwards",
      });
    }
    if (member.trapFocus && !asked) {
      node
        .querySelector<HTMLElement>(
          'input:not([disabled]), button:not([disabled]), [tabindex="0"]'
        )
        ?.focus();
    }
    return () => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
    };
  };
</script>

{@render children()}
{#if !outer}
  <!-- The kit's Root (root-open): a member open as the page mounts (a
       sign-in a reload brought back open) registers after the Root is made,
       and bits-ui's own would never draw it. -->
  <PopoverRoot
    onOpenChange={(value) => {
      if (!value) {
        active?.onchange(false);
      }
    }}
    {open}
  >
    <Popover.Portal>
      {#if surface}
        <Popover.Content
          data-ns-pop
          forceMount
          preventOverflowTextSelection={false}
          strategy="fixed"
          align={surface.align}
          class={cn(
            "ns-theme",
            glidePopoverVariants({ height: surface?.tall ? "room" : "cap" })
          )}
          collisionPadding={inset}
          customAnchor={surface.trigger}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (surface?.onclosefocus?.()) {
              return;
            }
            const focused = document.activeElement;
            if (
              !focused ||
              focused === document.body ||
              focused.closest("[data-ns-pop]")
            ) {
              surface?.trigger?.focus();
            }
          }}
          onInteractOutside={(event) => {
            const { target } = event;
            if (
              target instanceof Node &&
              group.members.some((member) => member.trigger?.contains(target))
            ) {
              event.preventDefault();
            }
          }}
          onOpenAutoFocus={(event) => {
            if (!surface?.trapFocus) {
              event.preventDefault();
            }
          }}
          side="bottom"
          sideOffset={6}
          style={`--ns-pop-width:${popoverWidth(surface.width)}`}
          trapFocus={surface.trapFocus}
        >
          {#snippet child({ props, wrapperProps, open })}
            {@const seen = drawn(props)}
            <!-- Closing, it lets presses through to the page (floating-presence).
                 It glides to each new placement while the surface morphs.
                 Closed and gone, it stands kept (bits-ui's forceMount), its
                 content built, unseen, unrendered and out of reach: the next
                 press draws it as it was left, nothing mounted. -->
            <div
              {...wrapperProps}
              class={seen ? undefined : "invisible content-visibility-hidden"}
              inert={!seen}
              style:pointer-events={pressable(open)}
              {@attach glides}
            >
              <!-- The label names what the trigger holds, so it changes as the
                 reader types or picks inside the surface. It is set here, on
                 the element: as a prop of Popover.Content each change
                 re-mounts bits-ui's focus scope, and focus leaves the field
                 for the trigger. -->
              <div
                {...own(props)}
                aria-label={surface?.label}
                data-room={room}
                id={`${surface?.id}-popover`}
                role="presentation"
                style:--ns-pop-room={room}
                style:pointer-events={pressable(open)}
                {@attach roomed}
                {@attach surface?.rows
                  ? highlight({ rows: surface.rows })
                  : undefined}
                {@attach morph({
                  ms: dur("--duration-panel"),
                  followUnfolds: true,
                  on: ["data-room"],
                  placed: true,
                  width: true,
                })}
              >
                <!-- The surface tweens to its content's next size (motion/
                     morph), width and height, as it glides to a sibling or
                     its own list filters, and to its next cap as its room
                     changes under a new trigger (`data-room`). The size it
                     tweens to is read at the new trigger's width and cap, and
                     the wrapper floating-ui places is held at it (`placed`),
                     so the wrapper glides once (`glides`), to where the
                     surface lands, on the size tween's clock. A question
                     unfolding in it (Full Send's) is the one motion, the
                     surface laid out at its size frame by frame. A fresh
                     open is drawn at its own content's size. -->
                {#each keptNow as member (member.id)}
                  {@const on = member === shown}
                  <!-- As the surface: a row with a long path shrinks and
                       ellipsises it, never widening the set past it. One
                       not shown stands out of the flow at its own width,
                       unseen and unrendered, its layout kept. -->
                  <!-- The one shown clips at the surface's inset (`clip-margin`,
                       the surface's own padding): its rows enter rising from
                       below (`ns-in`, --pop-rise), and the last row's lift
                       reached past the inset into the surface's scrollable
                       overflow, a scrollbar standing for the entry and going
                       as it landed, the rows shifting with it. -->
                  <div
                    class={on
                      ? "grid grid-cols-1 content-start gap-(--ns-pop-gap,0px) overflow-clip clip-margin-space-2"
                      : "invisible absolute start-0 top-0 grid w-(--kept-w) grid-cols-1 content-start gap-(--ns-pop-gap,0px) content-visibility-hidden"}
                    inert={!on}
                    style={`--ns-pop-gap:${member.gap}px;--kept-w:${popoverWidth(member.width)}`}
                    {@attach showing(member)}
                  >
                    {@render member.children()}
                  </div>
                {/each}
              </div>
            </div>
          {/snippet}
        </Popover.Content>
      {/if}
    </Popover.Portal>
  </PopoverRoot>
{/if}
