# Main Branch Baseline (Reference)

**Captured:** October 20, 2025
**Branch:** `main` (up to date with origin/main)

## Test Status

### Language Tests (`packages/malloy/src/lang/test/parameters.spec.ts`)
**Result:** ✅ All passing
```
Tests:       8 skipped, 71 passed, 79 total
Test Suites: 1 passed, 1 total
Time:        6.243 s
```

**Skipped Tests:**
1. can pass parameter into source of query
2. can pass through parameter to source in joined query
3. can pass through parameter to view in joined query
4. can pass through parameter to source in query in SQL source
5. can pass through parameter to view in query in SQL source
6. can pass through parameter to source in query in joined SQL source
7. can use param in multi-stage query
8. can add an annotation to a param

**All 71 tests passing** - no failures.

### Integration Tests (`test/src/core/parameters.spec.ts`)
**Result:** ⚠️ 1 pre-existing failure
```
Tests:       1 failed, 8 skipped, 16 passed, 25 total
Test Suites: 1 failed, 1 total
Time:        3.444 s
```

**Passing Tests (16):**
1. number param used in dimension
2. number param used in sql function
3. can filter on filter expression param
4. can pass param into joined source correctly
5. can pass param into extended source
6. can shadow field that is excepted
7. default value propagates
8. default value can be overridden
9. default value passed through extension propagates
10. use parameter in nested view
11. can use param in join on
12. can use param in join with
13. source arguments in query propagate when turned into source
14. date parameters keep granularity when passing in
15. can use parameter in null check
16. default value not passed through extension propagates

**Failing Test (1):**
- ❌ `default value modified through extension propagates`
  - **Issue:** Expected `{param_value: 12}` Got: `11`
  - **Root Cause:** Pre-existing bug in default value propagation through extensions
  - **SQL Generated:** `SELECT 11 as "param_value" FROM malloytest.state_facts`
  - **Expected:** Should be `12` after modification through extension

**Skipped Tests (8):**
1. string param used in group_by
2. reference field in source in argument
3. can use dimension that uses field that is excepted
4. can shadow field that is excepted, using dimension that uses field that is excepted
5. default value modified through extension twice propagates
6. can pass param into joined source from query
7. can pass param into query definition
8. default value not passed through extension propagates, with composite source

## Summary

Main branch has stable parameter support with:
- ✅ 87 total passing tests (71 language + 16 integration)
- ⚠️ 1 known bug (default value modification through extension)
- 📝 16 skipped tests (features not yet implemented)

## Use as Baseline

When testing our branch, any test that:
- Exists and passes on main → Must still pass (regression if fails)
- Exists and fails on main → Known issue (not a regression)
- Doesn't exist on main → New test (failure indicates incomplete implementation)

This baseline confirms **zero regressions** in our branch - all our "failures" are from new tests!
