# Commit Message

## Title
fix: Enable parameters in ad-hoc query operations (group_by, etc.)

## Description
Fixed parameter propagation issue where parameters passed to sources in run statements were not available in ad-hoc query operations.

### Problem
```malloy
run: state_facts(param is "foo") -> { group_by: param_val is param }
//                                                           ^^^^^ 'param' is not defined
```

When using `source(param is value) -> { ... }`, the parameter values were stored in `inputStruct.arguments` but were not converted into a `ParameterSpace` that could be accessed by the inline view.

### Solution
Modified `QueryArrow.queryComp()` to detect when `inputStruct.arguments` contains parameter values and create a `ParameterSpace` from them, making parameters available to ad-hoc query operations.

### Changes
- **packages/malloy/src/lang/ast/query-elements/query-arrow.ts**
  - Added imports for `ParameterSpace` and `HasParameter`
  - Convert `arguments` to `ParameterSpace` when present
  - Pass parameter space to view and field space
  - Used proper TypeScript types (no `any`)

- **test/src/core/parameters.spec.ts**
  - Unskipped `string param used in group_by` test
  - Test now passes ✅

### Test Results
- **Before:** 33 passing, 10 skipped
- **After:** 34 passing, 9 skipped
- All existing tests continue to pass

### Impact
Parameters can now be used in:
- `group_by` clauses in ad-hoc queries
- Any inline query operation after `->` operator
- Maintains type safety with proper TypeScript types
