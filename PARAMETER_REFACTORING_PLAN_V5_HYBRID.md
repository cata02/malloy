# Parameter System Implementation - Hybrid Incremental Plan V5

## Strategy Overview

**Approach**: Graduated complexity levels with test-driven micro-iterations
**Innovation**: Vertical slices (end-to-end) with 15-30 min feedback cycles
**Risk Mitigation**: Validate complete feature before adding complexity

### Key Principles

1. ✅ **Vertical Slices**: Each level is complete (AST→IR→Model→SQL) before next
2. ✅ **Micro-Iterations**: 15-30 min cycles with immediate feedback
3. ✅ **Fast Validation**: Multiple feedback stages (build→IR→translate→execute)
4. ✅ **Stop on Red**: Don't proceed if tests fail
5. ✅ **Flexible Commits**: Commit when valuable (level completion, significant milestones, or end)

### The Architecture

```
Each Level validates full stack:

┌─────────────────────────────────────┐
│ AST Layer (Compile-Time)            │
│ - Parse & validate                  │
│ - ParameterSpace (MERGE-BASED)      │
│   • Merge at boundaries only        │
│   • No parent pointers/chains       │
│ - Constant expression folding       │
│ - Type checking                     │
│ - Write complete metadata to IR     │
├─────────────────────────────────────┤
│         ↓ produces                  │
├─────────────────────────────────────┤
│ IR (Intermediate Representation)    │
│ - Parameter declarations            │
│ - Argument bindings (literals)      │
│ - Argument bindings (param refs)    │
│ - Tested via snapshots/structure    │
├─────────────────────────────────────┤
│         ↓ consumed by               │
├─────────────────────────────────────┤
│ Model Layer (Runtime Resolution)    │
│ - QueryStruct.arguments()           │
│ - SINGLE SOURCE OF TRUTH            │
│ - Resolve parameter references      │
│ - Walk parent chain (inheritance)   │
│ - Apply runtime precedence          │
│ - ~50-70 lines (cleaner than ref)   │
├─────────────────────────────────────┤
│         ↓ produces                  │
├─────────────────────────────────────┤
│ SQL Generation                      │
│ - Parameter nodes → SQL literals    │
│ - Dialect-specific formatting       │
├─────────────────────────────────────┤
│         ↓ executes                  │
├─────────────────────────────────────┤
│ Results (tested via assertions)     │
└─────────────────────────────────────┘

### Clear Responsibility Split

**AST Layer (Compile-Time)**:
- ✅ Discover and declare parameters
- ✅ Merge parameter visibility at boundaries (outer scope + local scope)
- ✅ Constant expression folding (compile-time evaluable expressions)
- ✅ Type checking
- ✅ Write complete metadata to IR
- ❌ NO parent pointer chains
- ❌ NO runtime resolution

**Model Layer (Runtime)**:
- ✅ Single source of truth for parameter resolution
- ✅ Resolve parameter reference nodes (walk parent QueryStruct chain)
- ✅ Apply precedence rules (defaults → literals → param-refs → runtime)
- ✅ Handle runtime overrides (sourceArguments)
- ✅ Parent parameter inheritance
- ❌ Does NOT duplicate AST work
```

### Why Model Must Do Runtime Resolution

**Critical Insight**: Model layer CANNOT be just "read from IR". It must handle **late binding** because:

#### 1. Parameter References Across Boundaries
```malloy
source: outer(p::number is 10) is ...
source: inner(q::number is p) is outer  // q references p from outer!
```
- **AST time**: `inner` compiled independently, doesn't know `p is 10`
- **Model time**: Walks parent chain, finds `p is 10`, resolves `q is 10`

#### 2. Parent Parameter Inheritance
```malloy
source: base(p::number is 10) is ...
source: ext is base extend {}  // No explicit p declaration
run: ext -> { select: p }      // But p is available!
```
- **AST time**: `ext` doesn't declare `p`, just extends `base`
- **Model time**: Inherits `base`'s parameters automatically

#### 3. Runtime Override Precedence
```malloy
source: s(p::number is outer_param) is ...  // Default is param ref
run: s(p is 42) -> {}                       // Override at call site
```
- **Complex precedence**: Literal defaults vs param ref defaults vs runtime overrides
- **Model time**: Applies correct precedence rules

**Result**: Model's `arguments()` method is ~50-70 lines (not 3), but still much cleaner than the reference branch's 130+ lines.

---

## Commit Strategy

**Philosophy**: Commit when valuable, not on a fixed schedule.

### When to Commit

**Recommended Commit Points**:
1. ✅ **Level Completion** (e.g., "Level 1 Complete - Basic Parameters")
2. ✅ **Significant Milestones** (e.g., "Model layer integration working")
3. ✅ **End of Session** (if stopping work)
4. ⚠️ **Optional**: Individual iterations (if you want granular history)

**Flexible Approach**: Throughout the plan, commit commands are marked as **(OPTIONAL)** or shown at level boundaries. Use your judgment!

### Signed Commits Required

**All commits must be signed** (GPG or SSH):

```bash
# Configure GPG signing (one-time setup)
git config user.signingkey YOUR_KEY_ID
git config commit.gpgsign true

# Or configure SSH signing (one-time setup)
git config gpg.format ssh
git config user.signingkey ~/.ssh/id_ed25519.pub
git config commit.gpgsign true

# Then all commits will be signed automatically
git commit -m "message"  # → signed automatically

# Or sign explicitly
git commit -S -m "message"
```

### Commit Message Format

```
<type>(<scope>): <summary>

<optional detailed description>

<optional footer>
```

**Examples**:
- `feat(params): Level 1 Complete - Basic Parameters ✅`
- `test(params): Add precedence tests`
- `refactor(model): Simplify QueryStruct.arguments()`

---

## Phase 0: Setup & Infrastructure (2-3 hours)

### 0.1: Environment Setup (30 min)

```bash
# 1. Create worktree from main
cd /Users/catalinadler/dev/malloy-cata02
git worktree add ../malloy-param-clean main
cd ../malloy-param-clean
git checkout -b params-hybrid-impl

# 2. Install dependencies
npm install

# 3. Validate build is clean
echo "Validating build..."
if npm run build; then
  echo "✓ Build successful"
else
  echo "✗ Build failed - fix before proceeding"
  exit 1
fi

# 4. Run baseline tests
echo "Running baseline tests..."
npm test 2>&1 | tee BASELINE_ALL_TESTS.log

# Document baseline
echo "=== Baseline ===" > BASELINE_SUMMARY.md
echo "Date: $(date)" >> BASELINE_SUMMARY.md
echo "" >> BASELINE_SUMMARY.md
grep -E "(Tests:|passing|failing)" BASELINE_ALL_TESTS.log >> BASELINE_SUMMARY.md

# 5. Copy PostgreSQL setup (port conflict avoidance)
# These scripts use port 5433 (not 5432) to avoid conflicts
# Container name: malloy-test-postgres (more descriptive)
mkdir -p test/postgres
cp ../malloy-cata02/test/postgres/postgres_start.sh test/postgres/postgres_start.sh
cp ../malloy-cata02/test/postgres/postgres_stop.sh test/postgres/postgres_stop.sh

# Verify PostgreSQL setup
echo "PostgreSQL setup copied:"
echo "  - Port: 5433 (avoids conflict with default 5432)"
echo "  - Container: malloy-test-postgres"
grep -q "5433" test/postgres/postgres_start.sh && echo "  ✓ Port configured" || echo "  ✗ Port check failed"
grep -q "malloy-test-postgres" test/postgres/postgres_start.sh && echo "  ✓ Container name set" || echo "  ✗ Container check failed"

# 6. Commit (OPTIONAL - or commit at end of Phase 0)
git add -A
git commit -m "chore: Setup from main branch with baseline

Baseline documented in BASELINE_SUMMARY.md

PostgreSQL test infrastructure:
- Port 5433 (avoids conflicts with default PostgreSQL)
- Container: malloy-test-postgres (descriptive naming)

Build validated: clean ✓"
```

**Deliverable**: Clean workspace with documented baseline

**PostgreSQL Testing Notes**:
- Tests run on port 5433 (not default 5432) to avoid conflicts
- Container name: `malloy-test-postgres`
- Environment variables (set automatically by scripts):
  ```bash
  PGHOST=localhost
  PGPORT=5433
  PGUSER=root
  PGPASSWORD=postgres
  ```
- To run PostgreSQL tests:
  ```bash
  ./test/postgres/postgres_start.sh    # Start
  MALLOY_DATABASES=postgres npm test   # Test
  ./test/postgres/postgres_stop.sh     # Stop
  ```

---

### 0.2: Setup Test Files (30 min)

```bash
# Create empty test files that we'll populate incrementally
touch packages/malloy/src/lang/test/parameters.spec.ts
touch test/src/core/parameters.spec.ts

# Add basic describe blocks
cat > packages/malloy/src/lang/test/parameters.spec.ts << 'EOF'
/* eslint-disable no-console */
// Parameter tests - implemented incrementally
// Reference: ../malloy-cata02/packages/malloy/src/lang/test/parameters.spec.ts

describe('parameters (AST layer)', () => {
  // Tests will be added incrementally from reference branch
  // Each test copied with its original name for easy tracking
});
EOF

cat > test/src/core/parameters.spec.ts << 'EOF'
// Parameter tests - implemented incrementally
// Reference: ../malloy-cata02/test/src/core/parameters.spec.ts

describe('parameters (runtime)', () => {
  // Tests will be added incrementally from reference branch
  // Each test copied with its original name for easy tracking
});
EOF

# Count reference tests programmatically
mkdir -p scripts
cat > scripts/count_param_tests.js << 'EOF'
const fs = require('fs');

const astTests = fs.readFileSync('../malloy-cata02/packages/malloy/src/lang/test/parameters.spec.ts', 'utf8');
const runtimeTests = fs.readFileSync('../malloy-cata02/test/src/core/parameters.spec.ts', 'utf8');

const astCount = (astTests.match(/\b(test|it)\(/g) || []).length;
const runtimeCount = (runtimeTests.match(/\b(test|it)\(/g) || []).length;

console.log(`AST tests: ${astCount}`);
console.log(`Runtime tests: ${runtimeCount}`);
console.log(`Total: ${astCount + runtimeCount}`);
EOF

node scripts/count_param_tests.js

# Create test organization document
cat > TEST_ORGANIZATION.md << 'EOF'
# Parameter Test Organization

## Approach: Incremental Test Addition (Not Copying)

Instead of copying entire test files as "REFERENCE", we add tests incrementally:
- Copy test from reference branch
- Add to our test file
- Implement feature
- Test passes
- Commit

**Benefits**:
- No drift between REFERENCE and actual
- Clear git history (see which tests added when)
- Easy to track progress (enabled vs remaining)

## Test Files
- `packages/malloy/src/lang/test/parameters.spec.ts` - AST tests (start empty, grow to ~91)
- `test/src/core/parameters.spec.ts` - Runtime tests (start empty, grow to ~37)

**Total target: ~128 tests** (run `node scripts/count_param_tests.js` to get exact count from reference)

## Test Categories (by complexity level)

### Level 1: Basic Parameters (~15 tests)
**AST Tests (10):**
- Declaration with type (number, string, boolean, date, timestamp)
- Declaration with default value (literal and constant expression)
- Multiple parameters in one source
- Type checking errors (type mismatch, null handling)
- Inferred types from default values

**Runtime Tests (5):**
- Use parameter in dimension
- Use parameter in expression
- Use parameter in filter
- Override default value at runtime
- Parameter in SQL generation

**Success Criteria:** Parameters work in simple queries with no propagation

---

### Level 2: Parameter Propagation (~20 tests)
**AST Tests (15):**
- Parameter through source extension (`source: ext is base(p)`)
- Parameter visibility in views
- Parameter shadowing (source and field with same name)
- Nested source parameters
- Parameter with `except` keyword
- Parameter in refined sources

**Runtime Tests (5):**
- Extended source with parameters executes
- View accessing outer parameters
- Override parameter in extended context
- Parameter propagation through multiple levels
- Field shadowing parameter works correctly

**Success Criteria:** Parameters flow correctly through source hierarchy

---

### Level 3: Pipeline Parameters (~25 tests)
**AST Tests (17):**
- Parameter in single-stage pipeline
- Parameter in multi-stage pipeline (2 stages)
- Parameter in multi-stage pipeline (3+ stages)
- Parameter visibility per stage
- Parameter reference between stages
- Pipeline with parameter in group_by
- Pipeline with parameter in aggregate
- Pipeline with parameter in where clause

**Runtime Tests (8):**
- Use parameter in stage 1 only
- Use parameter in stage 2 only
- Use parameter in both stages
- Aggregate using parameter value
- Filter using parameter in each stage
- Complex multi-stage query with parameters
- Nested pipelines with parameters
- Parameter forwarding through stages

**Success Criteria:** Parameters work correctly in complex pipelines

---

### Level 4: Join Parameters (~20 tests)
**AST Tests (12):**
- Parameterized joined source
- Parameter in join condition (`on param = field`)
- Outer parameter accessible in join
- Nested join with parameters
- Join with parameter in ON clause
- join_one with parameterized source
- join_many with parameters
- Multiple joins with different parameters

**Runtime Tests (8):**
- Pass parameter to joined source
- Join accessing outer parameter
- Multi-level join with parameters
- Join condition using parameter
- Parameterized join with pipeline
- Join accessing parameters from outer scope
- Complex join scenarios
- Join with parameter override

**Success Criteria:** Parameters work with all join types

---

### Level 5: Advanced Features (~25 tests)
**AST Tests (18):**
- Filter expression parameters (`param::filter<string>`)
- Parameter type coercion
- Constant expression folding (11 + 1 → 12)
- Refine with parameters
- Parameter in null equality
- Parameter with range (error case)
- Parameter in composite fields
- SQL function with parameters
- Nested parameter references
- Parameter in calculated dimensions

**Runtime Tests (7):**
- Filter expression parameter execution
- Type coercion at runtime
- Complex expressions with parameters
- Edge cases (null, undefined)
- Parameter in WHERE clause
- Parameter in complex calculations
- Filter expression with string parameter

**Success Criteria:** All special cases and edge cases handled

---

### Runtime Integration Tests (~23 remaining)
**Additional runtime coverage:**
- Parameter in various SQL contexts
- Performance with parameters
- Error messages with parameters
- Parameter in nested queries
- Parameter with aggregates
- Parameter in ORDER BY
- Parameter in LIMIT clauses
- Various database dialects

**Success Criteria:** Full end-to-end coverage across all databases
EOF

# Commit (OPTIONAL - or commit at end of Phase 0)
git add -A
git commit -m "docs: Test organization and counting script

Created empty test files for incremental test addition:
- packages/malloy/src/lang/test/parameters.spec.ts
- test/src/core/parameters.spec.ts

Added scripts/count_param_tests.js for programmatic test counting.
Tests will be copied from reference branch incrementally as features are implemented.

Reference branch: params-in-pipeline-stages
Target: ~128 tests (run \`node scripts/count_param_tests.js\` for exact count)"
```

**Deliverable**: Reference tests copied and organized

---

### 0.3: Create Test Helpers (30 min)

```bash
# Create directory if needed
mkdir -p packages/malloy/src/lang/test/test-helpers

# Create IR validation helpers
cat > packages/malloy/src/lang/test/test-helpers/ir-parameter-helpers.ts << 'EOF'
/*
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: MIT
 *
 * Helpers for validating parameter IR structure
 */

import type {SourceDef, Parameter, Argument, ModelDef} from '../../../model/malloy_types';
import {TestTranslator} from '../test-translator';

/**
 * Compile Malloy source to IR and return ModelDef
 * Throws if compilation fails
 */
export function compileToIR(source: string): ModelDef {
  const translator = new TestTranslator(source);
  const result = translator.translate();

  if (translator.logger.hasErrors()) {
    const errors = translator.logger.errors.map(e => e.message).join('\n');
    throw new Error(`Compilation failed:\n${errors}`);
  }

  if (!result.modelDef) {
    throw new Error('No ModelDef produced');
  }

  return result.modelDef;
}

/**
 * Get parameters from a source in the IR
 */
export function getSourceParameters(
  ir: ModelDef,
  sourceName: string
): Record<string, Parameter> | undefined {
  const source = ir.contents?.[sourceName];
  if (!source || source.type === 'connection' || source.type === 'query') {
    return undefined;
  }
  return (source as SourceDef).parameters;
}

/**
 * Get arguments from a source in the IR
 */
export function getSourceArguments(
  ir: ModelDef,
  sourceName: string
): Record<string, Argument> | undefined {
  const source = ir.contents?.[sourceName];
  if (!source || source.type === 'connection' || source.type === 'query') {
    return undefined;
  }
  return (source as SourceDef).arguments;
}

/**
 * Helper to validate a parameter exists in IR with expected properties
 */
export function expectParameterInIR(
  source: string,
  sourceName: string,
  paramName: string,
  expected: Partial<Parameter>
): void {
  const ir = compileToIR(source);
  const params = getSourceParameters(ir, sourceName);

  expect(params).toBeDefined();
  expect(params![paramName]).toBeDefined();
  expect(params![paramName]).toMatchObject(expected);
}

/**
 * Helper to check if source has specific number of parameters
 */
export function expectParameterCount(
  source: string,
  sourceName: string,
  count: number
): void {
  const ir = compileToIR(source);
  const params = getSourceParameters(ir, sourceName);

  if (count === 0) {
    expect(params === undefined || Object.keys(params).length === 0).toBe(true);
  } else {
    expect(params).toBeDefined();
    expect(Object.keys(params!)).toHaveLength(count);
  }
}
EOF

# Create initial test file with helpers
cat > packages/malloy/src/lang/test/parameters.spec.ts << 'EOF'
/*
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: MIT
 *
 * Parameter Tests - Incremental Implementation
 *
 * Tests are enabled as features are implemented.
 * Reference: ../malloy-cata02/packages/malloy/src/lang/test/parameters.spec.ts
 *
 * Progress: See PROGRESS_TRACKER.md
 */

import {TestTranslator, errorMessage, markSource} from './test-translator';
import {
  compileToIR,
  expectParameterInIR,
  expectParameterCount,
  getSourceParameters,
} from './test-helpers/ir-parameter-helpers';
import './parse-expects';

describe('parameters - incremental implementation', () => {
  // Tests will be added here as we implement features

  // Level 1: Basic Parameters (will be added in iteration 1.2+)
  // Level 2: Propagation (will be added in Level 2)
  // Level 3: Pipelines (will be added in Level 3)
  // Level 4: Joins (will be added in Level 4)
  // Level 5: Advanced (will be added in Level 5)
});
EOF

# Create runtime test file
cat > test/src/core/parameters.spec.ts << 'EOF'
/*
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: MIT
 *
 * Parameter Runtime Tests - Incremental Implementation
 *
 * Tests are enabled as features are implemented.
 * Reference: ../malloy-cata02/test/src/core/parameters.spec.ts (reference branch)
 */

import {runtimeFor} from '../runtimes';
import '../util/db-jest-matchers';

const runtime = runtimeFor('duckdb');

afterAll(async () => {
  await runtime.connection.close();
});

describe('parameters - runtime', () => {
  // Runtime tests will be added as features complete

  // Level 1: Basic Runtime (will be added in iteration 1.5)
  // Level 2: Propagation Runtime (will be added in Level 2)
  // etc.
});
EOF

# Commit (OPTIONAL - or commit at end of Phase 0)
git add -A
git commit -m "test: Create test infrastructure and helpers

- IR validation helpers for fast feedback
- compileToIR() - compile and return ModelDef
- getSourceParameters() - extract parameters from IR
- expectParameterInIR() - validate parameter structure
- Empty test files ready for incremental additions
- Reference tests preserved for comparison

Tests: 0/128 passing (starting point)"
```

**Deliverable**: Test infrastructure ready

---

### 0.4: Create Progress Tracking (30 min)

```bash
# Create progress tracker
cat > PROGRESS_TRACKER.md << 'EOF'
# Parameter Implementation Progress

## Current Status

**Branch:** params-hybrid-impl
**Started:** [DATE]
**Target:** 128 total tests (91 AST + 37 runtime)

### Completion by Level
- [ ] Phase 0: Setup (0/0 tests) - Infrastructure
- [ ] Level 1: Basic Parameters (0/15 tests)
- [ ] Level 2: Propagation (0/20 tests)
- [ ] Level 3: Pipelines (0/25 tests)
- [ ] Level 4: Joins (0/20 tests)
- [ ] Level 5: Advanced (0/25 tests)
- [ ] Runtime Integration (0/23 tests)

**Total: 0/128 tests passing**

---

## Phase 0: Setup & Infrastructure ⏳

### Actions
- [ ] 0.1: Environment setup
- [ ] 0.2: Copy reference tests
- [ ] 0.3: Create test helpers
- [ ] 0.4: Create progress tracking
- [ ] 0.5: Validation

**Status**: In progress

---

## Level 1: Basic Parameters ⏳

**Goal**: Parameters work in simple queries (no propagation, no pipelines)

### Iteration Status
- [ ] 1.1: ParameterSpace foundation (30 min, 0 tests)
- [ ] 1.2: Parse parameter declaration (45 min, ~3 tests)
- [ ] 1.3: Default values (30 min, ~3 tests)
- [ ] 1.4: Type checking (30 min, ~3 tests)
- [ ] 1.5: Model layer integration (1 hour, ~3 tests)
- [ ] 1.6: SQL generation (30 min, ~3 tests)

**Target**: 15 tests passing (10 AST + 5 runtime)

### Tests Enabled
(none yet)

---

## Latest Activity

[This section will be updated after each iteration]

### [Date] - Phase 0 Started
- Created workspace from main branch
- Documented baseline
- Copied reference tests (128 tests)
EOF

# Create changelog
cat > CHANGELOG_PARAMS.md << 'EOF'
# Parameter Implementation Changelog

## Format per Iteration

Each entry documents a single iteration (15-30 min of work).

### [Level.Iteration] - Title
**Date:** YYYY-MM-DD HH:MM
**Time Spent:** X min
**Files Modified:**
- `path/to/file1.ts` (+X/-Y lines)
- `path/to/file2.ts` (+X/-Y lines)

**What:** Brief description of what was implemented
**Why:** Reason for the change (what problem does it solve)
**How:** Implementation approach (key decisions)
**Tests:** Which tests now pass (X/128)
**Validated:**
- Build: ✓/✗
- IR Tests: ✓/✗ (X passing)
- Translation: ✓/✗
- Runtime: ✓/✗ (X passing)

**Notes:** Any important observations, TODOs, or decisions

---

## Changelog Entries

### [0.1] - Environment Setup
**Date:** [DATE]
**Time Spent:** 30 min
**Files Modified:**
- Initial setup

**What:** Created workspace and documented baseline
**Why:** Need clean starting point from main branch
**How:** Git worktree, npm install, baseline tests
**Tests:** 0/128 (baseline documented)
**Validated:**
- Build: ✓
- Baseline: documented

**Notes:** Working from main branch, using params-in-pipeline-stages as reference
EOF

# Create validation checklist
cat > VALIDATION_CHECKLIST.md << 'EOF'
# Validation Checklist

## After Each Iteration (15-30 min)

Run these checks:

- [ ] **Build**: `npm run build` passes without errors
- [ ] **IR Tests**: Target IR test(s) pass
  ```bash
  npm test -- --testNamePattern="[test name]"
  ```
- [ ] **Translation**: No new syntax/translation errors
- [ ] **Type Check**: TypeScript compilation clean
- [ ] **Git Status**: Only expected files modified
- [ ] **Progress Updated**: PROGRESS_TRACKER.md updated
- [ ] **Changelog Updated**: CHANGELOG_PARAMS.md updated

## Before Committing (Optional per iteration, Recommended per level)

- [ ] **Commit Message**: Clear and follows convention (signed)
- [ ] **Logical Grouping**: Commit represents a coherent unit of work

**Time Budget**: ~5 min validation per iteration

---

## After Each Level (4-5 hours)

Before moving to next level:

- [ ] **All Level Tests**: All level tests passing
  ```bash
  npm test -- --testNamePattern="Level [N]"
  ```
- [ ] **Full Suite**: Run complete test suite
  ```bash
  npm test
  ```
- [ ] **Regression Check**: Compare with baseline
  ```bash
  diff BASELINE_SUMMARY.md <(npm test 2>&1 | grep -E "passing|failing")
  ```
- [ ] **IR Comparison**: Compare IR with reference branch for sample queries
- [ ] **Code Review**: Quick self-review of code quality
- [ ] **Documentation**: Level completion documented in PROGRESS_TRACKER.md
- [ ] **Commit** (RECOMMENDED): Level completion committed with summary

**Time Budget**: ~30 min validation per level

---

## Final Validation (Before PR)

- [ ] **All Tests**: 128/128 parameter tests passing
- [ ] **Full Suite**: All baseline tests still passing
- [ ] **No Regressions**: Zero new test failures
- [ ] **Code Quality**:
  - No debug code remaining
  - No commented-out code
  - Consistent style
  - Clear variable names
- [ ] **Documentation**:
  - CHANGELOG_PARAMS.md complete
  - PROGRESS_TRACKER.md shows 128/128
  - README updated if needed
- [ ] **Architectural Notes**:
  - Known limitations documented
  - Future work items noted
  - Design decisions explained
- [ ] **Commit History**: Clean, logical commits
- [ ] **Ready for Review**: All criteria met

---

## Emergency Stop Conditions

**Stop immediately and reassess if:**

❌ **Time Overrun**: Iteration takes >2x estimated time
❌ **Regression**: Previously passing tests now fail
❌ **IR Mismatch**: IR structure significantly different from reference
❌ **Test Failure**: New tests fail in unexpected ways
❌ **Approach Wrong**: Implementation feels overly complex

**Recovery Steps:**
1. Review reference branch implementation
2. Check if missing a key concept
3. Consider different approach
4. Consult PARAMETER_CHANGES_DEEP_DIVE.md
5. Ask for help/pair programming
EOF

# Commit (OPTIONAL - or commit at end of Phase 0)
git add -A
git commit -m "docs: Progress tracking and validation infrastructure

Created tracking documents:
- PROGRESS_TRACKER.md - Track test completion by level
- CHANGELOG_PARAMS.md - Document each iteration
- VALIDATION_CHECKLIST.md - Ensure quality at each step

Phase 0: 4/5 actions complete"
```

**Deliverable**: Tracking infrastructure in place

---

### 0.5: Final Setup Validation (15 min)

```bash
# Verify everything is set up correctly

echo "=== Setup Validation ===" | tee SETUP_VALIDATION.log

# 1. Check files exist
echo "Checking files..." | tee -a SETUP_VALIDATION.log
test -f BASELINE_SUMMARY.md && echo "✓ Baseline documented" || echo "✗ Missing baseline"
test -f TEST_ORGANIZATION.md && echo "✓ Tests organized" || echo "✗ Missing test org"
test -f PROGRESS_TRACKER.md && echo "✓ Progress tracker ready" || echo "✗ Missing tracker"
test -f CHANGELOG_PARAMS.md && echo "✓ Changelog ready" || echo "✗ Missing changelog"
test -f packages/malloy/src/lang/test/parameters.spec.ts && echo "✓ AST test file ready" || echo "✗ Missing AST test file"
test -f test/src/core/parameters.spec.ts && echo "✓ Runtime test file ready" || echo "✗ Missing runtime test file"
test -f scripts/count_param_tests.js && echo "✓ Test counting script ready" || echo "✗ Missing count script"

# 2. Check PostgreSQL setup (port 5433, container malloy-test-postgres)
echo "Checking PostgreSQL setup..." | tee -a SETUP_VALIDATION.log
grep -q "5433" test/postgres/postgres_start.sh && echo "✓ PostgreSQL on port 5433" || echo "✗ Port not updated"
grep -q "malloy-test-postgres" test/postgres/postgres_start.sh && echo "✓ Container name correct" || echo "✗ Container name not updated"

# 3. Check test helpers compile
echo "Checking test helpers..." | tee -a SETUP_VALIDATION.log
npm run build 2>&1 | grep -q "error" && echo "✗ Build errors" || echo "✓ Build clean"

# 4. Count reference tests using Node script
echo "Counting tests from reference branch..." | tee -a SETUP_VALIDATION.log
node scripts/count_param_tests.js | tee -a SETUP_VALIDATION.log

# Extract counts (script outputs: "AST tests: N", "Runtime tests: N", "Total: N")
AST_COUNT=$(node scripts/count_param_tests.js | grep "AST tests:" | awk '{print $3}')
RUNTIME_COUNT=$(node scripts/count_param_tests.js | grep "Runtime tests:" | awk '{print $3}')
TOTAL_COUNT=$(node scripts/count_param_tests.js | grep "^Total:" | awk '{print $2}')

echo "  Reference branch has ${AST_COUNT} AST + ${RUNTIME_COUNT} runtime = ${TOTAL_COUNT} total tests" | tee -a SETUP_VALIDATION.log

# 5. Update progress tracker with actual counts
sed -i.bak "s/Target: ~128/Target: ~${TOTAL_COUNT}/" PROGRESS_TRACKER.md
rm PROGRESS_TRACKER.md.bak

echo "=== Setup Complete ===" | tee -a SETUP_VALIDATION.log

# Commit (RECOMMENDED - Phase 0 Complete)
git add -A
git commit -m "chore: Phase 0 Complete - Setup validated ✅

Setup actions completed:
- ✓ Environment setup (baseline, PostgreSQL)
- ✓ Test files created (incremental addition approach)
- ✓ Test counting script (${TOTAL_COUNT} tests in reference)
- ✓ Test helpers created
- ✓ Progress tracking ready
- ✓ Validation complete

Ready to begin Level 1: Basic Parameters

See SETUP_VALIDATION.log for details"
```

**Deliverable**: Phase 0 complete, ready for Level 1

---

## Level 1: Basic Parameters (4-5 hours)

**Goal**: Parameters work in simple queries (no propagation, no pipelines)

**Success Criteria**:
- ✅ Can declare parameter with type
- ✅ Can provide default value
- ✅ Can use parameter in dimension
- ✅ SQL generation works
- ✅ ~15 tests passing (10 AST + 5 runtime)

---

### Level 1 Preparation (10 min)

**Before starting iterations, review the reference implementation:**

```bash
# 1. Review what was done for basic parameters
cd ../malloy-cata02
less PARAMETER_IMPLEMENTATION_SUMMARY.md
# Read: "Core Changes - AST Layer" section (lines ~100-200)
# Focus: ParameterSpace basics, parameter declaration

# 2. Check reference implementation files
ls -lh packages/malloy/src/lang/ast/field-space/parameter-space.ts
# Note: ~110 lines

ls -lh packages/malloy/src/lang/ast/source-elements/named-source.ts
# Check git diff to see what changed

# 3. Return to working branch
cd ../malloy-param-clean
```

**Key Insights from Reference** (document these):
- ParameterSpace implements FieldSpace (with stub methods)
- Parameters stored as `Record<string, SpaceEntry>`
- Parent chain for lexical scoping
- Write to IR in `getSourceDef()`

**Known Challenges**:
- FieldSpace interface requires methods that don't apply to parameters
- Need to integrate with existing lookup infrastructure
- Type checking for default values

**Time**: 10 min reading, saves 30+ min debugging

---

### Iteration 1.1: ParameterSpace Foundation (30 min)

**Objective**: Create ParameterSpace class that integrates with FieldSpace

**What to Build**: Core ParameterSpace class using **MERGE-BASED** approach

**Why**: Need namespace to track parameter declarations. Uses merge at boundaries (NOT parent-chain) for simplicity and lower complexity.

**Architecture Decision**:
- ✅ **MERGE-BASED**: Visibility established by merging at source boundaries
- ❌ **NOT PARENT-CHAIN**: No parent pointers, no threading across AST
- ✅ Model layer is single source of truth for runtime resolution

**Reference**: `../malloy-cata02/packages/malloy/src/lang/ast/field-space/parameter-space.ts` (but adapt for merge approach)

**File**: `packages/malloy/src/lang/ast/field-space/parameter-space.ts` (NEW)

**Implementation**:
```typescript
/*
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: MIT
 */

import type {Dialect} from '../../../dialect';
import type {AccessModifierLabel, StructDef} from '../../../model';
import type {HasParameter} from '../parameters/has-parameter';
import type {
  FieldName,
  FieldSpace,
  QueryFieldSpace,
} from '../types/field-space';
import type {LookupResult} from '../types/lookup-result';
import type {SpaceEntry} from '../types/space-entry';
import {AbstractParameter} from '../types/space-param';

/**
 * ParameterSpace: A namespace for parameter declarations
 *
 * Uses MERGE-BASED visibility (not parent-chain):
 * - Parameters are merged at source boundaries (outer + local)
 * - NO parent pointers (simplicity, lower review burden)
 * - Model layer handles runtime resolution
 *
 * Architectural Note:
 * Currently implements FieldSpace for integration with existing
 * lookup infrastructure. Future refactoring should extract a
 * Namespace base class with FieldSpace and ParameterSpace as
 * subclasses.
 *
 * See: Maintainer discussion on Namespace abstraction
 */
export class ParameterSpace implements FieldSpace {
  readonly type = 'fieldSpace';

  private readonly _map: Record<string, SpaceEntry>;

  constructor(
    parameters: HasParameter[] // Already merged (outer + local)
    // NO parent parameter - merge happens at boundaries
  ) {
    this._map = {};
    for (const parameter of parameters) {
      this._map[parameter.name] = new AbstractParameter(parameter);
    }
  }

  // FieldSpace interface - Core functionality

  entry(name: string): SpaceEntry | undefined {
    // Simple lookup - no parent chain
    // Parameters were already merged at construction
    return this._map[name];
  }

  lookup(symbol: FieldName[]): LookupResult {
    const name = symbol[0];
    if (name === undefined) {
      return {
        error: {
          message: 'Invalid reference',
          code: 'invalid-parameter-reference',
        },
        found: undefined,
      };
    }

    const entry = this.entry(name.refString);
    if (entry === undefined) {
      return {
        error: {
          message: `\`${name}\` is not defined`,
          code: 'parameter-not-found',
        },
        found: undefined,
      };
    }

    // Parameters cannot have paths (e.g., param.field)
    if (symbol.length > 1) {
      return {
        error: {
          message: `\`${name}\` cannot contain a \`${symbol
            .slice(1)
            .join('.')}\``,
          code: 'invalid-parameter-reference',
        },
        found: undefined,
      };
    }

    return {
      found: entry,
      error: undefined,
      joinPath: [],
      isOutputField: false,
    };
  }

  entries(): [string, SpaceEntry][] {
    return Object.entries(this._map);
  }

  parameterNames(): string[] {
    return Object.keys(this._map);
  }

  // FieldSpace interface - Not applicable to parameters
  // TODO: Remove these when Namespace abstraction is added

  structDef(): StructDef {
    throw new Error('Parameter space does not have a structDef');
  }

  emptyStructDef(): StructDef {
    throw new Error('Parameter space does not have an emptyStructDef');
  }

  dialectName(): string {
    return '~parameter-space-unknown-dialect~';
  }

  connectionName(): string {
    return '~parameter-space-unknown-connection~';
  }

  dialectObj(): Dialect | undefined {
    return undefined;
  }

  isQueryFieldSpace(): this is QueryFieldSpace {
    return false;
  }

  accessProtectionLevel(): AccessModifierLabel {
    return 'private';
  }
}
```

**Validation**:
```bash
# Build check
npm run build

# Expected: Builds successfully
# Time: ~10 seconds
```

**Changelog Entry**:
```bash
cat >> CHANGELOG_PARAMS.md << 'EOF'

### [1.1] - ParameterSpace Foundation
**Date:** $(date +"%Y-%m-%d %H:%M")
**Time Spent:** 30 min
**Files Modified:**
- `packages/malloy/src/lang/ast/field-space/parameter-space.ts` (+110/-0 lines, new file)

**What:** Created ParameterSpace class for tracking parameter declarations
**Why:** Need namespace to store and lookup parameters
**How:** Implemented FieldSpace interface with MERGE-BASED visibility (no parent pointers)
**Tests:** 0/128 (foundation only, no tests yet)
**Validated:**
- Build: ✓
- IR Tests: N/A
- Translation: N/A
- Runtime: N/A

**Notes:**
- Uses merge-based approach (parameters merged at boundaries, not parent-chain)
- Currently implements FieldSpace with stub methods (structDef, dialect, etc.)
- Future: Extract Namespace base class per maintainer suggestion
- Model layer handles runtime resolution via QueryStruct parent chain
EOF
```

**Progress Update**:
```bash
sed -i.bak 's/- \[ \] 1.1: ParameterSpace foundation/- [x] 1.1: ParameterSpace foundation/' PROGRESS_TRACKER.md
rm PROGRESS_TRACKER.md.bak

cat >> PROGRESS_TRACKER.md << 'EOF'

### Latest: Iteration 1.1 Complete
**Date:** $(date)
- ✓ ParameterSpace class created
- Next: Parse parameter declarations (1.2)
EOF
```

**Commit** (OPTIONAL - or commit at Level 1 completion):
```bash
git add -A
git commit -m "feat(params): Iteration 1.1 - ParameterSpace foundation ✅

Created ParameterSpace class for parameter namespace management.

Key features:
- Implements FieldSpace for existing lookup integration
- MERGE-BASED visibility (no parent pointers/chains)
- entry() and lookup() methods for name resolution

Architectural notes:
- Parameters merged at boundaries before ParameterSpace construction
- Stub methods for FieldSpace interface (structDef, dialect, etc.)
- Future: Extract Namespace base class
- Model layer handles runtime resolution via QueryStruct parent chain
- See maintainer discussion on Namespace abstraction

Validation: Build ✓
Progress: 0/128 tests (foundation only)
Time: 30 min"
```

---

### Iteration 1.2: Parse Parameter Declaration (45 min)

**Objective**: Parse `source: s(param::number) is t` and create ParameterSpace

**What to Build**: Parameter parsing in NamedSource

**Why**: Need to extract parameter declarations from source syntax and populate ParameterSpace

**Reference**:
- `../malloy-cata02/packages/malloy/src/lang/ast/source-elements/named-source.ts`
- `../malloy-cata02/packages/malloy/src/lang/ast/parameters/has-parameter.ts`

**Files to Check/Modify**:
1. Check if `packages/malloy/src/lang/ast/parameters/has-parameter.ts` exists
2. Modify `packages/malloy/src/lang/ast/source-elements/named-source.ts`

**Test First** (TDD):

Add to `packages/malloy/src/lang/test/parameters.spec.ts`:

```typescript
describe('Level 1: Basic Parameters', () => {
  describe('Iteration 1.2: Parameter Declaration', () => {
    test('IR: can declare parameter with type', () => {
      const ir = compileToIR(`
        ##! experimental.parameters
        source: ab_new(param::number) is ab
      `);

      expectParameterInIR(ir, 'ab_new', 'param', {
        name: 'param',
        type: 'number',
        value: null
      });
    });

    test('IR: can declare multiple parameters', () => {
      const ir = compileToIR(`
        ##! experimental.parameters
        source: ab_new(p1::number, p2::string) is ab
      `);

      const params = getSourceParameters(ir, 'ab_new');
      expect(params).toBeDefined();
      expect(Object.keys(params!)).toHaveLength(2);
      expect(params!.p1.type).toBe('number');
      expect(params!.p2.type).toBe('string');
    });

    test('translation: basic parameter declaration', () => {
      expect(`
        ##! experimental.parameters
        source: ab_new(param::number) is ab
      `).toTranslate();
    });
  });
});
```

**Run Test**:
```bash
npm test -- --testNamePattern="Iteration 1.2"
# Expected: FAIL (not implemented yet)
```

**Implement**:

1. Review reference implementation
2. Create/modify HasParameter if needed
3. Modify NamedSource to:
   - Parse parameter list from grammar
   - Create ParameterSpace with declarations
   - Write parameters to IR in getSourceDef()

**Steps**:
```bash
# Review reference
cd ../malloy-cata02
grep -A 20 "class NamedSource" packages/malloy/src/lang/ast/source-elements/named-source.ts | head -30

# Implement in new workspace
cd ../malloy-param-clean
# Make changes to named-source.ts based on reference
```

**Validation**:
```bash
# Build
npm run build

# Run IR tests
npm test -- --testNamePattern="Iteration 1.2"
# Expected: 3 tests PASS ✓

# Check translation
npm test -- --testNamePattern="can declare parameter with no default"
# Expected: PASS ✓
```

**Changelog & Commit**: (Similar pattern to 1.1)

```bash
# Update changelog
cat >> CHANGELOG_PARAMS.md << 'EOF'

### [1.2] - Parse Parameter Declarations
**Date:** $(date +"%Y-%m-%d %H:%M")
**Time Spent:** 45 min
**Files Modified:**
- `packages/malloy/src/lang/ast/source-elements/named-source.ts` (+X lines)
- (potentially) `packages/malloy/src/lang/ast/parameters/has-parameter.ts`

**What:** Parse parameter list and create ParameterSpace
**Why:** Extract parameter declarations from source syntax
**How:** Modified NamedSource constructor to parse parameters and write to IR
**Tests:** 3/128 passing (2 IR + 1 translation)
**Validated:**
- Build: ✓
- IR Tests: ✓ (2 passing)
- Translation: ✓ (1 passing)
- Runtime: N/A

**Notes:**
- Parameters now appear in IR (SourceDef.parameters)
- Multiple parameters supported
- Ready for default values (next iteration)
EOF

# Update progress
sed -i.bak 's/- \[ \] 1.2: Parse parameter declaration/- [x] 1.2: Parse parameter declaration/' PROGRESS_TRACKER.md
sed -i.bak 's/Total: 0\/128/Total: 3\/128/' PROGRESS_TRACKER.md
rm PROGRESS_TRACKER.md.bak

# Commit (OPTIONAL - or commit at Level 1 completion)
git add -A
git commit -m "feat(params): Iteration 1.2 - Parse parameter declarations ✅

Parse parameter list from source syntax and write to IR.

Changes:
- Modified NamedSource to parse parameter list
- Create ParameterSpace from declarations
- Write parameters to IR (SourceDef.parameters)

Tests: 3/128 passing (2 IR + 1 translation)
- ✓ Can declare parameter with type
- ✓ Can declare multiple parameters
- ✓ Basic declaration translates

Validation: Build ✓, IR ✓, Translation ✓
Time: 45 min"
```

---

### Iteration 1.3: Default Values (30 min)

[Similar pattern - test first, implement, validate, commit]

**Target**: Parse default values, constant expression folding

**Tests to Enable**:
- Parameter with literal default
- Parameter with constant expression default

---

### Iteration 1.4: Type Checking (30 min)

**Target**: Validate parameter types

**Tests to Enable**:
- Type mismatch errors
- Null handling
- Type inference

---

### Iteration 1.5: Model Layer Integration (1.5 hours)

**Objective**: Model reads parameters and resolves them properly

**What to Build**: QueryStruct.arguments() with basic late binding

**Target**: First runtime test passing!

**Files to Modify**:
1. `packages/malloy/src/model/query_node.ts`
2. `packages/malloy/src/model/expression_compiler.ts`

#### Step 1: Implement QueryStruct.arguments() (45 min)

**Location**: `packages/malloy/src/model/query_node.ts`

```typescript
export class QueryStruct {
  private _resolvedArguments?: Record<string, Argument>;

  constructor(
    public structDef: StructDef,
    private sourceArguments?: Record<string, Argument>,
    parent?: ParentQueryStruct | ParentQueryModel,
    prepareResultOptions?: PrepareResultOptions
  ) {
    // ... existing constructor code ...
  }

  arguments(): Record<string, Argument> {
    /**
     * Parameter Resolution Precedence Matrix:
     *
     * 1. Runtime literal (highest)
     *    - sourceArguments with concrete value
     *    - Always overrides declared param-refs
     *    - CANNOT override declared literals
     *
     * 2. Declared param-ref (resolved from parent)
     *    - arguments[name].value.node === 'parameter'
     *    - Resolved by walking QueryStruct parent chain
     *    - Can be overridden by runtime literal
     *
     * 3. Declared literal
     *    - arguments[name].value is concrete expression
     *    - CANNOT be overridden by runtime (compile-time binding)
     *
     * 4. Default value
     *    - parameters[name].value
     *    - Used if no argument provided
     *
     * 5. Parent parameter (lowest)
     *    - Inherited if not declared locally
     *    - Enables parameter propagation
     */

    // Cache computed arguments
    if (this._resolvedArguments !== undefined) {
      return this._resolvedArguments;
    }

    this._resolvedArguments = {};

    if (!isSourceDef(this.structDef)) {
      // Non-source structs inherit from parent
      if (this.parent) {
        this._resolvedArguments = {...this.parent.arguments()};
      }
      return this._resolvedArguments;
    }

    // For source structs: complex resolution
    const params = this.structDef.parameters ?? {};
    const declaredArgs = this.structDef.arguments ?? {};

    // 1. Start with parameter defaults
    for (const [name, param] of Object.entries(params)) {
      this._resolvedArguments[name] = param;
    }

    // 2. Apply declared arguments (from IR)
    for (const [name, arg] of Object.entries(declaredArgs)) {
      const value = (arg as any)?.value;

      // Check if value is a parameter reference node
      if (value && value.node === 'parameter') {
        // Resolve from parent chain (LATE BINDING)
        const resolved = this.resolveParameterReference(value.path);
        if (resolved) {
          this._resolvedArguments[name] = {
            ...arg,
            value: resolved.value
          } as Argument;
        } else {
          // Keep as-is if can't resolve yet
          this._resolvedArguments[name] = arg as Argument;
        }
      } else if (value !== null && value !== undefined) {
        // Literal value - use directly
        this._resolvedArguments[name] = arg as Argument;
      }
    }

    // 3. Inherit from parent (for extended sources)
    if (this.parent) {
      const parentArgs = this.parent.arguments();
      for (const [name, value] of Object.entries(parentArgs)) {
        if (!(name in this._resolvedArguments)) {
          this._resolvedArguments[name] = value;
        }
      }
    }

    // 4. Apply sourceArguments (runtime overrides) with precedence
    if (this.sourceArguments) {
      for (const [name, arg] of Object.entries(this.sourceArguments)) {
        const value = (arg as any)?.value;
        if (value !== null && value !== undefined) {
          this._resolvedArguments[name] = arg as Argument;
        }
      }
    }

    return this._resolvedArguments;
  }

  private resolveParameterReference(path: string[]): Argument | undefined {
    if (!path || path.length === 0) return undefined;

    const refName = path[0];
    let current: QueryStruct | undefined = this.parent;

    // Walk up parent chain to find parameter
    while (current) {
      const parentArgs = current.arguments?.();
      const found = parentArgs?.[refName];
      if (found && found.value !== null && found.value !== undefined) {
        return found;
      }
      current = current.parent;
    }

    return undefined;
  }
}
```

**Notes**:
- ~70 lines (not 130+ like reference branch)
- Clear separation: defaults → declared → inherited → overrides
- Comments explain each step
- Handles parameter reference nodes (late binding)

#### Step 2: Handle Parameters in Expression Compiler (30 min)

**Location**: `packages/malloy/src/model/expression_compiler.ts`

Add case for parameter nodes:

```typescript
export function exprToSQL(
  resultSet: ResultSet,
  context: QueryStruct | QueryField,
  expr: Expr,
  state: ExprCompileState
): string {
  switch (expr.node) {
    // ... existing cases ...

    case 'parameter': {
      // Parameter nodes should have been resolved to values
      // by QueryStruct.arguments(), but if we encounter one,
      // we need to look it up and recursively compile its value
      const paramName = expr.path[0];
      const contextStruct = context instanceof QueryStruct
        ? context
        : context.getParent();

      const arg = contextStruct?.arguments()[paramName];
      if (!arg || !arg.value) {
        throw new Error(`Parameter ${paramName} not found or has no value`);
      }

      // Recursively compile the parameter's resolved value
      return exprToSQL(resultSet, context, arg.value, state);
    }

    // ... other cases ...
  }
}
```

#### Step 3: Test Level 1 Model Integration (15 min)

```bash
# Enable first runtime test
# In test/src/core/parameters.spec.ts
test('number param used in dimension', async () => {
  await expect(`
    ##! experimental.parameters
    source: state_facts(param::number) is duckdb.table('malloytest.state_facts') extend {
      dimension: param_plus_one is param + 1
    }
    run: state_facts(param is 1) -> { group_by: param_plus_one }
  `).malloyResultMatches(runtime, {param_plus_one: 2});
});

# Run test
npm test -- --testNamePattern="number param used in dimension"
```

**Expected**: Test passes ✅

**Validation**:
```bash
# Check SQL generation
npm test -- --testNamePattern="parameter" --verbose
# Look for: Parameter properly resolved in SQL

# Commit if passing (OPTIONAL - or commit at Level 1 completion)
git add -A
git commit -m "feat(params): Iteration 1.5 - Model layer parameter resolution

Implemented QueryStruct.arguments() with late binding:
- Resolve parameter reference nodes by walking parent chain
- Handle parent parameter inheritance
- Apply sourceArguments with precedence
- ~70 lines (vs 130+ in reference)

Added parameter node case to expression compiler.

First runtime test passing: 'number param used in dimension'"
```

**Time**: 1.5 hours (45m + 30m + 15m)

---

### Iteration 1.6: Precedence Tests (45 min)

**Objective**: Lock down exact precedence rules early

**Why**: Complex precedence logic in Model layer needs explicit validation to prevent bugs.

**Add 4 critical precedence tests**:

```typescript
// Test 1: Precedence order
test('precedence: runtime > declared literal > default', async () => {
  await expect(`
    ##! experimental.parameters
    source: s(p::number is 10) is t extend {
      dimension: x is p
    }
    run: s(p is 42) -> { select: x }  // Runtime binding uses 'is'
  `).malloyResultMatches(runtime, {x: 42});
});

// Test 2: Runtime does NOT override declared literal
test('precedence: declared literal wins over runtime', async () => {
  await expect(`
    ##! experimental.parameters
    source: outer(p::number is 10) is t
    source: inner(q::number is 5) is outer extend {
      dimension: x is q
    }
    run: inner(q is 99) -> { select: x }
  `).malloyResultMatches(runtime, {x: 5}); // Declared literal wins!
});

// Test 3: Runtime DOES override declared param-ref
test('precedence: runtime overrides param-ref default', async () => {
  await expect(`
    ##! experimental.parameters
    source: outer(p::number is 10) is t
    source: inner(q::number is p) is outer extend {
      dimension: x is q
    }
    run: inner(q is 99) -> { select: x }
  `).malloyResultMatches(runtime, {x: 99}); // Runtime overrides param-ref!
});

// Test 4: Parent fallback only for concrete values
test('precedence: parent fallback with null', async () => {
  await expect(`
    ##! experimental.parameters
    source: outer(p::number is 10) is t
    source: inner(q::number is null) is outer extend {
      dimension: x is q ?? p
    }
    run: inner -> { select: x }
  `).malloyResultMatches(runtime, {x: 10}); // Falls back to parent
});
```

**Documentation**:
```typescript
// In QueryStruct.arguments(), add comment:
/**
 * Precedence order (highest to lowest):
 * 1. Runtime literal (sourceArguments with concrete value)
 * 2. Declared param-ref (resolved from parent) - can be overridden by runtime
 * 3. Declared literal - CANNOT be overridden by runtime
 * 4. Default value from parameter declaration
 * 5. Parent parameter (if not declared locally)
 */
```

**Validation**:
```bash
# Run precedence tests
npm test -- --testNamePattern="precedence"
# Expected: 4/4 passing ✓

# Commit (OPTIONAL - or commit at Level 1 completion)
git add -A
git commit -m "test(params): Add precedence tests

Lock down exact precedence rules:
- Runtime > declared param-ref > declared literal > default
- Runtime cannot override declared literals
- Runtime can override declared param-refs
- Parent fallback only for concrete values

4 tests ensure Model layer precedence logic is correct."
```

**Time**: 45 min

---

### Iteration 1.7: Cross-Dialect Smoke Tests (30 min)

**Objective**: Catch SQL quoting/formatting issues early across dialect families

**Why**: Parameters must generate correct SQL for all supported dialects.

**Add 3 dialect smoke tests**:

```typescript
// Test 1: DuckDB (default)
test('cross-dialect: DuckDB parameter in SQL', async () => {
  const runtime = runtimeFor('duckdb');
  await expect(`
    ##! experimental.parameters
    source: s(p::string is 'test') is duckdb.table('t') extend {
      dimension: x is p
    }
    run: s -> { select: x }
  `).malloyResultMatches(runtime, {x: 'test'});
});

// Test 2: PostgreSQL parameter quoting (gated by environment)
const pgEnabled = process.env.MALLOY_DATABASES?.includes('postgres');
(pgEnabled ? test : test.skip)('cross-dialect: PostgreSQL parameter in SQL', async () => {
  const runtime = runtimeFor('postgres');
  await expect(`
    ##! experimental.parameters
    source: s(p::string is 'test''quote') is postgres.table('t') extend {
      dimension: x is p
    }
    run: s -> { select: x }
  `).malloyResultMatches(runtime, {x: "test'quote"});
});

// Test 3: Number parameters across dialects
test('cross-dialect: number parameter formatting', async () => {
  // Test that 11 + 1 constant folding works across dialects
  const duckRuntime = runtimeFor('duckdb');

  await expect(`
    ##! experimental.parameters
    source: s(p::number is 11 + 1) is duckdb.table('t') extend {
      dimension: x is p
    }
    run: s -> { select: x }
  `).malloyResultMatches(duckRuntime, {x: 12});

  // Also test with postgres if available
  if (pgEnabled) {
    const pgRuntime = runtimeFor('postgres');
    await expect(`
      ##! experimental.parameters
      source: s(p::number is 11 + 1) is postgres.table('t') extend {
        dimension: x is p
      }
      run: s -> { select: x }
    `).malloyResultMatches(pgRuntime, {x: 12});
  }
});
```

**Validation**:
```bash
# Run cross-dialect tests
npm test -- --testNamePattern="cross-dialect"
# Expected:
#   - DuckDB tests: Always run (2 tests)
#   - PostgreSQL test: Skipped if MALLOY_DATABASES doesn't include 'postgres'
#   - Result: 2-3 passing ✓ depending on environment

# Check generated SQL for each dialect
npm test -- --testNamePattern="cross-dialect" --verbose
# Look for: Proper quoting, no SQL injection risks

# Commit (OPTIONAL - or commit at Level 1 completion)
git add -A
git commit -m "test(params): Add cross-dialect smoke tests

Validate SQL generation across dialect families:
- DuckDB: Default dialect
- PostgreSQL: Quote escaping
- Numbers: Constant folding

Catches formatting/quoting issues early (Level 1)."
```

**Time**: 30 min

---

### Iteration 1.8: Level 1 Final Validation (15 min)

**Objective**: Confirm all Level 1 features work end-to-end

**Tests**: Run full Level 1 test suite

**Expected results**:
- ✅ Basic parameter declarations (5 tests)
- ✅ Type checking (4 tests)
- ✅ Default values (3 tests)
- ✅ Model integration (3 tests)
- ✅ Precedence rules (4 tests)
- ✅ Cross-dialect (3 tests)
- **Total: ~22 tests passing**

---

### Level 1 Summary & Validation

After completing all Level 1 iterations:

```bash
# Run all Level 1 tests
npm test -- parameters
# Expected: ~22 tests passing ✓

# Breakdown:
# - Declarations: 5 tests
# - Type checking: 4 tests
# - Default values: 3 tests
# - Model integration: 3 tests
# - Precedence: 4 tests
# - Cross-dialect: 3 tests

# Run all parameter tests
npm test -- parameters
# Expected: 22/~128 passing, rest not implemented yet

# Run full test suite
npm test
# Expected: Baseline + 15, no regressions

# Update final progress
cat >> PROGRESS_TRACKER.md << 'EOF'

## Level 1 Complete ✅
**Date:** $(date)
**Time:** 6.5 hours
**Tests:** 22/~128 passing (12 AST + 10 runtime)

### Iterations Completed
- ✓ 1.1: ParameterSpace foundation (30 min)
- ✓ 1.2: Parse declarations (45 min)
- ✓ 1.3: Default values (30 min)
- ✓ 1.4: Type checking (30 min)
- ✓ 1.5: Model integration with late binding (1.5 hours)
- ✓ 1.6: Precedence tests (45 min)
- ✓ 1.7: Cross-dialect smoke tests (30 min)
- ✓ 1.8: Final validation (15 min)

### What Works
- ✅ Parameter declaration with types
- ✅ Default values (literals and constant expressions)
- ✅ Type checking and inference
- ✅ Model layer late binding (parameter refs, inheritance, precedence)
- ✅ Use parameters in dimensions
- ✅ SQL generation
- ✅ End-to-end execution
- ✅ **Precedence rules locked down** (4 explicit tests)
- ✅ **Cross-dialect validated** (DuckDB, PostgreSQL)

### What's Next
Level 2: Parameter Propagation (~20 tests, 3.5-4.5 hours)
EOF

# Commit level completion (RECOMMENDED - Major Milestone)
git add -A
git commit -m "feat(params): Level 1 Complete - Basic Parameters ✅

Level 1 summary:
- All 8 iterations complete
- 22/~128 tests passing (12 AST + 10 runtime)
- ~6.5 hours total

Features implemented:
✓ Parameter declaration with types
✓ Default values (literals + constant expressions)
✓ Type checking and type inference
✓ Model layer late binding (refs, inheritance, precedence)
✓ SQL generation for parameters
✓ End-to-end execution
✓ Precedence rules locked down (4 tests)
✓ Cross-dialect validation (DuckDB, PostgreSQL)

Tests passing:
- Parameter declaration (various types)
- Multiple parameters
- Default values
- Type checking errors
- Use in dimensions
- SQL generation
- Runtime execution

No regressions in existing tests.

Next: Level 2 - Parameter Propagation"
```

---

## Level 2: Parameter Propagation (3.5-4.5 hours)

**Goal**: Parameters flow through source extensions and views

**Success Criteria**:
- ✅ Extended source inherits parameters
- ✅ Can override parameter values
- ✅ Views can access outer parameters
- ✅ ~20 additional tests passing

**Note**: Model layer's parent parameter inheritance (from Level 1.5) already handles propagation at runtime. Level 2 focuses on AST writing correct metadata to IR for extended/refined sources.

---

### Level 2 Preparation (10 min)

**Review propagation implementation:**

```bash
# 1. Review propagation section
cd ../malloy-cata02
less PARAMETER_CHANGES_DEEP_DIVE.md
# Search for: "Parameter Propagation" or "Source Extension"
# Read: How parameters flow through source hierarchy

# 2. Check key files
git diff main..HEAD packages/malloy/src/lang/ast/source-elements/
# Focus on: How ParameterSpace is threaded through extensions

# 3. Check test patterns
grep -A 10 "extended source" packages/malloy/src/lang/test/parameters.spec.ts | head -20

cd ../malloy-param-clean
```

**Key Insights from Reference Branch**:
- Reference uses parent-pointer chaining (we use merge-based instead)
- Extended sources need parameter visibility from parent
- Arguments can override parameters
- Views inherit parent's parameters

**Our Approach (Different)**:
- We use MERGE-BASED: merge outer + local at boundaries
- No parent pointers in ParameterSpace (simpler)
- Model layer handles runtime resolution

**Known Challenges**:
- Distinguishing between parameter declaration vs argument binding
- Handling parameter shadowing correctly
- Override precedence: runtime > param-ref > literal > default

**Time**: 10 min preparation

---

### Iterations

2.1: Source Extension (1 hour) - Merge-based parameter visibility (outer + local) at extension boundaries
2.2: Views Accessing Parameters (1 hour) - Views see merged parameters from base source
2.3: Runtime Override (45 min) - Model handles runtime override precedence
2.4: Nested Propagation (45 min) - Multi-level inheritance

[Each iteration follows same pattern: Test → Implement → Validate → Commit]

---

### Iteration 2.1 Detail: AST-Only Test (Nice-to-Have)

**Add fast AST-level test to validate merge-based visibility**:

```typescript
// In packages/malloy/src/lang/test/parameters.spec.ts
test('AST: StaticSourceSpace.entry() resolves parameter after extend', () => {
  const source = `
    ##! experimental.parameters
    source: base(p::number is 10) is duckdb.table('t')
    source: ext is base extend { dimension: x is 1 }
  `;

  const translator = new TestTranslator(source);
  const result = translator.translate();

  // Get the extended source's space
  const extSource = result.modelDef.contents['ext'];
  // In implementation, verify that parameter 'p' is visible in ext's ParameterSpace
  // This validates merge happened correctly at AST level

  expect(extSource).toBeDefined();
  // Fast feedback: AST merged parameters correctly (no need for runtime execution)
});
```

**Why**: This gives ~10 sec feedback (AST only) vs ~30 sec (full runtime execution). Catches AST merge issues immediately.

**Time**: Add this test in iteration 2.1 (adds ~5-10 min)

---

## Level 3: Pipeline Parameters (4.5-5.5 hours)

**Goal**: Parameters work in multi-stage pipelines

**Success Criteria**:
- ✅ Parameter visible in all stages
- ✅ Can use parameter in different stages
- ✅ Aggregates using parameters work
- ✅ ~25 additional tests passing

**Note**: This is the most complex level - parameters must thread through multiple pipeline stages. Model layer may need additional logic for stage transitions. AST must write pipeline-stage metadata correctly to IR.

---

### Level 3 Preparation (15 min)

**Review pipeline implementation (most complex part):**

```bash
# 1. Review pipeline section in detail
cd ../malloy-cata02
less PARAMETER_CHANGES_DEEP_DIVE.md
# Search for: "Multi-Stage Pipeline Support"
# Read carefully: This was the main bug fix in working branch

# 2. Review the key commit
git log --oneline | grep -i pipeline
git show [commit-hash] --stat

# 3. Check QueryArrow changes
git diff main..HEAD packages/malloy/src/lang/ast/query-elements/query-arrow.ts | less
# Focus on: How ParameterSpace threads through stages

# 4. Read test patterns
grep -A 15 "pipeline" packages/malloy/src/lang/test/parameters.spec.ts | head -40

cd ../malloy-param-clean
```

**Key Insights**:
- Each pipeline stage needs access to source parameters
- AST merges parameters at each stage boundary (stage input + local)
- Model resolves parameters at runtime (QueryStruct chain)
- Parameters written to IR for each stage
- Stage output becomes next stage input (with merged parameters)

**Known Challenges**:
- QueryArrow has complex stage chaining
- Each stage is a separate QuerySpace
- Need to pass sourceArguments correctly
- Aggregate expressions in later stages using parameters

**Critical**: This was the main fix in working branch - study carefully!

**Time**: 15 min preparation (extra time worth it - complex!)

---

### Iterations

3.1: Thread Through QueryArrow (1.5 hours)
3.2: Multi-Stage Access (1 hour)
3.3: Stage-Specific Expressions (1 hour)
3.4: Aggregates with Parameters (1 hour)

---

## Level 4: Join Parameters (3-4 hours)

**Goal**: Parameters work with joins

**Success Criteria**:
- ✅ Can parameterize joined sources
- ✅ Parameters in join conditions
- ✅ Outer parameters accessible in joins
- ✅ ~20 additional tests passing

---

### Level 4 Preparation (10 min)

**Review join parameter handling:**

```bash
# 1. Review join section
cd ../malloy-cata02
less PARAMETER_CHANGES_DEEP_DIVE.md
# Search for: "Join Parameters" or "join_one"

# 2. Check join implementation
git diff main..HEAD packages/malloy/src/lang/ast/source-properties/join.ts | less
# Focus on: How parameters pass to joined sources

# 3. Check test patterns for joins
grep -A 10 "join" packages/malloy/src/lang/test/parameters.spec.ts | head -30

cd ../malloy-param-clean
```

**Key Insights**:
- Joined sources can be parameterized: `join_one: s is source(param)`
- Outer scope parameters accessible in join
- Join ON conditions can use parameters
- ParameterSpace merges when joining

**Known Challenges**:
- Distinguishing outer vs joined source parameters
- Passing arguments correctly to joined sources
- Scope resolution in join conditions
- Multiple levels of joins

**Time**: 10 min preparation

---

### Iterations

4.1: Parameterized Joins (1.5 hours)
4.2: Join Conditions (1 hour)
4.3: Outer Scope Access (1 hour)

---

## Level 5: Advanced Features (3-4 hours)

**Goal**: Special cases and edge cases

**Success Criteria**:
- ✅ Filter expression parameters
- ✅ Refine operations
- ✅ All edge cases handled
- ✅ ~25 additional tests passing

---

### Level 5 Preparation (10 min)

**Review advanced features:**

```bash
# 1. Review advanced sections
cd ../malloy-cata02
less PARAMETER_CHANGES_DEEP_DIVE.md
# Search for: "Filter Expression" and "Constant Expression Folding"

# 2. Check filter expression parameter types
grep -A 20 "filter<" packages/malloy/src/lang/test/parameters.spec.ts | head -30

# 3. Check constant folding
grep -A 10 "constant expression" packages/malloy/src/lang/test/parameters.spec.ts | head -20

# 4. Check refine operations
grep -A 10 "refine" packages/malloy/src/lang/test/parameters.spec.ts | head -20

cd ../malloy-param-clean
```

**Key Insights**:
- Filter expression parameters: `param::filter<string>`
- Constant expression folding: `param::number is 11 + 1` → `12`
- Refine operations can access parameters from refined source
- Type coercion for parameter values
- Null handling in parameters

**Known Challenges**:
- Filter expression type checking is complex
- Constant folding needs expression evaluator
- Refine scope resolution
- Edge cases: null, undefined, type mismatches

**Time**: 10 min preparation

---

### Iterations

5.1: Filter Expression Parameters (1.5 hours)
5.2: Refine Operations (1 hour)
5.3: Edge Cases (1.5 hours)

---

## Final Phase: Integration & Polish (2-3 hours)

### Polish 1: Enable Remaining Runtime Tests (1 hour)

Enable and validate all remaining runtime tests

### Polish 2: Remove Debug Code (30 min)

Search for and remove any debug logging, console statements

### Polish 3: Documentation (1 hour)

- Update README if needed
- Document known limitations
- Note future work items

### Polish 4: Final Validation (30 min)

```bash
# All parameter tests
npm test -- parameters
# Expected: 128/128 passing ✅

# Full test suite
npm test
# Expected: All baseline tests + 128 new tests ✅

# Compare with baseline
echo "=== Final Comparison ===" > FINAL_VALIDATION.md
echo "Baseline tests: $(grep passing BASELINE_SUMMARY.md)" >> FINAL_VALIDATION.md
echo "Current tests: $(npm test 2>&1 | grep passing)" >> FINAL_VALIDATION.md
echo "New tests: 128 parameter tests" >> FINAL_VALIDATION.md
echo "Regressions: $(diff <(grep passing BASELINE_SUMMARY.md) <(npm test 2>&1 | grep passing) | wc -l)" >> FINAL_VALIDATION.md

# Should show 0 regressions
```

---

## Time Breakdown

| Phase | Focus | Prep | Implementation | Tests | Iterations |
|-------|-------|------|----------------|-------|------------|
| 0 | Setup | - | 2-3h | 0 | 5 actions |
| 1 | Basic + Precedence + Dialect | 10m | 6-7h | 22 | 8 iterations |
| 2 | Propagation | 10m | 3.5-4.5h | 20 | 4 iterations |
| 3 | Pipelines | 15m | 4.5-5.5h | 25 | 4 iterations |
| 4 | Joins | 10m | 3-4h | 20 | 3 iterations |
| 5 | Advanced | 10m | 3.5-4.5h | 20 | 3 iterations |
| Final | Polish | - | 2-3h | 21 | 4 tasks |
| **Total** | | **~1h** | **24.5-34.5h** | **~128** | **31 steps** |

**Preparation time**: ~10-15 min per level (ROI: saves 30-60 min debugging)
**Average per iteration**: 15-45 min
**Feedback cycle**: 15-30 min (test → implement → validate)
**Checkpoint**: After each level (~daily)

---

## Success Criteria (Final)

### Must Have
- ✅ 128/128 parameter tests passing
- ✅ 0 regressions in existing tests
- ✅ All changes documented in CHANGELOG_PARAMS.md
- ✅ Clean commit history (commits at level boundaries and significant milestones)
- ✅ IR structure matches reference (where applicable)
- ✅ No debug code remaining

### Should Have
- ✅ Code is readable and well-commented
- ✅ Architectural notes documented
- ✅ Known limitations listed
- ✅ Future work items identified

### Nice to Have
- ✅ Performance benchmarks
- ✅ Comparison with reference implementation
- ✅ Migration guide (if breaking changes)

---

## Emergency Procedures

### If Iteration Takes Too Long (>2x estimate)

1. **Stop** - Don't continue coding
2. **Review** - Read reference implementation carefully
3. **Debug** - What's the actual problem?
4. **Simplify** - Is there a simpler approach?
5. **Ask** - Get help if stuck >1 hour

### If Tests Fail Unexpectedly

1. **Check IR** - Does IR look right?
2. **Check Reference** - What does working branch do?
3. **Isolate** - Create minimal reproduction
4. **Debug** - Step through code
5. **Reassess** - Is approach fundamentally wrong?

### If Regression Detected

1. **Stop** - Don't proceed
2. **Identify** - Which test broke?
3. **Isolate** - What change caused it?
4. **Fix** - Correct the issue
5. **Validate** - Full suite passes again

---

## Appendix A: Quick Reference Commands

```bash
# Build
npm run build

# Run specific test
npm test -- --testNamePattern="test name"

# Run level tests
npm test -- --testNamePattern="Level [N]"

# Run all parameter tests
npm test -- parameters

# Run full suite
npm test

# Compare with baseline
diff BASELINE_SUMMARY.md <(npm test 2>&1 | grep -E "passing|failing")

# Check reference implementation
cd ../malloy-cata02
grep -A 20 "pattern" path/to/file.ts
cd ../malloy-param-clean
```

---

## Appendix B: Commit Message Format

```
<type>(params): <Level.Iteration> - <Title> <status>

<Detailed description>

<What was implemented>
<Why it was needed>
<How it works>

Tests: X/128 passing (<change from previous>)
<List of tests passing>

Validation: Build ✓, IR ✓, Translation ✓, Runtime ✓
Time: X min
```

**Types**: `feat`, `fix`, `test`, `docs`, `chore`
**Status**: `✅` (complete), `⏳` (in progress), `🚧` (blocked)

---

## Appendix C: Useful Queries to Reference Branch

```bash
# See how parameter is declared in IR
cd ../malloy-cata02
node -e "
const {compile} = require('./packages/malloy');
const model = compile('##! experimental.parameters\nsource: s(p::number=5) is a');
console.log(JSON.stringify(model._modelDef.contents.s.parameters, null, 2));
"

# Find where a feature is implemented
grep -r "ParameterSpace" packages/malloy/src/lang/ast/ | grep -v ".js" | head -20

# See test patterns
grep -A 10 "test('parameter" packages/malloy/src/lang/test/parameters.spec.ts | head -30
```

---

**Ready to execute!** 🚀

Next step: Execute Phase 0, then begin Level 1.
