# Parameter Implementation - Plan Index

## Current Plan (V5 Hybrid) ⭐

**📋 Full Plan**: [`PARAMETER_REFACTORING_PLAN_V5_HYBRID.md`](./PARAMETER_REFACTORING_PLAN_V5_HYBRID.md)
**📊 Summary**: [`CURRENT_PLAN_SUMMARY.md`](./CURRENT_PLAN_SUMMARY.md)
**📚 Reference**: See "Reference Documents" section below

**Status**: ✅ Ready to execute (Final, cleaned)
**Time**: 24.5-34.5 hours
**Target**: ~128 tests passing

### Why V5?

Combines the best ideas from previous iterations:
- ✅ **Vertical slices** (complete features, not layers)
- ✅ **Fast feedback** (15-30 min cycles)
- ✅ **IR testing** (validate AST quickly)
- ✅ **Incremental** (commit every 30 min)
- ✅ **Detailed** (every step explained)

**Key Innovation**: End-to-end validation at each level (not just at the end).

---

## Plan Evolution

### V1: Initial Analysis
**File**: `PARAMETER_CHANGES_DEEP_DIVE.md`
**Purpose**: Understand what the working branch did
**Outcome**: Identified complexity issues (215-line arguments() method)

### V2: First Refactoring Plan
**File**: `PARAMETER_REFACTORING_PLAN_V2.md`
**Approach**: Big phases, try to plan everything upfront
**Issue**: Too ambitious, phases not detailed enough

### V3: Incremental Approach
**File**: `PARAMETER_REFACTORING_PLAN_V3_INCREMENTAL.md`
**Approach**: Smaller increments, test-driven
**Improvement**: Better granularity
**Issue**: Still horizontal layers, some phases vague

### V4: Layer-Based Testing
**File**: `PARAMETER_REFACTORING_PLAN_V4_LAYERED.md`
**Approach**: Split AST and Model work, use IR tests
**Innovation**: ✅ **IR testing for fast feedback**
**Issue**: Phases 3-7 not detailed, test count wrong

### V5: Hybrid (Current) ⭐
**File**: `PARAMETER_REFACTORING_PLAN_V5_HYBRID.md`
**Approach**: Vertical slices + micro-iterations + IR testing
**Combines**:
- Vertical slicing (validate end-to-end early)
- Fast feedback (30 min cycles)
- IR testing (from V4)
- Incremental commits (from V3)
- Full detail (learned from V2-V4)

**Result**: Best of all previous plans, fully detailed, ready to execute.

---

## Supporting Documents

### Analysis & Background
- `PARAMETER_IMPLEMENTATION_SUMMARY.md` - What was done on working branch
- `PARAMETER_CHANGES_DEEP_DIVE.md` - Deep analysis of changes
- `PARAMETER_FEATURES_INVENTORY.md` - Feature catalog
- `SKIPPED_TESTS_SUMMARY.md` - Tests not passing on working branch

**Note**: Architecture clarifications (why Model must handle late binding) are now integrated into the main plan (lines 85-110).

### Setup & Configuration
- `POSTGRES_SETUP_CHANGES.md` - PostgreSQL port changes (5433)
- `TEST_ORGANIZATION.md` - How tests are organized (will be created in Phase 0)

### Progress Tracking (will be created)
- `PROGRESS_TRACKER.md` - Current status, tests passing
- `CHANGELOG_PARAMS.md` - Detailed log of all changes
- `VALIDATION_CHECKLIST.md` - Quality checks per iteration

### Updates & Summaries
- `PLAN_UPDATES_TEST_DRIVEN.md` - Updates to add test-driven approach
- `PLAN_SUMMARY.md` - Old summary (superseded by CURRENT_PLAN_SUMMARY.md)

---

## Quick Start

### For Implementation

1. **Read**: `CURRENT_PLAN_SUMMARY.md` (10 min)
2. **Review**: `PARAMETER_REFACTORING_PLAN_V5_HYBRID.md` (30 min)
3. **Execute**: Start with Phase 0
4. **Track**: Update PROGRESS_TRACKER.md as you go

### For Review

1. **Summary**: Read `CURRENT_PLAN_SUMMARY.md`
2. **Rationale**: Read "Why V5?" section
3. **Details**: Skim specific levels you're interested in
4. **Questions**: Check "Questions?" section in summary

### For Understanding Context

1. **What was done**: `PARAMETER_IMPLEMENTATION_SUMMARY.md`
2. **Why it's complex**: `PARAMETER_CHANGES_DEEP_DIVE.md`
3. **Evolution**: This document (PLAN_INDEX.md)

---

## Key Decisions

### Architectural

**Decision**: Use ParameterSpace that implements FieldSpace (with stub methods)
**Rationale**: Integrate with existing lookup infrastructure
**Future**: Extract Namespace base class (per maintainer suggestion)
**Document**: Iteration 1.1 in V5 plan

**Decision**: AST merges parameter visibility at boundaries, Model resolves at runtime
**Rationale**:
- AST: Merge-based visibility (outer + local), write metadata to IR
- Model: Single source of truth for runtime resolution (param-refs, precedence, overrides)
- Clear separation: AST = compile-time, Model = runtime

**Why Not Parent-Chain**: Lower complexity, fewer files touched, lower review burden
**Why Model Must Resolve**: Cross-boundary references, parent inheritance, runtime precedence
**Document**: V5 plan architecture section (lines 85-110)

**Decision**: Write parameters to IR (SourceDef.parameters)
**Rationale**: Clear contract between layers
**Alternative**: Pass around ParameterSpace instances (tighter coupling)
**Document**: Level 1 iterations in V5 plan

### Process

**Decision**: Vertical slices (end-to-end per level)
**Rationale**: Validate approach early, reduce risk
**Alternative**: Horizontal layers (all AST, then Model) - higher risk
**Document**: CURRENT_PLAN_SUMMARY.md

**Decision**: 15-30 min micro-iterations
**Rationale**: Fast feedback, easy to debug
**Alternative**: Longer iterations - harder to isolate bugs
**Document**: Section 2 in CURRENT_PLAN_SUMMARY.md

**Decision**: IR testing for AST validation
**Rationale**: Much faster than runtime tests (10 sec vs 5 min)
**Alternative**: Only runtime tests - slower feedback
**Document**: Test Organization in V5 plan

---

## Success Metrics

### During Implementation
- ✅ Each iteration completes in estimated time (±50%)
- ✅ Tests pass after each iteration
- ✅ No regressions in full suite
- ✅ Commit after each iteration (~30 min)

### After Each Level
- ✅ All level tests passing
- ✅ Feature works end-to-end
- ✅ IR matches reference branch
- ✅ Full suite passes (no regressions)

### Final Success
- ✅ 128/128 parameter tests passing
- ✅ 0 regressions in existing tests
- ✅ Code is clean and maintainable
- ✅ All changes documented
- ✅ Ready for PR

---

## Time Estimates

| Phase | Best Case | Likely | Worst Case |
|-------|-----------|--------|------------|
| Phase 0 | 2h | 2.5h | 3h |
| Level 1 | 4h | 4.5h | 5h |
| Level 2 | 3h | 3.5h | 4h |
| Level 3 | 4h | 4.5h | 5h |
| Level 4 | 3h | 3.5h | 4h |
| Level 5 | 3h | 3.5h | 4h |
| Final | 2h | 2.5h | 3h |
| **Total** | **21h** | **24.5h** | **31h** |

**Factors affecting time**:
- Familiarity with codebase
- Complexity of reference implementation
- Number of unexpected issues
- Testing thoroughness

**Strategy**: Plan for "Likely" (24.5h), track against "Best Case" (21h).

---

## Related Work

### Maintainer Feedback
- **Namespace abstraction**: Should extract Namespace base class
- **Scope chains**: Should be formalized, not "magical"
- **Can ship current approach**: Architecture refinement can be follow-up PR

**Decision**: Ship parameters with current approach, refactor later.
**Document**: Discussion in CURRENT_PLAN_SUMMARY.md

### Reference Implementation
- **Branch**: `params-in-pipeline-stages`
- **Status**: 37/43 tests passing (6 skipped)
- **LOC**: ~5500 (including debug code)
- **Issues**: Complex Model logic, debug instrumentation

**Our Goal**: Clean implementation, ~2500 LOC, all tests passing.

---

## FAQ

**Q: Why not start from the working branch?**
A: Working branch has architectural issues (Model doing AST's job), extensive debug code, and ~5k LOC. Starting fresh with clean architecture is faster and results in better code.

**Q: How do we know V5 will work?**
A: It's based on proven patterns from working branch, but with cleaner separation. Level 1 (4 hours) validates the approach end-to-end.

**Q: What if we get stuck?**
A: Stop conditions are defined. If iteration takes >2x estimated time, we stop, review reference, and reassess. Recovery procedures documented in V5 plan.

**Q: Can we skip levels?**
A: No. Each level builds on previous. But within a level, we can adjust iteration breakdown if needed.

**Q: What about the Namespace abstraction?**
A: We acknowledge it in code comments but ship without it. It's a broader refactor that benefits the whole codebase, should be separate PR.

---

## Next Steps

1. ✅ Review and approve V5 plan
2. ⏳ Execute Phase 0 (Setup)
3. ⏳ Execute Level 1 (Basic Parameters)
4. ⏳ Decision: Does it work? Continue or reassess.

---

**Ready to build! 🚀**

Last Updated: [DATE]
Current Plan: V5 Hybrid
Status: Ready to execute
