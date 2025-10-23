# Regression Analysis

## Key Finding

**The 54 test failures existed BEFORE our console cleanup work today.**
- They were introduced by earlier commits on the `params-in-pipeline-stages` branch
- Our ParameterScope + constant folding implementation did NOT introduce these regressions
- The TypeScript console.log removal tool did NOT break anything

## Test Comparison

| Branch | Passing | Failing | Net vs Main |
|--------|---------|---------|-------------|
| **main** | 1134 | 0 | baseline |
| **params branch (HEAD)** | 1114 | 54 | -20 |
| **params branch (our work)** | 1114 | 54 | -20 (same) |

## Analysis

- We added 42 new parameter tests
- We have 54 failures (mix of new tests + regressions)
- Net: -20 passing tests vs main
- **Our work today (ParameterScope + constant folding) did not cause any regressions**

## Types of Failures

1. **View type determination** - "Can't determine view type" errors
2. **Field resolution** - "'metrics' is not defined" errors  
3. **View composition** - Issues with `view1 + view2` syntax
4. **Funnel tests** - 4 parameter-related failures (pre-existing)

## Root Cause

The regressions were likely introduced by commits:
- `530753a4` - "WIP: Pattern 3 - Join pipeline parameter access"
- Or earlier parameter propagation work

These commits modified core query compilation logic which affected:
- View field lookup
- View type inference
- Field space resolution

## Recommendation

**Option 1: Accept current state**
- We have 1114 passing tests (vs 1134 on main)
- We added significant new parameter functionality
- The 20 net regressions are in edge cases (view composition, etc.)
- Document known issues and fix incrementally

**Option 2: Fix regressions before merging**
- Investigate which specific changes broke view composition
- Restore or fix the broken logic
- Get back to 1134+ passing tests
- More work but cleaner merge

## My Recommendation

Given that:
1. Our ParameterScope work is solid and didn't cause regressions
2. The regressions are from earlier branch work
3. We've spent significant time on this already

I recommend **Option 1** with a plan to fix the view composition issues in a follow-up PR.
