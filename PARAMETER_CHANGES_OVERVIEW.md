# Code Review Guide: Parameter Scoping and Resolution Changes

## 1. High-Level Overview

This document provides a detailed walkthrough of the changes on the `params-in-pipeline-stages` branch. These changes fundamentally refactor how parameters are handled in the Malloy compiler to support more advanced query patterns, fix critical bugs, and improve the overall robustness of the system.

### The Problem: Why Was This Change Needed?

The previous compiler had a critical flaw: it tightly coupled the structure of a query (the tree of sources and joins) with the way it looked up parameter values. This created a problem in advanced scenarios, particularly when a `join` contained a multi-stage pipeline that needed to reference a parameter from an "outer" source.

**A "Pattern 3" Example:**

```malloy
source: airports(p_state: string) is table('airports') extend {
  where: state = p_state

  join_one: carriers_by_state is carriers -> {
    where: state = p_state  // <-- PROBLEM HERE
  } on carrier = carriers.code
}
```

To make `p_state` available inside the `carriers -> { ... }` pipeline, the old compiler created a *structural link* from the pipeline back to the `airports` source. This created a cycle (`airports` contains a join which refers back to `airports`), leading to infinite recursion and compiler crashes.

### The Solution: Decoupling Parameter Scope

The core of this branch is a single, powerful idea: **Parameter visibility (scope) should be separate from the query's physical structure.**

To achieve this, a new mechanism called `ParameterScope` was introduced. Think of it like lexical scope in JavaScript or Python. It's a chain of scopes, and when the compiler needs a parameter's value, it looks in the current scope, then its parent, and so on, up the chain.

This new `ParameterScope` chain is built independently of the join tree, which remains a clean, acyclic structure. This elegantly solves the recursion problem while making parameter resolution more predictable and powerful.

---

## 2. Changes by Functional Area

### A. Core Parameter Resolution Engine (`packages/malloy/src/model/query_node.ts`)

This is where the most fundamental changes occurred.

**Background:** The `QueryStruct` class is the compiler's internal blueprint for a query scope (a source or a join). It contains all the fields and context for that part of the query. Its `arguments()` method is the engine that resolves the final values for all parameters in scope.

**Code Changes:**

1.  **New `ParameterScope` Interface:** A new data structure was introduced to represent the lexical scope chain, completely separate from the `QueryStruct`'s structural `parent` property.

    ```typescript
    export interface ParameterScope {
      readonly bindings: Record<string, Argument>;
      readonly parent?: ParameterScope;
      // ... metadata
    }
    ```

2.  **`QueryStruct` Integration:** The `QueryStruct` class was given a `paramScope` property, making it the anchor for this new system. Its constructor was updated to build this chain correctly for root queries and nested joins.

3.  **Complete Overhaul of `arguments()`:** This critical method was rewritten to use the new `paramScope` chain exclusively. It no longer relies on the structural `parent` for lookups.

4.  **Refactoring for Clarity (Your Suggestion):** Based on your feedback, the complex `arguments()` method was refactored into smaller, private helper methods (`_computeArguments`, `_applyIncomingArguments`, etc.). This improves readability without changing the correct logic.

5.  **Handling of `null` Overrides (Your Change):** You correctly identified a subtle but important edge case. The logic in `_applyIncomingArguments` was refined to ensure that a `null` or `undefined` value passed as a runtime parameter is treated as an **explicit override**, preventing an incorrect fallback to a value from a parent scope.

    ```typescript
    // In _applyIncomingArguments...
    const fromRuntime = this.sourceArguments !== undefined &&
      Object.prototype.hasOwnProperty.call(this.sourceArguments, name);
    if (fromRuntime) {
      allArgs[name] = arg as Argument;
    } else {
      // Otherwise, allow fallback...
    }
    ```

6.  **Dead Code Removal (Your Change):** The old `resolveParentParameterReferences` method is now unused because the new `paramScope` system and the expression compiler handle all resolution. You correctly identified this and it has been commented out, clearly marking the definitive switch to the new paradigm.

### B. Join & Pipeline Compilation (`packages/malloy/src/model/query_query.ts`)

This is where the new `ParameterScope` system is put to the test to solve the "Pattern 3" recursion problem.

**Background:** The `QueryQuery` class is the orchestrator that transforms the parsed AST into a `QueryStruct` model and then generates SQL from it. The `_getStructSourceSQLImpl` method is responsible for generating the SQL for a source, including sources-within-joins.

**Code Changes:**

1.  **Breaking the Structural Cycle:** The code that compiles a `query_source` (a pipeline within a join) has been modified to prevent recursion. When it creates the `QueryStruct` for the pipeline's underlying source, it now sets its structural parent to the top-level `model` instead of the join it's inside.

    ```typescript
    // Inside _getStructSourceSQLImpl...
    sourceStruct = new QueryStruct(
      struct.structDef,
      effectiveArgs,
      {model: this.parent.model}, // <-- This breaks the cycle
      qs.prepareResultOptions
    );
    ```

2.  **Manually Correcting the `paramScope`:** Although the structural link is broken, the parameter link is preserved. The logic in `query_query.ts` now manually connects the pipeline's `paramScope` to the join's `paramScope`, ensuring parameters can flow from the outer query into the inner pipeline. This is the other half of the solution.

3.  **Recursion Guard with Logging (Your Suggestion):** A safety net called `structSQLCallStack` was added to catch any potential cycles that might have been missed. As you requested, I added a detailed error log to this guard. If it's ever triggered, it will now log the problematic struct and the call stack, providing essential debugging information.

    ```typescript
    // Inside getStructSourceSQL...
    if (structSQLCallStack.has(structKey)) {
      console.error(
        `[Malloy] Infinite recursion detected...`,
        'Call stack:',
        Array.from(structSQLCallStack)
      );
      throw new Error(...);
    }
    ```

### C. Testing (`...spec.ts` files)

**Background:** A robust test suite is critical for a compiler. The files ending in `.spec.ts` contain tests that define expected behaviors.

**Changes:** The files `packages/malloy/src/lang/test/parameters.spec.ts` and `test/src/core/parameters.spec.ts` have been significantly updated. They now include new tests specifically for the "Pattern 3" case, asserting that parameters passed from an outer source are correctly resolved and used within a join's inner pipeline. These tests codify the new, correct behavior and protect against future regressions.

