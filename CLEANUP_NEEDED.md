# Cleanup Needed Before Merge

## Diagnostic Logging

The branch contains extensive diagnostic logging that was added during development and debugging. These logs need to be removed or gated behind environment variables before merging.

### Files with Diagnostic Logs

#### Core Model Files (High Priority)
- `packages/malloy/src/model/query_node.ts` - Extensive logging in `arguments()`, `_computeArguments()`, `_inheritArgumentsFromChain()`, constructor
- `packages/malloy/src/model/query_query.ts` - SQL generation logging, join condition logging
- `packages/malloy/src/model/query_model_impl.ts` - Runtime wrapper creation logging
- `packages/malloy/src/model/expression_compiler.ts` - Parameter resolution logging (CLEANED UP)
- `packages/malloy/src/model/stage_writer.ts` - Stage SQL and name logging
- `packages/malloy/src/model/field_instance.ts` - JoinInstance creation logging
- `packages/malloy/src/model/join_instance.ts` - Join relationship logging

#### AST/Compiler Files (Medium Priority)
- `packages/malloy/src/lang/ast/source-elements/named-source.ts` - Parameter evaluation and constant folding logging
- `packages/malloy/src/lang/ast/query-elements/query-arrow.ts` - **BROKEN console.log statements** (lines 60, 64, 117, 121, 146)
- `packages/malloy/src/lang/ast/source-query-elements/sq-arrow.ts` - **BROKEN console.log statement** (line 70)
- `packages/malloy/src/lang/ast/source-properties/join.ts` - **BROKEN console.log statements** (lines 266, 270, 282, 295)
- `packages/malloy/src/lang/ast/field-space/query-input-space.ts` - **BROKEN console.log statements** (lines 112, 116)
- `packages/malloy/src/lang/ast/field-space/parameter-space.ts` - **BROKEN console.log statement** (line 43)
- `packages/malloy/src/lang/ast/field-space/static-space.ts` - **BROKEN console.log statements** (lines 102, 112, 274, 325, 346)

## Broken Console.log Statements

Several files have incomplete console.log statements (missing the `console.log(` wrapper) that are causing TypeScript compilation errors:

```typescript
// BROKEN - Missing console.log(
`[SomeClass.method] Message`,
value
);

// SHOULD BE (if keeping):
console.log(
  `[SomeClass.method] Message`,
  value
);

// OR BETTER (remove entirely):
// (deleted)
```

### Immediate Action Required

1. **Fix Compilation Errors**: Remove all broken console.log statements in the AST files listed above
2. **Clean Up Model Logs**: Remove or gate all diagnostic logging in model files
3. **Keep Only Essential Logs**: If any logging is needed for debugging, gate it behind `process.env['MALLOY_DEBUG']` or similar

### Recommended Approach

```typescript
// Instead of:
console.log('[debug] Some message', data);

// Use:
if (process.env['MALLOY_DEBUG']) {
  console.log('[debug] Some message', data);
}

// Or remove entirely if not needed for production debugging
```

## Other Cleanup Tasks

1. **Remove Recursion Guard Logging**: The `structSQLCallStack` guard has detailed error logging that should be simplified
2. **Remove Stage Debug Files**: `stage_debug.log` files are being written to disk - remove this
3. **Simplify Error Messages**: Some error messages include debug info that should be removed

## Testing After Cleanup

After removing diagnostic logs:
1. Run full test suite: `npm test`
2. Verify all 125 parameter tests still pass
3. Check that no essential debugging information was removed
4. Ensure TypeScript compilation succeeds: `npm run build`

## Status

- ✅ `expression_compiler.ts` - Cleaned up (removed broken console.log statements)
- ✅ `join-space-field.ts` - Cleaned up (removed broken console.log statements)
- ⏳ AST files - Need to remove broken console.log statements
- ⏳ Model files - Need to remove or gate diagnostic logging
- ⏳ Test compilation - Blocked by broken console.log statements
