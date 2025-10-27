# Current Implementation Plan - V5 Hybrid Approach

**Document**: `PARAMETER_REFACTORING_PLAN_V5_HYBRID.md`
**Status**: Ready to execute (Updated with Model layer + precedence + dialect tests)
**Estimated Time**: 24.5-34.5 hours
**Target**: ~128 parameter tests passing

---

## Why V5 (Hybrid Approach)?

### Evolution of Plans

- **V1-V2**: Too big, tried to plan everything upfront
- **V3**: Incremental but phases not detailed enough
- **V4**: Layer-based testing (good idea!) but phases 3-7 missing details
- **V5**: **Hybrid** - Combines best of V3 and V4

### Key Innovation: Vertical Slices

Instead of horizontal layers (all AST, then all Model), we do **vertical slices**:

```
Level 1 (4-5h): Basic Parameters - Complete stack
  ├─ AST: Parse declarations ✓
  ├─ IR: Write to IR ✓
  ├─ Model: Read from IR ✓
  └─ SQL: Generate literals ✓
  Result: Parameters work end-to-end! ✅

Level 2 (3-4h): Propagation - Complete stack
  ├─ AST: Thread through extensions ✓
  ├─ IR: Extended sources ✓
  ├─ Model: Inherit parameters ✓
  └─ Runtime: Override values ✓
  Result: Propagation works! ✅

... and so on
```

**Benefit**: Know within 4 hours if basic approach is right (not after 20 hours).

---

## The Approach

### 1. Graduated Complexity Levels

Each level adds one major feature, complete end-to-end:

| Level | Feature | Time | Tests |
|-------|---------|------|-------|
| 0 | Setup & Infrastructure | 2-3h | 0 |
| 1 | Basic + Late Binding + Precedence + Dialect | 6-7h | 22 |
| 2 | Propagation | 3.5-4.5h | 20 |
| 3 | Pipelines | 4.5-5.5h | 25 |
| 4 | Joins | 3-4h | 20 |
| 5 | Advanced | 3.5-4.5h | 20 |
| Final | Polish & Integration | 2-3h | 21 |

**Total**: 24.5-34.5 hours, ~128 tests

### 2. Micro-Iterations (15-30 min cycles)

Within each level, tiny iterations with fast feedback:

```
Iteration 1.1 (30 min):
  1. Write test (what should happen?) ← 5 min
  2. Run test → FAILS (red) ← 10 sec
  3. Implement feature ← 20 min
  4. Run test → PASSES (green) ← 10 sec
  5. Commit ← 2 min

Iteration 1.2 (30 min):
  ... repeat
```

**Benefit**: Know within 30 min if implementation is wrong.

### 3. Multi-Stage Validation

Fast feedback at multiple levels:

```
After each iteration (5 min):
  ✓ Build: Does it compile? (10 sec)
  ✓ IR Test: Is IR correct? (5 sec)
  ✓ Translation: Does it parse? (5 sec)
  ✓ Runtime: Does it execute? (30 sec)

After each level (30 min):
  ✓ All level tests pass
  ✓ Full suite (no regressions)
  ✓ Compare IR with reference
```

---

## Example: Level 1 Breakdown

**Goal**: Basic parameters work (no propagation, no pipelines)

### Iteration 1.1 (30 min): Foundation
- Create ParameterSpace class
- No tests yet (just infrastructure)
- Validation: Builds ✓

### Iteration 1.2 (45 min): Parse Declarations
**Test first**:
```typescript
test('IR: can declare parameter', () => {
  const ir = compileToIR(`source: s(p::number) is t`);
  expect(ir.contents.s.parameters.p).toBeDefined();
});
```
**Implement**: Parse parameters, write to IR
**Result**: 3 tests passing ✅

### Iteration 1.3 (30 min): Default Values
**Test first**:
```typescript
test('IR: parameter with default', () => {
  const ir = compileToIR(`source: s(p::number = 42) is t`);
  expect(ir.contents.s.parameters.p.value).toMatchObject({
    node: 'numberLiteral', value: 42
  });
});
```
**Implement**: Parse default expressions
**Result**: 6 tests passing ✅

### Iteration 1.4 (30 min): Type Checking
**Test first**: Error cases
**Implement**: Validate types
**Result**: 9 tests passing ✅

### Iteration 1.5 (1.5 hours): Model Integration with Late Binding
**Test first** (Runtime!):
```typescript
it('can use parameter', async () => {
  await expect(`
    source: s(p::number=5) is t extend { dimension: x is p }
    run: s() -> {select: x}
  `).malloyResultMatches(runtime, {x: 5});
});
```
**Implement**:
- QueryStruct.arguments() method (~70 lines, not 130+)
- Resolve parameter references by walking parent chain
- Handle parent parameter inheritance
- Apply runtime precedence rules
- Add parameter node case to expression compiler

**Result**: 12 tests passing ✅ **END-TO-END WORKS!**

### Iteration 1.6 (45 min): Precedence Tests
**Test**: Lock down exact precedence rules
- Runtime > declared param-ref > declared literal > default
- 4 explicit tests ensure Model precedence logic is correct
**Result**: 16 tests passing ✅

### Iteration 1.7 (30 min): Cross-Dialect Smoke Tests
**Test**: Validate SQL across dialects
- DuckDB, PostgreSQL, number formatting
- Catch quoting/formatting issues early
**Result**: 19 tests passing ✅

### Iteration 1.8 (15 min): Final Validation
**Result**: 22 tests passing ✅

**Level 1 Complete**: Parameters work with precedence validated and cross-dialect tested! Move to Level 2.

---

## Risk Mitigation

### Early Validation Points

- **30 min**: Does ParameterSpace compile?
- **2 hours**: Do parameters appear in IR?
- **4 hours**: Does end-to-end work?

If any fail, we know immediately (not after 20 hours).

### Stop Conditions

Stop and reassess if:
- ❌ Iteration takes >2x estimated time
- ❌ Previously passing tests fail (regression)
- ❌ IR structure very different from reference
- ❌ Approach feels overly complex

**Recovery**: Review reference, simplify, ask for help.

---

## Why This Works

### 1. Vertical Slices Beat Horizontal Layers

**Horizontal** (V3/V4 issue):
```
Phase 1-3: All AST work (10 hours)
  ↓
Phase 4: Model work (3 hours)
  ↓
Discover AST is wrong! → 10 hours wasted
```

**Vertical** (V5 approach):
```
Level 1: Basic (AST→Model→SQL) (4 hours)
  ✓ Works! Approach validated.
  ↓
Level 2: Add propagation (3 hours)
  ✓ Still works!
  ↓
Continue with confidence...
```

### 2. Fast Feedback Cycles

**Slow** (traditional):
```
Write 1000 lines → compile → test → fails
Where's the bug? Anywhere in 1000 lines!
```

**Fast** (V5):
```
Write 50 lines → test (10 sec) → passes ✓
Write 50 lines → test (10 sec) → fails ✗
  Bug is in last 50 lines! Easy to find.
```

### 3. Layer-Based Testing (from V4)

We keep the good idea from V4:

- **AST Tests** → Validate IR structure (fast! 5-10 sec per test)
- **Runtime Tests** → Validate execution (slower, 1-5 sec per test)

**Benefit**: AST bugs caught in seconds, not minutes.

### 4. Incremental Commits

One commit per iteration (~30 min work):
- Easy to review
- Easy to revert if wrong
- Clear history

---

## Tracking & Documentation

### Files Created

- **PROGRESS_TRACKER.md** - Current status, tests passing
- **CHANGELOG_PARAMS.md** - Every change documented
- **VALIDATION_CHECKLIST.md** - Quality checks
- **TEST_ORGANIZATION.md** - Test breakdown by level

### Updated After Each Iteration

- Tests passing: X/128
- What works now
- What's next
- Any issues encountered

---

## Comparison with Previous Plans

| Aspect | V3 | V4 | V5 (Hybrid) |
|--------|----|----|-------------|
| **Structure** | Horizontal layers | Horizontal layers | Vertical slices ✅ |
| **Testing** | Mixed | IR-focused ✅ | IR + Runtime ✅ |
| **Feedback** | Per phase (8h) | Per phase (8h) | Per iteration (30m) ✅ |
| **Detail** | Some phases vague | Half missing | All detailed ✅ |
| **Model Layer** | Unclear | Oversimplified | Late binding handled ✅ |
| **Precedence** | Not explicit | Not explicit | 4 explicit tests ✅ |
| **Dialect Coverage** | Unclear | Unclear | Early smoke tests ✅ |
| **Risk** | Medium | Medium-High | Low ✅ |
| **Time** | 20-30h | 17-27h | 24.5-34.5h |

**V5 Advantages**:
- ✅ Fastest feedback (30 min vs 8 hours)
- ✅ Validates approach early (Level 1 = 4 hours)
- ✅ Every step detailed
- ✅ Clear stop/go decisions

---

## Ready to Execute

### Prerequisites
- ✅ Plan reviewed and approved
- ✅ Reference branch available (params-in-pipeline-stages)
- ✅ Time allocated (21-31 hours)
- ✅ Main branch is baseline

### Next Steps
1. Execute Phase 0 (Setup) - 2-3 hours
2. Execute Level 1 (Basic) - 4-5 hours
3. **Decision point**: Does end-to-end work?
   - ✅ Yes → Continue to Level 2
   - ❌ No → Reassess approach

### First Session Plan (4-5 hours)
- Phase 0: Setup (2-3h)
- Level 1.1-1.3: Foundation + parsing (1.5-2h)

**After first session**: Should have parameters appearing in IR!

### Second Session Plan (4-6 hours)
- Level 1.4: Type checking (30m)
- Level 1.5: Model integration with late binding (1.5h)
- Level 1.6: SQL generation (30m)
- Begin Level 2: Propagation

**After second session**: END-TO-END working! Parameters execute correctly.

---

## Important: Model Layer Responsibilities

**Key Update**: After deep analysis, we discovered Model layer CANNOT just "read from IR". It must handle **late binding**:

### Why Model Must Do More

1. **Parameter References Across Boundaries**:
   ```malloy
   source: outer(p::number = 10) is ...
   source: inner(q::number = p) is outer  // q references p
   ```
   - AST: Can't resolve `p` when compiling `inner` independently
   - Model: Walks parent chain at runtime to resolve

2. **Parent Parameter Inheritance**:
   ```malloy
   source: base(p::number = 10) is ...
   source: ext is base extend {}  // Inherits p!
   ```
   - AST: `ext` doesn't explicitly declare `p`
   - Model: Automatically inherits from `base`

3. **Runtime Override Precedence**:
   - Complex rules for literal defaults vs parameter references vs runtime overrides
   - Model applies correct precedence

### The Solution

**Model's `arguments()` method**:
- ~50-70 lines (cleaner than reference branch's 130+)
- Clear, well-commented
- Handles all 3 late binding cases

**Time Impact**:
- Level 1.5 increased from 1h → 1.5h
- Total time increased from 21-31h → 23-33h
- Still much cleaner than reference implementation

---

## Questions?

- **Why not just clean up the working branch?**
  Working branch has 5k LOC with debug code, complex logic in wrong places. Starting fresh with clean architecture is faster.

- **What if we discover we need something not in the plan?**
  That's fine! The plan is a guide. Document changes in CHANGELOG_PARAMS.md.

- **What if a level takes much longer than estimated?**
  Stop and reassess. Maybe split it into smaller levels. The estimates are based on reference implementation analysis.

- **Can we parallelize any of this?**
  Not easily for one person. For a team, could parallelize levels (but must agree on IR structure first).

---

**Let's build parameters the right way!** 🚀
