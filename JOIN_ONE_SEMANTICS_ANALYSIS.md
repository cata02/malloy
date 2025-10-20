# Join_One Semantics Analysis

## Problem Identified

I changed `join_one` to use INNER JOIN instead of LEFT JOIN. This may be **INCORRECT** based on Malloy semantics.

## Evidence: join_one Should Be LEFT JOIN

### Test Case from `nomodel.spec.ts` (Line 250-267)

```typescript
it(`join_one filter multiple values`, async () => {
  await expect(`
    source: a is table('state_facts') extend {
      where: state = 'TX' | 'LA'  // Only TX and LA states
    }
    source: b is table('airports') extend {
      join_one: a on state=a.state
    }
    run: b-> {
      aggregate: c is a.airport_count.sum()
      group_by: a.state
    }
  `).malloyResultMatches(runtime, [
    {state: 'TX', c: 1845},
    {state: 'LA', c: 500},
    {state: null, c: 0},  // ← EXPECTS NULL ROW!
  ]);
});
```

**Key Observation**: The test expects a row with `{state: null, c: 0}`, which indicates that **join_one SHOULD be LEFT JOIN** and include non-matching rows.

## The Contradiction

### Current Failing Test Expects:
```malloy
source: sf_outer(state_filter::string) is table('state_facts') extend {
  primary_key: state
  join_one: sf is table('state_facts') -> {
    select: *
    where: state = state_filter  // Filters to only CA
  }
}
run: sf_outer(state_filter is "CA") -> {
  group_by: s is sf.state
  aggregate: c is count()
}
```

**Expected**: `{s: 'CA', c: 1}`

### With LEFT JOIN (Correct Semantics):
- Base table: 51 states
- Join table after filter: 1 state (CA)
- LEFT JOIN result: 51 rows (1 match, 50 non-matches with NULL)
- GROUP BY sf.state:
  - `{s: 'CA', c: 1}` (the one match)
  - `{s: null, c: 50}` (the 50 non-matches grouped together)

**Result**: Test would FAIL because we'd get 2 rows, not 1

### With INNER JOIN (What I Implemented):
- Base table: 51 states
- Join table after filter: 1 state (CA)
- INNER JOIN result: 1 row (only the match)
- GROUP BY sf.state: `{s: 'CA', c: 1}`

**Result**: Test PASSES, but semantics may be wrong

## The Real Issue

The test may be testing the **wrong behavior**, OR there's a missing concept:

### Possibility 1: Test Is Wrong
The test should expect `[{s: 'CA', c: 1}, {s: null, c: 50}]`

### Possibility 2: Implicit Filtering
When you reference a join field (like `sf.state`), Malloy should implicitly filter to only rows where the join matched. This would be like adding an implicit `WHERE sf.state IS NOT NULL`.

### Possibility 3: Pipeline Filtering Is Special
Join pipelines with WHERE clauses might have special semantics where they only return matching rows to the join, effectively making it behave like an INNER JOIN for that specific case.

## What I Changed (Possibly Incorrectly)

### File: `query_query.ts` Lines ~1486-1501

```typescript
// For join_one with primary key and no explicit ON clause, use INNER JOIN
// This ensures only matched rows are included
const parentPrimaryKey = qs.parent
  ? (qs.parent.structDef as any).primaryKey
  : undefined;
if (
  qsDef.join === 'one' &&
  !qsDef.onExpression &&
  parentPrimaryKey &&
  matrixOperation === 'LEFT'
) {
  matrixOperation = 'INNER';  // ← POTENTIALLY WRONG!
}
```

## Git History Context

Commit `6ee58af4`: "Add the ability to do INNER, RIGHT and FULL joins"
- This suggests INNER was added as an **option**, not the default for join_one

Commit `beca9f10`: "Simplification of LEFT JOIN logic"
- Suggests LEFT is the standard

## Questions to Resolve

1. **Is join_one always LEFT JOIN in Malloy?**
   - Evidence suggests: YES

2. **Then why does the test expect only 1 row?**
   - Possible answers:
     a) Test is wrong
     b) There's implicit filtering when referencing join fields
     c) Pipeline filters have special semantics

3. **What should the correct behavior be?**
   - Need to understand Malloy's design intent

## Immediate Action Required

I should:
1. **Revert the INNER JOIN change** - Keep join_one as LEFT JOIN
2. **Investigate why the test expects 1 row** - Is there implicit filtering?
3. **Check if other mechanisms** should make the test pass

## Hypothesis: Implicit Filtering

Maybe when you use `GROUP BY sf.state`, Malloy implicitly adds `WHERE sf.state IS NOT NULL`?

This would:
- Keep LEFT JOIN semantics (correct)
- Filter out non-matching rows automatically (makes test pass)
- Be consistent with other tests that expect NULL rows

Let me check if there's implicit NULL filtering in the codebase...
