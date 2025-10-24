# Commit Message 2

## Title
fix: Enable parameters in query source definitions

## Description
Fixed parameter propagation issue where parameters declared on a query source were not available within the query definition itself.

### Problem
```malloy
source: state_facts_query(state_filter::string) is state_facts(state_filter) -> { select: * }
//                                                              ^^^^^^^^^^^^ 'state_filter' is not defined
```

When defining a parameterized query source, the source's own parameters were not available in the query expression, only outer parameters were passed through.

### Solution
Modified `QuerySource.withParameters()` to merge the source's own declared parameters (`pList`) with the outer parameter space before passing to the query. This follows the same pattern as `StaticSourceSpace.parameterSpace()`.

### Changes
- **packages/malloy/src/lang/ast/source-elements/query-source.ts**
  - Added import for `ParameterSpace`
  - Merge source's own parameters with outer parameters
  - Create effective parameter space that includes both contexts
  - Pass merged parameter space to the query

- **test/src/core/parameters.spec.ts**
  - Unskipped `can pass param into query definition` test
  - Test now passes ✅

### Test Results
- **Before:** 34 passing, 9 skipped
- **After:** 35 passing, 8 skipped
- All existing tests continue to pass

### Impact
Query sources can now be parameterized and reference their own parameters within the query definition:
```malloy
source: filtered_query(filter::string) is base_source(filter) -> { where: field = filter }
```

This enables reusable parameterized query patterns and more flexible query composition.
