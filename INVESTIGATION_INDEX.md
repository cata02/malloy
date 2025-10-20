# Investigation & Status Documentation Index

**Branch:** `params-in-pipeline-stages`
**Objective:** Enable parameters in join query pipelines (Pattern 3)

## Quick Start

**New to this work?** Read in this order:
1. 📊 **MAIN_BRANCH_BASELINE.md** - What works on main (reference)
2. 🎯 **KEY_FINDING.md** - Critical insight: no regressions!
3. 📈 **CURRENT_STATUS_MASTER.md** - Current status and next steps
4. 🔍 **MAIN_VS_BRANCH_SUMMARY.md** - Detailed comparison

**Working on Pattern 3?** Reference these:
5. 🛠️ **PATTERN3_SQL_GENERATION_ANALYSIS.md** - Technical deep dive
6. 🔗 **JOIN_ONE_SEMANTICS_ANALYSIS.md** - LEFT JOIN semantics
7. ✅ **STATUS_ROUNDUP.md** - What we fixed

## Document Purposes

### Reference Documents

#### MAIN_BRANCH_BASELINE.md
**What:** Complete test status from main branch
**When to use:** When determining if a test failure is a regression
**Key info:**
- 87 passing tests (71 language + 16 integration)
- 1 known pre-existing bug
- Full list of passing/failing/skipped tests

#### PARAMETER_FEATURES_INVENTORY.md
**What:** Pre-existing repo documentation
**When to use:** Understanding overall parameter feature landscape
**Key info:** Comprehensive parameter feature matrix

### Current Status

#### CURRENT_STATUS_MASTER.md ⭐
**What:** Master status document - THE source of truth
**When to use:** Any time you need current status
**Key info:**
- Test counts and comparisons
- What we fixed (+20 tests)
- What remains (18 new test failures)
- Technical fixes applied
- Modified files list
- Next steps

#### KEY_FINDING.md ⭐
**What:** Critical discovery - "failures" are new tests, not regressions
**When to use:** Understanding why test counts differ
**Key info:**
- Evidence that failing tests don't exist on main
- Test log size comparison (12K → 28K lines)
- Proof of zero regressions

#### MAIN_VS_BRANCH_SUMMARY.md
**What:** Comprehensive comparison with recommendations
**When to use:** Understanding overall progress and impact
**Key info:**
- Side-by-side test comparison
- Net progress calculation
- Detailed breakdown of what works vs what doesn't
- Recommendations for next steps

### Technical Analysis

#### PATTERN3_SQL_GENERATION_ANALYSIS.md
**What:** Deep technical analysis of join pipeline parameter issue
**When to use:** Working on Pattern 3 implementation
**Key info:**
- Problem statement and examples
- Root cause analysis
- SQL generation flow
- Code paths involved
- Solutions attempted

#### JOIN_ONE_SEMANTICS_ANALYSIS.md
**What:** Analysis of join_one behavior (LEFT vs INNER)
**When to use:** When dealing with join semantics
**Key info:**
- join_one should be LEFT JOIN (confirmed)
- Test expectation corrections
- SQL generation details

#### STATUS_ROUNDUP.md
**What:** Summary of fixes and new capabilities
**When to use:** Documenting progress or reviewing achievements
**Key info:**
- List of fixed scenarios
- New use cases enabled
- Before/after comparison

## Documentation Maintenance

### Update Frequency
- **CURRENT_STATUS_MASTER.md**: Update after each major change
- **MAIN_BRANCH_BASELINE.md**: Static reference (only update if re-baselining)
- **Technical docs**: Update when implementation details change

### Before Final Merge
1. Update all documents with final status
2. Remove any interim/temporary analysis
3. Add final test counts
4. Document any remaining known issues
5. Update repo README if needed

## Test Log Files

Located in repo root:
- `main_language_tests.log` - Language tests from main branch
- `main_integration_tests.log` - Integration tests from main branch
- `branch_language_tests.log` - Language tests from our branch
- `branch_integration_tests.log` - Integration tests from our branch
- `test_output.log` - Latest test run output

## Standard Repo Documentation

- **README.md** - Main repo readme
- **CHANGELOG.md** - Repo changelog
- **CONTRIBUTING.md** - Contribution guidelines
- **PARAMETER_FEATURES_INVENTORY.md** - Parameter feature matrix

---

**Last Updated:** October 20, 2025
**Status:** Documentation organized and consolidated
