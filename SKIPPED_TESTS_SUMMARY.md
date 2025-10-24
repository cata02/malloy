# Skipped Parameter Tests Summary

## Overview
There are **6 tests skipped** in `test/src/core/parameters.spec.ts`. These tests are intentionally skipped for various reasons including missing features, architecture improvements, or test bugs.

**Note**: This document was updated after fixing several tests. Previously skipped tests that are now passing:
- ✅ `string param used in group_by` - Fixed by ad-hoc query parameter propagation
- ✅ `can pass param into query definition` - Fixed by query source parameter propagation
- ✅ `refine uses in-scope parameter` - Fixed test syntax (refine already works)
- ✅ `basic refine operation works` - Fixed test syntax (refine already works)
- ✅ `join-in-view: pass param into joined source` - Fixed test syntax (infinite recursion bug was already fixed)
- ✅ `join-in-view: param used inside join pipeline` - Fixed test syntax (infinite recursion bug was already fixed)

## Skipped Tests List

### 1. `reference field in source in argument` (line 50)
**Status**: ⏸️ **SKIPPED** - Invalid syntax
**Reason**: Test uses `boolean` type which doesn't exist in Malloy
**Test**: Referencing a field from the source in a parameter argument
**Complexity**: Involves field references within parameter contexts
**Action Needed**: Determine if test should be fixed or removed

### 2. `can use dimension that uses field that is excepted` (line 99)
**Status**: ⏸️ **SKIPPED** - Blocked by field exception system
**Reason**: Requires field exception/inclusion system improvements
**Comment**: "This will require a way to copy a field between the original source and the created source, as well as a separate way to override the definition of a field deeply (without removing it or changing its type)."
**Test**: Using dimensions that reference fields that have been excepted
**Action Needed**: Improve field exception system architecture

### 3. `can shadow field that is excepted, using dimension that uses field that is excepted` (line 116)
**Status**: ⏸️ **SKIPPED** - Blocked by field exception system
**Reason**: Related to field exception system
**Test**: Complex field shadowing with exceptions
**Complexity**: Involves both field shadowing and exception mechanics
**Action Needed**: Improve field exception system architecture

### 4. `default value modified through extension twice propagates` (line 190)
**Status**: ⏸️ **SKIPPED** - Blocked by namespace architecture
**Reason**: Needs namespace fixes
**Comment**: "Fix this with namespaces!"
**Test**: Parameter default values modified through multiple levels of extension
**Action Needed**: Namespace redesign

### 5. `refine with missing parameter errors` (line 505)
**Status**: ⏸️ **SKIPPED** - Test bug
**Reason**: Test expects success but should test for error
**Test**: Error handling when refine references missing parameters
**Issue**: Test uses `malloyResultMatches` but references `missing_param` which should cause compilation error
**Action Needed**: Fix test to properly test error handling

### 6. `default value not passed through extension propagates, with composite source` (line 631)
**Status**: ⏸️ **SKIPPED** - Blocked by namespace architecture
**Reason**: Needs namespace fixes
**Comment**: "TODO fix this when we redo namespaces"
**Test**: Parameter default value propagation with composite sources
**Action Needed**: Namespace redesign

## Categories

### By Implementation Status

**Namespace/Architecture Issues (2 tests)**
- `default value modified through extension twice propagates`
- `default value not passed through extension propagates, with composite source`

**Field Exception System (2 tests)**
- `can use dimension that uses field that is excepted`
- `can shadow field that is excepted, using dimension that uses field that is excepted`

**Test Bugs/Invalid Syntax (2 tests)**
- `reference field in source in argument` - Invalid syntax (uses non-existent `boolean` type)
- `refine with missing parameter errors` - Test bug (should test for error, not success)

### By Priority

**Medium Priority** (Feature work)
- Field exception system tests (2 tests)

**Low Priority** (Architecture improvements)
- Namespace-related tests (2 tests)

**Needs Investigation** (Test issues)
- `reference field in source in argument` - Determine if test should be fixed or removed
- `refine with missing parameter errors` - Fix test to properly test error handling

## Recommendations

1. ~~**Fix infinite recursion bug** in `getStructSourceSQL` for join-in-view scenarios~~ ✅ **COMPLETED**
2. ~~**Implement refine feature** to enable 3 skipped tests~~ ✅ **COMPLETED** - Refine already works
3. **Improve field exception system** for 2 skipped tests
4. **Namespace redesign** will enable 2 skipped tests
5. **Fix test bugs** in 2 tests (invalid syntax and error handling)

## Summary

**Progress**: Reduced from 12 skipped tests to 6 skipped tests (50% reduction)

**Remaining Blockers**:
- Field exception system improvements (2 tests)
- Namespace architecture redesign (2 tests)
- Test bugs/invalid syntax (2 tests)
