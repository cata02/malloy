# Test Results Comparison: Main vs Branch

## Summary

| Metric | Main | Branch | Difference |
|--------|------|--------|------------|
| **Passing** | 1134 | 1114 | **-20** ❌ |
| **Failing** | 0 | 54 | **+54** ❌ |
| **Skipped** | 31 | 39 | +8 |
| **Total** | 1167 | 1209 | +42 |

## Analysis

**REGRESSIONS DETECTED:** 20 tests that were passing on main are now failing on our branch.

The additional 42 tests are new parameter tests we added, but we broke 54 existing tests in the process.

## Failing Test Suites on Branch

1. `query.spec.ts` - 7 failures
2. `composite-field-usage.spec.ts` 
3. `source.spec.ts`
4. `parse.spec.ts`
5. `lenses.spec.ts`
6. `syntax-errors.spec.ts`
7. `locations.spec.ts`
8. `parameters.spec.ts` - 4 failures (funnel tests)

## Sample Errors

1. **"Can't determine view type"** - Multiple tests failing with this error
2. **"'metrics' is not defined"** - Field resolution issues
3. **Error message mismatches** - Some error checking tests failing

## Root Cause Hypothesis

The TypeScript console.log removal tool likely removed too much code, breaking:
- View type determination logic
- Field resolution in certain contexts
- Error message generation

## Next Steps

1. Identify what code was accidentally removed by the TypeScript cleaner
2. Restore the broken functionality
3. Re-run tests to confirm no regressions
4. Only then can we accept this work
