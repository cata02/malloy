## Parameter Scope: Deterministic References, Late Binding, and Cycle‑Free Joins

### TL;DR
- Separate parameter scope from the SQL/join structure.
- Resolve parameter references deterministically to their declaration (compile-time pointers), bind values later.
- For join pipelines, use the outer parameter scope without introducing structural parent cycles.
- Keep a temporary recursion guard; it should stop triggering once scopes are decoupled.

---

### Problem Statement
Recent parameter work (Pattern 3: parameters in join pipelines and join-in-view) introduced structural parent links to make outer parameters visible to inner pipelines. This created cycles in the join tree and required a band‑aid recursion guard during SQL generation.

We want:
- Deterministic parameter reference resolution (compile-time) independent of the join/SQL structure
- Late binding of concrete values (prepare/runtime/SQL-gen)
- No structural cycles (and no reliance on a global recursion Set)

---

### Mental Model
Separate two concerns:
- Reference determinism (compile-time): each `ParamRef` points to exactly one `ParamDecl` in a lexical parameter scope chain.
- Value binding (late): concrete values are assigned to declarations (defaults → run args → stage overrides → join arg mappings) and rendered during SQL generation with proper types/casting.

Key terms:
- Binding: associate a parameter name to a concrete value in a given scope.
- Resolution: find the nearest declaration for a `ParamRef` in the scope chain (no structural walking).
- Evaluation: render the bound value into SQL (literal/placeholder) with dialect-aware casting.

---

### Concrete Examples

1) Basic join (no params)
```malloy
source: A is duckdb.table('malloytest.airports') extend {
  primary_key: code
  join_one: B is duckdb.table('malloytest.carriers') on B.code = carrier
}
run: A -> { group_by: B.name }
```

2) Outer param in join ON (no pipeline)
```malloy
source: A(p::string) is duckdb.table('malloytest.airports') extend {
  primary_key: code
  join_one: B is duckdb.table('malloytest.carriers') on B.code = p
}
run: A(p is 'UA') -> { group_by: B.name }
```

3) Join pipeline uses outer param directly (Pattern 3)
```malloy
source: B(q::string) is duckdb.table('malloytest.carriers')

source: A(p::string) is duckdb.table('malloytest.airports') extend {
  primary_key: code
  join_one: B is B(q is p) -> {
    where: nickname ~ p   # pipeline can read outer p directly
  } on B.code = carrier
}
run: A(p is '.*United.*') -> { group_by: B.nickname }
```

4) Run-time override (no stage-level param set)
```malloy
run: A(p is 'y') -> { where: carrier = p }
```
Note: Malloy does not support a `parameter:` directive inside a stage; overrides are provided at call-sites like `A(p is ...)`.

---

### Proposed Architecture

Introduce `ParameterScope` independent of `QueryStruct`:

```
ParameterScopeNode
  - bindings: Map<string, Argument>    # concrete args/defaults only
  - parent?: ParameterScopeNode        # lexical chain
  - meta: { origin: 'run'|'source'|'stage'|'join'|'pipeline'|'view', name: string }
```

Deterministic resolution:
- On compile-time reference resolution, each `ParamRef` points to a `ParamDecl` found by walking the scope chain (not the structural join tree).
- Add a small safety cap (e.g., 20 hops) → clear diagnostic: "parameter scope cycle".

Where scopes are created (rules):
1) run … → root scope with run-time args
2) source head (`source X(p::…)`) → child scope with defaults overlaid by provided source args
3) stage/view bodies (`-> { … }`) → child scope per stage; overlay stage params
4) join without pipeline → child scope for RHS over parent scope; overlay RHS args/defaults
5) join with pipeline (`Pattern 3`) →
   - RHS `query_source`: structural parent = model (avoid structural cycles)
   - param scope parent = LHS scope; overlay RHS args/defaults; stage scopes underneath
6) join-in-view → same as (5)

Diagnostics & events:
- Undefined param → error with scope name and available keys
- Type/filterType mismatch → early compile-time error
- Emit existing events: `parameterized-source-compiled`, `parameter-miss`, `debug-args-node`

---

### Implementation Plan (Low‑Churn, Incremental)
1) Add `paramScope` to `QueryStruct`
   - `{ bindings, parent, meta }` initialized at construction

2) Update `arguments()`
   - Resolve via `paramScope` chain, not structural `parent`
   - 20-hop safety cap and improved error messages

3) Update `QueryFieldStruct` (RHS joins)
   - Keep structural parent = current `QueryStruct` (unchanged)
   - Build `finalSourceArguments` (existing logic)
   - Set `child.paramScope = new ParameterScopeNode({ parent: this.paramScope, bindings: finalSourceArguments + RHS defaults })`

4) Update `_getStructSourceSQLImpl` for `query_source` (RHS pipelines)
   - Construct child `QueryStruct` with structural parent = model (no struct parent → no structural cycle)
   - Set `child.paramScope = new ParameterScopeNode({ parent: LHS.paramScope, bindings: effectiveArgs + defaults })`

5) Keep the band‑aid temporarily
   - It should stop triggering once structural and parameter scopes are decoupled
   - Remove after tests confirm no recursion

6) Tests (focused)
   - Pattern 3 join pipelines: outer param visible in pipeline
   - Join‑in‑view parameter resolution
   - Stage shadowing precedence
   - Negative: undefined param; name collision (shadowing); depth cap exceeded
   - Self‑joins and circular joins: no recursion; correct SQL

---

### Risks / Trade‑offs
- Requires touching `QueryStruct` construction and `arguments()` resolution path
- Temporary coexistence with band‑aid until tests are fully green
- Future step (nice‑to‑have): compile-time ParamRef→ParamDecl pointers for maximum determinism and tooling

---

### Alternatives Considered
- Context‑aware aliasing during SQL generation (reuse table alias if already in path)
  - Pros: robust at SQL layer
  - Cons: more invasive in SQL generator; still doesn’t separate parameter concerns

- CTE layering (WITH blocks for sources)
  - Pros: very robust, cleaner SQL debugging
  - Cons: larger architectural change; not necessary for first fix

---

### TODO (Engineering Checklist)
- [ ] Add `ParameterScopeNode` type and `paramScope` field to `QueryStruct`
- [ ] Refactor `arguments()` to use `paramScope` (with 20‑hop cap)
- [ ] Seed `paramScope` correctly in `QueryFieldStruct` (RHS joins)
- [ ] In `_getStructSourceSQLImpl`, set structural parent = model and seed `paramScope` from LHS
- [ ] Keep recursion guard; add telemetry to verify it no longer triggers
- [ ] Add/adjust tests for Pattern 3, join‑in‑view, shadowing, undefined params, circular joins
- [ ] Remove recursion band‑aid after validation
- [ ] Document scope rules and debugging guidance

---

### Validation Plan
- Run DuckDB tests for parameters/joins only (faster feedback)
- Confirm no recursion warnings and correct parameter visibility
- Verify zero regressions on existing tests
- Enable `MALLOY_DEBUG_ARGS` locally to inspect scopes during dev

---

### Join‑in‑View and Multi‑Stage Pipelines with ParameterScope

#### Join‑in‑View
- Goal: Allow a view body used on the RHS of a join to see outer parameters from the LHS source, without creating structural cycles.
- Scope rule: When `A` joins to `B -> { … }` inside a view defined in `A`, the RHS pipeline’s `paramScope.parent = A.paramScope` (structural parent of the RHS `query_source` remains the model, not `A`).
- Effect: Inside the RHS pipeline, using `p` resolves to `A.p` deterministically (nearest scope); explicit mappings like `B(q is p)` still work and can provide local aliases.

```malloy
source: B(q::string) is duckdb.table('...')

source: A(p::string) is duckdb.table('...') extend {
  view: by_outer is {
    join_one: B is B(q is p) -> {
      where: nickname ~ p   # outer A.p visible
    } on B.code = carrier
  }
}

run: A(p is '.*United.*') -> by_outer
```

- Why it’s safe: The RHS `query_source`’s structural parent is the model, so SQL generation does not re‑enter the `A→B` path while already visiting it. Parameter resolution happens via `paramScope`, not the structural parent.

#### Multi‑Stage Pipelines
- Goal: Each stage can introduce/override parameters; later stages see the nearest binding (lexical shadowing), while still having access to outer parameters.
- Scope rule: Every `{ … }` stage creates a child `ParameterScope` that inherits from the previous stage. Stage overrides shadow outer bindings. Structural parentage of the pipeline’s `query_source` remains stable (model for RHS pipelines; the current struct for LHS query pipelines).

```malloy
source: A(p::string default 'x') is duckdb.table('...')

run: A(p is 'y') -> {
  where: carrier = p          # resolves to 'y'
} -> {
  where: p ~ 'Y'              # still resolves to 'y'
}
```

- Join RHS multi‑stage:
```malloy
source: B(q::string) is duckdb.table('...')
source: A(p::string) is duckdb.table('...') extend {
  join_one: B is B(q is p) -> {
    where: nickname ~ p      # resolves to A.p via parent scope
  } -> {
    where: nickname ~ (q || ' Co.')
  } on B.code = carrier
}
```

- Effect:
  - Stage 1 sees `p` from `A.paramScope` (outer), and `q` bound from `p` if provided.
  - Stage 2 can override `q`; `p` remains available from the parent scope unless shadowed.

#### Scope Chains (mental model)
- LHS `A.paramScope` → RHS join pipeline scope → stage scopes (each stage adds a child scope).
- ParamRef resolves to the nearest declaration; explicit mappings (`q is p`) create an alias binding from `declId(q)` to `declId(p)`.
- No structural parent walking is involved in parameter lookup.

#### Error Cases and Diagnostics
- Undefined param: Fail at compile‑time with scope name and available keys.
- Shadowing collision: Nearest wins; keep error messages consistent with main where required.
- Cycle in parameter mappings: Detect when resolving alias chains (e.g., `q -> r -> q`); emit “parameter scope cycle” with the scope chain.

### Open Questions
- Do we want compile-time ParamRef→ParamDecl pointers now or later?
- Should we support explicit outer‑scope references in pipelines when names shadow (e.g., `A.p`) or keep it purely lexical?
- Any dialect quirks that require earlier value realization vs symbolic parameters?

---

### Compatibility with Malloy main/docs (separating branch changes)

This section isolates what stays the same as Malloy main (and its tests/docs), what we propose to newly enable, and which current branch behaviors should be reverted/removed to avoid divergence.

What remains the same (must preserve):
- Parameters are declared on sources; views inside a source can reference that source’s parameters.
- Passing parameters through to joined sources is supported (shorthand/longhand), per tests in `packages/malloy/src/lang/test/parameters.spec.ts`.
- Parameters are not visible in plain query bodies or in “in‑query source extension” blocks (tests like "cannot reference param in query against source" and "cannot reference param in in‑query source extension" must continue to fail as today).
- Shadowing rules and error messages (e.g., illegal shadowing of fields) remain unchanged.

What this proposal enables/clarifies (new, but aligned with intent of Pattern 3):
- Outer source parameters are visible inside RHS join pipelines (and join‑in‑view pipelines) via an explicit ParameterScope chain, without introducing structural recursion.
- Parameter resolution uses a lexical ParameterScope (deterministic, nearest binding) distinct from the structural join tree used for SQL generation.

Branch‑introduced behaviors to avoid/remove (divergence from main):
- Using structural `parent` to find parameter values (creates cycles); replace with explicit `paramScope`.
- Global recursion guard (`structSQLCallStack`) as a logic gate; keep only as a temporary safety net, then remove once scopes are decoupled and tests are green.
- Excessive unconditional logging; remove before merge (keep optional env‑gated debug only).

Conformance checks (must pass after changes):
- Negative visibility tests remain negative (no params in plain query bodies).
- Pass‑through to joined sources still translates and runs (shorthand/longhand).
- Newly covered Pattern 3 tests (join pipelines, join‑in‑view) translate and execute without recursion.

Rollout notes:
- Keep behavior behind existing `##! experimental.parameters` annotations as appropriate.
- Add clear diagnostics for parameter misses and scope depth caps; do not alter user‑visible semantics outside parameterized joins/pipelines.

---

### Phased Rollout

#### Phase A — Minimal, High ROI (Recommended Now)
- Add `ParameterScope` to `QueryStruct` and refactor `arguments()` to resolve via the scope chain (with ~20‑hop cap and aligned error messages).
- For RHS join pipelines (`query_source`): structural parent = model; param parent = LHS scope; overlay RHS args/defaults.
- For normal joins: structural parent = current struct; param parent = current scope; overlay RHS args/defaults.
- Keep the existing recursion guard temporarily; add lightweight telemetry (counter/event) to verify it is not triggered.

Acceptance for Phase A
- Existing negative tests remain negative (no params in plain query bodies; no in‑query source extension leakage).
- Join pass‑through (shorthand/longhand) still translates and runs.
- Pattern 3 (join pipelines, join‑in‑view) translate and run without recursion.
- No dependence on structural parent walking for parameter resolution.

#### Phase B — Optional Enhancements (Later)
- Add compile‑time ParamRef→ParamDecl pointers (declIds) for full reference determinism and better tooling.
- Remove the recursion guard once telemetry shows it is unused across the test matrix.
- Performance: cache declId lookups per scope; avoid repeated resolution; document scope lifetime per compilation.
- Telemetry: structured events for parameter misses, alias cycles, and scope depth overflows.
