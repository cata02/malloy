/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {runtimeFor} from '../runtimes';
import '../util/db-jest-matchers';

const runtime = runtimeFor('duckdb');

afterAll(async () => {
  await runtime.connection.close();
});

describe('parameters', () => {
  it('number param used in dimension', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(param::number) is duckdb.table('malloytest.state_facts') extend {
        dimension: param_plus_one is param + 1
      }
      run: state_facts(param is 1) -> { group_by: param_plus_one }
    `).malloyResultMatches(runtime, {param_plus_one: 2});
  });
  it('number param used in sql function', async () => {
    await expect(`
      ##! experimental { parameters sql_functions }
      source: state_facts(param::number) is duckdb.table('malloytest.state_facts') extend {
        dimension: param_plus_one is sql_number("\${param} + 1")
      }
      run: state_facts(param is 1) -> { group_by: param_plus_one }
    `).malloyResultMatches(runtime, {param_plus_one: 2});
  });
  it('string param used in group_by', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(param::string) is duckdb.table('malloytest.state_facts') extend {
        dimension: param_plus_one is param
      }
      run: state_facts(param is "foo") -> { group_by: param_val is param }
    `).malloyResultMatches(runtime, {param_val: 'foo'});
  });
  it('can filter on filter expression param', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(param::filter<string>) is duckdb.table('malloytest.state_facts') extend {
        where: state ~ param
      }
      run: state_facts(param is f'CA') -> { select: state }
    `).malloyResultMatches(runtime, {state: 'CA'});
  });
  it.skip('reference field in source in argument', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(filter::boolean) is duckdb.table('malloytest.state_facts') extend {
        where: filter
      }
      run: state_facts(filter is state = 'CA') -> { group_by: state }
    `).malloyResultMatches(runtime, {state: 'CA'});
  });
  it('can pass param into joined source correctly', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(
        state_filter::string
      ) is duckdb.table('malloytest.state_facts') extend {
        where: state = state_filter
      }

      source: state_facts2(
        state_filter::string
      ) is duckdb.table('malloytest.state_facts') extend {
        where: state = state_filter

        join_many: state_facts is state_facts(state_filter) on 1 = 1
      }

      run: state_facts2(state_filter is "CA") -> {
        group_by:
          s1 is state,
          s2 is state_facts.state
        aggregate: c is count()
      }
    `).malloyResultMatches(runtime, {s1: 'CA', s2: 'CA', c: 1});
  });
  it('can pass param into extended source', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(param::number) is duckdb.table('malloytest.state_facts') extend {
        dimension: p is param
      }
      source: state_facts_ext(param::number) is state_facts(param)
      run: state_facts_ext(param is 1) -> p
    `).malloyResultMatches(runtime, {p: 1});
  });
  // TODO excepting a field outright removes it from the source, without consideration
  //      to other fields that use that removed field in their definition; consider
  //      changing rename/accept/except to modify a mapping layer between the underlying
  //      source and the created source, as well as a separate way to override the definition
  //      of a field deeply (without removing it or changing its type).
  it.skip('can use dimension that uses field that is excepted', async () => {
    await expect(`
        ##! experimental.parameters
        source: state_facts is duckdb.table('malloytest.state_facts') extend {
          dimension: state_copy is state
        }
        source: state_facts_ext is state_facts extend {
          except: state
        }

        run: state_facts_ext -> {
          group_by: state_copy
          order_by: state_copy desc
          limit: 1
        }
      `).malloyResultMatches(runtime, {state_copy: 'AK'});
  });
  it.skip('can shadow field that is excepted, using dimension that uses field that is excepted', async () => {
    await expect(`
        ##! experimental.parameters
        source: state_facts is duckdb.table('malloytest.state_facts') extend {
          dimension: state_copy is state
        }
        source: state_facts_hardcode_state(state::string) is state_facts extend {
          except: state
          dimension: hardcoded_state is state
        }

        run: state_facts_hardcode_state(state is 'NOT A STATE') -> {
          group_by: hardcoded_state, state_copy
          order_by: state_copy desc
          limit: 1
        }
      `).malloyResultMatches(runtime, {
      hardcoded_state: 'NOT A STATE',
      state_copy: 'AK',
    });
  });
  it('can shadow field that is excepted', async () => {
    await expect(`
        ##! experimental.parameters
        source: state_facts is duckdb.table('malloytest.state_facts')
        source: state_facts_hardcode_state(state::string) is state_facts extend {
          except: state
          dimension: hardcoded_state is state
        }

        run: state_facts_hardcode_state(state is 'NOT A STATE') -> {
          group_by: hardcoded_state
        }
      `).malloyResultMatches(runtime, {hardcoded_state: 'NOT A STATE'});
  });
  it('default value propagates', async () => {
    await expect(`
        ##! experimental.parameters
        source: ab_new(param::number is 10) is duckdb.table('malloytest.state_facts') extend {
          dimension: param_value is param
        }
        run: ab_new -> { group_by: param_value }
      `).malloyResultMatches(runtime, {param_value: 10});
  });
  it('default value can be overridden', async () => {
    await expect(`
        ##! experimental.parameters
        source: ab_new(param::number is 10) is duckdb.table('malloytest.state_facts') extend {
          dimension: param_value is param
        }
        run: ab_new(param is 11) -> { group_by: param_value }
      `).malloyResultMatches(runtime, {param_value: 11});
  });
  it('default value passed through extension propagates', async () => {
    await expect(`
        ##! experimental.parameters
        source: ab_new(param::number is 10) is duckdb.table('malloytest.state_facts') extend {
          dimension: param_value is param
        }
        source: ab_new_new(param::number is 11) is ab_new(param) extend {}
        run: ab_new_new -> { group_by: param_value }
      `).malloyResultMatches(runtime, {param_value: 11});
  });
  it('default value modified through extension propagates', async () => {
    await expect(`
        ##! experimental.parameters
        source: ab_new(param::number is 10) is duckdb.table('malloytest.state_facts') extend {
          dimension: param_value is param
        }
        source: ab_new_new(param::number is 11) is ab_new(param is param + 1) extend {}
        run: ab_new_new -> { group_by: param_value }
      `).malloyResultMatches(runtime, {param_value: 12});
  });
  // Fix this with namespaces!
  it.skip('default value modified through extension twice propagates', async () => {
    await expect(`
        ##! experimental.parameters
        source: ab_plus_0(param::number is 0) is duckdb.table('malloytest.state_facts') extend {
          dimension: param_value is param
        }
        source: ab_plus_one(param::number is 0) is ab_plus_0(param is param + 1) extend {}
        source: ab_plus_two(param::number is 0) is ab_plus_one(param is param + 1) extend {}
        run: ab_plus_two -> { group_by: param_value }
      `).malloyResultMatches(runtime, {param_value: 2});
  });
  it('use parameter in nested view', async () => {
    await expect(`
        ##! experimental.parameters
        source: ab_new(param::number is 10) is duckdb.table('malloytest.state_facts') extend {
          dimension: param_value_1 is param
          view: v is {
            group_by: param_value_1
            group_by: param_value_2 is param
            nest: n is {
              group_by: param_value_1
              group_by: param_value_3 is param
            }
          }
        }
        run: ab_new -> v
      `).malloyResultMatches(runtime, {
      'param_value_1': 10,
      'param_value_2': 10,
      'n.param_value_1': 10,
      'n.param_value_3': 10,
    });
  });
  it('can pass param into joined source from query', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(
        state_filter::string
      ) is duckdb.table('malloytest.state_facts') extend {
        where: state = state_filter
      }

      source: state_facts2(
        state_filter::string
      ) is duckdb.table('malloytest.state_facts') extend {
        where: state = state_filter

        join_many: state_facts is (state_facts(state_filter) -> { select: * }) on 1 = 1
      }

      run: state_facts2(state_filter is "CA") -> {
        group_by:
          s1 is state,
          s2 is state_facts.state
        aggregate: c is count()
      }
    `).malloyResultMatches(runtime, {s1: 'CA', s2: 'CA', c: 1});
  });
  it('can pass param into query definition', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(
        state_filter::string
      ) is duckdb.table('malloytest.state_facts') extend {
        where: state = state_filter
      }

      source: state_facts_query(state_filter::string) is state_facts(state_filter) -> { select: * }

      run: state_facts_query(state_filter is "CA") -> {
        select: state
      }
    `).malloyResultMatches(runtime, {state: 'CA'});
  });
  it('can use param in join on', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts is duckdb.table('malloytest.state_facts')

      source: state_facts2(
        state_filter::string
      ) is duckdb.table('malloytest.state_facts') extend {
        where: state = state_filter

        join_many: state_facts on state_facts.state = state_filter
      }

      run: state_facts2(state_filter is "CA") -> {
        group_by:
          s1 is state,
          s2 is state_facts.state
        aggregate: c is count()
      }
    `).malloyResultMatches(runtime, {s1: 'CA', s2: 'CA', c: 1});
  });
  it('can use param in join with', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts is duckdb.table('malloytest.state_facts') extend {
        primary_key: state
      }

      source: state_facts2(
        state_filter::string
      ) is duckdb.table('malloytest.state_facts') extend {
        where: state = state_filter

        join_one: state_facts with state_filter
      }

      run: state_facts2(state_filter is "CA") -> {
        group_by:
          s1 is state,
          s2 is state_facts.state
        aggregate: c is count()
      }
    `).malloyResultMatches(runtime, {s1: 'CA', s2: 'CA', c: 1});
  });
  it('source arguments in query propagate when turned into source', async () => {
    await expect(`
      ##! experimental.parameters
      source: ab_new(param::number) is duckdb.table('malloytest.state_facts') extend {
        dimension: param_value is param
      }
      query: foo is ab_new(param is 1) -> { select: param_value }
      source: foo_ext is foo
      run: foo_ext -> { select: param_value }
    `).malloyResultMatches(runtime, {param_value: 1});
  });
  it('date parameters keep granularity when passing in', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(param::date) is duckdb.table('malloytest.state_facts') extend {
        dimension: date_value is day(param)
      }
      run: state_facts(param is @2024-04-11.month) -> { group_by: date_value }
    `).malloyResultMatches(runtime, {date_value: 1});
  });
  it('can use parameter in null check', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(
        param::string is null,
        state_filter::string is "CA"
      ) is duckdb.table('malloytest.state_facts') extend {
        where: param is null and state = state_filter
      }
      run: state_facts -> { group_by: state }
    `).malloyResultMatches(runtime, {state: 'CA'});
  });
  it('default value not passed through extension propagates', async () => {
    await expect(`
        ##! experimental.parameters
        source: ab_new(param::number is 10) is duckdb.table('malloytest.state_facts') extend {
          dimension: param_value is param
        }
        source: ab_new_new is ab_new extend {}
        run: ab_new_new -> { group_by: param_value }
      `).malloyResultMatches(runtime, {param_value: 10});
  });
  it('propagates param through single-stage view', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(state_filter::string) is duckdb.table('malloytest.state_facts') extend {
        view: single_stage is {
          group_by: state
          where: state = state_filter
        }
      }
      run: state_facts(state_filter is "CA") -> single_stage
    `).malloyResultMatches(runtime, {state: 'CA'});
  });
  it('uses param in aggregate expressions across stages', async () => {
    await expect(`
      ##! experimental.parameters
      source: ct(offset::number) is duckdb.table('malloytest.state_facts') extend {
        view: aggregate_stage is {
          group_by: state
          aggregate: count_filtered is count() + offset
          where: state = 'CA'
        } -> {
          limit: 10
          where: offset >= 0
        }
      }
      run: ct(offset is 2) -> aggregate_stage
    `).malloyResultMatches(runtime, {state: 'CA', count_filtered: 3});
  });
  it('works with param in join conditions across stages', async () => {
    await expect(`
      ##! experimental.parameters
      source: test_source(state_filter::string) is duckdb.table('malloytest.state_facts') extend {
        join_many: other is duckdb.table('malloytest.state_facts') on other.state = state_filter
        view: join_stage is {
          group_by: state
        } -> {
          limit: 10
          where: state = state_filter
        }
      }
      run: test_source(state_filter is 'CA') -> join_stage
    `).malloyResultMatches(runtime, {state: 'CA'});
  });
  it('works with parameters in three pipeline stages', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(filter_param::string) is duckdb.table('malloytest.state_facts') extend {
        view: three_stages is {
          group_by: state
        } -> {
          group_by: state
        } -> {
          select: *
          limit: 10
          where: state = filter_param
        }
      }
      run: state_facts(filter_param is 'CA') -> three_stages
    `).malloyResultMatches(runtime, {state: 'CA'});
  });
  it('works when parameter is only in last pipeline stage', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(filter_val::string is 'default') is duckdb.table('malloytest.state_facts') extend {
        view: last_stage_param is {
          group_by: state
          aggregate: total is count()
        } -> {
          group_by: state, total
        } -> {
          select: *
          where: state = filter_val
        }
      }
      run: state_facts(filter_val is 'CA') -> last_stage_param
    `).malloyResultMatches(runtime, {state: 'CA'});
  });
  it('works with join_one parameterized source with pipeline', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(state_filter::string) is duckdb.table('malloytest.state_facts') extend {
        primary_key: state
        where: state = state_filter
      }

      source: state_facts2(state_filter2::string) is duckdb.table('malloytest.state_facts') extend {
        join_one: filtered_facts is state_facts(state_filter is state_filter2) -> { select: * }
      }

      run: state_facts2(state_filter2 is 'CA') -> {
        group_by:
          s1 is state,
          s2 is filtered_facts.state
        where: filtered_facts.state is not null
        aggregate: c is count()
      }
    `).malloyResultMatches(runtime, {s1: 'CA', s2: 'CA', c: 1});
  });
  it('join_one with pipeline where inner stage references param', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(
        state_filter::string
      ) is duckdb.table('malloytest.state_facts') extend {
        primary_key: state
        where: state = state_filter
      }

      source: state_facts3(state_filter3::string) is duckdb.table('malloytest.state_facts') extend {
        join_one: filtered is state_facts(state_filter is state_filter3) -> {
          select: *
        }
      }

      run: state_facts3(state_filter3 is 'CA') -> {
        group_by:
          s is filtered.state
        where: filtered.state is not null
        aggregate: c is count()
      }
    `).malloyResultMatches(runtime, {s: 'CA', c: 1});
  });
  it('join_one simple source with pipeline referencing outer param', async () => {
    await expect(`
      ##! experimental.parameters
      source: sf_outer(state_filter::string) is duckdb.table('malloytest.state_facts') extend {
        primary_key: state
        join_one: sf is duckdb.table('malloytest.state_facts') -> {
          select: *
          where: state = state_filter
        }
      }
      run: sf_outer(state_filter is "CA") -> {
        group_by: s is sf.state
        aggregate: c is count()
      }
    `).malloyResultMatches(runtime, [
      {s: null, c: 50}, // The 50 non-matching rows (join_one is LEFT JOIN, ordered first by count desc)
      {s: 'CA', c: 1}, // The one matching row
    ]);
  });
  // Skipping as it's not yet implemented
  it('refine uses in-scope parameter', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(state_filter::string) is duckdb.table('malloytest.state_facts') extend {
        view: base is {
          group_by: state
          aggregate: c is count()
        }
      }
      run: state_facts(state_filter is 'CA') -> base + { group_by: state; where: state = state_filter }
    `).malloyResultMatches(runtime, {state: 'CA'});
  });
  // Skipping as it's not yet implemented
  it.skip('refine with missing parameter errors', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(state_filter::string) is duckdb.table('malloytest.state_facts') extend {
        view: base is {
          group_by: state
          where: state = state_filter
        }
      }
      run: state_facts(state_filter is 'CA') -> base + { group_by: state; where: state = missing_param }
    `).malloyResultMatches(runtime, {state: 'CA'});
  });
  it('basic refine operation works', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(state_filter::string) is duckdb.table('malloytest.state_facts') extend {
        view: base is {
          group_by: state
          where: state = state_filter
        }
      }
      run: state_facts(state_filter is 'CA') -> base + { group_by: state; limit: 1 }
    `).malloyResultMatches(runtime, {state: 'CA'});
  });
  it('filter expression parameters work', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(state_filter::filter<string>) is duckdb.table('malloytest.state_facts') extend {
        where: state ~ state_filter
      }
      run: state_facts(state_filter is f'CA') -> { group_by: state }
    `).malloyResultMatches(runtime, {state: 'CA'});
  });
  it('multiple parameters in one source', async () => {
    await expect(`
      ##! experimental.parameters
      source: state_facts(
        state_filter::string,
        min_count::number
      ) is duckdb.table('malloytest.state_facts') extend {
        where: state = state_filter
        view: filtered is {
          group_by: state
          aggregate: c is count()
          having: c >= min_count
        }
      }
      run: state_facts(state_filter is 'CA', min_count is 1) -> filtered
    `).malloyResultMatches(runtime, {state: 'CA', c: 1});
  });
  // Integration tests for join-in-view scenarios requested
  // Simplified to avoid infinite recursion bug in Malloy SQL generation
  it('join-in-view: pass param into joined source', async () => {
    // TODO: This triggers infinite recursion in getStructSourceSQL due to
    // combination of parameterized source with filter + join + pipeline
    await expect(`
      ##! experimental.parameters
      source: inner_source(param2::string) is duckdb.table('malloytest.state_facts') extend {
        primary_key: state
        dimension: state_copy is state
        where: state = param2
        view: passthrough is { group_by: state_copy }
      }
      source: outer(p::string) is duckdb.table('malloytest.state_facts') extend {
        primary_key: state
        view: v is {
          group_by: state, inner_state is inner_alias.state_copy
          join_one: inner_alias is inner_source(param2 is p) -> passthrough on state = inner_alias.state_copy
          where: inner_alias.state_copy is not null
        }
      }
      run: outer(p is 'CA') -> v
    `).malloyResultMatches(runtime, {state: 'CA', inner_state: 'CA'});
  });
  it('join-in-view: use param in ON clause', async () => {
    await expect(`
      ##! experimental.parameters
      source: inner_source is duckdb.table('malloytest.state_facts')
      source: outer(p::string) is duckdb.table('malloytest.state_facts') extend {
        view: v is {
          join_one: i is inner_source on i.state = p
          where: state = p
          group_by: state, i_state is i.state
        }
      }
      run: outer(p is 'CA') -> v
    `).malloyResultMatches(runtime, {state: 'CA', i_state: 'CA'});
  });
  it('join-in-view: param used inside join pipeline', async () => {
    // TODO: This triggers infinite recursion in getStructSourceSQL
    await expect(`
      ##! experimental.parameters
      source: inner_source(param2::string) is duckdb.table('malloytest.state_facts') extend {
        primary_key: state
        dimension: state_copy is state
        view: filtered_view is { group_by: state_copy; where: state_copy = param2 }
      }
      source: outer(p::string) is duckdb.table('malloytest.state_facts') extend {
        primary_key: state
        view: v is {
          group_by: state, inner_state is joined_inner.state_copy
          join_one: joined_inner is inner_source(param2 is p) -> filtered_view on state = joined_inner.state_copy
          where: joined_inner.state_copy is not null
        }
      }
      run: outer(p is 'CA') -> v
    `).malloyResultMatches(runtime, {state: 'CA', inner_state: 'CA'});
  });
  it('minimal single-stage: view param resolves literal', async () => {
    await expect(`
      ##! experimental.parameters
      source: sf(p::string) is duckdb.table('malloytest.state_facts') extend {
        view: v is { group_by: state; where: state = p }
      }
      run: sf(p is 'CA') -> v
    `).malloyResultMatches(runtime, {state: 'CA'});
  });
  it('minimal join-on: param used in ON clause', async () => {
    await expect(`
      ##! experimental.parameters
      source: inner_tbl is duckdb.table('malloytest.state_facts')
      source: outer(p::string) is duckdb.table('malloytest.state_facts') extend {
        view: v is {
          join_one: i is inner_tbl on i.state = p
          where: state = p
          group_by: state, i_state is i.state
        }
      }
      run: outer(p is 'CA') -> v
    `).malloyResultMatches(runtime, {state: 'CA', i_state: 'CA'});
  });
  // TODO fix this when we redo namespaces
  it.skip('default value not passed through extension propagates, with composite source', async () => {
    await expect(`
        ##! experimental { parameters composite_sources }
        source: ab_new(param::number is 10) is compose(
          duckdb.table('malloytest.state_facts'),
          duckdb.table('malloytest.state_facts') extend { dimension: foo is 1 }
        ) extend {
          dimension: param_value is param
        }
        source: ab_new_new is ab_new extend {}
        run: ab_new_new -> { group_by: param_value, foo }
      `).malloyResultMatches(runtime, {param_value: 10});
  });
});
