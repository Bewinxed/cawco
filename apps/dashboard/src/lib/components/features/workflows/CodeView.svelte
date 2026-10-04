<script lang="ts">
  import type { Problem } from "@cawco/core";
  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
  import { javascript } from "@codemirror/lang-javascript";
  import {
    bracketMatching,
    HighlightStyle,
    indentOnInput,
    syntaxHighlighting,
  } from "@codemirror/language";
  import {
    type Diagnostic,
    lintGutter,
    setDiagnostics,
  } from "@codemirror/lint";
  import { Compartment, EditorState } from "@codemirror/state";
  import {
    EditorView,
    highlightActiveLine,
    highlightActiveLineGutter,
    keymap,
    lineNumbers,
  } from "@codemirror/view";
  import { tags } from "@lezer/highlight";
  import { untrack } from "svelte";
  import { withoutLine } from "./workflow-ui";

  let {
    value,
    editable = false,
    problems = [],
    label,
    onchange,
  }: {
    editable?: boolean;
    label: string;
    onchange?: (value: string) => void;
    problems?: Problem[];
    value: string;
  } = $props();

  /**
   * Monochrome on purpose. DESIGN.md budgets 2.57% of the surface for hue and
   * spends it on status; a token rainbow here would make the program the
   * loudest thing in the product. Structure rides weight and ink instead, and
   * survives greyscale.
   */
  const highlight = HighlightStyle.define([
    {
      tag: [tags.keyword, tags.modifier],
      color: "var(--ink-strong)",
      fontWeight: "500",
    },
    {
      tag: [
        tags.definition(tags.variableName),
        tags.function(tags.variableName),
        tags.propertyName,
      ],
      color: "var(--ink-strong)",
    },
    {
      tag: [
        tags.string,
        tags.special(tags.string),
        tags.number,
        tags.bool,
        tags.null,
      ],
      color: "var(--ink-muted)",
    },
    {
      tag: [tags.comment, tags.lineComment, tags.blockComment],
      color: "var(--ink-muted)",
      fontStyle: "italic",
    },
    { tag: [tags.typeName, tags.className], color: "var(--ink-strong)" },
    {
      tag: [tags.operator, tags.punctuation, tags.bracket],
      color: "var(--ink-muted)",
    },
  ]);
  const theme = EditorView.theme({
    "&": {
      height: "100%",
      color: "var(--ink-strong)",
      backgroundColor: "var(--surface-recess)",
      fontSize: "var(--text-label)",
    },
    "&.cm-focused": {
      outline: "var(--focus-ring-width) solid var(--focus-ring)",
      outlineOffset: "var(--focus-ring-inset)",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      lineHeight: "var(--leading-body)",
    },
    ".cm-content": {
      padding: "var(--space-3) 0",
      caretColor: "var(--ink-strong)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--surface-recess)",
      color: "var(--ink-muted)",
      border: "0",
      borderInlineEnd: "1px solid var(--border-hairline)",
      paddingInlineEnd: "var(--space-2)",
    },
    ".cm-lineNumbers .cm-gutterElement": { minWidth: "32px" },
    ".cm-activeLine": { backgroundColor: "var(--surface-hover)" },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--ink-strong)",
    },
    ".cm-cursor": { borderLeftColor: "var(--ink-strong)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
      {
        backgroundColor: "var(--surface-fill)",
      },
    ".cm-lintRange-error": {
      backgroundImage: "none",
      textDecoration: "underline wavy var(--status-fail-ink)",
      textUnderlineOffset: "3px",
    },
    ".cm-diagnostic": {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-label)",
      borderInlineStart: "3px solid var(--status-fail-ink)",
      backgroundColor: "var(--surface-raised)",
      color: "var(--ink-strong)",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--surface-raised)",
      border: "1px solid var(--border-control)",
      borderRadius: "var(--radius-sm)",
      boxShadow: "var(--shadow-overlay)",
    },
  });
  const editing = new Compartment();
  let host = $state<HTMLElement>();
  let view: EditorView | undefined;

  /** The hub prefixes a diagnostic with its line; the gutter already says it. */
  /** Line-anchored diagnostics become a CodeMirror range on that line. */
  function marks(state: EditorState): Diagnostic[] {
    return problems
      .filter((problem) => problem.line && problem.line <= state.doc.lines)
      .map((problem) => {
        const line = state.doc.line(problem.line as number);
        return {
          from: line.from,
          to: line.to,
          severity: "error" as const,
          message: withoutLine(problem.message),
        };
      });
  }
  $effect(() => {
    const parent = host;
    if (!parent) {
      return;
    }
    return untrack(() => mount(parent));
  });
  function mount(parent: HTMLElement) {
    view = new EditorView({
      parent,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          indentOnInput(),
          bracketMatching(),
          // A read-only program has no caret, so an active line would mark a
          // row the operator never put anything on.
          ...(editable
            ? [highlightActiveLine(), highlightActiveLineGutter()]
            : []),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          javascript({ typescript: true }),
          syntaxHighlighting(highlight),
          EditorView.lineWrapping,
          theme,
          editing.of([
            EditorState.readOnly.of(!editable),
            EditorView.editable.of(editable),
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onchange?.(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    view.dispatch(setDiagnostics(view.state, marks(view.state)));
    const instance = view;
    return () => {
      instance.destroy();
      view = undefined;
    };
  }
  $effect(() => {
    const writable = editable;
    view?.dispatch({
      effects: editing.reconfigure([
        EditorState.readOnly.of(!writable),
        EditorView.editable.of(writable),
      ]),
    });
  });
  // The document is owned outside when it is read-only (a recompile on save)
  // and inside while it is being typed, so only a genuine divergence is pushed.
  $effect(() => {
    const next = value;
    if (view && untrack(() => view?.state.doc.toString()) !== next) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
      });
    }
  });
  $effect(() => {
    // Read `problems` here so the effect re-runs when the hub answers.
    const pinned = problems;
    if (view && pinned) {
      untrack(() => {
        if (view) {
          view.dispatch(setDiagnostics(view.state, marks(view.state)));
        }
      });
    }
  });
</script>
<section aria-label={label} class="code-view" bind:this={host}></section>
<style>
  .code-view {
    height: 100%;
    min-height: 0;
    background: var(--surface-recess);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .code-view :global(.cm-editor) {
    height: 100%;
  }
</style>
