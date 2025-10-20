# Pattern 3: SQL Generation Problem Analysis

## The Test Case

```malloy
source: sf_outer(state_filter::string) is duckdb.table('malloytest.state_facts') extend {
  primary_key: state
  join_one: sf is duckdb.table('malloytest.state_facts') -> {
    select: *
    where: state = state_filter  // ← Parameter reference in join pipeline
  }
}

run: sf_outer(state_filter is "CA") -> {  // ← Runtime value provided here
  group_by: s is sf.state
  aggregate: c is count()
}
```

## What We Fixed (Compilation Phase) ✅

**Problem**: Parameter `state_filter` was not visible during compilation in the join's pipeline query.

**Solution**: Added `entry()` override in `QueryInputSpace` to check `parameterSpace()` when fields aren't found locally.

**Result**: Compilation now succeeds. Parameters are found and the AST is built correctly.

## Current Problem (SQL Generation Phase) ❌

**Error**: `Can't generate SQL, no value for state_filter`

**Location**: `expression_compiler.ts:765` in `generateParameterFragment()`

### The Flow (Step by Step)

#### 1. **Compilation Time** (Building the Model)
```
source: sf_outer(state_filter::string) is ... extend {
  join_one: sf is duckdb.table(...) -> { where: state = state_filter }
}
```

At this point:
- `sf_outer` source is compiled with parameter definition `state_filter::string`
- Join `sf` is compiled with a query that references `state_filter`
- The `JoinFieldDef` for `sf` gets `arguments: { state_filter: {type: 'string', value: undefined} }`
- This is stored in the ModelDef

**Key Point**: At compilation, parameters have NO VALUES (just type definitions).

#### 2. **Query Execution Time** (run: statement)
```
run: sf_outer(state_filter is "CA") -> { group_by: s is sf.state }
```

**Step 2a**: `QueryArrow.queryComp()` is called
- Creates a Query object with `sourceArguments: { state_filter: { type: 'string', value: "CA" } }`
- This is the RUNTIME value from the `run:` statement
- ✅ **Confirmed by logging**: `querySourceArgumentsNodes: { state_filter: 'stringLiteral' }`

**Step 2b**: `QueryModelImpl.loadQuery()` receives the Query
- **🔴 Problem Found**: `query.sourceArguments` is EMPTY `{}`
- Why? The Query object's sourceArguments were lost somewhere between QueryArrow and loadQuery

**Step 2c**: `QueryStruct` is created for `sf_outer`
- Passed `sourceArguments` from the Query (which is empty)
- ✅ **Should have**: `{ state_filter: "CA" }`
- ❌ **Actually has**: `{}`

**Step 2d**: `QueryFieldStruct` is created for join `sf`
- Constructor receives: `sourceArguments` from parent OR `jfd.arguments`
- `jfd.arguments` has `{ state_filter: {type: 'string', value: undefined} }` (from compilation)
- `parent.sourceArguments` is `{}` (empty)
- ❌ **Result**: No runtime value available

**Step 2e**: SQL Generation calls `generateParameterFragment()`
- Looks up `state_filter` in `context.arguments()`
- Finds the parameter but `value` is `undefined`
- ❌ **Throws error**: "Can't generate SQL, no value for state_filter"

### Visual Flow Diagram

```
COMPILATION PHASE (✅ Fixed)
========================
source definition
  → sf_outer has parameter state_filter (no value)
  → join sf has query with reference to state_filter
  → JoinFieldDef.arguments = { state_filter: {type:'string', value:undefined} }
  → Stored in ModelDef

RUNTIME PHASE (❌ Broken)
========================
run: sf_outer(state_filter is "CA")
  ↓
QueryArrow.queryComp()
  ↓ Creates Query with
  ↓ sourceArguments: { state_filter: {value: "CA"} } ✅
  ↓
  ??? SOMETHING HAPPENS HERE ???
  ↓
QueryModelImpl.loadQuery()
  ↓ Receives Query with
  ↓ sourceArguments: {} ❌ EMPTY!
  ↓
  ↓ Creates QueryStruct(sf_outer)
  ↓   sourceArguments: {} ❌
  ↓
  ↓ Creates QueryFieldStruct(sf)
  ↓   Uses jfd.arguments (has no value) ❌
  ↓   OR parent.sourceArguments (empty) ❌
  ↓
  ↓ Creates QueryStruct(sf's pipeline)
  ↓   sourceArguments: {} OR {value: undefined} ❌
  ↓
SQL Generation
  ↓ Calls context.arguments()['state_filter']
  ↓ Returns: { value: undefined } ❌
  ↓
ERROR: Can't generate SQL, no value for state_filter
```

### The Core Issue

**Runtime values from the `run:` statement are not reaching the join's QueryStruct.**

The chain is broken between:
1. QueryArrow.queryComp() ✅ Has the value
2. QueryModelImpl.loadQuery() ❌ Loses the value
3. QueryFieldStruct ❌ Can't find the value

## Investigation Questions

### Q1: Why is `query.sourceArguments` empty in loadQuery?

Let's check what happens between QueryArrow.queryComp returning the Query and loadQuery receiving it.

**Hypothesis**: The Query is being serialized/deserialized or reconstructed, losing the sourceArguments.

### Q2: Where should runtime arguments flow?

Looking at the code:
- `QueryStruct` has a `sourceArguments` parameter in constructor
- `QueryStruct.arguments()` resolves parameters through parent chain
- `QueryFieldStruct` passes `sourceArguments ?? parent.sourceArguments` to child QueryStruct

**Expected flow**:
```
Run statement (state_filter: "CA")
  ↓
Query.sourceArguments
  ↓
QueryStruct.sourceArguments (for sf_outer)
  ↓
QueryFieldStruct.sourceArguments (for join sf)
  ↓
QueryStruct.sourceArguments (for sf's pipeline)
  ↓
QueryStruct.arguments() (used by SQL generator)
```

### Q3: What's different about join pipelines?

Regular queries:
- Query.sourceArguments → QueryStruct.sourceArguments → SQL generation ✅

Join pipelines:
- Query.sourceArguments (for outer) → QueryStruct (outer) → QueryFieldStruct (join) → QueryStruct (join's query) → SQL ❌

The extra level of nesting is where values are lost.

## Potential Solutions

### Solution A: Fix Query.sourceArguments Preservation
**Where**: Between QueryArrow.queryComp and QueryModelImpl.loadQuery
**What**: Ensure Query.sourceArguments isn't lost when query is passed around
**Complexity**: Need to trace why it's being lost
**Risk**: May affect other query execution paths

### Solution B: Pass Parent Arguments to Join QueryStruct
**Where**: QueryFieldStruct constructor
**What**: Use `parent.arguments()` (which resolves through parent chain) instead of `parent.sourceArguments`
**Complexity**: Simple change, one line
**Risk**: Low - parent.arguments() already has resolution logic

### Solution C: Resolve Arguments in QueryStruct.arguments()
**Where**: QueryStruct.arguments() method
**What**: When a parameter has no value, look up parent chain for runtime values
**Complexity**: Medium - need to ensure proper resolution order
**Risk**: Medium - could affect other parameter resolution

### Solution D: Store Runtime Args on Parent Before Creating Joins
**Where**: QueryQuery.makeQuery or earlier
**What**: Ensure parent QueryStruct has sourceArguments before creating child QueryFieldStruct
**Complexity**: Need to understand query compilation order
**Risk**: May require significant refactoring

## Test Results

### Solution B: FAILED ❌

Changed `QueryFieldStruct` to use `parent.arguments()` instead of `parent.sourceArguments`.

**Result**: Still no value. The parent's `arguments()` returns empty because:
- Join QueryFieldStruct is created during model resolution (from ModelDef)
- At that point, runtime values haven't been provided yet
- The Query object for the join comes from the compiled ModelDef, not from the runtime `run:` statement

**Key Insight**: The timing is wrong. Joins are resolved when the model is loaded, BEFORE runtime query execution provides the values.

## Recommended Approach

~~**Start with Solution B** (simplest):~~ FAILED

```typescript
// In QueryFieldStruct constructor, line ~209
const finalSourceArguments = jfdArgs ?? sourceArguments ?? parent.arguments();
//                                                            ^^^^^^^^^^^^^^^^^
//                                                            Use .arguments() not .sourceArguments
```

**Why this works**:
- `parent.arguments()` resolves through parent chain and merges all sources
- It already has the logic to handle runtime values
- Minimal change, low risk

**If that doesn't work, investigate Solution A**:
- Add more logging to trace Query.sourceArguments through the call chain
- Find where it's being lost
- Fix the preservation

## Next Steps

1. Try Solution B (simplest)
2. Test if it resolves the issue
3. If not, investigate Solution A with detailed logging
4. Document findings and adjust approach
