# Pattern 3: Join Pipeline Parameters - Work Plan

**Objective:** Fix 11 failing language tests for parameter access in join query pipelines

## The Problem

When a source with parameters has a join that contains a query pipeline, parameters from the outer source are not accessible within the join's pipeline stages.

### Example Failing Test
```malloy
source: sf(p::string) is duckdb.table('malloytest.state_facts') extend {
  join_one: j is inner_source(p_inner is p) -> {
    group_by: state
    where: state = p  // ❌ ERROR: 'p' is not defined
  }
}
```

## Failing Tests (11 total)

From `packages/malloy/src/lang/test/parameters.spec.ts`:

### Basic Join Pipeline Tests (Lines 900-960)
1. ✅ "pipeline filters on literal" - PASSING
2. ❌ "pipeline references outer source" - `state_filter` not visible
3. ❌ "pipeline references outer source with explicit argument" - Similar issue

### Join-in-View Parameter Tests (Lines 961-1010)
4. ❌ "join ON clause uses param (view stage)" - Param not visible
5. ❌ "join inner pipeline references param (view stage)" - Param not visible

### Nested/Multi-Stage Tests
6. ❌ "join with parameters in multi-stage pipeline"
7. ❌ "join_one with pipeline where inner stage references param"
8. ❌ "join_one simple source with pipeline referencing outer param"

### Join-in-View Additional Tests
9-11. ❌ Three more join-in-view scenarios with parameter issues

## Root Cause Analysis

### Compilation Phase ✅ (Mostly Fixed)
We've made progress here:
- ✅ `StaticSourceSpace` propagates `parameterSpaceRef` to join fields
- ✅ `QueryInputSpace` checks parameter space during lookup
- ⚠️ **Incomplete:** Parameters not propagating in all join scenarios (especially view-defined joins)

### SQL Generation Phase ✅ (Fixed)
- ✅ Symbolic parameter generation when values unavailable
- ✅ Fixed parent assignment to prevent recursion
- ✅ Primary key join condition generation

## What We've Fixed

### Files Modified
1. **static-space.ts** - Parameter propagation to join fields
2. **query-input-space.ts** - Parameter space lookup
3. **query_query.ts** - Parent assignment, SQL generation
4. **expression_compiler.ts** - Symbolic parameters

### Scenarios Working
- ✅ Simple join with literal values in pipeline
- ✅ Parameters in join ON clauses
- ✅ Parameters in join WITH clauses
- ✅ Basic parameter passing to joined sources

## What Still Fails

### Pattern A: Direct Parameter Reference in Join Pipeline
```malloy
source: sf(p::string) is table extend {
  join_one: j is other_table -> {
    where: field = p  // ❌ 'p' is not defined
  }
}
```

### Pattern B: Parameter Passed to Inner Source
```malloy
source: sf(p::string) is table extend {
  join_one: j is inner_source(p_inner is p) -> {
    where: field = p  // ❌ 'p' is not defined (even though passed as p_inner)
  }
}
```

### Pattern C: Join in View with Parameters
```malloy
source: sf(p::string) is table extend {
  view: v is {
    join_one: j is other_table -> {
      where: field = p  // ❌ 'p' is not defined
    }
  }
}
```

## Investigation Checklist

For each failing test, determine:
- [ ] Is parameter visible during compilation? (check logs)
- [ ] Does ParameterSpace contain the parameter?
- [ ] Is FieldSpace lookup finding it?
- [ ] Where does the lookup fail?
- [ ] Is it a compilation issue or SQL generation issue?

## Implementation Strategy

### Phase 1: Identify Exact Failure Points (Current)
1. Run failing tests with full logging
2. Trace parameter lookup path
3. Identify where propagation breaks

### Phase 2: Fix Compilation Issues
1. Ensure parameter propagation for view-defined joins
2. Fix nested pipeline parameter access
3. Verify parameter space chain is intact

### Phase 3: Fix SQL Generation Issues
1. Ensure parameter values flow to join contexts
2. Fix any remaining symbolic parameter issues
3. Test all scenarios

### Phase 4: Validation
1. Run all 11 failing tests
2. Verify no regressions on passing tests
3. Clean up debug logging

## Quick Test Command

```bash
# Run all Pattern 3 related tests
npm test -- --testPathPattern="parameters.spec" \
  --testNamePattern="pipeline|join.*param" --runInBand

# Run specific failing test
npm test -- --testPathPattern="parameters.spec" \
  --testNamePattern="pipeline references outer source" --runInBand
```

## Expected Outcome

After fixes:
- All 11 tests passing
- Parameters accessible in all join pipeline scenarios
- No regressions on existing 80 passing language tests
- Zero regressions on 27 passing integration tests

## Next Actions

1. Pick one failing test (simplest pattern)
2. Run with full logging
3. Trace exact failure point
4. Apply targeted fix
5. Verify test passes
6. Apply fix to similar tests
7. Repeat until all 11 pass

---

**Status:** Ready to begin Pattern 3 fixes
**Estimated Effort:** 2-4 hours based on complexity
**Risk:** Low - we understand the architecture, just need to complete implementation
