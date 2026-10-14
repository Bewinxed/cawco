<!--
  Renders an OpenUI Lang program with a component library, running its
  Query() tools: a Svelte 5 binding over `@openuidev/lang-core`'s runtime,
  written to the behaviour of react-lang 1.0.0's Renderer
  (`useOpenUIState`): the streaming parser, the store holding `$bindings`,
  the query manager calling a tool provider, `evaluateRoot` resolving every
  prop to a value, then each element drawn by its library component inside
  its own error boundary. `@openuidev/svelte-lang` 0.4.1's Renderer runs no
  Query() tools (it has no `toolProvider` and draws props unevaluated), which
  is why this exists; it depends on nothing but lang-core and Svelte, so it
  can be offered upstream as that package's tool support.

  Bare programs only: OpenUI Cloud's message framing and its scripts
  section (code the host would run) are not read. No actions or form state:
  a component reads its props and renders children through `renderNode`.
-->
<script lang="ts" module>
  import type {
    ElementNode,
    EvaluationContext,
    Library,
    McpClientLike,
    OpenUIError,
    ParseResult,
    QueryManager,
    QuerySnapshot,
    ToolProvider,
  } from "@openuidev/lang-core";
  import type { Component, Snippet } from "svelte";

  /** What every component of the library is given. */
  export interface OpenUIRenderProps<P = Record<string, unknown>> {
    props: P;
    /** Draws any value a prop holds: an element, an array, a primitive. */
    renderNode: Snippet<[unknown]>;
    /** The statement the element came from (`header = …`); none for an inline one. */
    statementId?: string;
  }
  // biome-ignore lint/suspicious/noExplicitAny: a library holds components of every prop shape
  export type OpenUIComponent = Component<OpenUIRenderProps<any>>;
  export type OpenUILibrary = Library<OpenUIComponent>;

  /** Query()'s tools: a plain object of async functions by tool name, or an MCP client. */
  export type OpenUIToolProvider =
    | Record<string, (args: Record<string, unknown>) => Promise<unknown>>
    | McpClientLike;

  /** A form field's stored `{ value, componentType }`, read as its value. */
  const unwrap = (value: unknown): unknown =>
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "value" in value
      ? (value as { value: unknown }).value
      : value;

  const isElement = (value: unknown): value is ElementNode =>
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "element";

  /** Reads its arguments, and nothing more: what a derived or an effect also re-runs on. */
  const dependsOn = (..._values: unknown[]): void => undefined;

  const EMPTY_QUERIES: QuerySnapshot = {
    __openui_loading: [],
    __openui_refetching: [],
    __openui_errors: [],
  };
</script>

<script lang="ts">
  import {
    createQueryManager,
    createStore,
    createStreamingParser,
    evaluate,
    evaluateRoot,
    extractToolResult,
    ToolNotFoundError,
  } from "@openuidev/lang-core";
  import { untrack } from "svelte";
  import RegionHeld from "../../RegionHeld.svelte";

  let {
    response,
    library,
    isStreaming = false,
    toolProvider = null,
    class: className,
    pending: pendingContent,
    onParseResult,
    onError,
  }: {
    /** The program: openui-lang text. */
    response: string | null;
    library: OpenUILibrary;
    /** The text is still arriving: queries wait for it to end. */
    isStreaming?: boolean;
    toolProvider?: OpenUIToolProvider | null;
    class?: string;
    /**
     * Drawn instead of the program until each of its Queries has answered
     * once, so a Query's defaults are never shown as its data. Without it,
     * the program draws at once with the defaults.
     */
    pending?: Snippet;
    /** The raw parse (props still as AST), each time it changes. */
    onParseResult?: (result: ParseResult | null) => void;
    /** Every error the parser, the evaluation, a render or a tool reported; [] once all are gone. */
    onError?: (errors: OpenUIError[]) => void;
  } = $props();

  // ─── The tool provider: one identity, reading the latest prop per call ───
  const provider: ToolProvider = {
    async callTool(toolName, args) {
      const current = toolProvider;
      if (current === null || current === undefined) {
        throw new Error("[openui] toolProvider is null");
      }
      if (typeof (current as McpClientLike).callTool === "function") {
        return extractToolResult(
          await (current as McpClientLike).callTool({
            name: toolName,
            arguments: args,
          })
        );
      }
      const map = current as Record<
        string,
        (a: Record<string, unknown>) => Promise<unknown>
      >;
      const fn = map[toolName];
      if (!fn) {
        throw new ToolNotFoundError(toolName, Object.keys(map));
      }
      return fn(args);
    },
  };
  const hasProvider = $derived(
    toolProvider !== null && toolProvider !== undefined
  );

  // ─── Parser ───
  const schema = $derived(library.toJSONSchema());
  const parser = $derived(createStreamingParser(schema, library.root));
  const functions = $derived(
    Object.fromEntries(
      Object.entries(schema.functions ?? {}).flatMap(([name, spec]) => {
        const fn = library.functions?.[name]?.fn;
        return fn ? [[name, { ...spec, fn }]] : [];
      })
    )
  );

  let parseException: OpenUIError | null = null;
  const result = $derived.by((): ParseResult | null => {
    parseException = null;
    if (!response) {
      return null;
    }
    try {
      return parser.set(response, !isStreaming);
    } catch (error) {
      parseException = {
        source: "parser",
        code: "parse-exception",
        message: `Parser crashed: ${error instanceof Error ? error.message : String(error)}`,
        hint: "The response may contain syntax the parser cannot handle",
      };
      return null;
    }
  });
  $effect(() => {
    onParseResult?.(result);
  });

  // ─── Store and query manager ───
  const store = createStore();
  $effect(() => () => store.dispose());
  const queries = $derived<QueryManager>(
    createQueryManager(hasProvider ? provider : null)
  );
  $effect(() => {
    const manager = queries;
    manager.activate();
    return () => manager.dispose();
  });

  let storeSnapshot = $state.raw(store.getSnapshot());
  $effect(() =>
    store.subscribe(() => {
      storeSnapshot = store.getSnapshot();
    })
  );
  let querySnapshot = $state.raw<QuerySnapshot>(EMPTY_QUERIES);
  $effect(() => {
    const manager = queries;
    querySnapshot = manager.getSnapshot();
    return manager.subscribe(() => {
      querySnapshot = manager.getSnapshot();
    });
  });

  // `$state` defaults the program declares, set once per declaration set.
  let declared = "";
  $effect(() => {
    const declarations = result?.stateDeclarations;
    if (!declarations) {
      return;
    }
    const key = JSON.stringify(declarations);
    if (key !== declared) {
      declared = key;
      untrack(() => store.initialize(declarations, {}));
    }
  });

  const context = $derived<EvaluationContext>({
    getState: (name) => unwrap(store.get(name)),
    resolveRef: (name) =>
      queries.getMutationResult(name) ?? queries.getResult(name),
    functions,
    actions: schema.actions,
  });

  // ─── Queries and mutations, once the program has arrived ───
  $effect(() => {
    if (isStreaming) {
      return;
    }
    const statements = result?.queryStatements ?? [];
    const ctx = context;
    const snapshot = storeSnapshot;
    const manager = queries;
    untrack(() => {
      manager.evaluateQueries(
        statements.map((statement) => {
          const deps: Record<string, unknown> = {};
          for (const ref of statement.deps ?? []) {
            deps[ref] = snapshot[ref];
          }
          return {
            statementId: statement.statementId,
            toolName: statement.toolAST
              ? (evaluate(statement.toolAST, ctx) as string)
              : "",
            args: statement.argsAST ? evaluate(statement.argsAST, ctx) : null,
            defaults: statement.defaultsAST
              ? evaluate(statement.defaultsAST, ctx)
              : null,
            refreshInterval: statement.refreshAST
              ? (evaluate(statement.refreshAST, ctx) as number)
              : undefined,
            deps: Object.keys(deps).length > 0 ? deps : undefined,
            complete: statement.complete,
          };
        })
      );
    });
  });
  $effect(() => {
    if (isStreaming) {
      return;
    }
    const statements = result?.mutationStatements ?? [];
    const ctx = context;
    const manager = queries;
    untrack(() =>
      manager.registerMutations(
        statements.map((statement) => ({
          statementId: statement.statementId,
          toolName: statement.toolAST
            ? (evaluate(statement.toolAST, ctx) as string)
            : "",
        }))
      )
    );
  });

  // ─── Every prop evaluated, again whenever the store or a query moves ───
  let runtimeErrors: OpenUIError[] = [];
  const evaluated = $derived.by((): ElementNode | null => {
    dependsOn(storeSnapshot, querySnapshot);
    if (!(result?.root || result?.rootExpression)) {
      return result?.root ?? null;
    }
    const errors: OpenUIError[] = [];
    try {
      const root = evaluateRoot(result, {
        ctx: context,
        library,
        store,
        errors,
      });
      runtimeErrors = errors;
      return root;
    } catch (error) {
      runtimeErrors = [
        ...errors,
        {
          source: "runtime",
          code: "runtime-error",
          message: `Prop evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ];
      return result.root;
    }
  });

  // ─── A component that throws: reported, and tried again with the next props ───
  let renderErrors: OpenUIError[] = [];
  let renderFailures = $state(0);
  let retries: (() => void)[] = [];
  function renderFailed(component: string, error: unknown, reset: () => void) {
    retries.push(reset);
    if (isStreaming) {
      return;
    }
    renderErrors.push({
      source: "runtime",
      code: "render-error",
      component,
      message: `Component ${component} render failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    renderFailures += 1;
  }
  $effect(() => {
    dependsOn(evaluated);
    untrack(() => {
      const again = retries;
      retries = [];
      for (const reset of again) {
        reset();
      }
    });
  });

  // ─── Errors: the parser's, the evaluation's, the renders' and the tools' ───
  let reported = "";
  $effect(() => {
    dependsOn(renderFailures, evaluated);
    const parsed = result;
    const tools = querySnapshot.__openui_errors ?? [];
    if (isStreaming) {
      if (reported !== "") {
        reported = "";
        untrack(() => onError?.([]));
      }
      return;
    }
    const errors: OpenUIError[] = [];
    if (parseException) {
      errors.push(parseException);
    }
    if (response && !parsed?.meta.statementCount && !parseException) {
      errors.push({
        source: "parser",
        code: "parse-failed",
        message: "Response could not be parsed as valid openui-lang",
        hint: `The entire response must be valid openui-lang code starting with root = ${library.root ?? "Root"}(...)`,
      });
    }
    for (const error of parsed?.meta.errors ?? []) {
      errors.push({ source: "parser", ...error });
    }
    errors.push(...runtimeErrors, ...renderErrors, ...tools);
    renderErrors = [];
    const key = JSON.stringify(errors);
    if (key === reported) {
      return;
    }
    reported = key;
    untrack(() => {
      if (onError) {
        onError(errors);
      } else {
        for (const error of errors) {
          console.warn(
            `[openui] ${error.source}/${error.code}: ${error.message}`
          );
        }
      }
    });
  });

  const loading = $derived(querySnapshot.__openui_loading.length > 0);
  /**
   * A Query has not answered once yet: the manager has no entry for it, or
   * it is loading for the first time (loading, and not a refetch).
   */
  const unanswered = $derived(
    (result?.queryStatements ?? []).some(
      ({ statementId }) =>
        !(statementId in querySnapshot) ||
        (querySnapshot.__openui_loading.includes(statementId) &&
          !querySnapshot.__openui_refetching.includes(statementId))
    )
  );
</script>

{#snippet renderNode(
  value: unknown
)}
  {#if value === null || value === undefined}
    <!-- nothing -->
  {:else if typeof value === "string"}
    {value}
  {:else if typeof value === "number" || typeof value === "boolean"}
    {String(value)}
  {:else if Array.isArray(value)}
    {#each value as item, index (index)}
      {@render renderNode(item)}
    {/each}
  {:else if isElement(value)}
    {@render element(value)}
  {/if}
{/snippet}

{#snippet element(
  node: ElementNode
)}
  {@const Comp = library.components[node.typeName]?.component}
  {#if Comp}
    <svelte:boundary
      onerror={(error, reset) => renderFailed(node.typeName, error, reset)}
    >
      <!-- Its error is the component's, never the route's (region-held.ts). -->
      <RegionHeld />
      <Comp props={node.props} {renderNode} statementId={node.statementId} />
      {#snippet failed()}
        <!-- A component that throws draws nothing; its error is reported. -->
      {/snippet}
    </svelte:boundary>
  {/if}
{/snippet}

{#if pendingContent && unanswered}
  {@render pendingContent()}
{:else if evaluated}
  <div
    aria-busy={loading}
    class={className}
    data-query-loading={loading ? "" : undefined}
  >
    {@render element(evaluated)}
  </div>
{/if}
