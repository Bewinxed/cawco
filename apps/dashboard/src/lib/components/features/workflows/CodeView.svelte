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
   * The code surfaces' one theme (DESIGN.md, Syntax): each tag takes the
   * role Shiki's css-variables theme gives it on every other code surface,
   * through the same `--code-syntax-token-*` properties app.css maps onto
   * the syntax tokens. Type and class names are entity names, which that
   * theme colours as functions.
   */
  const highlight = HighlightStyle.define([
    {
      tag: [tags.keyword, tags.modifier],
      color: "var(--code-syntax-token-keyword)",
    },
    {
      tag: [
        tags.function(tags.variableName),
        tags.function(tags.propertyName),
        tags.typeName,
        tags.className,
      ],
      color: "var(--code-syntax-token-function)",
    },
    {
      tag: [tags.string, tags.special(tags.string), tags.regexp],
      color: "var(--code-syntax-token-string)",
    },
    {
      tag: [tags.number, tags.bool, tags.null, tags.atom],
      color: "var(--code-syntax-token-constant)",
    },
    {
      tag: [tags.comment, tags.lineComment, tags.blockComment],
      color: "var(--code-syntax-token-comment)",
    },
    {
      tag: [tags.operator, tags.punctuation, tags.bracket],
      color: "var(--code-syntax-token-punctuation)",
    },
  ]);
  const theme = EditorView.theme({
    "&": {
      height: "100%",
      color: "var(--code-syntax-foreground)",
      backgroundColor: "var(--code-syntax-background)",
      fontSize: "var(--text-label)",
    },
    // An editor's focus is its caret (DESIGN.md, The Caret Rule): the
    // view draws no outline (CodeMirror's own is a dotted one), and the
    // host's frame steps its edge (`field-edge`).
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      lineHeight: "var(--leading-body)",
    },
    ".cm-content": {
      padding: "var(--space-3) 0",
      caretColor: "var(--ink-strong)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--code-syntax-background)",
      color: "var(--ink-muted)",
      border: "0",
      borderInlineEnd: "1px solid var(--border-hairline)",
      paddingInlineEnd: "var(--space-2)",
    },
    ".cm-lineNumbers .cm-gutterElement": { minWidth: "var(--space-8)" },
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
      textUnderlineOffset: "var(--space-1)",
    },
    ".cm-diagnostic": {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-label)",
      borderInlineStart: "var(--space-1) solid var(--status-fail-ink)",
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
  /**
   * The active line, only while the program can be edited: a read-only
   * program has no caret, so an active line would mark a row the operator
   * never put anything on. Reconfigured with `editing`, so it follows
   * `editable` whenever that arrives, before the editor mounts or after.
   */
  const activeLine = new Compartment();
  const activeLineFor = (writable: boolean) =>
    writable ? [highlightActiveLine(), highlightActiveLineGutter()] : [];
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
          activeLine.of(activeLineFor(editable)),
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
      effects: [
        editing.reconfigure([
          EditorState.readOnly.of(!writable),
          EditorView.editable.of(writable),
        ]),
        activeLine.reconfigure(activeLineFor(writable)),
      ],
    });
  });
  // The document is owned outside when it is read-only (a recompile on save)
  // and inside while it is being typed, so only a genuine divergence is pushed.
  // The text that lands after the editor mounts reads as it would had it
  // landed first: the caret where it stood (a whole-text replacement would
  // map it to the text's end), and the problems marked on the new lines.
  $effect(() => {
    const next = value;
    if (view && untrack(() => view?.state.doc.toString()) !== next) {
      const { head } = view.state.selection.main;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
        selection: { anchor: Math.min(head, next.length) },
      });
      view.dispatch(setDiagnostics(view.state, marks(view.state)));
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

<section
  aria-label={label}
  data-slot="code-view"
  class="field-edge transition-control h-full min-h-0 bg-(color:--code-syntax-background) border border-border-well rounded-md overflow-hidden"
  bind:this={host}
></section>
